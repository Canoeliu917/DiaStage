import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteSceneStore } from '../../../packages/mcp/src/storage/sqlite-scene-store'
import type { SceneStore } from '../../../packages/mcp/src/storage/types'
import { createPrivateSceneStore } from './private-scene-store'

const graph = { nodes: {}, rootNodeIds: [] }
let directory: string
let store: SqliteSceneStore
let alice: SceneStore
let bob: SceneStore

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'private-scene-'))
  store = new SqliteSceneStore({ databasePath: join(directory, 'scenes.db') })
  alice = createPrivateSceneStore(store, 'alice')
  bob = createPrivateSceneStore(store, 'bob')
  await store.save({ id: 'legacy', name: 'Existing unclaimed scene', graph })
  await alice.save({ id: 'alice-stage', name: 'Alice', graph })
  await bob.save({ id: 'bob-stage', name: 'Bob', graph })
})

afterEach(() => {
  store.close()
  rmSync(directory, { recursive: true, force: true })
})

test('every list is owner-scoped, even if the caller supplies another owner', async () => {
  expect((await alice.list()).map((scene) => scene.id)).toEqual(['alice-stage'])
  expect((await alice.list({ ownerId: 'bob' })).map((scene) => scene.id)).toEqual(['alice-stage'])
  expect((await bob.list()).map((scene) => scene.id)).toEqual(['bob-stage'])
  expect(await alice.load('bob-stage')).toBeNull()
  expect(await alice.load('legacy')).toBeNull()
  expect(await alice.load('missing')).toBeNull()
  expect(await alice.getProjectStatus!('bob-stage')).toBeNull()
})

test('new scene ownership is forced and foreign or unclaimed IDs cannot be adopted', async () => {
  expect(
    await alice.save({ id: 'forced-owner', name: 'Owned', ownerId: 'bob', graph }),
  ).toMatchObject({
    ownerId: 'alice',
  })
  for (const id of ['bob-stage', 'legacy']) {
    const before = await store.load(id)
    await expect(
      alice.save({ id, name: 'Overwrite', graph, expectedVersion: 1 }),
    ).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(await store.load(id)).toEqual(before)
  }
})

test('every mutating method and event history rejects foreign and unclaimed scenes', async () => {
  for (const id of ['bob-stage', 'legacy']) {
    const before = await store.load(id)
    const attempts = [
      () => alice.delete(id),
      () => alice.rename(id, 'Changed'),
      () =>
        alice.updateThumbnail!(id, 'data:image/png;base64,iVBORw0KGgo=', { expectedVersion: 1 }),
      () => alice.appendSceneEvent!({ sceneId: id, version: 1, graph, kind: 'test' }),
      () => alice.listSceneEvents!(id),
    ]
    for (const attempt of attempts)
      await expect(attempt()).rejects.toMatchObject({ code: 'not_found' })
    expect(await store.load(id)).toEqual(before)
    expect(await store.listSceneEvents(id)).toEqual([])
  }
})

test('project placeholders stay private and cannot be used to claim another owner', async () => {
  await bob.createProject!({ id: 'bob-project', name: 'Bob project' })
  expect(await alice.getProjectStatus!('bob-project')).toBeNull()
  await expect(alice.createProject!({ id: 'bob-project', name: 'Hijack' })).rejects.toMatchObject({
    code: 'not_found',
  })
  await expect(alice.save({ id: 'bob-project', name: 'Hijack', graph })).rejects.toMatchObject({
    code: 'not_found',
  })
  await expect(
    alice.save({ id: 'new-stage', projectId: 'bob-stage', name: 'Hijack', graph }),
  ).rejects.toMatchObject({ code: 'not_found' })
  expect(
    await alice.createProject!({ id: 'alice-project', name: 'Alice project', ownerId: 'bob' }),
  ).toMatchObject({ ownerId: 'alice' })
})

test('owned saves, rename, thumbnails, events and deletion retain existing version rules', async () => {
  const saved = await alice.save({ id: 'alice-stage', name: 'Saved', graph, expectedVersion: 1 })
  expect(saved.version).toBe(2)
  await expect(alice.rename('alice-stage', 'Stale', { expectedVersion: 1 })).rejects.toMatchObject({
    code: 'version_conflict',
  })
  const renamed = await alice.rename('alice-stage', 'Renamed')
  expect(renamed.version).toBe(3)
  const covered = await alice.updateThumbnail!(
    'alice-stage',
    'data:image/png;base64,iVBORw0KGgo=',
    { expectedVersion: 3 },
  )
  expect(covered.version).toBe(3)
  await alice.appendSceneEvent!({ sceneId: 'alice-stage', version: 3, graph, kind: 'test' })
  expect(await alice.listSceneEvents!('alice-stage')).toHaveLength(1)
  expect(await alice.delete('alice-stage', { expectedVersion: 3 })).toBe(true)
  expect(await alice.load('alice-stage')).toBeNull()
})

test('concurrent creation of the same ID cannot transfer ownership', async () => {
  const attempts = await Promise.allSettled([
    alice.save({ id: 'racing-stage', name: 'Alice racing', graph }),
    bob.save({ id: 'racing-stage', name: 'Bob racing', graph }),
  ])
  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1)
  const winner = attempts.find((result) => result.status === 'fulfilled')
  if (winner?.status !== 'fulfilled') throw new Error('Expected one winner')
  expect(await store.load('racing-stage')).toMatchObject({
    ownerId: winner.value.ownerId,
    version: 1,
  })
})

test('transaction owner checks reject a same-version replacement after authorization', async () => {
  const original = await alice.load('alice-stage')
  await alice.delete('alice-stage')
  await bob.save({ id: 'alice-stage', name: 'Now Bob owns this ID', graph })
  const before = await store.load('alice-stage')
  expect(original?.version).toBe(before?.version)
  const expectedOwnerId = 'alice'
  for (const operation of [
    () =>
      store.save({
        id: 'alice-stage',
        name: 'Stale save',
        graph,
        ownerId: 'alice',
        expectedOwnerId,
        expectedVersion: 1,
      }),
    () => store.rename('alice-stage', 'Stale rename', { expectedOwnerId, expectedVersion: 1 }),
    () => store.delete('alice-stage', { expectedOwnerId, expectedVersion: 1 }),
    () => store.updateThumbnail('alice-stage', 'stale', { expectedOwnerId, expectedVersion: 1 }),
    () =>
      store.appendSceneEvent({
        sceneId: 'alice-stage',
        version: 1,
        kind: 'stale',
        graph,
        expectedOwnerId,
      }),
  ])
    await expect(operation()).rejects.toMatchObject({ code: 'not_found' })
  await bob.appendSceneEvent!({ sceneId: 'alice-stage', version: 1, kind: 'private', graph })
  expect(await store.listSceneEvents('alice-stage', { expectedOwnerId })).toEqual([])
  expect(await store.load('alice-stage')).toEqual(before)
})
