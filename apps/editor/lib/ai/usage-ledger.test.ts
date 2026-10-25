import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UsageLedger, type UsageLimits } from './usage-ledger'

const limits: UsageLimits = { siteMonthlyCny: 100, userMonthlyCny: 5, userDailyCny: 1, taskCny: 1 }
const today = new Date('2026-10-25T12:00:00Z')

test('account daily caps are independent and reset at Beijing midnight', async () => {
  const ledger = new UsageLedger(':memory:')
  const before = new Date('2026-10-25T15:59:59Z')
  const after = new Date('2026-10-25T16:00:00Z')
  try {
    await ledger.reserve('a', 'first', 'alice', 1, limits, before)
    await expect(ledger.reserve('b', 'second', 'alice', 0.01, limits, before)).rejects.toThrow(
      'USER_DAILY_BUDGET_EXCEEDED',
    )
    await ledger.reserve('c', 'first', 'bob', 1, limits, before)
    await ledger.reserve('d', 'third', 'alice', 0.5, limits, after)
    expect(await ledger.userSummary('alice', after)).toEqual({
      dailyCny: 0.5,
      monthlyCny: 1.5,
      calls: 2,
    })
    expect(await ledger.userSummary('bob', after)).toEqual({ dailyCny: 0, monthlyCny: 1, calls: 1 })
    expect(await ledger.userSummary('stranger', after)).toEqual({
      dailyCny: 0,
      monthlyCny: 0,
      calls: 0,
    })
  } finally {
    await ledger.close()
  }
})

test('account monthly cap resets at Beijing month boundary', async () => {
  const ledger = new UsageLedger(':memory:')
  try {
    for (let day = 26; day <= 30; day++)
      await ledger.reserve(
        `a${day}`,
        `task${day}`,
        'alice',
        1,
        limits,
        new Date(`2026-10-${day}T12:00:00Z`),
      )
    const before = new Date('2026-10-31T15:59:59Z')
    await expect(ledger.reserve('extra', 'extra', 'alice', 0.01, limits, before)).rejects.toThrow(
      'USER_MONTHLY_BUDGET_EXCEEDED',
    )
    const after = new Date('2026-10-31T16:00:00Z')
    await ledger.reserve('new-month', 'new-month', 'alice', 1, limits, after)
    expect(await ledger.userSummary('alice', after)).toEqual({
      dailyCny: 1,
      monthlyCny: 1,
      calls: 1,
    })
    expect((await ledger.summary(before)).costCny).toBe(5)
    expect((await ledger.summary(after)).costCny).toBe(1)
  } finally {
    await ledger.close()
  }
})

test('all accounts share the site monthly cap even when a new account has quota', async () => {
  const ledger = new UsageLedger(':memory:')
  try {
    for (let user = 0; user < 20; user++) {
      for (let day = 20; day < 25; day++) {
        const id = `${user}-${day}`
        await ledger.reserve(id, id, `user${user}`, 1, limits, new Date(`2026-10-${day}T12:00:00Z`))
      }
    }
    await expect(ledger.reserve('over', 'over', 'new-user', 0.01, limits, today)).rejects.toThrow(
      'SITE_MONTHLY_BUDGET_EXCEEDED',
    )
    expect(await ledger.summary(today)).toEqual({ scope: 'site', costCny: 100, calls: 100 })
  } finally {
    await ledger.close()
  }
})

test('task cap accumulates across calls and is scoped to its account', async () => {
  const ledger = new UsageLedger(':memory:')
  const generous = { ...limits, userDailyCny: 5 }
  try {
    await ledger.reserve('a', 'task', 'alice', 0.6, generous, today)
    await expect(ledger.reserve('b', 'task', 'alice', 0.5, generous, today)).rejects.toThrow(
      'TASK_BUDGET_EXCEEDED',
    )
    await ledger.reserve('c', 'task', 'bob', 0.6, generous, today)
    await ledger.reserve('d', 'other-task', 'alice', 0.6, generous, today)
    expect((await ledger.userSummary('alice', today)).monthlyCny).toBe(1.2)
  } finally {
    await ledger.close()
  }
})

