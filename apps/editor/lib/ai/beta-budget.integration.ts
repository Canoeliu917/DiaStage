import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'
import { GET as getUsage } from '../../app/api/ai/usage/route'
import { __resetAuthForTests, getAuth, getSession } from '../auth/server'
import { handleAiRequest } from './api'
import { betaBudgetPolicy, estimateCall } from './model-budget'
import { estimateTextCostCny } from './model-pricing'
import { readAiUsage, recordAiUsage, trackAiCall } from './usage'
import { usageLedger } from './usage-ledger'

const origin = 'http://127.0.0.1:4329'
const model = 'gpt-5.6-luna'
const payload = 'synthetic budget input'
const providerUsage = {
  input_tokens: 42,
  output_tokens: 8,
  input_tokens_details: { cached_tokens: 12, cache_write_tokens: 0 },
}
const savedEnv = { ...process.env }
const savedFetch = globalThis.fetch
let directory: string
let ledgerDb: DatabaseSync
let alice: { cookie: string; id: string }
let bob: { cookie: string; id: string }

function request(
  cookie = alice?.cookie,
  extra: Record<string, string> = {},
  path = '/api/stage/plan',
  body: unknown = {},
) {
  return new NextRequest(`${origin}${path}`, {
    method: path.startsWith('/api/ai/usage') ? 'GET' : 'POST',
    headers: {
      host: new URL(origin).host,
      origin,
      'content-type': 'application/json',
      'x-forwarded-for': `synthetic-${crypto.randomUUID()}`,
      'x-diastage-budget-consent': '100',
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    ...(path.startsWith('/api/ai/usage') ? {} : { body: JSON.stringify(body) }),
  })
}

function paid(signal: AbortSignal) {
  return trackAiCall(
    'stage-command',
    model,
    signal,
    async () => providerUsage,
    (value) => value,
    null,
    payload,
  )
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'diastage-ai-beta-'))
  process.env.PASCAL_DB_PATH = join(directory, 'scenes.db')
  process.env.DIASTAGE_AI_LEDGER_PATH = join(directory, 'ai-usage.db')
  process.env.BETTER_AUTH_URL = origin
  process.env.NEXT_PUBLIC_APP_URL = origin
  process.env.BETTER_AUTH_SECRET = 'synthetic-ai-beta-secret-at-least-32-characters'
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  process.env.DIASTAGE_USD_CNY_REFERENCE = '7'
  delete process.env.OPENAI_API_KEY
  globalThis.fetch = async () => {
    throw new Error('Network is forbidden in AI beta tests')
  }
  await __resetAuthForTests()
  const auth = await getAuth()
  const register = async (name: string) => {
    const response = await auth.handler(
      request('', {}, '/api/auth/sign-up/email', {
        name,
        email: `${name.toLowerCase()}@example.com`,
        password: 'synthetic-test-password',
      }),
    )
    assert.equal(response.status, 200)
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const session = await getSession(new Headers({ cookie }))
    assert.ok(session)
    return { cookie, id: session.user.id }
  }
  alice = await register('Alice')
  bob = await register('Bob')
  const authDb = new DatabaseSync(join(directory, 'auth.sqlite'))
  try {
    authDb.exec(
      'CREATE TABLE diastage_owner_bootstrap (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL)',
    )
    authDb.prepare('INSERT INTO diastage_owner_bootstrap VALUES (1, ?)').run(alice.id)
  } finally {
    authDb.close()
  }
  await usageLedger().summary()
  ledgerDb = new DatabaseSync(process.env.DIASTAGE_AI_LEDGER_PATH)
})

beforeEach(() => {
  process.env.DIASTAGE_AI_BETA_USER_IDS = alice.id
  process.env.DIASTAGE_AI_COMMAND_SOFT_LIMIT_CNY = '0.05'
  process.env.DIASTAGE_AI_SCRIPT_SOFT_LIMIT_CNY = '0.5'
  process.env.DIASTAGE_AI_SCRIPT_HARD_LIMIT_CNY = '1'
  ledgerDb.exec('DELETE FROM ai_usage')
})

