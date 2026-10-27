import { createHash } from 'node:crypto'
import { chmod, mkdir, open } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  openSqliteDatabase,
  resolveDefaultDatabasePath,
  type SqliteDatabase,
} from '@pascal-app/mcp/storage'
import { validateScanGlb } from './remote-voice/scan-glb'

export const SCENE_ASSET_LIMITS = {
  fileBytes: 32 * 1024 * 1024,
  ownerBytes: 256 * 1024 * 1024,
  siteBytes: 2 * 1024 * 1024 * 1024,
} as const

const contentTypes = ['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary'] as const
type AssetContentType = (typeof contentTypes)[number]
export type SceneAssetMetadata = {
  id: string
  contentType: AssetContentType
  bytes: number
  sha256: string
}
type StoredAsset = SceneAssetMetadata & { body: Uint8Array }
type AssetRow = { id: string; content_type: AssetContentType; bytes: number; sha256: string }

export class SceneAssetError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}

export function assertSceneAssetId(id: string): void {
  if (!/^[a-z0-9]{16}$/.test(id)) throw new SceneAssetError('asset_invalid_id', 400)
}

export function sceneAssetContentType(value: string | null): AssetContentType {
  const type = value?.split(';', 1)[0]?.trim().toLowerCase()
  if (!contentTypes.includes(type as AssetContentType))
    throw new SceneAssetError('asset_unsupported_type', 415)
  return type as AssetContentType
}

export function sceneAssetsDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const scenePath = resolveDefaultDatabasePath(env)
  if (scenePath === ':memory:')
    throw new Error('Assets require an explicit persistent data directory')
  return join(dirname(resolve(scenePath)), 'assets.db')
}

export async function readSceneAssetBody(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new SceneAssetError('asset_empty', 400)
  const reader = request.body.getReader()
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120_000)])
  const cancel = () => void reader.cancel().catch(() => {})
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    signal.throwIfAborted()
    while (true) {
      const result = await reader.read()
      signal.throwIfAborted()
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > SCENE_ASSET_LIMITS.fileBytes) throw new SceneAssetError('asset_too_large', 413)
      chunks.push(result.value)
    }
    if (!bytes) throw new SceneAssetError('asset_empty', 400)
    const body = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return body
  } catch (error) {
    if (signal.aborted) throw new SceneAssetError('asset_upload_cancelled', 408)
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}

async function validateBody(contentType: AssetContentType, body: Uint8Array): Promise<void> {
  if (!body.byteLength) throw new SceneAssetError('asset_empty', 400)
  if (body.byteLength > SCENE_ASSET_LIMITS.fileBytes)
    throw new SceneAssetError('asset_too_large', 413)
  if (contentType === 'model/gltf-binary') {
    try {
      await validateScanGlb(
        async (offset, length) => body.subarray(offset, offset + length),
        body.length,
      )
      return
    } catch {
      throw new SceneAssetError('asset_invalid_content', 415)
    }
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  const png =
    body.length >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452 &&
    view.getUint32(16) > 0 &&
    view.getUint32(20) > 0
  const jpeg = body.length >= 4 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
  const webp =
    body.length >= 20 &&
    view.getUint32(0) === 0x52494646 &&
    view.getUint32(4, true) + 8 === body.length &&
    view.getUint32(8) === 0x57454250 &&
    [0x56503820, 0x5650384c, 0x56503858].includes(view.getUint32(12))
  if (!(contentType === 'image/png' ? png : contentType === 'image/jpeg' ? jpeg : webp))
    throw new SceneAssetError('asset_invalid_content', 415)
}

function metadata(row: AssetRow): SceneAssetMetadata {
  return { id: row.id, contentType: row.content_type, bytes: row.bytes, sha256: row.sha256 }
}

export class SceneAssetStore {
  private opening: Promise<SqliteDatabase> | null = null
  constructor(
    readonly databasePath: string,
    private readonly quotas: { ownerBytes: number; siteBytes: number } = SCENE_ASSET_LIMITS,
  ) {}

  private database(): Promise<SqliteDatabase> {
    this.opening ??= (async () => {
      await mkdir(dirname(this.databasePath), { recursive: true, mode: 0o700 })
      const file = await open(this.databasePath, 'a', 0o600)
      await file.close()
      await chmod(this.databasePath, 0o600)
      const db = await openSqliteDatabase(this.databasePath)
      try {
        db.exec(`
          PRAGMA busy_timeout = 5000;
          CREATE TABLE IF NOT EXISTS assets (
            owner_id TEXT NOT NULL,
            id TEXT NOT NULL,
            content_type TEXT NOT NULL,
            bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes = length(body)),
            sha256 TEXT NOT NULL,
            body BLOB NOT NULL,
            PRIMARY KEY (owner_id, id)
          );
        `)
        return db
      } catch (error) {
        db.close()
        throw error
      }
    })()
    return this.opening
  }

  async head(ownerId: string, id: string): Promise<SceneAssetMetadata | null> {
    assertSceneAssetId(id)
    const db = await this.database()
    const row = db
      .query('SELECT id, content_type, bytes, sha256 FROM assets WHERE owner_id = ? AND id = ?')
      .get(ownerId, id) as AssetRow | undefined
    return row ? metadata(row) : null
  }

  async get(ownerId: string, id: string): Promise<StoredAsset | null> {
    assertSceneAssetId(id)
    const db = await this.database()
    const row = db.query('SELECT * FROM assets WHERE owner_id = ? AND id = ?').get(ownerId, id) as
      | (AssetRow & { body: Uint8Array })
      | undefined
    return row ? { ...metadata(row), body: row.body } : null
  }

  async put(ownerId: string, id: string, type: string, body: Uint8Array) {
    assertSceneAssetId(id)
    const contentType = sceneAssetContentType(type)
    await validateBody(contentType, body)
    const sha256 = createHash('sha256').update(body).digest('hex')
    const result: SceneAssetMetadata = { id, contentType, bytes: body.length, sha256 }
    const db = await this.database()
    db.exec('BEGIN IMMEDIATE')
    try {
      const previous = db
        .query('SELECT id, content_type, bytes, sha256 FROM assets WHERE owner_id = ? AND id = ?')
        .get(ownerId, id) as AssetRow | undefined
      if (previous) {
        if (previous.sha256 !== sha256 || previous.content_type !== contentType)
          throw new SceneAssetError('asset_conflict', 409)
        db.exec('COMMIT')
        return { metadata: metadata(previous), created: false }
      }
      const usage = db
        .query(`SELECT COALESCE(SUM(bytes), 0) AS site,
          COALESCE(SUM(CASE WHEN owner_id = ? THEN bytes ELSE 0 END), 0) AS owner FROM assets`)
        .get(ownerId) as { owner: number; site: number }
      if (
        usage.owner + body.length > this.quotas.ownerBytes ||
        usage.site + body.length > this.quotas.siteBytes
      )
        throw new SceneAssetError('asset_quota_exceeded', 413)
      db.query(
        'INSERT INTO assets (owner_id, id, content_type, bytes, sha256, body) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(ownerId, id, contentType, body.length, sha256, body)
      db.exec('COMMIT')
      return { metadata: result, created: true }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  async close(): Promise<void> {
    if (this.opening) (await this.opening).close()
    this.opening = null
  }
}

let store: SceneAssetStore | null = null
export function getSceneAssetStore(): SceneAssetStore {
  store ??= new SceneAssetStore(sceneAssetsDatabasePath())
  return store
}
