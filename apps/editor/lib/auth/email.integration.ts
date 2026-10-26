import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createEmailVerificationToken } from 'better-auth/api'
import { createAuth } from './factory'

const origin = 'http://127.0.0.1:4329'
const password = 'temporary-integration-password'
const secret = 'temporary-email-integration-secret-at-least-32-characters'
let requestId = 0
const request = (path: string, body: unknown, ip = `192.0.2.${++requestId}`) =>
  new Request(`${origin}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
const cookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
const signup = (email: string) => ({ email, name: 'Test', password })

test('verification applies only to new accounts and remains enforced after mail is disabled', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-email-rollout-'))
  const env = { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' as const, BETTER_AUTH_SECRET: secret }
  let context = await createAuth({ env })
  t.after(async () => {
    context.database.close()
    await rm(directory, { recursive: true, force: true })
  })
  const legacySignup = await context.auth.handler(
    request('sign-up/email', signup('old@example.com')),
  )
  const legacyHeaders = new Headers({ cookie: cookie(legacySignup) })
  assert.ok(await context.getSession(legacyHeaders))
  context.database.exec('ALTER TABLE user DROP COLUMN emailVerificationRequired')
  context.database.close()

  const sent: string[] = []
  context = await createAuth({
    env,
    sendVerificationEmail: async ({ url }) => {
      sent.push(url)
    },
  })
  assert.equal((await context.getSession(legacyHeaders))?.user.email, 'old@example.com')
  const legacy = context.database
    .prepare('SELECT emailVerified, emailVerificationRequired FROM user WHERE email = ?')
    .get('old@example.com')
  assert.equal(legacy?.emailVerified, 0)
  assert.equal(legacy?.emailVerificationRequired, 0)

  const registered = await context.auth.handler(
    request('sign-up/email', {
      ...signup('new@example.com'),
      emailVerificationRequired: false,
    }),
  )
  assert.equal(registered.status, 200)
  assert.equal((await registered.json()).token, null)
  assert.equal(cookie(registered), '')
  assert.equal(sent.length, 1)
  const user = context.database
    .prepare('SELECT id, emailVerificationRequired FROM user WHERE email = ?')
    .get('new@example.com')
  assert.equal(user?.emailVerificationRequired, 1)
  const blocked = await context.auth.handler(
    request('sign-in/email', { email: 'new@example.com', password }),
  )
  assert.equal(blocked.status, 403)
  assert.equal((await blocked.json()).code, 'EMAIL_NOT_VERIFIED')
  assert.equal(sent.length, 1)

  context.database.prepare('UPDATE session SET userId = ?').run(user!.id)
  assert.equal(
    (await context.auth.api.getSession({ headers: legacyHeaders }))?.user.email,
    'new@example.com',
  )
  assert.equal(await context.getSession(legacyHeaders), null)
  context.database.close()
  context = await createAuth({ env })
  assert.equal(await context.getSession(legacyHeaders), null)
  assert.equal(
    (await context.auth.handler(request('sign-in/email', { email: 'new@example.com', password })))
      .status,
    403,
  )

  const verified = await context.auth.handler(new Request(sent[0]!))
  assert.equal(verified.status, 302)
  assert.equal(cookie(verified), '')
  const repeated = await context.auth.handler(new Request(sent[0]!))
  assert.equal(repeated.status, 302)
  assert.equal(cookie(repeated), '')
  const signedIn = await context.auth.handler(
    request('sign-in/email', { email: 'new@example.com', password }),
  )
  assert.equal(signedIn.status, 200)
  assert.equal(
    (await context.getSession(new Headers({ cookie: cookie(signedIn) })))?.user.email,
    'new@example.com',
  )
})

test('expired and tampered verification tokens cannot grant a session or verify an account', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-email-expiry-'))
  const context = await createAuth({
    env: { PASCAL_DATA_DIR: directory, NODE_ENV: 'test', BETTER_AUTH_SECRET: secret },
    sendVerificationEmail: async () => {},
  })
  t.after(async () => {
    context.database.close()
    await rm(directory, { recursive: true, force: true })
  })
  await context.auth.handler(request('sign-up/email', signup('expires@example.com')))
  const expired = await createEmailVerificationToken(secret, 'expires@example.com', undefined, -1)
  for (const token of [expired, 'invalid-token']) {
    const response = await context.auth.handler(
      new Request(`${origin}/api/auth/verify-email?token=${token}`),
    )
    assert.equal(response.status, 401)
    assert.equal(cookie(response), '')
  }
  assert.equal(context.database.prepare('SELECT emailVerified FROM user').get()?.emailVerified, 0)
  assert.equal(context.database.prepare('SELECT COUNT(*) AS count FROM session').get()?.count, 0)
})

test('reset tokens expire, are consumed once, and revoke existing sessions', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-email-reset-'))
  const tokens: string[] = []
  const context = await createAuth({
    env: { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' },
    sendResetPassword: async ({ token }) => {
      tokens.push(token)
    },
  })
  t.after(async () => {
    context.database.close()
    await rm(directory, { recursive: true, force: true })
  })
  const registered = await context.auth.handler(
    request('sign-up/email', signup('reset@example.com')),
  )
  const headers = new Headers({ cookie: cookie(registered) })
  assert.ok(await context.getSession(headers))
  const resetBody = { email: 'reset@example.com', redirectTo: `${origin}/reset-password` }
  const accepted = await context.auth.handler(request('request-password-reset', resetBody))
  const missing = await context.auth.handler(
    request('request-password-reset', { ...resetBody, email: 'missing@example.com' }),
  )
  assert.equal(accepted.status, 200)
  assert.deepEqual(await accepted.json(), await missing.json())
  assert.equal(tokens.length, 1)
  context.database
    .prepare('UPDATE verification SET expiresAt = ? WHERE identifier = ?')
    .run(Date.now() - 1000, `reset-password:${tokens[0]}`)
  assert.equal(
    (
      await context.auth.handler(
        request('reset-password', { token: tokens[0], newPassword: `${password}-new` }),
      )
    ).status,
    400,
  )
  assert.ok(await context.getSession(headers))
  await context.auth.handler(request('request-password-reset', resetBody))
  const body = { token: tokens[1], newPassword: `${password}-new` }
  assert.equal((await context.auth.handler(request('reset-password', body))).status, 200)
  assert.equal((await context.auth.handler(request('reset-password', body))).status, 400)
  assert.equal(await context.getSession(headers), null)
  assert.equal(
    (await context.auth.handler(request('sign-in/email', { email: resetBody.email, password })))
      .status,
    401,
  )
  assert.equal(
    (
      await context.auth.handler(
        request('sign-in/email', { email: resetBody.email, password: body.newPassword }),
      )
    ).status,
    200,
  )
})

test('mail failures and resend responses do not reveal account existence or leak provider errors', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-email-failure-'))
  const logs: unknown[][] = []
  t.mock.method(console, 'error', (...args: unknown[]) => {
    logs.push(args)
  })
  let deliveries = 0
  const fail = async () => {
    deliveries++
    throw new Error('secret-provider-body token=do-not-log user@example.com')
  }
  const context = await createAuth({
    env: { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' },
    sendResetPassword: fail,
    sendVerificationEmail: fail,
  })
  t.after(async () => {
    context.database.close()
    await rm(directory, { recursive: true, force: true })
  })
  const registered = await context.auth.handler(
    request('sign-up/email', signup('failure@example.com')),
  )
  assert.equal(registered.status, 200)
  assert.equal((await registered.json()).token, null)
  const duplicate = await context.auth.handler(
    request('sign-up/email', signup('failure@example.com')),
  )
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).token, null)
  for (const endpoint of ['request-password-reset', 'send-verification-email']) {
    const known = await context.auth.handler(request(endpoint, { email: 'failure@example.com' }))
    const unknown = await context.auth.handler(request(endpoint, { email: 'missing@example.com' }))
    assert.equal(known.status, 200)
    assert.equal(unknown.status, 200)
    assert.deepEqual(await known.json(), await unknown.json())
  }
  context.database.exec('UPDATE user SET emailVerified = 1')
  const verified = await context.auth.handler(
    request('send-verification-email', { email: 'failure@example.com' }),
  )
  const unknown = await context.auth.handler(
    request('send-verification-email', { email: 'missing@example.com' }),
  )
  assert.deepEqual(await verified.json(), await unknown.json())
  assert.equal(deliveries, 3)
  assert.equal(logs.length, 3)
  assert.ok(
    logs.every(
      (args) => args.length === 1 && args[0] === 'DiaStage account email could not be sent.',
    ),
  )
})

test('mail request throttles persist across authentication restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-email-rate-'))
  const env = { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' as const }
  const senders = { sendVerificationEmail: async () => {}, sendResetPassword: async () => {} }
  let context = await createAuth({ env, ...senders })
  t.after(async () => {
    context.database.close()
    await rm(directory, { recursive: true, force: true })
  })
  for (const endpoint of ['request-password-reset', 'send-verification-email']) {
    for (let count = 0; count < 3; count++)
      assert.equal(
        (
          await context.auth.handler(
            request(endpoint, { email: 'missing@example.com' }, '198.51.100.1'),
          )
        ).status,
        200,
      )
  }
  context.database.close()
  context = await createAuth({ env, ...senders })
  for (const endpoint of ['request-password-reset', 'send-verification-email']) {
    const response = await context.auth.handler(
      request(endpoint, { email: 'missing@example.com' }, '198.51.100.1'),
    )
    assert.equal(response.status, 429)
    assert.ok(Number(response.headers.get('x-retry-after')) > 0)
  }
})

test('registration, recovery and resend complete before the managed mail tasks start', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-email-after-'))
  const tasks: (() => Promise<void>)[] = []
  let sent = 0
  let finish: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const logs: unknown[][] = []
  t.mock.method(console, 'error', (...args: unknown[]) => {
    logs.push(args)
  })
  const sender = async () => {
    sent++
    await pending
    throw new Error('private-provider-response')
  }
  const context = await createAuth({
    env: { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' },
    sendResetPassword: sender,
    sendVerificationEmail: sender,
    afterResponse: (send) => {
      tasks.push(send)
    },
  })
  t.after(async () => {
    context.database.close()
    await rm(directory, { recursive: true, force: true })
  })
  assert.equal(
    (await context.auth.handler(request('sign-up/email', signup('after@example.com')))).status,
    200,
  )
  for (const endpoint of ['request-password-reset', 'send-verification-email']) {
    const known = await context.auth.handler(request(endpoint, { email: 'after@example.com' }))
    const unknown = await context.auth.handler(request(endpoint, { email: 'missing@example.com' }))
    assert.equal(known.status, 200)
    assert.deepEqual(await known.json(), await unknown.json())
  }
  assert.equal(sent, 0)
  assert.equal(tasks.length, 3)
  const running = tasks.map((task) => task())
  assert.equal(sent, 3)
  const received = await context.auth.handler(
    request('request-password-reset', { email: 'after@example.com' }),
  )
  assert.equal(received.status, 200)
  assert.equal(sent, 3)
  finish()
  await Promise.all(running)
  assert.equal(logs.length, 3)
  assert.ok(
    logs.every(
      (args) => args.length === 1 && args[0] === 'DiaStage account email could not be sent.',
    ),
  )
})
