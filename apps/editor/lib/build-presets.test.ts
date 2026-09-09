import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  AnyNode,
  BuildingNode,
  clearSceneHistory,
  ElevatorNode,
  LevelNode,
  nodeRegistry,
  registerLibraryMaterials,
  resolveElevatorLevels,
  SceneMaterial,
  unregisterLibraryMaterials,
  useScene,
  WindowNode,
} from '@pascal-app/core'
import {
  BUILD_PRESETS,
  buildPresetLabel,
  buildPresetSnapshot,
  buildPresetToolDefaults,
  buildPresetUsesTool,
  insertBuildNodes,
  validateBuildSnapshot,
} from './build-presets'
import { PASCAL_LIBRARY_MATERIALS } from './pascal-library-materials'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
let restoreRegistry = () => {}

beforeEach(() => {
  registerLibraryMaterials(PASCAL_LIBRARY_MATERIALS)
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._reset()
  for (const schema of AnyNode.options) {
    nodeRegistry._register({
      kind: schema.shape.type.value,
      schemaVersion: 1,
      schema,
      category: 'structure',
      defaults: () => ({}),
      capabilities: { hostRefFields: ['wallId', 'roofSegmentId', 'roofFace'] },
    })
  }
  const level = LevelNode.parse({ id: 'level_presets' })
  useScene.setState({
    nodes: { [level.id]: level },
    rootNodeIds: [level.id],
    materials: {},
    readOnly: false,
  })
  clearSceneHistory()
  useScene.temporal.getState().resume()
})

afterEach(() => {
  unregisterLibraryMaterials(PASCAL_LIBRARY_MATERIALS.map((material) => material.id))
  restoreRegistry()
  clearSceneHistory()
  useScene.temporal.getState().resume()
})

test('882 public presets are complete and one missing library material is explicitly rejected', () => {
  expect(BUILD_PRESETS).toHaveLength(883)
  expect(BUILD_PRESETS.filter((preset) => preset.source === 'library')).toHaveLength(88)
  const unavailable: string[] = []
  for (const preset of BUILD_PRESETS) {
    try {
      expect(validateBuildSnapshot(buildPresetSnapshot(preset)).nodes.length).toBe(
        1 + preset.nodeData.descendants.length,
      )
    } catch (error) {
      expect(preset.source).toBe('community')
      expect(String(error)).toContain('library:mtl_kWcibTyZ0JC9IYc7')
      unavailable.push(preset.id)
    }
  }
  expect(unavailable).toHaveLength(1)
  expect(BUILD_PRESETS.some((preset) => preset.rootKind === 'streetscape:road-network')).toBe(false)
})

test('embedded materials remap only collisions and undo with the imported nodes', () => {
  const imported = SceneMaterial.parse({
    id: 'mat_preset',
    name: '预设饰面',
    material: { properties: { color: '#123abc' } },
  })
  const existing = SceneMaterial.parse({
    ...imported,
    name: '现有饰面',
    material: { properties: { color: '#ffffff' } },
  })
  useScene.setState({ materials: { [existing.id]: existing } })
  clearSceneHistory()
  const before = useScene.getState().nodes
  const window = WindowNode.parse({ id: 'window_preset', slots: { glass: 'scene:mat_preset' } })
  const ids = insertBuildNodes(
    {
      roots: [window],
      descendants: [],
      materials: { [imported.id]: imported },
    },
    'level_presets',
  )
  const added = useScene.getState().nodes[ids[0]!]
  expect(added?.type).toBe('window')
  if (added?.type !== 'window') throw new Error('missing window')
  expect(added.slots?.glass).not.toBe('scene:mat_preset')
  const newId = added.slots!.glass!.slice(6)
  expect(useScene.getState().materials[newId]?.material.properties?.color).toBe('#123abc')
  expect(useScene.getState().materials.mat_preset).toEqual(existing)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes).toEqual(before)
  expect(useScene.getState().materials).toEqual({ mat_preset: existing })
})

test('tool parameters retain finishes and shape while removing original IDs and hosts', () => {
  const arch = BUILD_PRESETS.find(
    (preset) => preset.source === 'library' && preset.name === 'Arch opening',
  )!
  const params = buildPresetToolDefaults(arch)
  expect(params.openingKind).toBe('opening')
  expect(params.openingShape).toBe('arch')
  for (const field of ['id', 'parentId', 'position', 'rotation', 'wallId', 'children'])
    expect(params[field]).toBeUndefined()
  const roof = BUILD_PRESETS.find(
    (preset) => preset.source === 'library' && preset.name === 'Gambrel roof',
  )!
  expect(buildPresetToolDefaults(roof).roofType).toBe('gambrel')
  expect(buildPresetUsesTool(roof)).toBe(true)
  expect(buildPresetLabel(arch)).toBe('拱形门洞')
  const community = BUILD_PRESETS.find((preset) => preset.source === 'community')!
  expect(buildPresetLabel(community)).toBe(community.name)
})

