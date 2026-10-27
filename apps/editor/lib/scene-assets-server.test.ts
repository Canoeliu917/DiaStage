import { afterEach, beforeEach, expect, test } from 'bun:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { scanGlb } from './remote-voice/scan-test-fixtures'
import {
  readSceneAssetBody,
  SCENE_ASSET_LIMITS,
  SceneAssetStore,
  sceneAssetsDatabasePath,
} from './scene-assets-server'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
)
let directory: string
let stores: SceneAssetStore[]
const id = (number: number) => number.toString(36).padStart(16, '0')
const createStore = (quotas?: { ownerBytes: number; siteBytes: number }) => {
  const store = new SceneAssetStore(join(directory, 'private', 'assets.db'), quotas)
  stores.push(store)
  return store
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'diastage-assets-store-'))
  stores = []
})
afterEach(async () => {
  for (const store of stores) await store.close()
  const target = resolve(directory)
  assert.equal(dirname(target), resolve(tmpdir()))
  assert.ok(basename(target).startsWith('diastage-assets-store-'))
  await rm(target, { recursive: true, force: true })
})

test('asset paths follow the scene database precedence and never derive from an in-memory scene', () => {
  expect(
    sceneAssetsDatabasePath({
      NODE_ENV: 'test',
      PASCAL_DB_PATH: join(directory, 'db', 'scenes.db'),
      PASCAL_DATA_DIR: 'ignored',
    }),
  ).toBe(join(directory, 'db', 'assets.db'))
  expect(
    sceneAssetsDatabasePath({ NODE_ENV: 'test', PASCAL_DATA_DIR: join(directory, 'data') }),
  ).toBe(join(directory, 'data', 'assets.db'))
  expect(() => sceneAssetsDatabasePath({ NODE_ENV: 'test', PASCAL_DB_PATH: ':memory:' })).toThrow(
    'persistent',
  )
  expect(SCENE_ASSET_LIMITS).toEqual({
    fileBytes: 33554432,
    ownerBytes: 268435456,
    siteBytes: 2147483648,
  })
})

test('actual SQLite preserves immutable bytes, metadata and owner isolation after reopening', async () => {
  const store = createStore()
  const initial = await store.put('alice', id(1), 'image/png', png)
  expect(initial.created).toBe(true)
  expect(initial.metadata).toEqual({
    id: id(1),
    contentType: 'image/png',
    bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
  })
  expect(await store.put('alice', id(1), 'image/png', png)).toEqual({ ...initial, created: false })
  const glb = scanGlb()
  await store.put('alice', id(2), 'model/gltf-binary', glb)
  await expect(store.put('alice', id(2), 'model/gltf-binary', scanGlb(6))).rejects.toMatchObject({
    status: 409,
  })
  expect(await store.get('bob', id(1))).toBeNull()
  expect(await store.head('bob', id(1))).toBeNull()
  await store.put('bob', id(1), 'model/gltf-binary', glb)
  expect((await store.get('alice', id(1)))?.body).toEqual(new Uint8Array(png))
  expect((await store.get('bob', id(1)))?.body).toEqual(glb)
  await store.close()
  const reopened = createStore()
  expect(await reopened.head('alice', id(1))).toEqual(initial.metadata)
  expect((await reopened.get('alice', id(2)))?.body).toEqual(glb)
  if (process.platform !== 'win32') {
    expect((await stat(reopened.databasePath)).mode & 0o777).toBe(0o600)
    expect((await stat(dirname(reopened.databasePath))).mode & 0o777).toBe(0o700)
  }
})

test('existing public JPEG and WebP fixtures retain their canonical content types', async () => {
  const store = createStore()
  for (const [index, type, path] of [
    [1, 'image/jpeg', '../public/photo-stage/reference-stage.jpg'],
    [2, 'image/webp', '../public/icons/zone.webp'],
  ] as const) {
    const body = await readFile(new URL(path, import.meta.url))
    const saved = await store.put('alice', id(index), type, body)
    expect(saved.metadata.contentType).toBe(type)
    expect((await store.get('alice', id(index)))?.body).toEqual(new Uint8Array(body))
  }
})

