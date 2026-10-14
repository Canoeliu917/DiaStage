import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { resolveDefaultDatabasePath } from '@pascal-app/mcp/storage'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'

type ResetPasswordSender = NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']

export function authPaths(env: NodeJS.ProcessEnv = process.env) {
  const sceneDatabase = resolve(resolveDefaultDatabasePath(env))
  const directory = dirname(sceneDatabase)
  return {
    directory,
    sceneDatabase,
    database: join(directory, 'auth.sqlite'),
    secret: join(directory, 'auth.secret'),
  }
}

async function resolveSecret(env: NodeJS.ProcessEnv, baseURL: URL, secretPath: string) {
  if (env.BETTER_AUTH_SECRET) {
    if (env.BETTER_AUTH_SECRET.length < 32)
      throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters')
    return env.BETTER_AUTH_SECRET
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(baseURL.hostname)) {
    throw new Error('BETTER_AUTH_SECRET is required for a public website')
  }
  try {
    await writeFile(secretPath, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const secret = (await readFile(secretPath, 'utf8')).trim()
  if (secret.length < 32) throw new Error('The saved authentication secret is invalid')
  return secret
}

export async function createAuth({
  env = process.env,
  sendResetPassword,
}: {
  env?: NodeJS.ProcessEnv
  sendResetPassword?: ResetPasswordSender
} = {}) {
  const baseURL = new URL(env.BETTER_AUTH_URL || 'http://127.0.0.1:4329')
  if (
    !['http:', 'https:'].includes(baseURL.protocol) ||
    baseURL.username ||
    baseURL.password ||
    baseURL.search ||
    baseURL.hash ||
    baseURL.pathname !== '/'
  )
    throw new Error('BETTER_AUTH_URL must be the website origin')
  if (
    baseURL.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(baseURL.hostname)
  ) {
    throw new Error('Public authentication requires HTTPS')
  }
  const paths = authPaths(env)
  await mkdir(paths.directory, { recursive: true, mode: 0o700 })
  const secret = await resolveSecret(env, baseURL, paths.secret)
  const database = new DatabaseSync(paths.database)
  database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
  const options = {
    appName: 'DiaStage',
    baseURL: baseURL.origin,
    secret,
    database,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      ...(sendResetPassword ? { sendResetPassword } : {}),
    },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true },
  } satisfies BetterAuthOptions
  try {
    const { runMigrations } = await getMigrations(options)
    await runMigrations()
    const auth = betterAuth(options)
    await (await auth.$context).checkSchema?.()
    return { auth, database, paths }
  } catch (error) {
    database.close()
    throw error
  }
}
