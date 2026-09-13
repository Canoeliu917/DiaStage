'use client'

// Node registry bootstrap is loaded once at the root via
// `<ClientBootstrap>` in the scene route — no per-component side-effect
// import here.
import { SiteNode, useScene } from '@pascal-app/core'
import {
  applySceneGraphToEditor,
  Editor,
  type SaveStatus,
  type SceneGraph,
  useEditor,
} from '@pascal-app/editor'
import { NeutralRenderEnvironment, StableRenderMode, ViewerErrorBoundary } from '@pascal-app/viewer'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BETA_EXPERT_MEDIA_ENABLED } from '@/lib/beta-capabilities'
import { countGraphNodes, isEmptyGraphOverwrite } from '@/lib/empty-graph-guard'
import { archiveLegacyLighting } from '@/lib/legacy-lighting'
import { bindRehearsalScene, clearProposalGhost } from '@/lib/rehearsal-intelligence/authority'
import { SceneJournal } from '@/lib/scene-journal'
import { type PersistedSceneGraph, sceneGraphSignature } from '@/lib/scene-signature'
import { THEATRE_METADATA_KEY } from '@/lib/theatre/scene-adapter'
import { migrateStageDocument } from '@/lib/theatre/simulation'
import { cn } from '@/lib/utils'
import { validateCameraProject } from './camera-studio/model'
import { CameraPersistence } from './camera-studio/persistence'
import { DiaDock } from './dia-dock'
import { StageCommandRuntime } from './stage-entry/runtime'

const StagePlacementRuntime = dynamic(
  () => import('./stage-entry/manual-stage-panel').then((m) => m.StagePlacementRuntime),
  { ssr: false },
)
const StagePlacementSystem = dynamic(
  () => import('./stage-entry/placement-system').then((m) => m.StagePlacementSystem),
  { ssr: false },
)
const StagePlacementFloorplan = dynamic(
  () => import('./stage-entry/placement-system').then((m) => m.StagePlacementFloorplan),
  { ssr: false },
)
const StagePlanPreviewSystem = dynamic(
  () => import('./stage-entry/plan-preview-system').then((m) => m.StagePlanPreviewSystem),
  { ssr: false },
)
const StageContactSystem = dynamic(
  () => import('./stage-entry/contact-system').then((m) => m.StageContactSystem),
  { ssr: false },
)
const FoldingSystem = dynamic(
  () => import('./stage-entry/folding-system').then((m) => m.FoldingSystem),
  { ssr: false },
)
const StagePlanPreviewFloorplan = dynamic(
  () => import('./stage-entry/plan-preview-floorplan').then((m) => m.StagePlanPreviewFloorplan),
  { ssr: false },
)
const StageSelectionPanel = dynamic(
  () => import('./stage-entry/stage-selection-panel').then((m) => m.StageSelectionPanel),
  { ssr: false },
)
const RehearsalPartner = dynamic(
  () => import('./theatre/rehearsal-partner').then((m) => m.RehearsalPartner),
  { ssr: false },
)

const CameraRehearsalSystem = dynamic(
  () => import('./camera-rehearsal-system').then((m) => m.CameraRehearsalSystem),
  { ssr: false },
)
const CameraMonitor = dynamic(
  () => import('./camera-studio/camera-monitor').then((m) => m.CameraMonitor),
  { ssr: false },
)
const CameraStageFloorplan = dynamic(
  () => import('./camera-studio/camera-stage-floorplan').then((m) => m.CameraStageFloorplan),
  { ssr: false },
)
const CameraStageSystem = dynamic(
  () => import('./camera-studio/camera-stage-system').then((m) => m.CameraStageSystem),
  { ssr: false },
)
const CameraStudioDock = dynamic(
  () => import('./camera-studio/dock').then((m) => m.CameraStudioDock),
  { ssr: false },
)
const CameraStudioRuntime = dynamic(
  () => import('./camera-studio/runtime').then((m) => m.CameraStudioRuntime),
  { ssr: false },
)
const RemountPreviewSystem = dynamic(
  () => import('./remount-preview-system').then((m) => m.RemountPreviewSystem),
  { ssr: false },
)

