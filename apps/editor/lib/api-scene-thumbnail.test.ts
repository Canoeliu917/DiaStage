import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { createSceneOperations } from '../../../packages/mcp/src/operations/scene-operations'
import { SqliteSceneStore } from '../../../packages/mcp/src/storage/sqlite-scene-store'
import { POST } from '../app/api/scenes/[id]/thumbnail/route'
import { __resetSceneStoreForTests, __setSceneStoreForTests } from './scene-store-server'

const directory = mkdtempSync(join(tmpdir(), 'scene-cover-test-'))
const store = new SqliteSceneStore({ databasePath: join(directory, 'scenes.db') })
const token = process.env.PASCAL_SCENE_API_TOKEN
const thumbnailUrl = 'data:image/png;base64,iVBORw0KGgo='

beforeAll(async () => {
  delete process.env.PASCAL_SCENE_API_TOKEN
  __setSceneStoreForTests(store, createSceneOperations({ store }))
  await store.save({ id: 'cover', name: 'Cover', graph: { nodes: {}, rootNodeIds: [] } })
})

afterAll(() => {
  store.close()
  __resetSceneStoreForTests()
  if (token === undefined) delete process.env.PASCAL_SCENE_API_TOKEN
  else process.env.PASCAL_SCENE_API_TOKEN = token
  rmSync(directory, { recursive: true, force: true })
})

function request(body: unknown, id = 'cover', headers: Record<string, string> = {}) {
  return POST(
    new NextRequest(`http://127.0.0.1:4318/api/scenes/${id}/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

test('cover POST preserves graph, revision and exact modification timestamp', async () => {
  const before = await store.load('cover')
  const response = await request({ thumbnailUrl, expectedVersion: 1 })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ version: 1, updatedAt: before?.updatedAt })
  expect(await store.load('cover')).toEqual({ ...before, thumbnailUrl })
  expect((await request({ thumbnailUrl, expectedVersion: 2 })).status).toBe(409)
  expect((await request({ thumbnailUrl, expectedVersion: 1 }, 'missing')).status).toBe(404)
})

test('cover POST rejects malformed images, oversized payloads and invalid versions', async () => {
  for (const invalid of [
    { thumbnailUrl, expectedVersion: 0 },
    { thumbnailUrl, expectedVersion: 1.5 },
    { thumbnailUrl },
    { thumbnailUrl: 'https://example.com/image.png', expectedVersion: 1 },
    { thumbnailUrl: 'data:image/svg+xml;base64,PHN2Zy8+', expectedVersion: 1 },
    { thumbnailUrl: 'data:image/png;base64,aGVsbG8=', expectedVersion: 1 },
    { thumbnailUrl: `${thumbnailUrl}${'A'.repeat(2 * 1024 * 1024)}`, expectedVersion: 1 },
  ]) {
    expect((await request(invalid)).status).toBe(400)
  }
  expect(
    (await request({ thumbnailUrl, expectedVersion: 1 }, 'cover', { origin: 'https://evil.test' }))
      .status,
  ).toBe(403)
})