after(async () => {
  ledgerDb?.close()
  if (directory) await usageLedger().close()
  await __resetAuthForTests()
  globalThis.fetch = savedFetch
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
  if (directory) {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    await rm(directory, { recursive: true, force: true })
  }
})

test('invited cookie account settles provider counts and retains only safe usage fields', async () => {
  const response = await handleAiRequest(request(), async ({ signal }) => ({
    result: await paid(signal),
  }))
  assert.equal(response.status, 200)
  const { requestId } = await response.json()
  const entry = readAiUsage().find((record) => record.requestId === requestId)!
  assert.equal(entry.inputTokens, 42)
  assert.equal(entry.cachedInputTokens, 12)
  assert.equal(entry.outputTokens, 8)
  recordAiUsage({
    ...entry,
    ...{ transcript: 'PRIVATE TEXT', prompt: 'PRIVATE SCRIPT', audio: [1, 2] },
  })
  assert.doesNotMatch(JSON.stringify(readAiUsage()), /PRIVATE/)
  const row = ledgerDb.prepare('SELECT user_id, request_id, record FROM ai_usage').get()!
  assert.equal(row.user_id, alice.id)
  assert.equal(row.request_id, requestId)
  assert.equal(JSON.parse(String(row.record)).inputTokens, 42)
  assert.doesNotMatch(String(row.record), /synthetic budget input|PRIVATE/)
  const summary = await usageLedger().userSummary(alice.id)
  assert.equal(summary.calls, 1)
  assert.ok(Math.abs(summary.dailyCny - estimateTextCostCny(model, 42, 12, 8)) < 1e-8)
})

test('anonymous and uninvited accounts cannot charge an invited account using forged headers or body', async () => {
  let executions = 0
  for (const cookie of ['', bob.cookie]) {
    const response = await handleAiRequest(
      request(
        cookie,
        {
          'x-user-id': alice.id,
          'x-diastage-user-id': alice.id,
          'x-diastage-budget-user-id': alice.id,
        },
        '/api/stage/plan',
        { userId: alice.id, ownerId: alice.id },
      ),
      async ({ signal }) => {
        return {
          result: await trackAiCall(
            'stage-command',
            model,
            signal,
            async () => {
              executions++
              return providerUsage
            },
            (value) => value,
            null,
            payload,
          ),
        }
      },
    )
    assert.equal(response.status, cookie ? 403 : 401)
    if (cookie) assert.equal((await response.json()).error.code, 'AI_INVITE_REQUIRED')
  }
  assert.equal(executions, 0)
  assert.equal((await usageLedger().summary()).calls, 0)
})

test('empty invitation configuration disables paid AI even for the administrator', async () => {
  delete process.env.DIASTAGE_AI_BETA_USER_IDS
  const response = await handleAiRequest(request(), async ({ signal }) => ({
    result: await paid(signal),
  }))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'AI_INVITE_REQUIRED')
  assert.equal((await usageLedger().summary()).calls, 0)
})

test('cache writes settle separately and absent write counts conservatively retain their higher rate', async () => {
  for (const details of [
    {
      cached_tokens: 12,
      cache_write_tokens: 20,
      cache_write_tokens_details: { ttl_12h_tokens: 5 },
    },
    { cached_tokens: 12 },
  ]) {
    const result = { ...providerUsage, input_tokens_details: details }
    const response = await handleAiRequest(request(), async ({ signal }) => ({
      result: await trackAiCall(
        'stage-command',
        model,
        signal,
        async () => result,
        (value) => value,
        null,
        payload,
      ),
    }))
    assert.equal(response.status, 200)
    const { requestId } = await response.json()
    const row = ledgerDb
      .prepare('SELECT cost_units, record FROM ai_usage WHERE request_id = ?')
      .get(requestId)!
    const cost = estimateTextCostCny(
      model,
      42,
      12,
      8,
      7,
      false,
      details.cache_write_tokens ?? 30,
      details.cache_write_tokens_details?.ttl_12h_tokens ?? 0,
    )
    assert.ok(Math.abs(Number(row.cost_units) / 100_000_000 - cost) < 1e-8)
    assert.equal(
      JSON.parse(String(row.record)).cacheWriteTokens,
      details.cache_write_tokens ?? null,
    )
  }
})

