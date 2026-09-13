'use client'

import { subscribeSceneCommits, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { type MutableRefObject, useEffect, useRef } from 'react'
import { type SceneGraph, saveSceneToLocalStorage } from '../lib/scene'
import { createSceneSaveQueue } from '../lib/scene-save-queue'
import useInteractionScope from '../store/use-interaction-scope'

const STRUCTURAL_NODE_COUNT = 4

type NodeSnapshot = Pick<SceneGraph, 'nodes' | 'rootNodeIds'>
let authorizedNodeDropSnapshot: NodeSnapshot | null = null

/** Authorize only the committed result of an explicit host deletion, never an empty/unloaded graph. */
export function authorizeSceneNodeDrop(snapshot: NodeSnapshot) {
  if (
    snapshot.rootNodeIds.length > 0 &&
    snapshot.rootNodeIds.every((id) => Object.hasOwn(snapshot.nodes, id))
  ) {
    authorizedNodeDropSnapshot = { nodes: snapshot.nodes, rootNodeIds: snapshot.rootNodeIds }
  }
}

function isAuthorizedNodeDrop(snapshot: NodeSnapshot) {
  return (
    authorizedNodeDropSnapshot?.nodes === snapshot.nodes &&
    authorizedNodeDropSnapshot.rootNodeIds === snapshot.rootNodeIds
  )
}

export function isSuspiciousNodeDrop(previousNodeCount: number, currentNodeCount: number) {
  return previousNodeCount > STRUCTURAL_NODE_COUNT && currentNodeCount <= STRUCTURAL_NODE_COUNT
}

/**
 * Tracks the node count of the graph we believe is stored, which is what the
 * accidental-wipe guard measures every write against.
 *
 * The distinction that matters: a graph that came from storage is authoritative
 * and has to become the new baseline, while an edited or previewed graph must
 * not. Seeding the baseline once at mount is not enough — the hook mounts
 * before the scene has loaded, so it would sit at ~0 for the whole session and
 * `isSuspiciousNodeDrop` could never fire.
 */
export function createStoredNodeCountTracker(initialNodeCount: number) {
  let count = initialNodeCount

  return {
    get count() {
      return count
    },
    /** A graph read from storage — it defines what "populated" means from here. */
    trackLoadedGraph(nodeCount: number) {
      count = nodeCount
    },
    /**
     * `false` when the write would drop a populated scene to a bare scaffold,
     * which is an accidental full deletion far more often than an intent. The
     * caller reports the block; on `true` the write becomes the new baseline.
     */
    allowWrite(nodeCount: number, authorized = false) {
      if (isSuspiciousNodeDrop(count, nodeCount) && !authorized) return false
      count = nodeCount
      return true
    },
  }
}

export type ExitFlushDecision = 'skip-clean' | 'skip-loading' | 'blocked-suspicious' | 'flush'

/**
 * Decides what the unload/unmount flush may do with the store's current
 * content. Pure so the wipe scenarios stay unit-testable.
 *
 * `skip-loading` is the load-bearing branch: while a scene load is in flight
 * the store passes through an intermediate `unloadScene()` state — zero nodes,
 * zero roots — that is NOT user data. A flush fired in that window (StrictMode
 * simulated unmount in dev, a quick tab close or navigation in prod) used to
 * serialize that empty store and PUT it over the server copy, wiping the scene
 * at v2. The dirty flag alone cannot protect here: document-level writes that
 * land before hydration (e.g. the host-panel default `installedPlugins` sync)
 * mark the session dirty without any user edit.
 */
export function decideExitFlush(opts: {
  isLoadingScene: boolean
  hasDirtyChanges: boolean
  storedNodeCount: number
  currentNodeCount: number
  authorizedNodeDrop?: boolean
}): ExitFlushDecision {
  if (!opts.hasDirtyChanges) return 'skip-clean'
  if (opts.isLoadingScene) return 'skip-loading'
  if (
    isSuspiciousNodeDrop(opts.storedNodeCount, opts.currentNodeCount) &&
    !opts.authorizedNodeDrop
  ) {
    return 'blocked-suspicious'
  }
  return 'flush'
}

export type SaveStatus =
  | 'idle'
  | 'pending'
  | 'local-saved'
  | 'saving'
  | 'saved'
  | 'paused'
  | 'error'

interface UseAutoSaveOptions {
  onSave?: (scene: SceneGraph, options?: { keepalive?: boolean }) => Promise<void>
  /** Durable local write, completed before the network queue may send this commit. */
  onLocalSave?: (scene: SceneGraph) => Promise<void>
  onDirty?: () => void
  onSaveStatusChange?: (status: SaveStatus) => void
  isVersionPreviewMode?: boolean
}

/** One subscription per Editor: committed edits only, never animation/drag notifications. */
export function useAutoSave(options: UseAutoSaveOptions): {
  isLoadingSceneRef: MutableRefObject<boolean>
} {
  const isLoadingSceneRef = useRef(true)
  const latest = useRef(options)
  latest.current = options
  useEffect(() => {
    const tracker = createStoredNodeCountTracker(Object.keys(useScene.getState().nodes).length)
    let past = [...useScene.temporal.getState().pastStates]
    let future = [...useScene.temporal.getState().futureStates]
    const queue = createSceneSaveQueue({
      persist: options.onLocalSave ? (graph) => latest.current.onLocalSave!(graph) : undefined,
      sync: async (graph) => {
        if (latest.current.onSave) await latest.current.onSave(graph)
        else saveSceneToLocalStorage(graph)
      },
      paused: () =>
        isLoadingSceneRef.current ||
        !!latest.current.isVersionPreviewMode ||
        useViewer.getState().inputDragging ||
        useInteractionScope.getState().scope.kind !== 'idle',
      status: (status) => latest.current.onSaveStatusChange?.(status),
    })
    let committed: SceneGraph | undefined
    function enqueue(graph: SceneGraph, intentional = false) {
      if (isLoadingSceneRef.current || latest.current.isVersionPreviewMode) return
      const count = Object.keys(graph.nodes).length
      if (
        !graph.rootNodeIds.length ||
        !tracker.allowWrite(count, intentional || isAuthorizedNodeDrop(graph))
      ) {
        latest.current.onSaveStatusChange?.('error')
        return
      }
      const { nodes, rootNodeIds, collections, materials, installedPlugins } = graph
      committed = { nodes, rootNodeIds, collections, materials, installedPlugins }
      latest.current.onDirty?.()
      queue.enqueue(committed)
    }
    const stopCommits = subscribeSceneCommits((commit) => {
      if (commit.origin === 'load') return
      // Delete/undo may intentionally return to the scaffold. Empty unloads remain blocked.
      const removed = Object.keys(commit.before.nodes).some(
        (id) => !Object.hasOwn(commit.current.nodes, id),
      )
      enqueue(
        commit.current,
        removed && !!commit.changedNodeIds?.size && commit.current.rootNodeIds.length > 0,
      )
    })
    const stopScene = useScene.subscribe((state) => {
      if (isLoadingSceneRef.current) {
        tracker.trackLoadedGraph(Object.keys(state.nodes).length)
        const { nodes, rootNodeIds, collections, materials, installedPlugins } = state
        committed = { nodes, rootNodeIds, collections, materials, installedPlugins }
      } else {
        const history = useScene.temporal.getState()
        const restored =
          (history.pastStates.length < past.length && past.some((s) => s.nodes === state.nodes)) ||
          (history.futureStates.length < future.length &&
            future.some((s) => s.nodes === state.nodes))
        if (restored && state.nodes !== committed?.nodes) enqueue(state, true)
      }
    })
    const stopHistory = useScene.temporal.subscribe((state) => {
      past = [...state.pastStates]
      future = [...state.futureStates]
    })
    const retry = () => {
      if (committed && !isLoadingSceneRef.current && !latest.current.isVersionPreviewMode)
        queue.enqueue(committed)
      queue.retry()
    }
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (!queue.unsavedLocally) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('online', retry)
    window.addEventListener('scene:retry-save', retry)
    window.addEventListener('beforeunload', warnUnsaved)
    return () => {
      stopCommits()
      stopScene()
      stopHistory()
      queue.dispose()
      window.removeEventListener('online', retry)
      window.removeEventListener('scene:retry-save', retry)
      window.removeEventListener('beforeunload', warnUnsaved)
    }
  }, [options.onLocalSave])
  return { isLoadingSceneRef }
}
