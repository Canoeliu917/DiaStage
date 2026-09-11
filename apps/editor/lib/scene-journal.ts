import type { SceneGraph } from '@pascal-app/editor'
import { sceneGraphSignature } from './scene-signature'

type Patch = {
  put: Record<string, unknown>
  remove: string[]
  document: Omit<SceneGraph, 'nodes'>
}
type Head = { id: string; version: number; sequence: number; acknowledged: number }
type Entry = { id: string; sequence: number; patch: Patch }

let durable: { id: string; nodes: SceneGraph['nodes'] } | undefined
const persistedListeners = new Set<() => void>()
function publishLocalCommit(id: string, graph: SceneGraph) {
  durable = { id, nodes: graph.nodes }
  for (const listener of persistedListeners) listener()
}

/** Observe committed snapshots, never pointer-move notifications. */
export function subscribeLocalScene(
  sceneId: string,
  listener: (nodes: SceneGraph['nodes']) => void,
) {
  const notify = () => {
    if (durable?.id === sceneId) listener(durable.nodes)
  }
  persistedListeners.add(notify)
  notify()
  return () => {
    persistedListeners.delete(notify)
  }
}

/** An imported asset is not acknowledged to the phone until its node is durable. */
export function waitForLocalScene(
  sceneId: string,
  matches: (nodes: SceneGraph['nodes']) => boolean,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      persistedListeners.delete(check)
      signal.removeEventListener('abort', abort)
    }
    const check = () => {
      if (durable?.id === sceneId && matches(durable.nodes)) {
        cleanup()
        resolve()
      }
    }
    const abort = () => {
      cleanup()
      reject(new Error('等待本机保存已取消，场景修改仍保留。'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('尚未完成本机保存，请检查存储空间后重试确认。'))
    }, 20_000)
    persistedListeners.add(check)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else check()
  })
}

export function scenePatch(before: SceneGraph, after: SceneGraph): Patch {
  const put: Record<string, unknown> = {}
  for (const [id, node] of Object.entries(after.nodes)) {
    if (before.nodes[id] !== node && JSON.stringify(before.nodes[id]) !== JSON.stringify(node))
      put[id] = node
  }
  return {
    put,
    remove: Object.keys(before.nodes).filter((id) => !Object.hasOwn(after.nodes, id)),
    document: {
      rootNodeIds: after.rootNodeIds,
      collections: after.collections ?? {},
      materials: after.materials ?? {},
      installedPlugins: after.installedPlugins ?? [],
    },
  }
}
export function replayScenePatch(graph: SceneGraph, patch: Patch): SceneGraph {
  const nodes = { ...graph.nodes, ...patch.put }
  for (const id of patch.remove) delete nodes[id]
  return { nodes, ...patch.document }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error)
  })
}
function complete(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('本机事务未完成'))
  })
}
function openJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('diastage-scene-journal', 1)
    opening.onupgradeneeded = () => {
      const db = opening.result
      db.createObjectStore('heads', { keyPath: 'id' })
      db.createObjectStore('checkpoints')
      db.createObjectStore('transactions', { keyPath: ['id', 'sequence'] })
    }
    opening.onsuccess = () => {
      opening.result.onversionchange = () => opening.result.close()
      resolve(opening.result)
    }
    opening.onerror = () => reject(opening.error)
    opening.onblocked = () => reject(new Error('请关闭旧版窗口后重试本机保存'))
  })
}

/** One checkpoint plus ordered patches. Never delete patches before a server acknowledgement. */
export class SceneJournal {
  private db: IDBDatabase | undefined
  private graph: SceneGraph | undefined
  private head: Head | undefined
  private revisions = new WeakMap<SceneGraph, number>()
  constructor(readonly id: string) {}