test('more than 20 distinct invitees fails closed before a paid operation', async () => {
  process.env.DIASTAGE_AI_BETA_USER_IDS = [
    alice.id,
    ...Array.from({ length: 20 }, (_, i) => `synthetic-${i}`),
  ].join(',')
  let executions = 0
  const response = await handleAiRequest(request(), async ({ signal }) => ({
    result: await trackAiCall(
      'stage-command',
      model,
      signal,
      async () => {
        executions++
        return providerUsage
      },
      (value) => value,
      null,
      payload,
    ),
  }))
  assert.equal(response.status, 500)
  assert.equal(executions, 0)
  assert.equal((await usageLedger().summary()).calls, 0)
})

test('missing budget input or trusted account never invokes the provider, including skipSceneAuth', async () => {
  let executions = 0
  const operation = async () => {
    executions++
    return providerUsage
  }
  const missingPayload = await handleAiRequest(request(), async ({ signal }) => ({
    result: await trackAiCall('stage-command', model, signal, operation, (value) => value),
  }))
  assert.equal(missingPayload.status, 500)
  await assert.rejects(
    trackAiCall(
      'stage-command',
      model,
      new AbortController().signal,
      operation,
      (value) => value,
      null,
      payload,
    ),
    { code: 'AI_INVITE_REQUIRED' },
  )
  const skipped = await handleAiRequest(
    request(),
    async ({ signal }) => ({
      result: await trackAiCall(
        'stage-command',
        model,
        signal,
        operation,
        (value) => value,
        null,
        payload,
      ),
    }),
    { skipSceneAuth: true },
  )
  assert.equal(skipped.status, 403)
  assert.equal(executions, 0)
  assert.equal((await usageLedger().summary()).calls, 0)
})

test('local parser remains free for uninvited and exhausted accounts; local cancellation is recorded', async () => {
  await usageLedger().reserve('full-day', 'previous-task', alice.id, 1, betaBudgetPolicy().limits)
  for (const cookie of [bob.cookie, alice.cookie]) {
    const response = await handleAiRequest(request(cookie), async ({ signal }) => ({
      result: await trackAiCall(
        'stage-command',
        'local-parser',
        signal,
        async () => 'local',
        () => null,
      ),
    }))
    assert.equal(response.status, 200)
  }
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    trackAiCall(
      'stage-command',
      'local-parser',
      controller.signal,
      async () => 1,
      () => null,
    ),
  )
  assert.equal(readAiUsage().at(-1)?.status, 'cancelled')
  assert.equal(readAiUsage().at(-1)?.estimatedCostCny, 0)
  assert.equal((await usageLedger().summary()).calls, 1)
})

test('huge consent cannot override the account daily hard budget', async () => {
  await usageLedger().reserve(
    'almost-full',
    'previous-task',
    alice.id,
    0.99,
    betaBudgetPolicy().limits,
  )
  let executions = 0
  const response = await handleAiRequest(
    request(alice.cookie, { 'x-diastage-budget-consent': '999999999' }),
    async ({ signal }) => ({
      result: await trackAiCall(
        'stage-command',
        model,
        signal,
        async () => {
          executions++
          return providerUsage
        },
        (value) => value,
        null,
        payload,
      ),
    }),
  )
  assert.equal(response.status, 402)
  assert.equal((await response.json()).error.code, 'BUDGET_EXCEEDED')
  assert.equal(executions, 0)
  assert.equal((await usageLedger().userSummary(alice.id)).dailyCny, 0.99)
})

