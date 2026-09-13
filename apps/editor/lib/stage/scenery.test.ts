import { describe, expect, test } from 'bun:test'
import { AnyNode, BlockNode, getBlockFaceNormal, inspectBlockTopology } from '@pascal-app/core'
import { type StageCommand, StageCommandSchema, StageItemKindSchema } from '@pascal-app/core/stage'
import { dimensionsOf, makeScenery, SCENERY_LIBRARY, sceneryProxyParts } from './scenery'

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
  return BlockNode.parse(
    makeScenery(command(kind), 'level_test', [1, 0, 2], [0, Math.PI / 2, 0])[0],
  )
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
    for (const kind of StageItemKindSchema.exclude(['camera', 'performer-marker', 'stairs'])
      .options) {
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

  test('round tables have closed editable curved tops and a grounded pedestal', () => {
    const input = command('round-table')
    input.dimensionsMeters = { width: 1.2, height: 0.75, depth: 1.2 }
    const node = BlockNode.parse(makeScenery(input, 'level_test', [0, 0, 0], [0, 0, 0])[0])
    expect(dimensionsOf(node)).toEqual(input.dimensionsMeters)
    const edges = new Map<string, number>()
    for (const face of node.topology.faces) {
      face.vertexIds.forEach((id, i) => {
        const key = [id, face.vertexIds[(i + 1) % face.vertexIds.length]!].sort().join(':')
        edges.set(key, (edges.get(key) ?? 0) + 1)
      })
      const normal = getBlockFaceNormal(node.topology, face)!
      expect(normal.every(Number.isFinite)).toBe(true)
      if (face.id.endsWith(':top')) expect(normal[1]).toBeCloseTo(1)
      if (face.id.endsWith(':bottom')) expect(normal[1]).toBeCloseTo(-1)
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true)
    const top = node.topology.vertices.filter((vertex) => vertex.id.startsWith('part-0:'))
    expect(top.length).toBeGreaterThan(8)
    for (const vertex of top)
      expect(Math.hypot(vertex.position[0], vertex.position[2])).toBeCloseTo(0.6)
    expect(
      sceneryProxyParts('round-table', input.dimensionsMeters).map((part) => part.shape),
    ).toEqual(['cylinder', 'cylinder', 'cylinder'])
  })

  test('Ghost parts share the formal proxy extents and preserve recognisable openings and steps', () => {
    for (const kind of ['round-table', 'table', 'chair', 'door-flat'] as const) {
      const node = create(kind)
      const parts = sceneryProxyParts(kind, command(kind).dimensionsMeters)
      for (const [index, part] of parts.entries()) {
        const vertices = node.topology.vertices.filter((vertex) =>
          vertex.id.startsWith(`part-${index}:`),
        )
        for (const axis of [0, 1, 2] as const) {
          expect(Math.min(...vertices.map((vertex) => vertex.position[axis]))).toBeCloseTo(
            part.position[axis] - part.size[axis] / 2,
          )
          expect(Math.max(...vertices.map((vertex) => vertex.position[axis]))).toBeCloseTo(
            part.position[axis] + part.size[axis] / 2,
          )
        }
      }
      expect(parts.length).toBeGreaterThan(1)
    }
    const steps = sceneryProxyParts('stairs', { width: 1.2, height: 0.45, depth: 0.9 }, 3)
    expect(steps).toHaveLength(3)
    steps.forEach((part, i) => {
      expect(part.size[1]).toBeCloseTo(0.15 * (i + 1))
      expect(part.position[2]).toBeCloseTo(-0.45 + 0.3 * (i + 0.5))
      expect(part.position[1] - part.size[1] / 2).toBeCloseTo(0)
    })
    expect(() =>
      sceneryProxyParts('stairs', command('stairs').dimensionsMeters, Infinity),
    ).toThrow()
    expect(() => sceneryProxyParts('round-table', { width: NaN, height: 1, depth: 1 })).toThrow()
  })

  test('large scenery has usable silhouettes and open spaces', () => {
    expect(occupied(create('table'), [0, 0.5, 0])).toBe(false)
    expect(occupied(create('table'), [0, 1.75, 0])).toBe(true)
    expect(occupied(create('chair'), [0, 1.2, 0])).toBe(false)
    expect(occupied(create('chair'), [0, 1.2, 0.35])).toBe(true)
    expect(occupied(create('sofa'), [0, 1.1, -0.2])).toBe(false)
    expect(occupied(create('sofa'), [0, 1.1, 0.35])).toBe(true)
    expect(occupied(create('shelf'), [0.2, 0.35, 0])).toBe(false)
  })

  test('catalog models retain normalization and use separate requested size scale', () => {
    for (const { kind, asset } of SCENERY_LIBRARY) {
      const before = JSON.stringify(asset)
      const node = makeScenery(
        command(kind, asset.id),
        'level_test',
        [2, 0, 3],
        [0.1, 0.2, 0.3],
      )[0]!
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
