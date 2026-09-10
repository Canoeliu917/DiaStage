import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BlockNode,
  BuildingNode,
  clearSceneHistory,
  LevelNode,
  SiteNode,
  SlabNode,
  subscribeSceneCommits,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { createEmptyTableRehearsalScene } from './presets'
import {
  captureStageSnapshot,
  readTheatreDocument,
  restoreRehearsalTake,
  saveRehearsalTake,
  THEATRE_METADATA_KEY,
  writeTheatreDocument,
} from './scene-adapter'
import { createTheatreDocument } from './schema'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

function fixture() {
  const site = SiteNode.parse({
    metadata: { userNotes: '保留手工笔记', remount: { source: 'original' } },
  })
  const container = BuildingNode.parse({ parentId: site.id })
  const level = LevelNode.parse({ parentId: container.id, height: 4 })
  const block = BlockNode.parse({ parentId: level.id, name: '原有台块', position: [2, 0, 1] })
  site.children = [container.id]
  container.children = [level.id]
  level.children = [block.id]
  useScene
    .getState()
    .setScene(Object.fromEntries([site, container, level, block].map((node) => [node.id, node])), [
      site.id,
    ])
  clearSceneHistory()
  return { site, container, level, block }
}

beforeEach(() => {
  useScene.getState().setReadOnly(false)
  useLiveNodeOverrides.getState().clearAll()
  useLiveTransforms.getState().clearAll()
  clearSceneHistory()
})
afterEach(() => {
  useScene.getState().setReadOnly(false)
  useLiveNodeOverrides.getState().clearAll()
  useLiveTransforms.getState().clearAll()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

describe('theatre scene persistence', () => {
  test('venue dimensions update only the owned stage floor with metadata in one undo', () => {
    const { level } = fixture()
    const polygon: [number, number][] = [
      [-4, -3],
      [4, -3],
      [4, 3],
      [-4, 3],
    ]
    const floor = SlabNode.parse({
      parentId: level.id,
      polygon,
      elevation: 0,
      metadata: { theatreKind: 'stage-floor' },
    })
    const legacy = SlabNode.parse({ parentId: level.id, polygon, elevation: 0, name: '已有地面' })
    useScene.getState().applyNodeChanges({ create: [{ node: floor }, { node: legacy }] })
    clearSceneHistory()
    const before = useScene.getState().nodes
    const document = createTheatreDocument()
    document.venue = {
      ...document.venue,
      type: 'proscenium',
      width: 10,
      depth: 8,
      origin: [2, 1, 3],
    }
    let commits = 0
    const stop = subscribeSceneCommits(() => commits++)
    writeTheatreDocument(document)
    stop()
    expect(commits).toBe(1)
    expect(useScene.getState().nodes[floor.id]).toMatchObject({
      polygon: [
        [-3, -1],
        [7, -1],
        [7, 7],
        [-3, 7],
      ],
      elevation: 1,
      thickness: floor.thickness,
    })
    expect(useScene.getState().nodes[legacy.id]).toEqual(legacy)
    expect(readTheatreDocument()?.venue).toEqual(document.venue)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).toEqual(before)
    expect(readTheatreDocument()).toBeNull()
  })

  test('owned floor converts world venue coordinates through a rotated and elevated parent', () => {
    const { container, level } = fixture()
    useScene.getState().updateNodes([
      { id: container.id, data: { position: [5, 1, 2], rotation: [0, Math.PI / 2, 0] } },
      { id: level.id, data: { baseElevation: 3 } },
    ])
    const floor = SlabNode.parse({
      parentId: level.id,
      polygon: [
        [-4, -3],
        [4, -3],
        [4, 3],
        [-4, 3],
      ],
      metadata: { theatreKind: 'stage-floor' },
    })
    useScene.getState().createNode(floor, level.id)
    const document = createTheatreDocument()
    document.venue = { ...document.venue, width: 10, depth: 8, origin: [4, 2, 5] }
    writeTheatreDocument(document)
    const updated = useScene.getState().nodes[floor.id]
    expect(updated?.type).toBe('slab')
    if (updated?.type !== 'slab') throw new Error('missing owned floor')
    const expected = [
      [1, -6],
      [1, 4],
      [-7, 4],
      [-7, -6],
    ]
    updated.polygon.forEach((point, index) => {
      point.forEach((value, axis) => {
        expect(value).toBeCloseTo(expected[index]![axis]!)
      })
    })
    expect(updated.elevation).toBeCloseTo(-2)
    const stable = updated
    document.production.notes = '只改排演说明'
    writeTheatreDocument(document)
    expect(useScene.getState().nodes[floor.id]).toEqual(stable)
  })

  test('opening a legacy scene reads no theatre data and does not change nodes', () => {
    fixture()
    const before = useScene.getState().nodes
    expect(readTheatreDocument()).toBeNull()
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  })

  test('metadata edits preserve old root metadata and form one scene commit and undo', () => {
    const { site } = fixture()
    let commits = 0
    const stop = subscribeSceneCommits(() => commits++)
    const document = createTheatreDocument('空桌')
    writeTheatreDocument(document)
    stop()
    expect(commits).toBe(1)
    expect(readTheatreDocument()).toEqual(document)
    expect(useScene.getState().nodes[site.id]!.metadata.userNotes).toBe('保留手工笔记')
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(readTheatreDocument()).toBeNull()
    expect(useScene.getState().nodes[site.id]!.metadata.remount).toEqual({ source: 'original' })
  })

  test('save, JSON reload and reopen retain authored theatre entities and versions', () => {
    fixture()
    const document = createTheatreDocument('空桌')
    const scene = createEmptyTableRehearsalScene()
    writeTheatreDocument({ ...document, scenes: [scene], activeSceneId: scene.id })
    const saved = saveRehearsalTake('第一次排演', '先解决拒收')
    const state = useScene.getState()
    const graph = JSON.parse(JSON.stringify({ nodes: state.nodes, roots: state.rootNodeIds }))
    useScene.getState().setScene(graph.nodes, graph.roots)
    expect(readTheatreDocument()).toEqual(saved)
    expect(saved.takes[0]!.document).not.toHaveProperty('takes')
    expect(saved.takes[0]!.stage.nodes[state.rootNodeIds[0]!]!.metadata).not.toHaveProperty(
      THEATRE_METADATA_KEY,
    )
  })

  test('snapshot restore restores scenery and theatre together while preserving history and other metadata', () => {
    const { site, level, block } = fixture()
    writeTheatreDocument(createTheatreDocument('空桌'))
    const saved = saveRehearsalTake('原始落位')
    const takeId = saved.takes[0]!.id
    useScene.getState().updateNode(block.id, { position: [5, 0, 3] })
    const newBlock = BlockNode.parse({ parentId: level.id, name: '后来添加的台块' })
    useScene.getState().createNode(newBlock, level.id)
    const root = useScene.getState().nodes[site.id]!
    useScene
      .getState()
      .updateNode(site.id, { metadata: { ...root.metadata, laterNote: '最新手工笔记' } })
    const changed = readTheatreDocument()!
    changed.production.notes = '之后修改的排演'
    writeTheatreDocument(changed)
    saveRehearsalTake('第二次排演')
    const beforeRestore = JSON.parse(JSON.stringify(useScene.getState().nodes))
    clearSceneHistory()
    restoreRehearsalTake(takeId)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    expect(useScene.getState().nodes[block.id]).toMatchObject({ position: [2, 0, 1] })
    expect(useScene.getState().nodes[newBlock.id]).toBeUndefined()
    expect(readTheatreDocument()!.production.notes).toBe('')
    expect(readTheatreDocument()!.takes).toHaveLength(2)
    expect(useScene.getState().nodes[site.id]!.metadata.laterNote).toBe('最新手工笔记')
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).toEqual(beforeRestore)
  })

  test('invalid input and missing prop nodes never enter the scene', () => {
    fixture()
    const document = createTheatreDocument()
    const scene = createEmptyTableRehearsalScene()
    scene.props[0]!.nodeId = 'block_missing'
    const before = useScene.getState().nodes
    expect(() =>
      writeTheatreDocument({ ...document, activeSceneId: scene.id, scenes: [scene] }),
    ).toThrow('不存在')
    document.venue.width = Number.NaN
    expect(() => writeTheatreDocument(document)).toThrow()
    expect(useScene.getState().nodes).toBe(before)
  })

  test('read-only and active live edits block writes and version restore', () => {
    const { block } = fixture()
    writeTheatreDocument(createTheatreDocument())
    const saved = saveRehearsalTake('排演一')
    useScene.getState().setReadOnly(true)
    expect(() => restoreRehearsalTake(saved.takes[0]!.id)).toThrow('只读')
    useScene.getState().setReadOnly(false)
    useScene.temporal.getState().pause()
    expect(() => writeTheatreDocument(saved)).toThrow('结束')
    useScene.temporal.getState().resume()
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        [block.id]: { ...block, position: [Number.NaN, 0, 0] },
      },
    })
    expect(() => captureStageSnapshot()).toThrow('非法数值')
  })

  test('a damaged stored snapshot cannot remove valid live nodes', () => {
    const { site, block } = fixture()
    writeTheatreDocument(createTheatreDocument())
    const document = saveRehearsalTake('损坏测试')
    delete document.takes[0]!.stage.nodes[block.id]
    const root = useScene.getState().nodes[site.id]!
    useScene
      .getState()
      .updateNode(site.id, { metadata: { ...root.metadata, [THEATRE_METADATA_KEY]: document } })
    const before = useScene.getState().nodes
    expect(() => restoreRehearsalTake(document.takes[0]!.id)).toThrow('父子关系')
    expect(useScene.getState().nodes).toBe(before)
  })

  test('restoring a take retains old plugin nodes and their unrecognized fields', () => {
    const { level } = fixture()
    const legacy = {
      object: 'node',
      id: 'legacy-flat_original',
      type: 'legacy:flat',
      name: '原有自定义景片',
      parentId: level.id,
      visible: true,
      metadata: {},
      customShape: { width: 2, depth: 0.1 },
    } as unknown as AnyNode
    const state = useScene.getState()
    state.setScene(
      {
        ...state.nodes,
        [level.id]: { ...level, children: [...level.children, legacy.id] },
        [legacy.id]: legacy,
      },
      state.rootNodeIds,
    )
    writeTheatreDocument(createTheatreDocument())
    const document = saveRehearsalTake('兼容排演版本')
    restoreRehearsalTake(document.takes[0]!.id)
    expect(useScene.getState().nodes[legacy.id]).toEqual(legacy)
  })
})
