import 'fake-indexeddb/auto'
import { expect, spyOn, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  clearSceneHistory,
  installSceneMutationHandler,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { keys } from 'idb-keyval'
import { SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { importConfirmedScan } from './scan-import'
import { scanGlb } from './scan-test-fixtures'

test('confirmed ScanNode reuses asset storage, is durable, atomic, idempotent and undoable; invalid import rolls back asset', async () => {
  globalThis.requestAnimationFrame ??= () => 0
  globalThis.cancelAnimationFrame ??= () => {}
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  const sceneId = crypto.randomUUID(),
    bytes = scanGlb(),
    sessionId = crypto.randomUUID()
  const session = {
    id: sessionId,
    sceneId,
    ownerToken: 'synthetic-owner',
    pairingCode: 'TEST-CODE',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const upload = {
    id: crypto.randomUUID(),
    sessionId,
    sceneId,
    name: 'synthetic.glb',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    vertices: 3,
    state: 'ready' as const,
    expiresAt: Date.now() + 60_000,
    error: null,
  }
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  let lastWrite = Promise.resolve()
  const stop = subscribeSceneCommits((commit) => {
    lastWrite = lastWrite.then(() => journal.append(commit.current))
  })
  const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(bytes.slice(), {
        headers: { 'content-length': String(bytes.length), 'x-scan-sha256': upload.sha256 },
      }),
  )
  const signal = new AbortController().signal
  try {
    const before = useScene.getState().nodes
    const assetCount = (await keys()).length
    const failAssetWrite = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('synthetic quota', 'QuotaExceededError')
    })
    try {
      await expect(
        importConfirmedScan({ ...upload, id: crypto.randomUUID() }, session, sceneId, signal),
      ).rejects.toThrow('synthetic quota')
      expect(useScene.getState().nodes).toBe(before)
    } finally {
      failAssetWrite.mockRestore()
    }
    fetchMock.mockClear()
    expect(useScene.getState().nodes).toBe(before)
    const [id, duplicate] = await Promise.all([
      importConfirmedScan(upload, session, sceneId, signal),
      importConfirmedScan(upload, session, sceneId, signal),
    ])
    expect(id).toBe(duplicate)
    await expect(
      importConfirmedScan(upload, { ...session, sceneId: 'other-scene' }, sceneId, signal),
    ).rejects.toThrow('不属于')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await keys()).length).toBe(assetCount + 1)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    const current = useScene.getState()
    expect(current.nodes[id as `scan_${string}`]?.type).toBe('scan')
    const recovered = await new SceneJournal(sceneId).recover(graph, 1)
    expect(recovered.graph.nodes[id]).toEqual(current.nodes[id as `scan_${string}`])
    await importConfirmedScan(upload, session, sceneId, signal)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes[id as `scan_${string}`]).toBeUndefined()
    useScene.temporal.getState().redo()
    expect(useScene.getState().nodes[id as `scan_${string}`]).toBeDefined()
    await lastWrite

    const stopMutations = installSceneMutationHandler(() => false)
    try {
      await expect(
        importConfirmedScan({ ...upload, id: crypto.randomUUID() }, session, sceneId, signal),
      ).rejects.toThrow('创建未完成')
      expect((await keys()).length).toBe(assetCount + 1)
    } finally {
      stopMutations()
    }
    const invalid = bytes.slice()
    invalid[0] = 0
    fetchMock.mockImplementation(
      async () =>
        new Response(invalid, {
          headers: { 'content-length': String(bytes.length), 'x-scan-sha256': upload.sha256 },
        }),
    )
    await expect(
      importConfirmedScan({ ...upload, id: crypto.randomUUID() }, session, sceneId, signal),
    ).rejects.toThrow('摘要')
    expect((await keys()).length).toBe(assetCount + 1)
    expect(useScene.getState().nodes).toBe(current.nodes)
  } finally {
    stop()
    fetchMock.mockRestore()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
