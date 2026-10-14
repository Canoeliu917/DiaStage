import { expect, test } from 'bun:test'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { openRehearsalLog } from '../rehearsal-intelligence/feedback'
import { SceneJournal } from '../scene-journal'
import { localAccountStorageKey } from './local-account'

test('accounts cannot recover another owner or legacy browser journal with a reused scene ID', async () => {
  const previous = { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange }
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  const graph = (note: string) => ({ nodes: { item: { note } }, rootNodeIds: ['item'] })
  try {
    const legacy = new SceneJournal('same-scene', null)
    await legacy.recover(graph('server'), 1)
    await legacy.append(graph('legacy private draft'))
    const ownerA = new SceneJournal('same-scene', 'owner-a')
    expect((await ownerA.recover(graph('server'), 1)).pending).toBe(false)
    await ownerA.append(graph('owner a private draft'))
    const ownerB = await new SceneJournal('same-scene', 'owner-b').recover(
      graph('owner b server'),
      1,
    )
    expect(ownerB.pending).toBe(false)
    expect(ownerB.graph.nodes).toEqual(graph('owner b server').nodes)
    expect(
      (await new SceneJournal('same-scene', 'owner-a').recover(graph('server'), 1)).graph.nodes,
    ).toEqual(graph('owner a private draft').nodes)
    expect(
      (await new SceneJournal('same-scene', null).recover(graph('server'), 1)).graph.nodes,
    ).toEqual(graph('legacy private draft').nodes)
  } finally {
    Object.assign(globalThis, previous)
  }
})

test('conversation databases are separate for each account and leave legacy records intact', async () => {
  const previous = globalThis.indexedDB
  globalThis.indexedDB = new IDBFactory()
  const put = async (owner: string | null, note: string) => {
    const db = await openRehearsalLog(owner)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('threads', 'readwrite')
      tx.objectStore('threads').put({ sceneId: 'same-scene', note })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }
  const read = async (owner: string | null) => {
    const db = await openRehearsalLog(owner)
    try {
      return await new Promise<{ note: string } | undefined>((resolve, reject) => {
        const value = db.transaction('threads').objectStore('threads').get('same-scene')
        value.onsuccess = () => resolve(value.result)
        value.onerror = () => reject(value.error)
      })
    } finally {
      db.close()
    }
  }
  try {
    await put(null, 'legacy conversation')
    await put('owner-a', 'private conversation')
    expect(await read('owner-b')).toBeUndefined()
    expect(await read('owner-a')).toEqual({ sceneId: 'same-scene', note: 'private conversation' })
    expect(await read(null)).toEqual({ sceneId: 'same-scene', note: 'legacy conversation' })
    expect(localAccountStorageKey('draft', 'owner-a')).not.toBe(
      localAccountStorageKey('draft', 'owner-b'),
    )
  } finally {
    globalThis.indexedDB = previous
  }
})