test('failed and cancelled paid calls retain their reserved estimate when provider usage is unknown', async () => {
  const estimate = estimateCall('stage-command', model, payload, null)
  for (const cancel of [false, true]) {
    const controller = new AbortController()
    let completion: Promise<unknown> | undefined
    const base = request()
    const response = await handleAiRequest(
      new Request(base, { signal: controller.signal }),
      async ({ signal }) => {
        completion = trackAiCall(
          'stage-command',
          model,
          signal,
          async () => {
            if (cancel) {
              controller.abort()
              signal.throwIfAborted()
            }
            throw new Error('Synthetic provider failure')
          },
          () => null,
          null,
          payload,
        )
        return { result: await completion }
      },
    )
    assert.equal(response.status, cancel ? 499 : 500)
    await completion?.catch(() => {})
    const { requestId } = await response.json()
    assert.equal(
      readAiUsage().find((record) => record.requestId === requestId)?.status,
      cancel ? 'cancelled' : 'failed',
    )
  }
  assert.equal((await usageLedger().summary()).calls, 2)
  assert.ok(Math.abs((await usageLedger().userSummary(alice.id)).dailyCny - 2 * estimate) < 2e-8)
})

test('validation retries share request identity and cumulative task budget', async () => {
  process.env.DIASTAGE_AI_SCRIPT_HARD_LIMIT_CNY = '0.15'
  let executions = 0
  const attempt = (signal: AbortSignal) =>
    trackAiCall(
      'script-stage-plan',
      model,
      signal,
      async () => {
        executions++
        throw new SyntaxError('Synthetic invalid model output')
      },
      () => null,
      null,
      payload,
    )
  const response = await handleAiRequest(request(), async ({ signal }) => {
    await assert.rejects(attempt(signal), SyntaxError)
    return { result: await attempt(signal) }
  })
  assert.equal(response.status, 402)
  assert.equal((await response.json()).error.code, 'BUDGET_EXCEEDED')
  assert.equal(executions, 1)
  assert.equal((await usageLedger().summary()).calls, 1)
})

test('audio accepts a defined empty payload and charges the validated duration estimate', async () => {
  const response = await handleAiRequest(request(), async ({ signal }) => ({
    result: await trackAiCall(
      'voice-transcription',
      'gpt-transcribe',
      signal,
      async () => 'synthetic transcript',
      () => null,
      30,
      '',
    ),
  }))
  assert.equal(response.status, 200)
  assert.equal((await usageLedger().userSummary(alice.id)).dailyCny, 0.01575)
})

test('usage API exposes only own totals, while only bootstrap owner can see site aggregate', async () => {
  await usageLedger().reserve('alice-entry', 'alice-task', alice.id, 0.1, betaBudgetPolicy().limits)
  await usageLedger().reserve('bob-entry', 'bob-task', bob.id, 0.25, betaBudgetPolicy().limits)
  const ownerResponse = await getUsage(request(alice.cookie, {}, '/api/ai/usage'))
  assert.equal(ownerResponse.status, 200)
  const owner = await ownerResponse.json()
  assert.equal(owner.summary.dailyCny, 0.1)
  assert.equal(owner.site.costCny, 0.35)
  assert.equal(owner.site.limitCny, 100)
  const otherResponse = await getUsage(
    request(
      bob.cookie,
      { 'x-user-id': alice.id },
      `/api/ai/usage?userId=${alice.id}&ownerId=${alice.id}`,
    ),
  )
  assert.equal(otherResponse.status, 200)
  const other = await otherResponse.json()
  assert.equal(other.summary.dailyCny, 0.25)
  assert.equal(other.invited, false)
  assert.deepEqual(other.limits, { dailyCny: 1, monthlyCny: 5 })
  assert.equal(other.timeZone, 'Asia/Shanghai')
  assert.equal('site' in other, false)
  assert.equal('userIds' in other, false)
  assert.doesNotMatch(JSON.stringify(other), new RegExp(`${alice.id}|${bob.id}|example.com`))
  assert.equal((await getUsage(request('', {}, '/api/ai/usage'))).status, 401)
})
