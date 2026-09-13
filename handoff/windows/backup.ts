import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '../..')
const source = resolve(root, '.local/handoff-20260913/pascal.db')
if (!existsSync(source)) throw new Error('Scene database missing')
const db = new Database(source, { readonly: true })
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
try {
  db.exec('BEGIN')
  const integrity = db.query('PRAGMA integrity_check').all()
  if (JSON.stringify(integrity) !== '[{"integrity_check":"ok"}]')
    throw new Error(`Database integrity check failed: ${JSON.stringify(integrity)}`)
  const scenes = db.query('SELECT * FROM scenes ORDER BY id').all()
  const revisions = db.query('SELECT * FROM scene_revisions ORDER BY scene_id, version').all()
  const files = {
    'pascal.sqlite': db.serialize(),
    'scenes.json': JSON.stringify(scenes, null, 2),
    'revisions.jsonl': revisions.map((row) => JSON.stringify(row)).join('\n') + '\n',
  }
  db.exec('COMMIT')
  const folder = resolve(root, '.local/backups', new Date().toISOString().replace(/[:.]/g, '-'))
  mkdirSync(folder, { recursive: true })
  const hashes: Record<string, string> = {}
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(resolve(folder, name), contents, { flag: 'wx' })
    hashes[name] = sha256(contents)
  }
  writeFileSync(resolve(folder, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(), scenes: scenes.length, revisions: revisions.length,
    integrity, hashes,
  }, null, 2), { flag: 'wx' })
  console.log(`Saved ${scenes.length} scenes / ${revisions.length} revisions to ${folder}`)
  console.log('Chrome-only Dia conversations, favorites, journal and view settings need a separate browser export.')
} finally {
  db.close()
}
