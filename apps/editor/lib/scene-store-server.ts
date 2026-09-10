import type { SceneOperations } from '@pascal-app/mcp/operations'
import type { SceneStore } from '@pascal-app/mcp/storage'
import { guardSceneApiRequest } from './scene-api-security'

/**
 * Per-process singleton. The factory is async because backend modules are
 * dynamically imported — we cache the in-flight promise so concurrent calls
 * during a cold start share a single instantiation.
 */
let cachedStore: Promise<SceneStore> | null = null
let cachedOperations: Promise<SceneOperations> | null = null

export function getSceneStore(): Promise<SceneStore> {
  if (!cachedStore) {
    cachedStore = (async () => {
      const mod = (await import('@pascal-app/mcp/storage')) as {
        createSceneStore: (env?: NodeJS.ProcessEnv) => Promise<SceneStore>
      }
      return mod.createSceneStore(process.env)
    })()
  }
  return cachedStore
}

export function getSceneOperations(): Promise<SceneOperations> {
  if (!cachedOperations) {
    cachedOperations = (async () => {
      const store = await getSceneStore()
      const mod = (await import('@pascal-app/mcp/operations')) as {
        createSceneOperations: (options: { store: SceneStore }) => SceneOperations
      }
      return mod.createSceneOperations({ store })
    })()
  }
  return cachedOperations
}

export async function getScenePageOperations(requestHeaders: Headers): Promise<SceneOperations> {
  const host = requestHeaders.get('host')
  if (!host) throw new Error('场景读取被拒绝：缺少请求主机。')
  const protocol = requestHeaders.get('x-forwarded-proto') === 'https' ? 'https' : 'http'
  const request = new Request(`${protocol}://${host}/api/scenes`, { headers: requestHeaders })
  const denied = guardSceneApiRequest(request)
  if (denied) throw new Error(`场景读取被拒绝：${denied.status}`)

  // Server pages share the runtime store; a NEXT_PUBLIC origin is frozen at build time.
  return getSceneOperations()
}

/**
 * Test-only helper to reset the cached singleton. Not exported for production
 * callers.
 */
export function __resetSceneStoreForTests(): void {
  cachedStore = null
  cachedOperations = null
}

/**
 * Test-only injection: other test files in the same bun process may have
 * mock.module'd the '@pascal-app/mcp/*' subpaths (the mocks stick for
 * later dynamic imports on some platforms), so route tests inject REAL
 * instances built from relative source imports instead.
 */
export function __setSceneStoreForTests(store: SceneStore, operations: SceneOperations): void {
  cachedStore = Promise.resolve(store)
  cachedOperations = Promise.resolve(operations)
}
