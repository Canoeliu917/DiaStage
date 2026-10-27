import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { AI_TOKEN_LIMITS } from '../../apps/editor/lib/ai/config'
import { betaBudgetPolicy, estimateCall } from '../../apps/editor/lib/ai/model-budget'
import { estimateTextCostCny } from '../../apps/editor/lib/ai/model-pricing'
import { aiRequestContext, readAiUsage, trackAiCall } from '../../apps/editor/lib/ai/usage'
import { usageLedger } from '../../apps/editor/lib/ai/usage-ledger'
import { ALIYUN_TRIAL_MODEL, requestAliyunStructured } from './aliyun-chat'

const previousEnv = { ...process.env }
const originalFetch = globalThis.fetch
const format = zodTextFormat(z.strictObject({ answer: z.string() }), 'budget_trial')
const inputText = `PRIVATE_SYNTHETIC_SCRIPT_${'中'.repeat(1100)}`
const instructions = 'Return only the requested synthetic answer.'
const payload = instructions + inputText + JSON.stringify(format)
let directory: string
let db: Database
let requests = 0
let networkAttempts = 0
let responseBody: ReturnType<typeof completion>

function completion() {
  return {
    id: 'synthetic-chat',
    object: 'chat.completion',
    created: 0,
    model: ALIYUN_TRIAL_MODEL,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: '{"answer":"ok"}', refusal: null },
      },
    ],
    usage: {
      prompt_tokens: 3000,
      completion_tokens: 800,
      total_tokens: 3800,
      prompt_tokens_details: { cached_tokens: 1000 },
    },
  }
}

const client = new OpenAI({
  apiKey: 'synthetic-offline-key',
  baseURL: 'https://offline.invalid/compatible-mode/v1',
  maxRetries: 0,
  fetch: async () => {
    requests++
    return Response.json(responseBody)
  },
})

function attempt(userId: string | undefined = 'trial-user', photo = false) {
  const signal = new AbortController().signal
  return aiRequestContext.run({ requestId: crypto.randomUUID(), userId, approvedCny: 0 }, () =>
    trackAiCall(
      photo ? 'photo-stage-plan' : 'stage-command',
      ALIYUN_TRIAL_MODEL,
      signal,
      () =>
        requestAliyunStructured({
          client,
          instructions,
          inputText,
          format,
          signal,
          maxOutputTokens: AI_TOKEN_LIMITS.commandOutput,
          ...(photo
            ? {
                imageDataUrl:
                  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z1sAAAAASUVORK5CYII=',
              }
            : {}),
        }),
      (result) => result.usage,
      null,
      payload,
    ),
  )
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'diastage-aliyun-budget-'))
  process.env.DIASTAGE_AI_LEDGER_PATH = join(directory, 'usage.db')
  process.env.DIASTAGE_AI_BETA_USER_IDS = 'trial-user'
  process.env.DIASTAGE_AI_COMMAND_SOFT_LIMIT_CNY = '0.05'
  process.env.DIASTAGE_USD_CNY_REFERENCE = 'not-used-for-CNY-models'
  delete process.env.OPENAI_API_KEY
  globalThis.fetch = (async () => {
    networkAttempts++
    throw new Error('Network forbidden in offline trial')
  }) as unknown as typeof fetch
  await usageLedger().summary()
  db = new Database(process.env.DIASTAGE_AI_LEDGER_PATH)
})

beforeEach(() => {
  db.exec('DELETE FROM ai_usage')
  process.env.DIASTAGE_AI_BETA_USER_IDS = 'trial-user'
  requests = 0
  responseBody = completion()
})