import { StudioNavigation } from './studio-navigation'
import { useStudioSidebar } from './studio-sidebar'
import { RehearsalTransport, TheatreFloorplan, TheatreRuntime } from './theatre/runtime'
import { SceneLayersRuntime } from './theatre/scene-visibility'
import { useTheatreDocument } from './theatre/state'
import { VersionViewSync } from './theatre/versions-panel'
import './theatre/dia-conversation.css'
import { EditorViewerToolbarLeft, EditorViewerToolbarRight } from './viewer-toolbar'

export interface SceneMeta {
  id: string
  name: string
  projectId: string | null
  thumbnailUrl: string | null
  version: number
  createdAt: string
  updatedAt: string
  ownerId: string | null
  sizeBytes: number
  nodeCount: number
}

interface SceneLoaderProps {
  initialScene: SceneGraph
  meta: SceneMeta
  modelConfigured?: boolean
}

interface LiveSceneEvent {
  eventId: number
  sceneId: string
  version: number
  kind: string
  createdAt: string
  graph: PersistedSceneGraph
}

/**
 * `?disable=postFx` is read at post-processing module load, so it only takes
 * effect on a full page load. Reading it here as well lets the flag survive a
 * client-side navigation, since `disablePostFx` is a live prop.
 */
function isLightPreviewQuery(searchParams: URLSearchParams): boolean {
  const disable = searchParams.get('disable') ?? ''
  return disable.split(',').some((p) => p.trim() === 'postFx')
}

