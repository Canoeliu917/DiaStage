import type { SceneOperations } from '@pascal-app/mcp/operations'
import type { SceneStore } from '@pascal-app/mcp/storage'
import { redirect } from 'next/navigation'
import { createPrivateSceneStore } from './private-scene-store'
import { requireSceneSession } from './scene-api-security'

/**
 * Per-process singleton. The factory is async because backend modules are
 * dynamically imported — we cache the in-flight promise so concurrent calls
 * during a cold start share a single instantiation.
 */
let cachedStore: Promise<SceneStore> | null = null

function getSceneStore(): Promise<SceneStore> {
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

export async function getPrivateSceneAccess(request: Request) {
  const session = await requireSceneSession(request)
  if (session instanceof Response) return session
  const store = createPrivateSceneStore(await getSceneStore(), session.user.id)
  const { createSceneOperations } = await import('@pascal-app/mcp/operations')
  return { store, operations: createSceneOperations({ store }), user: session.user }
}

export async function getScenePageOperations(
  requestHeaders: Headers,
  returnTo = '/scenes',
): Promise<SceneOperations> {
  const host = requestHeaders.get('host')
  if (!host) throw new Error('场景读取被拒绝：缺少请求主机。')
  const protocol = requestHeaders.get('x-forwarded-proto') === 'https' ? 'https' : 'http'
  const request = new Request(`${protocol}://${host}/api/scenes`, { headers: requestHeaders })
  const access = await getPrivateSceneAccess(request)
  if (access instanceof Response) {
    if (access.status === 401) redirect(`/login?next=${encodeURIComponent(returnTo)}`)
    throw new Error(`场景读取被拒绝：${access.status}`)
  }
  return access.operations
}

/**
 * Test-only helper to reset the cached singleton. Not exported for production
 * callers.
 */
export function __resetSceneStoreForTests(): void {
  cachedStore = null
}

export const __getSceneStoreForTests = getSceneStore

export function __setSceneStoreForTests(store: SceneStore): void {
  cachedStore = Promise.resolve(store)
}
