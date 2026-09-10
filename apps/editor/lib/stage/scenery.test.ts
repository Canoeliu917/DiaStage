import { describe, expect, test } from 'bun:test'
import { AnyNode, BlockNode, inspectBlockTopology } from '@pascal-app/core'
import { type StageCommand, StageCommandSchema, StageItemKindSchema } from '@pascal-app/core/stage'
import { dimensionsOf, makeScenery, SCENERY_LIBRARY } from './scenery'

type AddScenery = Extract<StageCommand, { type: 'AddScenery' }>

function command(kind: AddScenery['kind'], libraryAssetId: string | null = null): AddScenery {
  return {
    type: 'AddScenery',
    meta: {
      commandId: 'test:0',
      transactionId: 'test',
      source: 'manual',
      issuedAt: '2026-09-10T00:00:00Z',
      expectedDocumentVersion: 0,
    },
    nodeId: 'test:proposal',
    name: '测试布景',
    kind,
    libraryAssetId,
    dimensionsMeters: { width: 2.4, height: 1.8, depth: 0.8 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
}

function create(kind: AddScenery['kind']) {
  return BlockNode.parse(makeScenery(command(kind), 'level_test', [1, 0, 2], [0, Math.PI / 2, 0]))
}

function occupied(node: BlockNode, point: [number, number, number]) {
  // The factory emits independent closed boxes; test actual gaps rather than only vertex counts.
  for (let start = 0; start < node.topology.vertices.length; start += 8) {
    const vertices = node.topology.vertices.slice(start, start + 8)
    if (
      point.every(
        (value, axis) =>
          value > Math.min(...vertices.map((v) => v.position[axis]!)) &&
          value < Math.max(...vertices.map((v) => v.position[axis]!)),
      )
    )
      return true
  }
  return false
}

describe('stage scenery adapter', () => {
  test('every allowed proxy is editable, finite, correctly sized and rests at y=0', () => {
    for (const kind of StageItemKindSchema.exclude(['camera', 'performer-marker']).options) {
      const node = create(kind)
      expect(AnyNode.safeParse(node).success).toBe(true)
      expect(inspectBlockTopology(node.topology)).toEqual([])
      expect(node.id.startsWith('block_')).toBe(true)
      expect(node.id).not.toBe('test:proposal')
      expect(node.position).toEqual([1, 0, 2])
      expect(node.rotation).toBe(Math.PI / 2)
      expect(node.metadata).toEqual({ stageKind: kind, representation: 'proxy' })
      const dimensions = dimensionsOf(node)
      expect(dimensions.width).toBeCloseTo(2.4)
      expect(dimensions.height).toBeCloseTo(1.8)
      expect(dimensions.depth).toBeCloseTo(0.8)
      expect(Math.min(...node.topology.vertices.map((vertex) => vertex.position[1]))).toBe(0)
      expect(node.topology.vertices.every((vertex) => vertex.position.every(Number.isFinite))).toBe(
        true,
      )
    }
  })

  test('door and window flats retain a real opening', () => {
    const door = create('door-flat')
    expect(occupied(door, [0, 0.9, 0])).toBe(false)
    expect(occupied(door, [1.1, 0.9, 0])).toBe(true)
    const window = create('window-flat')
    expect(occupied(window, [0.5, 0.9, 0])).toBe(false)
    expect(occupied(window, [0.5, 0.3, 0])).toBe(true)
  })

  test('large scenery has usable silhouettes and open spaces', () => {
    expect(occupied(create('table'), [0, 0.5, 0])).toBe(false)
    expect(occupied(create('table'), [0, 1.75, 0])).toBe(true)
    expect(occupied(create('chair'), [0, 1.2, 0])).toBe(false)
    expect(occupied(create('chair'), [0, 1.2, 0.35])).toBe(true)
    expect(occupied(create('sofa'), [0, 1.1, -0.2])).toBe(false)
    expect(occupied(create('sofa'), [0, 1.1, 0.35])).toBe(true)
    expect(occupied(create('stairs'), [0, 1.5, -0.3])).toBe(false)
    expect(occupied(create('stairs'), [0, 1.5, 0.3])).toBe(true)
    expect(occupied(create('shelf'), [0.2, 0.35, 0])).toBe(false)
  })

  test('catalog models retain normalization and use separate requested size scale', () => {
    for (const { kind, asset } of SCENERY_LIBRARY) {
      const before = JSON.stringify(asset)
      const node = makeScenery(command(kind, asset.id), 'level_test', [2, 0, 3], [0.1, 0.2, 0.3])
      expect(node.type).toBe('item')
      if (node.type !== 'item') throw new Error('Expected item')
      expect(node.asset.src).toBe(asset.src)
      expect(node.asset.scale).toEqual(asset.scale ?? [1, 1, 1])
      expect(node.asset.offset).toEqual(asset.offset ?? [0, 0, 0])
      expect(node.asset.attachTo).toBeUndefined()
      expect(node.rotation).toEqual([0.1, 0.2, 0.3])
      expect(node.metadata.representation).toBe('physical')
      const dimensions = dimensionsOf(node)
      expect(dimensions.width).toBeCloseTo(2.4)
      expect(dimensions.height).toBeCloseTo(1.8)
      expect(dimensions.depth).toBeCloseTo(0.8)
      expect(JSON.stringify(asset)).toBe(before)
    }
  })

  test('rejects unknown, forbidden or mismatched assets rather than silently substituting', () => {
    for (const id of [
      'missing',
      'https://example.com/item.glb',
      'table-lamp',
      'cabinet',
      'books',
      'sofa',
    ]) {
      expect(() => makeScenery(command('table', id), 'level_test', [0, 0, 0], [0, 0, 0])).toThrow(
        '舞台库布景',
      )
    }
  })

  test('rejects invalid values and unsupported proxy tilt before scene mutation', () => {
    expect(() => makeScenery(command('table'), 'level_test', [NaN, 0, 0], [0, 0, 0])).toThrow(
      '有效数值',
    )
    expect(() => makeScenery(command('table'), 'level_test', [0, 0, 0], [0, Infinity, 0])).toThrow(
      '有效数值',
    )
    expect(() => makeScenery(command('table'), 'level_test', [0, 0, 0], [0.5, 0, 0])).toThrow(
      '俯仰',
    )
    const invalid = command('table')
    invalid.dimensionsMeters.width = -1
    expect(() => makeScenery(invalid, 'level_test', [0, 0, 0], [0, 0, 0])).toThrow()
    expect(StageCommandSchema.safeParse({ ...command('table'), kind: 'light' }).success).toBe(false)
    expect(
      StageCommandSchema.safeParse({ ...command('table'), script: 'unexpected' }).success,
    ).toBe(false)
  })
})
