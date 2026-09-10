import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SiteNode } from '@pascal-app/core/schema'
import { NextRequest } from 'next/server'
import { createSceneOperations } from '../../../packages/mcp/src/operations/scene-operations'
import { SqliteSceneStore } from '../../../packages/mcp/src/storage/sqlite-scene-store'
import { PUT } from '../app/api/scenes/[id]/route'
import { POST } from '../app/api/scenes/route'
import {
  __resetSceneStoreForTests,
  __setSceneStoreForTests,
  getScenePageOperations,
} from './scene-store-server'

const savedEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  PASCAL_SCENE_API_TOKEN: process.env.PASCAL_SCENE_API_TOKEN,
  PASCAL_SCENE_API_RATE_LIMIT: process.env.PASCAL_SCENE_API_RATE_LIMIT,
  PASCAL_SCENE_API_ORIGINS: process.env.PASCAL_SCENE_API_ORIGINS,
}
let directory: string
let store: SqliteSceneStore

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'diastage-page-store-'))
  store = new SqliteSceneStore({ databasePath: join(directory, 'production.db') })
  __setSceneStoreForTests(store, createSceneOperations({ store }))
  process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:4318'
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  delete process.env.PASCAL_SCENE_API_TOKEN
  delete process.env.PASCAL_SCENE_API_ORIGINS
})

afterEach(() => {
  store.close()
  __resetSceneStoreForTests()
  rmSync(directory, { recursive: true, force: true })
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('page reads the API runtime store after create and update, regardless of the built public URL', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected self-fetch'))
  try {
    const site = SiteNode.parse({ name: '生产测试舞台' })
    const graph = { nodes: { [site.id]: site }, rootNodeIds: [site.id] }
    const requestHeaders = new Headers({ host: '127.0.0.1:4319' })
    const created = await POST(
      new NextRequest('http://127.0.0.1:4319/api/scenes', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ id: 'page-db-fixture', name: '生产独立剧目', graph }),
      }),
    )
    expect(created.status).toBe(201)

    const operations = await getScenePageOperations(requestHeaders)
    expect((await operations.loadStoredScene('page-db-fixture'))?.graph).toEqual(graph)
    expect(await operations.listScenes({ limit: 50 })).toMatchObject([
      { id: 'page-db-fixture', name: '生产独立剧目', version: 1 },
    ])
    expect(await operations.loadStoredScene('not-in-this-runtime')).toBeNull()

    const updated = await PUT(
      new NextRequest('http://127.0.0.1:4319/api/scenes/page-db-fixture', {
        method: 'PUT',
        headers: requestHeaders,
        body: JSON.stringify({ name: '排演已确认', graph, expectedVersion: 1 }),
      }),
      { params: Promise.resolve({ id: 'page-db-fixture' }) },
    )
    expect(updated.status).toBe(200)
    expect(await operations.loadStoredScene('page-db-fixture')).toMatchObject({
      name: '排演已确认',
      version: 2,
    })
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    fetch.mockRestore()
  }
})

test('page store access retains configured token authentication even on loopback', async () => {
  process.env.PASCAL_SCENE_API_TOKEN = 'page-test-secret'
  await expect(getScenePageOperations(new Headers({ host: '127.0.0.1:4319' }))).rejects.toThrow(
    '401',
  )
  const operations = await getScenePageOperations(
    new Headers({ host: '127.0.0.1:4319', authorization: 'Bearer page-test-secret' }),
  )
  expect(await operations.listScenes()).toEqual([])
})

test('a public request cannot become local through a forwarded host or a missing host', async () => {
  await expect(
    getScenePageOperations(
      new Headers({ host: 'diastage.example', 'x-forwarded-host': '127.0.0.1:4319' }),
    ),
  ).rejects.toThrow('503')
  await expect(getScenePageOperations(new Headers())).rejects.toThrow('缺少请求主机')
})

test('authenticated page reads still reject an unrelated request origin', async () => {
  process.env.PASCAL_SCENE_API_TOKEN = 'page-test-secret'
  const requestHeaders = new Headers({
    host: 'diastage.example',
    'x-forwarded-proto': 'https',
    authorization: 'Bearer page-test-secret',
    origin: 'https://unrelated.example',
  })
  await expect(getScenePageOperations(requestHeaders)).rejects.toThrow('403')
  requestHeaders.set('origin', 'https://diastage.example')
  expect((await getScenePageOperations(requestHeaders)).hasStore).toBe(true)
})
