import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { resolveDefaultDatabasePath } from '@pascal-app/mcp/storage'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { getMigrations } from 'better-auth/db/migration'

type ResetPasswordSender = NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']
type VerificationEmailSender = NonNullable<
  BetterAuthOptions['emailVerification']
>['sendVerificationEmail']

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
  sendVerificationEmail,
  afterResponse,
}: {
  env?: NodeJS.ProcessEnv
  sendResetPassword?: ResetPasswordSender
  sendVerificationEmail?: VerificationEmailSender
  afterResponse?: (send: () => Promise<void>) => void
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
  const needsEmailVerification = (userId: string) => {
    const user = database
      .prepare('SELECT emailVerified, emailVerificationRequired FROM user WHERE id = ?')
      .get(userId)
    return user?.emailVerificationRequired === 1 && user.emailVerified !== 1
  }
  const acceptMailRequest =
    (sender: NonNullable<ResetPasswordSender>) =>
    async (...args: Parameters<NonNullable<ResetPasswordSender>>) => {
      const send = async () => {
        try {
          await sender(...args)
        } catch {
          // Keep recovery responses identical for existing and unknown email addresses.
          console.error('DiaStage account email could not be sent.')
        }
      }
      if (afterResponse) afterResponse(send)
      else await send()
    }
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
      resetPasswordTokenExpiresIn: 3600,
      ...(sendResetPassword ? { sendResetPassword: acceptMailRequest(sendResetPassword) } : {}),
      ...(sendVerificationEmail ? { autoSignIn: false } : {}),
    },
    ...(sendVerificationEmail
      ? {
          emailVerification: {
            sendVerificationEmail: acceptMailRequest(sendVerificationEmail),
            sendOnSignUp: true,
            sendOnSignIn: false,
            autoSignInAfterVerification: false,
            expiresIn: 3600,
          },
        }
      : {}),
    user: {
      additionalFields: {
        emailVerificationRequired: {
          type: 'boolean',
          defaultValue: false,
          input: false,
          returned: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async () => ({ data: { emailVerificationRequired: !!sendVerificationEmail } }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (needsEmailVerification(session.userId))
              throw APIError.from('FORBIDDEN', {
                code: 'EMAIL_NOT_VERIFIED',
                message: 'Email verification is required before signing in.',
              })
          },
        },
      },
    },
    session: { cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: {
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
      },
    },
  } satisfies BetterAuthOptions
  try {
    const { runMigrations } = await getMigrations(options)
    await runMigrations()
    const auth = betterAuth(options)
    await (await auth.$context).checkSchema?.()
    const getSession = async (headers: Headers) => {
      const session = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
      })
      return session && !needsEmailVerification(session.user.id) ? session : null
    }
    return { auth, database, paths, getSession }
  } catch (error) {
    database.close()
    throw error
  }
}