  async recover(server: SceneGraph, version: number) {
    server = { nodes: server.nodes, ...scenePatch(server, server).document }
    this.db ??= await openJournal()
    const tx = this.db.transaction(['heads', 'checkpoints', 'transactions'], 'readwrite', {
      durability: 'strict',
    })
    const done = complete(tx)
    // Attach rejection immediately, including when request validation aborts below.
    void done.catch(() => {})
    const range = IDBKeyRange.bound([this.id, 0], [this.id, Number.MAX_SAFE_INTEGER])
    const [head, checkpoint, entries] = await Promise.all([
      request<Head | undefined>(tx.objectStore('heads').get(this.id)),
      request<SceneGraph | undefined>(tx.objectStore('checkpoints').get(this.id)),
      request<Entry[]>(tx.objectStore('transactions').getAll(range)),
    ])
    let graph = checkpoint ?? server
    for (const entry of entries) graph = replayScenePatch(graph, entry.patch)
    const pending = entries.length > 0 && sceneGraphSignature(graph) !== sceneGraphSignature(server)
    const conflict = pending && head?.version !== version
    if (!pending) {
      graph = server
      this.head = {
        id: this.id,
        version,
        sequence: head?.sequence ?? 0,
        acknowledged: head?.sequence ?? 0,
      }
      tx.objectStore('heads').put(this.head)
      tx.objectStore('checkpoints').put(graph, this.id)
      tx.objectStore('transactions').delete(range)
    } else {
      if (!head || !checkpoint) {
        tx.abort()
        throw new Error('本机日志不完整，原记录已保留')
      }
      this.head = head
    }
    await done
    this.graph = graph
    this.revisions.set(graph, this.head!.sequence)
    publishLocalCommit(this.id, graph)
    return { graph, pending, conflict }
  }

  async append(graph: SceneGraph) {
    if (!this.db || !this.head || !this.graph) throw new Error('本机日志尚未加载')
    const patch = scenePatch(this.graph, graph)
    const changed =
      Object.keys(patch.put).length ||
      patch.remove.length ||
      JSON.stringify(patch.document) !== JSON.stringify(scenePatch(this.graph, this.graph).document)
    const tx = this.db.transaction(['heads', 'transactions'], 'readwrite', { durability: 'strict' })
    const done = complete(tx)
    void done.catch(() => {})
    const head = await request<Head>(tx.objectStore('heads').get(this.id))
    if (head.sequence !== this.head.sequence) {
      tx.abort()
      throw new Error('另一个窗口已更新本机日志，请导出当前修改后重新打开')
    }
    if (changed) {
      head.sequence++
      tx.objectStore('transactions').add({
        id: this.id,
        sequence: head.sequence,
        patch,
      } satisfies Entry)
      tx.objectStore('heads').put(head)
    }
    await done
    this.head = head
    this.graph = graph
    this.revisions.set(graph, head.sequence)
    publishLocalCommit(this.id, graph)
  }

  async acknowledge(graph: SceneGraph, version: number) {
    const sequence = this.revisions.get(graph)
    if (!this.db || sequence === undefined) throw new Error('缺少本机事务，不清除任何记录')
    const tx = this.db.transaction(['heads', 'checkpoints', 'transactions'], 'readwrite', {
      durability: 'strict',
    })
    const done = complete(tx)
    void done.catch(() => {})
    const head = await request<Head>(tx.objectStore('heads').get(this.id))
    if (sequence >= head.acknowledged && version >= head.version) {
      head.acknowledged = sequence
      head.version = version
      tx.objectStore('heads').put(head)
      // Explicit fields only: a Zustand snapshot can also contain methods.
      tx.objectStore('checkpoints').put(
        { nodes: graph.nodes, ...scenePatch(graph, graph).document },
        this.id,
      )
      tx.objectStore('transactions').delete(IDBKeyRange.bound([this.id, 0], [this.id, sequence]))
    }
    await done
    // append can finish during the request; don't roll back its sequence.
    if (this.head)
      this.head = { ...this.head, acknowledged: head.acknowledged, version: head.version }
  }
}
