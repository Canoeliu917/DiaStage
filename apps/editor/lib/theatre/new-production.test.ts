import { afterEach, describe, expect, test } from 'bun:test'
import { AnyNode, clearSceneHistory, useScene } from '@pascal-app/core'
import { apiGraphSchema } from '../graph-schema'
import { addEmptyTableExample, createTheatreSceneGraph } from './new-production'
import { StageSceneDocumentSchema } from './simulation'
import { readStageDocument } from './simulation-store'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
afterEach(() => {
  useScene.getState().setReadOnly(false)
  useScene.getState().unloadScene()
  clearSceneHistory()
})

describe('new theatre production', () => {
  test('default graph has a real 8 by 6 metre stage and a valid persisted rehearsal', () => {
    const graph = createTheatreSceneGraph()
    expect(apiGraphSchema.safeParse(graph).success).toBe(true)
    for (const node of Object.values(graph.nodes))
      expect(AnyNode.safeParse(node).success).toBe(true)
    const site = graph.nodes[graph.rootNodeIds[0]!]!
    expect(site).toMatchObject({
      name: '黑匣子 · 8 × 6 米',
      polygon: {
        points: [
          [-4, -3],
          [4, -3],
          [4, 3],
          [-4, 3],
        ],
      },
    })
    const doc = StageSceneDocumentSchema.parse(site.metadata.diastageTheatre)
    expect(doc.venue).toMatchObject({ width: 8, depth: 6, height: 4 })
    expect(doc.production.name).toBe('未命名剧目')
    expect(doc.rehearsalSimulation.performers).toHaveLength(0)
    useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
    expect(readStageDocument()).toEqual(doc)
  })

  test('example adds editable circular table, chairs, door and letter with a single undo', () => {
    const graph = createTheatreSceneGraph('保留原剧目')
    useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
    const baseline = JSON.parse(JSON.stringify(useScene.getState().nodes))
    clearSceneHistory()
    const doc = addEmptyTableExample()
    expect(doc.scenes).toHaveLength(2)
    expect(doc.production.name).toBe('保留原剧目')
    const nodes = Object.values(useScene.getState().nodes)
    const blocks = nodes.filter((node) => node.type === 'block')
    expect(blocks).toHaveLength(5)
    const roundTable = blocks.find((node) => node.name?.startsWith('圆桌'))!
    const tabletop = roundTable.topology.vertices.filter(
      (vertex) => Math.abs(vertex.position[1] - 0.78) < 0.00001,
    )
    expect(tabletop).toHaveLength(32)
    for (const vertex of tabletop)
      expect(Math.hypot(vertex.position[0], vertex.position[2])).toBeCloseTo(0.65)
    const scene = doc.scenes.find((entry) => entry.id === doc.activeSceneId)!
    expect(scene.roles).toHaveLength(2)
    expect(scene.props[0]!.nodeId).toBe(blocks.find((node) => node.name === '未拆开的信')!.id)
    const state = useScene.getState()
    expect(
      apiGraphSchema.safeParse({ nodes: state.nodes, rootNodeIds: state.rootNodeIds }).success,
    ).toBe(true)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).toEqual(baseline)
  })

  test('repeated examples use unique nodes and do not replace earlier scenes', () => {
    const graph = createTheatreSceneGraph()
    useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
    const first = addEmptyTableExample()
    const firstScene = first.scenes.at(-1)!
    const second = addEmptyTableExample()
    expect(second.scenes).toHaveLength(3)
    expect(second.scenes.map((scene) => scene.number)).toEqual(['1', '2', '3'])
    expect(second.scenes.find((scene) => scene.id === firstScene.id)).toEqual(firstScene)
    expect(
      Object.values(useScene.getState().nodes).filter((node) => node.type === 'block'),
    ).toHaveLength(10)
    expect(second.scenes.at(-1)!.props[0]!.nodeId).not.toBe(firstScene.props[0]!.nodeId)
  })
})
