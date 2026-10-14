import 'server-only'
import type { createAuth } from './factory'

let instance: ReturnType<typeof createAuth> | null = null

async function getAuthContext() {
  instance ??= import('./factory')
    .then(({ createAuth }) => createAuth())
    .catch((error) => {
      instance = null
      throw error
    })
  return instance
}

export async function getAuth() {
  return (await getAuthContext()).auth
}

export async function getSession(headers: Headers) {
  return (await getAuth()).api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  })
}

export async function getBootstrapOwnerId(): Promise<string | null> {
  const { database } = await getAuthContext()
  if (
    !database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'diastage_owner_bootstrap'",
      )
      .get()
  )
    return null
  const row = database.prepare('SELECT user_id FROM diastage_owner_bootstrap WHERE id = 1').get()
  return typeof row?.user_id === 'string' ? row.user_id : null
}

export async function __resetAuthForTests() {
  const previous = instance
  instance = null
  if (previous) (await previous).database.close()
}