afterAll(async () => {
  db?.close()
  await usageLedger().close()
  globalThis.fetch = originalFetch
  for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key]
  Object.assign(process.env, previousEnv)
  if (directory) {
    expect(dirname(resolve(directory))).toBe(resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
  expect(networkAttempts).toBe(0)
})

test('invited text settles CNY usage without cache discounts or retaining script contents', async () => {
  expect((await attempt()).output_parsed).toEqual({ answer: 'ok' })
  expect(requests).toBe(1)
  const summary = await usageLedger().userSummary('trial-user')
  expect(summary.dailyCny).toBeCloseTo(0.00124, 8)
  expect(summary.calls).toBe(1)
  const row = db.query('SELECT user_id, record FROM ai_usage').get() as {
    user_id: string
    record: string
  }
  expect(row.user_id).toBe('trial-user')
  expect(row.record).not.toContain('PRIVATE_SYNTHETIC_SCRIPT')
  expect(JSON.parse(row.record)).toMatchObject({
    inputTokens: 3000,
    cachedInputTokens: 1000,
    cacheWriteTokens: 0,
    outputTokens: 800,
    status: 'succeeded',
  })
})

test('a single photo reserves its image allowance and settles the combined provider input once', async () => {
  const textEstimate = estimateCall('stage-command', ALIYUN_TRIAL_MODEL, payload, null)
  const photoEstimate = estimateCall('photo-stage-plan', ALIYUN_TRIAL_MODEL, payload, null)
  expect(photoEstimate).toBeGreaterThan(textEstimate)
  responseBody.usage.prompt_tokens = 19384
  responseBody.usage.total_tokens = 20184
  await attempt('trial-user', true)
  expect(requests).toBe(1)
  expect((await usageLedger().userSummary('trial-user')).dailyCny).toBeCloseTo(
    estimateTextCostCny(ALIYUN_TRIAL_MODEL, 19384, 1000, 800),
    8,
  )
})

test('missing or invalid usage and malformed output retain the reservation and return no result', async () => {
  const estimate = estimateCall('stage-command', ALIYUN_TRIAL_MODEL, payload, null)
  const variants = [
    { ...completion(), usage: undefined },
    { ...completion(), usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
    { ...completion(), usage: { ...completion().usage, prompt_tokens: -1 } },
    { ...completion(), choices: [{ ...completion().choices[0]!, finish_reason: 'length' }] },
    {
      ...completion(),
      choices: [
        {
          ...completion().choices[0]!,
          message: { role: 'assistant', content: 'not json', refusal: null },
        },
      ],
    },
  ]
  for (const body of variants) {
    responseBody = body as typeof responseBody
    await expect(attempt()).rejects.toThrow()
    expect(readAiUsage().at(-1)?.status).toBe('failed')
  }
  expect(requests).toBe(variants.length)
  expect((await usageLedger().summary()).costCny).toBeCloseTo(estimate * variants.length, 7)
})

test('uninvited and empty-list identities cause zero SDK requests or ledger charges', async () => {
  await expect(attempt('stranger')).rejects.toMatchObject({ code: 'AI_INVITE_REQUIRED' })
  process.env.DIASTAGE_AI_BETA_USER_IDS = ''
  await expect(attempt()).rejects.toMatchObject({ code: 'AI_INVITE_REQUIRED' })
  expect(requests).toBe(0)
  expect((await usageLedger().summary()).calls).toBe(0)
})

test('daily, monthly and site hard limits block the SDK request', async () => {
  const limits = betaBudgetPolicy().limits
  for (const kind of ['day', 'month', 'site']) {
    db.exec('DELETE FROM ai_usage')
    await usageLedger().reserve('full', 'previous', 'trial-user', 1, limits)
    if (kind !== 'day')
      db.query('UPDATE ai_usage SET day = ?, cost_units = ?, user_id = ?').run(
        'older-day-in-same-month',
        kind === 'month' ? 500_000_000 : 10_000_000_000,
        kind === 'site' ? 'other-user' : 'trial-user',
      )
    await expect(attempt()).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' })
    expect(requests).toBe(0)
    expect((await usageLedger().summary()).calls).toBe(1)
  }
})