test('PDF, spoofed image MIME, malformed GLB, empty content and invalid IDs never enter the store', async () => {
  const store = createStore()
  const pdf = new TextEncoder().encode('%PDF-1.7 synthetic')
  for (const [type, body] of [
    ['application/pdf', pdf],
    ['image/png', pdf],
    ['image/svg+xml', png],
    ['image/png', png.subarray(0, 12)],
    ['model/gltf-binary', png],
    [
      'model/gltf-binary',
      scanGlb(3, undefined, (json) => {
        json.uri = 'https://example.invalid/mesh'
      }),
    ],
  ] as const)
    await expect(store.put('alice', id(1), type, body)).rejects.toMatchObject({ status: 415 })
  await expect(store.put('alice', id(1), 'image/png', new Uint8Array())).rejects.toMatchObject({
    status: 400,
  })
  await expect(
    store.put('alice', id(1), 'image/png', new Uint8Array(SCENE_ASSET_LIMITS.fileBytes + 1)),
  ).rejects.toMatchObject({ status: 413 })
  for (const invalid of [
    '../assets',
    'A'.repeat(16),
    'a'.repeat(15),
    'a'.repeat(17),
    `asset://${id(1)}`,
  ]) {
    await expect(store.put('alice', invalid, 'image/png', png)).rejects.toMatchObject({
      status: 400,
    })
    await expect(store.get('alice', invalid)).rejects.toMatchObject({ status: 400 })
  }
  expect(await store.head('alice', id(1))).toBeNull()
})

test('owner and site quotas are checked inside the write transaction and retries consume no quota', async () => {
  const store = createStore({ ownerBytes: png.length * 2, siteBytes: png.length * 3 })
  await store.put('alice', id(1), 'image/png', png)
  await store.put('alice', id(2), 'image/png', png)
  await expect(store.put('alice', id(3), 'image/png', png)).rejects.toMatchObject({
    code: 'asset_quota_exceeded',
  })
  await store.put('bob', id(1), 'image/png', png)
  await expect(store.put('bob', id(2), 'image/png', png)).rejects.toMatchObject({ status: 413 })
  expect((await store.put('alice', id(1), 'image/png', png)).created).toBe(false)
  expect(await store.head('alice', id(3))).toBeNull()
  expect(await store.head('bob', id(2))).toBeNull()
})

test('two actual SQLite connections cannot oversubscribe the remaining capacity', async () => {
  const quotas = { ownerBytes: png.length * 2, siteBytes: png.length * 2 }
  const first = createStore(quotas)
  const second = createStore(quotas)
  await first.put('alice', id(1), 'image/png', png)
  await second.head('alice', id(1))
  const results = await Promise.allSettled([
    first.put('alice', id(2), 'image/png', png),
    second.put('bob', id(3), 'image/png', png),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
  expect(failure.reason).toMatchObject({ code: 'asset_quota_exceeded' })
})

test('streamed input ignores Content-Length, stops at the byte cap, and cancels the producer', async () => {
  const normal = new Request(`http://127.0.0.1/api/assets/${id(1)}`, {
    method: 'PUT',
    body: png,
    headers: { 'content-length': '1' },
  })
  expect(await readSceneAssetBody(normal)).toEqual(new Uint8Array(png))
  let pulls = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++
      controller.enqueue(new Uint8Array(1024 * 1024))
    },
    cancel() {
      cancelled = true
    },
  })
  const request = new Request(`http://127.0.0.1/api/assets/${id(1)}`, {
    method: 'PUT',
    body: stream,
    headers: { 'content-length': '1' },
    duplex: 'half',
  } as RequestInit)
  await expect(readSceneAssetBody(request)).rejects.toMatchObject({
    code: 'asset_too_large',
    status: 413,
  })
  expect(cancelled).toBe(true)
  expect(pulls).toBeLessThanOrEqual(34)
  const abort = new AbortController()
  const waiting = new Request(`http://127.0.0.1/api/assets/${id(1)}`, {
    method: 'PUT',
    signal: abort.signal,
    body: new ReadableStream(),
    duplex: 'half',
  } as RequestInit)
  const pending = readSceneAssetBody(waiting)
  abort.abort()
  await expect(pending).rejects.toMatchObject({ code: 'asset_upload_cancelled', status: 408 })
})
