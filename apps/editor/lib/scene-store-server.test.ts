import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SqliteSceneStore } from '@pascal-app/mcp/storage'
import {
  __resetSceneStoreForTests,
  __getSceneStoreForTests as getSceneStore,
} from './scene-store-server'

const databasePath = process.env.PASCAL_DB_PATH
let directory: string
let opened: SqliteSceneStore[]

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'scene-singleton-'))
  process.env.PASCAL_DB_PATH = join(directory, 'scenes.db')
  opened = []
  __resetSceneStoreForTests()
})

afterEach(() => {
  for (const store of opened) store.close()
  __resetSceneStoreForTests()
  if (databasePath === undefined) delete process.env.PASCAL_DB_PATH
  else process.env.PASCAL_DB_PATH = databasePath
  rmSync(directory, { recursive: true, force: true })
})

test('the scene store caches its promise and resolved instance', async () => {
  const first = getSceneStore()
  const second = getSceneStore()
  expect(first).toBe(second)
  const store = (await first) as SqliteSceneStore
  opened.push(store)
  expect(await second).toBe(store)
  expect(store.databasePath).toBe(process.env.PASCAL_DB_PATH)
})

test('reset replaces the cached store without module mocks', async () => {
  const first = (await getSceneStore()) as SqliteSceneStore
  opened.push(first)
  __resetSceneStoreForTests()
  const second = (await getSceneStore()) as SqliteSceneStore
  opened.push(second)
  expect(second).not.toBe(first)
})
