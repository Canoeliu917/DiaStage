import type { SceneGraph } from './scene'

export type QueueStatus = 'pending' | 'local-saved' | 'saving' | 'saved' | 'error'

/** Local commits are ordered; network snapshots are coalesced and never overlap. */
export function createSceneSaveQueue(options: {
  persist?: (graph: SceneGraph) => Promise<void>
  sync: (graph: SceneGraph) => Promise<void>
  paused: () => boolean
  status: (status: QueueStatus) => void
}) {
  const local: SceneGraph[] = []
  let latest: SceneGraph | undefined
  let writing = false
  let sending = false
  let disposed = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (delay = 1000) => {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), delay)
  }
  async function flush() {
    if (disposed || writing || sending) return
    if (options.paused()) return schedule()
    writing = true
    try {
      while (local.length) {
        const graph = local[0]!
        await options.persist?.(graph)
        local.shift()
        latest = graph
      }
      if (latest && options.persist) options.status('local-saved')
    } catch {
      options.status('error')
      schedule(Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)))
      return
    } finally {
      writing = false
    }
    if (!latest) return
    if (options.paused()) return schedule()
    const graph = latest
    sending = true
    try {
      if (!options.persist) options.status('saving')
      await options.sync(graph)
      if (latest === graph) latest = undefined
      failures = 0
      if (!latest && !local.length) options.status('saved')
    } catch {
      options.status(options.persist ? 'local-saved' : 'error')
      failures++
    } finally {
      sending = false
      if (local.length || latest) schedule(Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)))
    }
  }
  async function writeLocal() {
    if (disposed || writing) return
    writing = true
    try {
      while (local.length) {
        const graph = local[0]!
        await options.persist?.(graph)
        local.shift()
        latest = graph
      }
      if (options.persist) options.status('local-saved')
      schedule()
    } catch {
      options.status('error')
      schedule(Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)))
    } finally {
      writing = false
    }
  }
  return {
    enqueue(graph: SceneGraph) {
      local.push(graph)
      options.status('pending')
      void writeLocal()
    },
    retry: () => schedule(0),
    get unsavedLocally() {
      return local.length > 0
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
    },
  }
}