test('two ledger connections cannot both reserve the last account or site allowance', async () => {
  const root = mkdtempSync(join(tmpdir(), 'diastage-budget-'))
  const path = join(root, 'usage.db')
  const first = new UsageLedger(path)
  const second = new UsageLedger(path)
  try {
    const attempts = await Promise.allSettled([
      first.reserve('a', 'task-a', 'alice', 0.6, limits, today),
      second.reserve('b', 'task-b', 'alice', 0.6, limits, today),
    ])
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await first.summary(today)).costCny).toBe(0.6)
    const siteLimits = { ...limits, siteMonthlyCny: 1 }
    const siteAttempts = await Promise.allSettled([
      first.reserve('c', 'task-c', 'bob', 0.3, siteLimits, today),
      second.reserve('d', 'task-d', 'carol', 0.3, siteLimits, today),
    ])
    expect(siteAttempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await second.summary(today)).costCny).toBe(0.9)
  } finally {
    await first.close()
    await second.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('legacy rows retain cost and content, count toward site, and never become one account usage', async () => {
  const root = mkdtempSync(join(tmpdir(), 'diastage-budget-legacy-'))
  const path = join(root, 'usage.db')
  const original = new Database(path)
  original.exec(
    'CREATE TABLE ai_usage (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, month TEXT NOT NULL, cost_units INTEGER NOT NULL, record TEXT)',
  )
  original
    .query('INSERT INTO ai_usage VALUES (?, ?, ?, ?, ?)')
    .run('old', 'old-request', '2026-10', 9_980_000_000, '{"legacy":true}')
  original.close()
  const ledger = new UsageLedger(path)
  try {
    expect((await ledger.summary(today)).costCny).toBe(99.8)
    expect(await ledger.userSummary('alice', today)).toEqual({
      dailyCny: 0,
      monthlyCny: 0,
      calls: 0,
    })
    await expect(ledger.reserve('new', 'new', 'alice', 0.3, limits, today)).rejects.toThrow(
      'SITE_MONTHLY_BUDGET_EXCEEDED',
    )
    const check = new Database(path)
    try {
      expect(check.query('SELECT * FROM ai_usage WHERE id = ?').get('old')).toEqual({
        id: 'old',
        request_id: 'old-request',
        month: '2026-10',
        cost_units: 9_980_000_000,
        record: '{"legacy":true}',
        user_id: null,
        day: null,
      })
    } finally {
      check.close()
    }
  } finally {
    await ledger.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('settlement keeps sub-cent precision and unknown failures retain reserved cost', async () => {
  const ledger = new UsageLedger(':memory:')
  try {
    await ledger.reserve('a', 'task', 'alice', 0.6, limits, today)
    await ledger.reconcile('a', null, '{"status":"failed"}')
    expect((await ledger.userSummary('alice', today)).dailyCny).toBe(0.6)
    await ledger.reconcile('a', 0.01092, '{}')
    expect((await ledger.summary(today)).costCny).toBeCloseTo(0.01092, 8)
    await ledger.reserve('b', 'other', 'alice', 0.6, limits, today)
    await ledger.reconcile('b', 1.1, '{}')
    await expect(ledger.reserve('c', 'third', 'alice', 0.01, limits, today)).rejects.toThrow(
      'USER_DAILY_BUDGET_EXCEEDED',
    )
    expect((await ledger.summary(today)).costCny).toBeCloseTo(1.11092, 8)
  } finally {
    await ledger.close()
  }
})

test('invalid money, limits and identity are rejected before a reservation is stored', async () => {
  const ledger = new UsageLedger(':memory:')
  try {
    for (const amount of [Number.NaN, Infinity, -0.1, Number.MAX_SAFE_INTEGER])
      await expect(ledger.reserve('a', 'task', 'alice', amount, limits, today)).rejects.toThrow()
    for (const key of Object.keys(limits) as (keyof UsageLimits)[]) {
      for (const amount of [0, -1, Number.NaN, Infinity])
        await expect(
          ledger.reserve('a', 'task', 'alice', 0.1, { ...limits, [key]: amount }, today),
        ).rejects.toThrow()
    }
    await expect(ledger.reserve('a', 'task', ' ', 0.1, limits, today)).rejects.toThrow()
    await expect(ledger.reconcile('a', Number.NaN, '{}')).rejects.toThrow()
    expect((await ledger.summary(today)).calls).toBe(0)
  } finally {
    await ledger.close()
  }
})