export function SceneLoader({ initialScene, meta, modelConfigured = false }: SceneLoaderProps) {
  const [stableMode, setStableMode] = useState(true)
  useEffect(() => {
    try {
      setStableMode(localStorage.getItem('diastage:stable-mode') !== 'false')
    } catch {
      /* Default remains stable. */
    }
  }, [])
  const journal = useMemo(() => new SceneJournal(meta.id), [meta.id])
  const needsRecoverySync = useRef(false)
  const syncConflict = useRef(false)
  useEffect(
    () =>
      bindRehearsalScene(meta.id, async () => {
        if (syncConflict.current) throw new Error('请先处理场景版本冲突，再生成建议')
        await journal.assertCurrent()
      }),
    [meta.id, journal],
  )
  const { group, onGroupChange, sidebarTabs, sidebarTopSlot } = useStudioSidebar(meta.id)
  const { document } = useTheatreDocument()
  const activePanel = useEditor((state) => state.activeSidebarPanel)
  const immersive = useEditor(
    (state) => state.isCaptureMode || state.isFirstPersonMode || state.isPreviewMode,
  )
  const cameraEnabled = ['stage-cameras', 'observe', 'record', 'display'].includes(activePanel)
  const recordingEnabled =
    BETA_EXPERT_MEDIA_ENABLED &&
    group === 'rehearse' &&
    ['observe', 'record', 'camera-rehearsal'].includes(activePanel)
  const searchParams = useSearchParams()
  const initialWorkspace = useRef(searchParams.get('workspace'))
  useEffect(() => {
    if (
      initialWorkspace.current === 'remount' ||
      initialWorkspace.current === 'set' ||
      initialWorkspace.current === 'rehearse'
    ) {
      const workspace = initialWorkspace.current
      initialWorkspace.current = null
      onGroupChange(workspace)
    }
  }, [onGroupChange])
  const versionRef = useRef(meta.version)
  const loadedMetaKeyRef = useRef<string | null>(null)
  const localDirtyRef = useRef(false)
  const submittedGraphRef = useRef<string | null>(null)
  // Node count of the graph the server is known to hold. Guards against the
  // autosave wipe class: a save fired from a not-yet-hydrated (empty) editor
  // store must never overwrite a populated server copy.
  const serverNodeCountRef = useRef(meta.nodeCount)
  const lastRemoteGraphJsonRef = useRef<string | null>(null)
  const applyingRemoteRef = useRef(false)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [stageReady, setStageReady] = useState(false)
  const handleLoaderChange = useCallback((visible: boolean) => setStageReady(!visible), [])
  const exportBackup = useCallback(() => {
    const url = URL.createObjectURL(
      new Blob([sceneGraphSignature(useScene.getState())], { type: 'application/json' }),
    )
    const link = window.document.createElement('a')
    link.href = url
    link.download = `DiaStage-${meta.id}-本机备份.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [meta.id])
  useEffect(() => {
    if (stageReady && needsRecoverySync.current) {
      needsRecoverySync.current = false
      window.dispatchEvent(new Event('scene:retry-save'))
    }
  }, [stageReady])

  const lightPreview = stableMode || isLightPreviewQuery(searchParams)
  const sceneLoadKey = `${meta.id}:${meta.version}`

  useEffect(() => {
    if (loadedMetaKeyRef.current === sceneLoadKey) return
    loadedMetaKeyRef.current = sceneLoadKey
    versionRef.current = meta.version
    serverNodeCountRef.current = meta.nodeCount
    localDirtyRef.current = false
    submittedGraphRef.current = null
    lastRemoteGraphJsonRef.current = null
    applyingRemoteRef.current = false
    setConflict(false)
    setSaveError(null)
    setStageReady(false)
  }, [sceneLoadKey, meta.version, meta.nodeCount])

  const handleLoad = useCallback(async () => {
    const graph = structuredClone(archiveLegacyLighting(initialScene))
    const site = graph.rootNodeIds
      .map((id) => SiteNode.safeParse(graph.nodes[id]))
      .find((result) => result.success)?.data
    if (site && site.metadata.diastageCameraStudio === undefined) {
      try {
        const saved = localStorage.getItem(`camera-studio:v1:${meta.id}`)
        if (saved) {
          site.metadata.diastageCameraStudio = validateCameraProject(JSON.parse(saved))
          graph.nodes[site.id] = site
        }
      } catch {
        /* Keep unreadable legacy camera cache intact. */
      }
    }
    const recovered = await journal.recover(graph, meta.version)
    localDirtyRef.current = recovered.pending
    needsRecoverySync.current = recovered.pending
    syncConflict.current = recovered.conflict
    setConflict(recovered.conflict)
    if (recovered.pending) setSaveStatus('local-saved')
    return recovered.graph
  }, [initialScene, meta.id, meta.version, journal])

  const handleLocalSave = useCallback(
    async (graph: SceneGraph) => {
      try {
        await journal.append(graph)
      } catch (error) {
        setSaveError(
          error instanceof DOMException && error.name === 'QuotaExceededError'
            ? '本机空间不足，最新操作尚未写入；已保存事务仍保留。请先导出备份，再释放空间并重试。'
            : `本机保存失败：${error instanceof Error ? error.message : '无法写入事务日志'}。请保留页面并导出备份。`,
        )
        throw error
      }
    },
    [journal],
  )

  const handleSave = useCallback(
    async (graph: SceneGraph) => {
      if (syncConflict.current) throw new Error('版本冲突；本机事务已保留')
      const journalGraph = graph
      const liveGraphJson = sceneGraphSignature(graph)
      let browserLighting: string | null = null
      try {
        browserLighting = localStorage.getItem(`lighting:v1:${meta.id}`)
      } catch {
        /* Browser storage can be disabled. */
      }
      graph = archiveLegacyLighting(graph, browserLighting)
      const graphJson = sceneGraphSignature(graph)
      if (lastRemoteGraphJsonRef.current === liveGraphJson) {
        lastRemoteGraphJsonRef.current = null
        await journal.acknowledge(journalGraph, versionRef.current)
        if (sceneGraphSignature(useScene.getState()) === liveGraphJson)
          localDirtyRef.current = false
        return
      }
      // Only suppress the autosave generated by the remote apply itself.
      // A subsequent local edit must save even if it happens immediately.
      lastRemoteGraphJsonRef.current = null

      // Wipe guard: never PUT an empty graph over a populated server copy.
      // An empty serialization here means the editor store was not hydrated
      // (load in flight or failed), not that the user deleted everything.
      const outgoingNodeCount = countGraphNodes(graph)
      if (isEmptyGraphOverwrite(outgoingNodeCount, serverNodeCountRef.current)) {
        console.error(
          `[scene-loader] Blocked autosave: refusing to overwrite scene ${meta.id} ` +
            `(${serverNodeCountRef.current} nodes on the server) with an empty graph.`,
        )
        setSaveError('已阻止自动保存：场景尚未加载完成，请稍后重试。')
        throw new Error('场景尚未加载完成')
      }

      try {
        const site = graph.rootNodeIds
          .map((id) => SiteNode.safeParse(graph.nodes[id]))
          .find((result) => result.success)?.data
        const rawDocument = site?.metadata[THEATRE_METADATA_KEY]
        let name = meta.name
        if (rawDocument) {
          try {
            name = migrateStageDocument(rawDocument).production.name
          } catch {
            /* Preserve unrecognized legacy metadata. */
          }
        }
        submittedGraphRef.current = graphJson
        const response = await fetch(`/api/scenes/${meta.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': String(versionRef.current),
          },
          body: JSON.stringify({ name, graph }),
          signal: AbortSignal.timeout(20_000),
        })

        if (response.status === 409) {
          // A response can be lost after a successful write. Full snapshots
          // are idempotent: acknowledge an identical server result, never apply twice.
          const remote = await fetch(`/api/scenes/${meta.id}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
          })
          if (remote.ok) {
            const stored = (await remote.json()) as {
              graph: SceneGraph
              version: number
              nodeCount: number
            }
            if (sceneGraphSignature(stored.graph) === graphJson) {
              versionRef.current = stored.version
              serverNodeCountRef.current = stored.nodeCount
              await journal.acknowledge(journalGraph, stored.version)
              if (sceneGraphSignature(useScene.getState()) === liveGraphJson)
                localDirtyRef.current = false
              setSaveError(null)
              return
            }
          }
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          if (body?.error === 'empty_graph_rejected') {
            // Server-side wipe guard (defense in depth behind the client-side
            // check above) — not a concurrent-session conflict.
            console.error(
              `[scene-loader] Server rejected an empty-graph save for scene ${meta.id}.`,
            )
            throw new Error('已阻止空场景覆盖，请重新加载后重试')
          }
          setConflict(true)
          syncConflict.current = true
          clearProposalGhost()
          throw new Error('剧目已被其他窗口更新，请先处理版本冲突')
        }

        if (!response.ok) {
          throw new Error(`请求失败（${response.status}），请检查连接后重试`)
        }

        const next = (await response.json()) as SceneMeta
        versionRef.current = Math.max(versionRef.current, next.version)
        serverNodeCountRef.current = next.nodeCount
        await journal.acknowledge(journalGraph, next.version)
        if (sceneGraphSignature(useScene.getState()) === liveGraphJson)
          localDirtyRef.current = false
        setSaveError(null)
      } catch (error) {
        setSaveError(
          error instanceof Error ? `保存失败：${error.message}` : '保存失败，请稍后重试。',
        )
        throw error
      }
    },
    [meta.id, meta.name, journal],
  )

  useEffect(() => {
    const source = new EventSource(`/api/scenes/${meta.id}/events`)

    source.addEventListener('scene', (event) => {
      let payload: LiveSceneEvent
      try {
        payload = JSON.parse((event as MessageEvent<string>).data) as LiveSceneEvent
      } catch {
        return
      }
      if (payload.sceneId !== meta.id) return
      if (payload.version <= versionRef.current) return

      const remoteSignature = sceneGraphSignature(payload.graph)
      if (remoteSignature === submittedGraphRef.current) {
        versionRef.current = payload.version
        serverNodeCountRef.current = countGraphNodes(payload.graph)
        return
      }
      clearProposalGhost()
      if (localDirtyRef.current) {
        setConflict(true)
        syncConflict.current = true
        return
      }

      versionRef.current = payload.version
      serverNodeCountRef.current = countGraphNodes(payload.graph)
      lastRemoteGraphJsonRef.current = sceneGraphSignature(archiveLegacyLighting(payload.graph))
      applyingRemoteRef.current = true
      try {
        applySceneGraphToEditor(archiveLegacyLighting(payload.graph))
      } finally {
        applyingRemoteRef.current = false
      }
      setConflict(false)
      setSaveError(null)
    })

    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) {
        setSaveError('场景实时连接已断开，请刷新页面重新连接。')
      }
    })

    return () => source.close()
  }, [meta.id])

  return (
    <NeutralRenderEnvironment.Provider value={true}>
      <StableRenderMode.Provider value={stableMode}>
        <div className="studio-workspace" data-studio-group={group}>
          <CameraPersistence sceneId={meta.id} />
          <VersionViewSync />
          <SceneLayersRuntime key={`layers:${meta.id}`} enabled={!immersive} />
          <StagePlacementRuntime key={`placement:${meta.id}`} />
          <StageCommandRuntime
            sceneId={meta.id}
            rootId={initialScene.rootNodeIds[0]}
            applyPlan={stageReady && searchParams.get('applyPlan') === '1'}
          />
          {conflict && (
            <div
              role="alert"
              className="studio-save-notice shrink-0 border-b border-border bg-background p-3"
            >
              <h2 className="font-semibold text-sm">此场景已在其他窗口更新</h2>
              <p className="mt-1 text-muted-foreground text-xs">
                本机事务已保留，同步已暂停。请导出本机版本备份后处理差异；重新打开仍会恢复本机事务。
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-xs hover:bg-accent/80"
                  onClick={exportBackup}
                  type="button"
                >
                  导出本机版本
                </button>
                <button
                  className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-xs hover:bg-accent/40"
                  onClick={() => setConflict(false)}
                  type="button"
                >
                  关闭提示
                </button>
              </div>
            </div>
          )}
          {saveError && !conflict && (
            <div
              role="alert"
              className="studio-save-notice shrink-0 border-b border-destructive/50 bg-background p-3"
            >
              <p className="font-medium text-destructive text-xs">{saveError}</p>
              <button
                type="button"
                className="mt-2 border px-3 py-1 text-xs"
                onClick={() => {
                  window.dispatchEvent(new Event('scene:retry-save'))
                }}
              >
                重试保存
              </button>
              <button
                type="button"
                className="mt-2 ml-2 border px-3 py-1 text-xs"
                onClick={exportBackup}
              >
                导出备份
              </button>
            </div>
          )}
          <div className="dia-stage-layout">
            <div className="dia-editor">
              <Editor
                navbarSlot={
                  <StudioNavigation
                    sceneName={document?.production.name ?? meta.name}
                    group={group}
                    onGroupChange={onGroupChange}
                    actions={
                      <>
                        <span className="studio-save-status" role="status">
                          {
                            {
                              idle: '自动保存',
                              pending: '待保存',
                              'local-saved': '本机已保存',
                              saving: '保存中…',
                              saved: '本机已保存 · 已同步',
                              paused: '保存已暂停',
                              error: '保存失败',
                            }[saveStatus]
                          }
                        </span>
                        <button
                          aria-pressed={stableMode}
                          className={cn(
                            'rounded-md border border-border px-3 py-1.5 font-medium text-xs',
                            lightPreview ? 'bg-accent' : 'bg-background/90 hover:bg-accent/40',
                          )}
                          onClick={() => {
                            setStableMode(!stableMode)
                            try {
                              localStorage.setItem('diastage:stable-mode', String(!stableMode))
                            } catch {
                              /* Session choice still applies. */
                            }
                          }}
                          title="稳定模式限制帧率与分辨率，关闭后期和阴影；不改变舞台数据与复台计算"
                          type="button"
                        >
                          稳定模式
                        </button>
                      </>
                    }
                  />
                }
                disablePostFx={lightPreview}
                layoutVersion="v2"
                selectionPanelSlot={<StageSelectionPanel />}
                onLoad={handleLoad}
                onLoaderChange={handleLoaderChange}
                sceneLoadKey={sceneLoadKey}
                onSave={handleSave}
                onLocalSave={handleLocalSave}
                onDirty={() => {
                  if (!applyingRemoteRef.current) localDirtyRef.current = true
                }}
                onSaveStatusChange={setSaveStatus}
                projectId={meta.projectId ?? 'default'}
                viewerRuntimeSlot={
                  <>
                    {(cameraEnabled || recordingEnabled) && (
                      <ViewerErrorBoundary fallback={null} scope="recording-runtime">
                        <CameraStudioRuntime />
                      </ViewerErrorBoundary>
                    )}
                    <TheatreRuntime enabled={group !== 'remount'} />
                  </>
                }
                viewerSceneSlot={
                  <>
                    {group === 'remount' && (
                      <ViewerErrorBoundary fallback={null} scope="remount-preview">
                        <RemountPreviewSystem sceneId={meta.id} />
                      </ViewerErrorBoundary>
                    )}
                    {cameraEnabled && (
                      <ViewerErrorBoundary fallback={null} scope="camera-stage">
                        <CameraStageSystem enabled />
                      </ViewerErrorBoundary>
                    )}
                    <StagePlacementSystem enabled={!immersive} />
                    <FoldingSystem enabled={!immersive} />
                    <StagePlanPreviewSystem enabled={!immersive} />
                    <ViewerErrorBoundary fallback={null} scope="stage-contact-feedback">
                      <StageContactSystem enabled={!immersive} />
                    </ViewerErrorBoundary>
                  </>
                }
                studioSceneSlot={
                  recordingEnabled ? (
                    <ViewerErrorBoundary fallback={null} scope="sequence-recording">
                      <CameraRehearsalSystem sceneId={meta.id} />
                    </ViewerErrorBoundary>
                  ) : null
                }
                floorplanSceneSlot={
                  <>
                    <TheatreFloorplan enabled={group !== 'remount'} />
                    {cameraEnabled && <CameraStageFloorplan enabled />}
                    <StagePlacementFloorplan enabled={!immersive} />
                    <StagePlanPreviewFloorplan enabled={!immersive} />
                  </>
                }
                sidebarTabs={sidebarTabs}
                sidebarTopSlot={sidebarTopSlot}
                showPluginPanels={false}
                showLevelSelector={false}
                viewerToolbarLeft={<EditorViewerToolbarLeft />}
                viewerToolbarRight={<EditorViewerToolbarRight />}
              />
              {cameraEnabled && (
                <ViewerErrorBoundary
                  fallback={<p role="alert">监看已暂停，场景仍可编辑。</p>}
                  scope="camera-monitor"
                >
                  <CameraMonitor
                    enabled={cameraEnabled}
                    className="absolute right-4 bottom-4 z-30 max-w-[calc(100%-400px)]"
                  />
                </ViewerErrorBoundary>
              )}
            </div>
            <DiaDock hidden={immersive}>
              {stageReady && (
                <ViewerErrorBoundary
                  scope="dia-conversation"
                  resetKey={meta.id}
                  onError={clearProposalGhost}
                  fallback={
                    <p role="alert">Dia 对话暂不可用，舞台仍可编辑与保存。请刷新后重试。</p>
                  }
                >
                  <RehearsalPartner
                    key={meta.id}
                    sceneId={meta.id}
                    modelConfigured={modelConfigured}
                  />
                </ViewerErrorBoundary>
              )}
            </DiaDock>
          </div>
          {recordingEnabled && (
            <ViewerErrorBoundary
              fallback={<p role="alert">录像已暂停，场景仍可编辑。</p>}
              scope="recording"
            >
              <CameraStudioDock sceneId={meta.id} />
            </ViewerErrorBoundary>
          )}
          <RehearsalTransport enabled={group === 'rehearse'} sceneId={meta.id} />
        </div>
      </StableRenderMode.Provider>
    </NeutralRenderEnvironment.Provider>
  )
}
