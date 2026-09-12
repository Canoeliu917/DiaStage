import { afterEach, expect, test } from 'bun:test'
import {
  BlockNode,
  clearSceneHistory,
  ScanNode,
  subscribeSceneCommits,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { createTheatreSceneVisibility } from '../../components/theatre/scene-visibility'
import { useSimulationSelection } from '../../components/theatre/simulation-panel'
import { createTheatreSceneGraph } from './new-production'
import { DiaProjectStateSchema, TheatreConstraintSchema } from './project-state'
import { assertTheatreWritable } from './scene-adapter'
import { createStageSceneDocument } from './simulation'
import { deriveVenueModel, theatreNodeLayer } from './venue-model'

afterEach(() => {
  useLiveNodeOverrides.getState().clearAll()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('Venue derives dimensions, theatre directions and live references without duplicating Scene data', () => {
  const venue = {
    ...createStageSceneDocument().venue,
    origin: [2, 1, 3] as [number, number, number],
  }
  const graph = createTheatreSceneGraph()
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const door = BlockNode.parse({ parentId: level.id, metadata: { stageKind: 'door-flat' } })
  const platform = BlockNode.parse({ parentId: level.id, metadata: { stageKind: 'platform' } })
  const scan = ScanNode.parse({ parentId: level.id })
  Object.assign(graph.nodes, { [door.id]: door, [platform.id]: platform, [scan.id]: scan })
  const before = JSON.stringify(graph)
  const model = deriveVenueModel(venue, graph.nodes, { heightMeasured: false })
  expect(model.bounds).toEqual({ min: [-2, 1, 0], max: [6, 5, 6] })
  expect(model.stageFront).toEqual([2, 1, 6])
  expect(model.stageLeft).toEqual([1, 0, 0])
  expect(model.stageRight).toEqual([-1, 0, 0])
  expect(model.heightMeasured).toBe(false)
  expect(model.entranceNodeIds).toEqual([door.id])
  expect(model.platformNodeIds).toEqual([platform.id])
  expect(model.scanReferenceNodeIds).toEqual([scan.id])
  expect(theatreNodeLayer(door)).toBe('scenery')
  expect(JSON.stringify(graph)).toBe(before)
  platform.visible = false
  expect(deriveVenueModel(venue, graph.nodes).platformNodeIds).toEqual([])
  level.visible = false
  expect(deriveVenueModel(venue, graph.nodes).entranceNodeIds).toEqual([])
  expect(() => deriveVenueModel({ ...venue, width: Number.NaN }, graph.nodes)).toThrow()
  level.visible = true
  level.parentId = level.id
  expect(() => deriveVenueModel(venue, graph.nodes)).toThrow('循环')
})

test('Layer toggles share display-only overrides, preserve editability and saved visibility, and restore on exit', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  const nodes = useScene.getState().nodes
  const floor = Object.values(nodes).find((node) => node.type === 'slab')!
  const original = JSON.stringify(nodes)
  let commits = 0
  const unsubscribe = subscribeSceneCommits(() => commits++)
  const display = createTheatreSceneVisibility()
  try {
    display.apply(null, [floor.id])
    expect(useLiveNodeOverrides.getState().get(floor.id)).toMatchObject({ visible: false })
    expect(() => assertTheatreWritable()).not.toThrow()
    useSimulationSelection.setState({ showPerformers: false, showGhost: false })
    expect(JSON.stringify(useScene.getState().nodes)).toBe(original)
    expect(commits).toBe(0)
    display.apply(null)
    expect(useLiveNodeOverrides.getState().get(floor.id)).toBeUndefined()
    display.apply(null, [floor.id])
    display.restore()
    expect(useLiveNodeOverrides.getState().get(floor.id)).toBeUndefined()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(original)
  } finally {
    display.restore()
    unsubscribe()
    useSimulationSelection.setState({ showPerformers: true, showGhost: true })
  }
})

test('Project facts accept exactly five bounded constraint shapes, reject invalid numbers and invisible extra facts', () => {
  const a = { type: 'performer', id: 'a' }
  const b = { type: 'object', id: 'door' }
  const common = { label: '由导演确认', priority: 'must' }
  const constraints = [
    {
      ...common,
      id: '1',
      type: 'near-object',
      subject: a,
      objectId: 'door',
      maximumDistanceMeters: 1,
    },
    {
      ...common,
      id: '2',
      type: 'distance-preference',
      subjects: [a, b],
      distanceMeters: 2,
      toleranceMeters: 0.2,
    },
    {
      ...common,
      id: '3',
      type: 'keep-out-zone',
      subject: a,
      zone: { min: [0, 0, 0], max: [1, 2, 1] },
    },
    {
      ...common,
      id: '4',
      type: 'preserve-relation',
      subjects: [a, b],
      relation: 'A 保持在门边',
      sourceVersionId: 'v1',
    },
    { ...common, id: '5', type: 'must-use-entrance', performerId: 'a', entranceNodeId: 'door' },
  ]
  const facts = {
    schemaVersion: 1,
    sceneId: 'scene',
    sceneVersion: 'v2',
    currentExcerpt: '已明确选用的剧本片段',
    directorIntent: '保留距离',
    selectedCharacterIds: ['a'],
    importantConstraints: constraints,
    baselineVersionId: 'v1',
    targetVenueId: null,
    currentQuestion: '出口是否足够宽？',
  }
  expect(DiaProjectStateSchema.parse(facts).importantConstraints).toHaveLength(5)
  expect(DiaProjectStateSchema.safeParse({ ...facts, hiddenMemory: 'AI推测' }).success).toBe(false)
  expect(
    DiaProjectStateSchema.safeParse({ ...facts, selectedCharacterIds: ['a', 'a'] }).success,
  ).toBe(false)
  expect(
    TheatreConstraintSchema.safeParse({ ...constraints[0], maximumDistanceMeters: Infinity })
      .success,
  ).toBe(false)
  expect(
    TheatreConstraintSchema.safeParse({
      ...constraints[2],
      zone: { min: [1, 0, 0], max: [0, 1, 1] },
    }).success,
  ).toBe(false)
  expect(
    TheatreConstraintSchema.safeParse({ ...constraints[0], type: 'arbitrary-solver' }).success,
  ).toBe(false)
})
