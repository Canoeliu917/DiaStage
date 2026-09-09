import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  AnyNode,
  BuildingNode,
  clearSceneHistory,
  LevelNode,
  nodeRegistry,
  SceneMaterial,
  SiteNode,
  useScene,
} from '@pascal-app/core'
import { insertBuildNodes, validateBuildSnapshot } from './build-presets'
import {
  filterRoomPresets,
  ROOM_PRESETS,
  RoomPresetSchema,
  roomPresetIssue,
  roomPresetName,
  roomPresetSnapshot,
} from './rooms-presets'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
let restoreRegistry = () => {}

beforeEach(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._reset()
  for (const schema of AnyNode.options) {
    nodeRegistry._register({
      kind: schema.shape.type.value,
      schemaVersion: 1,
      schema,
      category: 'structure',
      defaults: () => ({}),
      capabilities: { hostRefFields: ['wallId', 'roofSegmentId', 'blockFaceId'] },
    })
  }
  const site = SiteNode.parse({ id: 'site_rooms', children: ['building_rooms'] })
  const building = BuildingNode.parse({
    id: 'building_rooms',
    parentId: site.id,
    children: ['level_rooms'],
  })
  const level = LevelNode.parse({ id: 'level_rooms', parentId: building.id })
  useScene.setState({
    nodes: { [site.id]: site, [building.id]: building, [level.id]: level },
    rootNodeIds: [site.id],
    materials: {},
    readOnly: false,
  })
  clearSceneHistory()
})

afterEach(() => {
  restoreRegistry()
  clearSceneHistory()
})

