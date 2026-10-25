import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openSqliteDatabase, type SqliteDatabase } from '@pascal-app/mcp/storage'
import { z } from 'zod'

export interface UsageLimits {
  siteMonthlyCny: number
  userMonthlyCny: number
  userDailyCny: number
  taskCny: number
}

function costUnits(cost: number, roundUp = true) {
  const scaled = cost * 100_000_000
  const nearest = Math.round(scaled)
  // Avoid rounding an exact decimal such as 1.1 up because of its binary representation.
  const stable = Math.abs(scaled - nearest) <= Number.EPSILON * Math.abs(scaled) ? nearest : scaled
  const units = roundUp ? Math.ceil(stable) : Math.floor(stable)
  if (cost < 0 || !Number.isSafeInteger(units)) throw new Error('费用无效')
  return units
}

function calendarDay(now: Date) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export class UsageLedger {
  private readonly ready: Promise<SqliteDatabase>
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.ready = openSqliteDatabase(path).then((db) => {
      db.exec(
        'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, month TEXT NOT NULL, cost_units INTEGER NOT NULL, record TEXT)',
      )
      db.exec('BEGIN IMMEDIATE')
      try {
        const columns = z
          .array(z.object({ name: z.string() }))
          .parse(db.query('PRAGMA table_info(ai_usage)').all())
        // Old rows retain their recorded month and count toward the site budget only.
        for (const column of ['user_id', 'day']) {
          if (!columns.some(({ name }) => name === column))
            db.exec(`ALTER TABLE ai_usage ADD COLUMN ${column} TEXT`)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        db.close()
        throw error
      }
      return db
    })
  }
  async reserve(
    id: string,
    requestId: string,
    userId: string,
    estimate: number,
    limits: UsageLimits,
    now = new Date(),
  ) {
    if (!id.trim() || !requestId.trim() || !userId.trim()) throw new Error('预算账号无效')
    const units = costUnits(estimate)
    for (const limit of [
      limits.siteMonthlyCny,
      limits.userMonthlyCny,
      limits.userDailyCny,
      limits.taskCny,
    ]) {
      if (!(limit > 0)) throw new Error('预算无效')
      costUnits(limit)
    }
    const day = calendarDay(now)
    const month = day.slice(0, 7)
    const db = await this.ready
    db.exec('BEGIN IMMEDIATE')
    try {
      const monthly = z.object({ site: z.number(), user: z.number(), day: z.number() }).parse(
        db
          .query(`SELECT COALESCE(SUM(cost_units), 0) AS site,
            COALESCE(SUM(CASE WHEN user_id = ? THEN cost_units ELSE 0 END), 0) AS user,
            COALESCE(SUM(CASE WHEN user_id = ? AND day = ? THEN cost_units ELSE 0 END), 0) AS day
            FROM ai_usage WHERE month = ?`)
          .get(userId, userId, day, month),
      )
      const task = z
        .object({ total: z.number() })
        .parse(
          db
            .query(
              'SELECT COALESCE(SUM(cost_units), 0) AS total FROM ai_usage WHERE user_id = ? AND request_id = ?',
            )
            .get(userId, requestId),
        )
      const checks = [
        [monthly.site, limits.siteMonthlyCny, 'SITE_MONTHLY_BUDGET_EXCEEDED'],
        [monthly.user, limits.userMonthlyCny, 'USER_MONTHLY_BUDGET_EXCEEDED'],
        [monthly.day, limits.userDailyCny, 'USER_DAILY_BUDGET_EXCEEDED'],
        [task.total, limits.taskCny, 'TASK_BUDGET_EXCEEDED'],
      ] as const
      for (const [used, limit, code] of checks) {
        if (used + units > costUnits(limit, false)) throw new Error(code)
      }
      db.query(
        'INSERT INTO ai_usage(id, request_id, user_id, day, month, cost_units) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, requestId, userId, day, month, units)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  async reconcile(id: string, cost: number | null, safeRecord: string) {
    const units = cost === null ? null : costUnits(cost)
    const db = await this.ready
    db.query(
      'UPDATE ai_usage SET cost_units = COALESCE(?, cost_units), record = ? WHERE id = ?',
    ).run(units, safeRecord, id)
  }
  async summary(now = new Date()) {
    const db = await this.ready
    const row = z
      .object({ total: z.number(), calls: z.number() })
      .parse(
        db
          .query(
            'SELECT COALESCE(SUM(cost_units), 0) AS total, COUNT(*) AS calls FROM ai_usage WHERE month = ?',
          )
          .get(calendarDay(now).slice(0, 7)),
      )
    return { scope: 'site', costCny: row.total / 100_000_000, calls: row.calls }
  }
  async userSummary(userId: string, now = new Date()) {
    if (!userId.trim()) throw new Error('预算账号无效')
    const db = await this.ready
    const day = calendarDay(now)
    const row = z.object({ daily: z.number(), monthly: z.number(), calls: z.number() }).parse(
      db
        .query(`SELECT COALESCE(SUM(CASE WHEN day = ? THEN cost_units ELSE 0 END), 0) AS daily,
        COALESCE(SUM(cost_units), 0) AS monthly, COUNT(*) AS calls
        FROM ai_usage WHERE user_id = ? AND month = ?`)
        .get(day, userId, day.slice(0, 7)),
    )
    return {
      dailyCny: row.daily / 100_000_000,
      monthlyCny: row.monthly / 100_000_000,
      calls: row.calls,
    }
  }
  async close() {
    ;(await this.ready).close()
  }
}
let ledger: UsageLedger | undefined
export function usageLedger() {
  ledger ??= new UsageLedger(
    resolve(/* turbopackIgnore: true */ process.env.DIASTAGE_AI_LEDGER_PATH ?? 'data/ai-usage.db'),
  )
  return ledger
}