test('complex stairs insert a complete fresh subtree in one undo step', () => {
  const stairs = BUILD_PRESETS.find(
    (preset) => preset.source === 'library' && preset.name === 'Switchback stairs',
  )!
  expect(buildPresetUsesTool(stairs)).toBe(false)
  const before = useScene.getState().nodes
  const original = JSON.stringify(stairs)
  const ids = insertBuildNodes(buildPresetSnapshot(stairs), 'level_presets')
  const nodes = useScene.getState().nodes
  expect(ids).toHaveLength(1)
  expect(ids[0]).not.toBe(stairs.nodeData.root.id)
  expect(Object.keys(nodes)).toHaveLength(
    Object.keys(before).length + stairs.nodeData.descendants.length + 1,
  )
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  const added = nodes[ids[0]!]
  expect(added?.type).toBe('stair')
  if (added?.type === 'stair') {
    expect(added.fromLevelId).toBe('level_presets')
    expect(added.toLevelId).toBeNull()
    expect(added.deckSlabId).toBeUndefined()
  }
  expect(JSON.stringify(stairs)).toBe(original)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes).toEqual(before)
})

test('elevator presets attach to the target building and resolve only its service levels', () => {
  const lower = LevelNode.parse({
    id: 'level_lower',
    parentId: 'building_target',
    level: 0,
    height: 3,
  })
  const upper = LevelNode.parse({
    id: 'level_upper',
    parentId: 'building_target',
    level: 1,
    height: 3,
  })
  const existingElevator = ElevatorNode.parse({
    id: 'elevator_existing',
    parentId: 'building_target',
    fromLevelId: lower.id,
    toLevelId: upper.id,
  })
  const building = BuildingNode.parse({
    id: 'building_target',
    children: [upper.id, lower.id, existingElevator.id],
  })
  const before = {
    [building.id]: building,
    [lower.id]: lower,
    [upper.id]: upper,
    [existingElevator.id]: existingElevator,
  }
  useScene.setState({ nodes: before, rootNodeIds: [building.id] })
  clearSceneHistory()
  const preset = BUILD_PRESETS.find(
    (entry) => entry.source === 'library' && entry.rootKind === 'elevator',
  )!
  const snapshot = buildPresetSnapshot(preset)
  snapshot.roots = [
    {
      ...snapshot.roots[0],
      disabledLevelIds: ['level_foreign'],
      serviceOnlyLevelIds: ['level_foreign'],
      servedLevelIds: ['level_foreign'],
    },
  ]
  const ids = insertBuildNodes(snapshot, lower.id)
  const state = useScene.getState()
  const added = state.nodes[ids[0]!]
  expect(added?.type).toBe('elevator')
  if (added?.type !== 'elevator') throw new Error('missing elevator')
  expect(added.parentId).toBe(building.id)
  expect(added.fromLevelId).toBe(lower.id)
  expect(added.toLevelId).toBe(upper.id)
  expect(added.defaultLevelId).toBe(lower.id)
  expect(added.disabledLevelIds).toEqual([])
  expect(added.serviceOnlyLevelIds).toEqual([])
  expect(added.servedLevelIds).toBeUndefined()
  expect(resolveElevatorLevels(added, state.nodes).entries.map((entry) => entry.id)).toEqual([
    lower.id,
    upper.id,
  ])
  expect(state.nodes[existingElevator.id]).toEqual(existingElevator)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes).toEqual(before)
})

test('invalid snapshots and an active history pause cannot partly insert nodes', () => {
  const before = useScene.getState().nodes
  const preset = BUILD_PRESETS.find((entry) => entry.rootKind === 'window')!
  const snapshot = buildPresetSnapshot(preset)
  expect(() =>
    insertBuildNodes(
      { ...snapshot, roots: [{ ...snapshot.roots[0], width: Number.NaN }] },
      'level_presets',
    ),
  ).toThrow('不兼容')
  expect(() => insertBuildNodes({ roots: [], descendants: [] }, 'level_presets')).toThrow('根物体')
  useScene.temporal.getState().pause()
  expect(() => insertBuildNodes(snapshot, 'level_presets')).toThrow('结束当前放置')
  expect(useScene.getState().nodes).toBe(before)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
})