describe('public room presets', () => {
  test('all 89 published room snapshots validate through native node schemas', () => {
    expect(ROOM_PRESETS).toHaveLength(89)
    expect(filterRoomPresets('library', '')).toHaveLength(5)
    expect(filterRoomPresets('community', '')).toHaveLength(84)
    for (const room of ROOM_PRESETS) {
      const snapshot = roomPresetSnapshot(room)
      expect(
        [...snapshot.roots, ...snapshot.descendants].every(
          (node) => AnyNode.safeParse(node).success,
        ),
      ).toBe(true)
    }
  })

  test('84 complete rooms are available while missing scene and library dependencies are rejected', () => {
    const unavailable = ROOM_PRESETS.filter((room) => roomPresetIssue(room) !== null)
    expect(ROOM_PRESETS.length - unavailable.length).toBe(84)
    expect(unavailable.map((room) => room.id).sort()).toEqual([
      'item_PAp6busEIvCfgAJi',
      'item_SbhRRPKY5gMUO1Ll',
      'item_fI9h42mNdjPeJlmU',
      'item_iM2a4HAOFYDW9VAj',
      'item_soB44Ef9oJ089Le3',
    ])
    const before = useScene.getState().nodes
    for (const room of unavailable) {
      const missingLibrary =
        room.id === 'item_fI9h42mNdjPeJlmU' || room.id === 'item_iM2a4HAOFYDW9VAj'
      expect(roomPresetIssue(room)).toContain(
        missingLibrary
          ? '预设所需的库材质暂不可用：library:mtl_kWcibTyZ0JC9IYc7'
          : '预设缺少材质定义：scene:mat_',
      )
      expect(() => insertBuildNodes(roomPresetSnapshot(room), 'level_rooms')).toThrow('材质')
    }
    expect(useScene.getState().nodes).toBe(before)
  })

  test('search supports Chinese names and tags while preserving community authors names', () => {
    expect(filterRoomPresets('library', ' 卫浴 ').map(roomPresetName)).toEqual(['卫浴间'])
    expect(filterRoomPresets('library', 'BEDROOM').map(roomPresetName)).toEqual(['带衣帽间的卧室'])
    expect(filterRoomPresets('community', '浴室').length).toBeGreaterThan(0)
    const community = ROOM_PRESETS.find((room) => room.source === 'community')!
    expect(roomPresetName(community)).toBe(community.name)
    expect(filterRoomPresets('library', '不存在的房间')).toEqual([])
  })

  test('a room inserts all roots, descendants and its zone in one undoable operation', () => {
    const room = filterRoomPresets('library', '卫浴')[0]!
    const snapshot = roomPresetSnapshot(room)
    const originalJson = JSON.stringify(room)
    const before = useScene.getState().nodes
    const selectedIds = insertBuildNodes(snapshot, 'level_rooms')
    expect(selectedIds).toHaveLength(room.roomData.roots.length + 1)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    const state = useScene.getState()
    expect(Object.keys(state.nodes)).toHaveLength(
      Object.keys(before).length +
        room.roomData.roots.length +
        room.roomData.descendants.length +
        1,
    )
    for (const id of selectedIds) {
      expect(state.nodes[id]?.parentId).toBe('level_rooms')
      expect(state.nodes[id]?.metadata.isNew).not.toBe(true)
    }
    const zone = selectedIds.map((id) => state.nodes[id]).find((node) => node?.type === 'zone')
    expect(zone?.type).toBe('zone')
    if (zone?.type === 'zone') {
      expect(zone.polygon).toEqual(room.roomData.footprint)
      expect(zone.spaceRole).toBe('room')
    }
    expect(JSON.stringify(room)).toBe(originalJson)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).toEqual(before)
  })

  test('bad coordinates, unsupported nodes and read-only insertion do not mutate the scene', () => {
    const room = ROOM_PRESETS[0]!
    expect(
      RoomPresetSchema.safeParse({
        ...room,
        roomData: { ...room.roomData, anchor: [Number.NaN, 0] },
      }).success,
    ).toBe(false)
    const snapshot = roomPresetSnapshot(room)
    const before = useScene.getState().nodes
    expect(() =>
      insertBuildNodes(
        { roots: [{ id: 'unknown_room', type: 'unknown-kind' }], descendants: [] },
        'level_rooms',
      ),
    ).toThrow('尚未加载')
    useScene.getState().setReadOnly(true)
    expect(() => insertBuildNodes(snapshot, 'level_rooms')).toThrow('只读')
    expect(useScene.getState().nodes).toBe(before)
    useScene.getState().setReadOnly(false)
  })

  test('provided scene materials survive parsing and only conflicting IDs are remapped on insertion', () => {
    const original = ROOM_PRESETS[0]!
    const importedMaterial = {
      id: 'mat_room_import',
      name: '原始房间饰面',
      material: {
        preset: 'custom',
        properties: {
          color: '#123abc',
          roughness: 0.5,
          metalness: 0,
          opacity: 1,
          transparent: false,
          side: 'front',
        },
      },
    }
    const room = RoomPresetSchema.parse({
      ...original,
      roomData: {
        ...original.roomData,
        roots: original.roomData.roots.map((node, index) =>
          index === 0 ? { ...node, slots: { exterior: 'scene:mat_room_import' } } : node,
        ),
        materials: { mat_room_import: importedMaterial },
      },
    })
    const snapshot = roomPresetSnapshot(room)
    expect(snapshot.materials?.mat_room_import?.material.properties?.color).toBe('#123abc')
    expect(() => validateBuildSnapshot(snapshot)).not.toThrow()
    const existingMaterial = SceneMaterial.parse({
      ...importedMaterial,
      name: '场景已有饰面',
      material: {
        ...importedMaterial.material,
        properties: { ...importedMaterial.material.properties, color: '#abcdef' },
      },
    })
    const beforeMaterials = { mat_room_import: existingMaterial }
    useScene.setState({ materials: beforeMaterials })
    clearSceneHistory()
    const ids = insertBuildNodes(snapshot, 'level_rooms')
    const wall = useScene.getState().nodes[ids[0]!]
    expect(wall?.type).toBe('wall')
    if (wall?.type === 'wall') {
      const ref = wall.slots.exterior
      expect(ref).not.toBe('scene:mat_room_import')
      expect(
        Object.values(useScene.getState().materials).some(
          (material) =>
            `scene:${material.id}` === ref && material.material.properties?.color === '#123abc',
        ),
      ).toBe(true)
    }
    expect(useScene.getState().materials.mat_room_import).toEqual(existingMaterial)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().materials).toEqual(beforeMaterials)
  })
})
