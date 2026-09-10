import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openSqliteDatabase, type SqliteDatabase } from '@pascal-app/mcp/storage'
import { z } from 'zod'

export class UsageLedger {
  private readonly ready: Promise<SqliteDatabase>
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.ready = openSqliteDatabase(path).then((db) => {
      db.exec(
        'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, month TEXT NOT NULL, cost_units INTEGER NOT NULL, record TEXT)',
      )
      return db
    })
  }
  async reserve(
    id: string,
    requestId: string,
    estimate: number,
    monthlyLimit: number,
    taskLimit: number,
    now = new Date(),
  ) {
    const db = await this.ready
    if (!Number.isFinite(estimate) || estimate < 0 || !(monthlyLimit > 0) || !(taskLimit > 0))
      throw new Error('预算无效')
    const month = now.toISOString().slice(0, 7)
    const units = Math.ceil(estimate * 100_000_000)
    db.exec('BEGIN IMMEDIATE')
    try {
      const monthly = z
        .object({ total: z.number() })
        .parse(
          db
            .query('SELECT COALESCE(SUM(cost_units), 0) AS total FROM ai_usage WHERE month = ?')
            .get(month),
        )
      const task = z
        .object({ total: z.number() })
        .parse(
          db
            .query(
              'SELECT COALESCE(SUM(cost_units), 0) AS total FROM ai_usage WHERE request_id = ?',
            )
            .get(requestId),
        )
      if (monthly.total + units > Math.floor(monthlyLimit * 100_000_000))
        throw new Error('MONTHLY_BUDGET_EXCEEDED')
      if (task.total + units > Math.floor(taskLimit * 100_000_000))
        throw new Error('TASK_BUDGET_EXCEEDED')
      db.query('INSERT INTO ai_usage(id, request_id, month, cost_units) VALUES (?, ?, ?, ?)').run(
        id,
        requestId,
        month,
        units,
      )
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  async reconcile(id: string, cost: number | null, safeRecord: string) {
    const db = await this.ready
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('费用无效')
    db.query(
      'UPDATE ai_usage SET cost_units = COALESCE(?, cost_units), record = ? WHERE id = ?',
    ).run(cost === null ? null : Math.ceil(cost * 100_000_000), safeRecord, id)
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
          .get(now.toISOString().slice(0, 7)),
      )
    return { scope: 'local-workspace', costCny: row.total / 100_000_000, calls: row.calls }
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
