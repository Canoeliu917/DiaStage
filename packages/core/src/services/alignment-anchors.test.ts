import { beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { nodeRegistry, registerNode } from '../registry'
import type { AnyNodeDefinition } from '../registry/types'
import type { AnyNode } from '../schema/types'
import { stairFootprintAABB } from '../systems/stair/stair-footprint'
import {
  collectAlignmentAnchors,
  footprintAABB,
  footprintAABBFrom,
  movingAlignmentAnchors,
  movingFootprintAnchors,
  polygonAnchors,
  wallSegmentAnchors,
} from './alignment-anchors'

// Minimal floor-placed def whose footprint reads `dimensions` / `rotation`
// straight off the node, so tests can drive the AABB math directly.
function floorPlacedDef(kind: string, applies?: (n: AnyNode) => boolean): AnyNodeDefinition {
  return {
    kind,
    schemaVersion: 1,
    schema: z.object({ type: z.literal(kind) }) as any,
    category: 'utility',
    defaults: () => ({}) as any,
    capabilities: {
      floorPlaced: {
        footprint: (n: AnyNode) => ({
          dimensions: (n as { dimensions?: [number, number, number] }).dimensions ?? [1, 1, 1],
          rotation: (n as { rotation?: [number, number, number] }).rotation ?? [0, 0, 0],
        }),
        ...(applies ? { applies } : {}),
      },
    },
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
  } as AnyNodeDefinition
}

// Minimal building-scoped kind that exposes the generic alignment-footprint
// capability without pulling a product-specific system into this test.
function alignmentBoxDef(): AnyNodeDefinition {
  return {
    kind: 'alignment-box',
    schemaVersion: 1,
    schema: z.object({ type: z.literal('alignment-box') }) as any,
    category: 'structure',
    defaults: () => ({}) as any,
    capabilities: {
      alignmentFootprint: (n: AnyNode) => ({
        shape: 'box',
        dimensions: (n as { dimensions?: [number, number, number] }).dimensions ?? [1, 1, 1],
        rotation: (n as { rotation?: [number, number, number] }).rotation ?? [0, 0, 0],
      }),
    },
    floorplanScope: 'building',
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
  } as AnyNodeDefinition
}

function stairDef(): AnyNodeDefinition {
  return {
    kind: 'stair',
    schemaVersion: 1,
    schema: z.object({ type: z.literal('stair') }) as any,
    category: 'structure',
    defaults: () => ({}) as any,
    capabilities: {
      alignmentFootprint: (n: AnyNode, nodes?: Readonly<Record<string, AnyNode>>) => {
        const aabb = stairFootprintAABB(n as any, nodes)
        return aabb ? { shape: 'aabb', ...aabb } : null
      },
    },
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
  } as AnyNodeDefinition
}

function plainDef(kind: string): AnyNodeDefinition {
  return {
    kind,
    schemaVersion: 1,
    schema: z.object({ type: z.literal(kind) }) as any,
    category: 'utility',
    defaults: () => ({}) as any,
    capabilities: {},
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
  } as AnyNodeDefinition
}

const node = (over: Record<string, unknown>): AnyNode => over as unknown as AnyNode

describe('footprintAABBFrom', () => {
  test('unrotated box is centred at position', () => {
    const aabb = footprintAABBFrom([10, 0, 20], [2, 1, 4], 0)
    expect(aabb).toEqual({ minX: 9, minZ: 18, maxX: 11, maxZ: 22 })
  })

  test('90° rotation swaps width and depth extents', () => {
    const aabb = footprintAABBFrom([0, 0, 0], [2, 1, 4], Math.PI / 2)
    expect(aabb.minX).toBeCloseTo(-2, 10)
    expect(aabb.maxX).toBeCloseTo(2, 10)
    expect(aabb.minZ).toBeCloseTo(-1, 10)
    expect(aabb.maxZ).toBeCloseTo(1, 10)
  })
})

describe('footprintAABB', () => {
  beforeEach(() => nodeRegistry._reset())

  test('reads dimensions + rotation from a floor-placed kind', () => {
    registerNode(floorPlacedDef('box'))
    const aabb = footprintAABB(
      node({ id: 'b1', type: 'box', position: [10, 0, 20], dimensions: [2, 1, 4] }),
    )
    expect(aabb).toEqual({ minX: 9, minZ: 18, maxX: 11, maxZ: 22 })
  })

  test('returns null for a kind without a footprint', () => {
    registerNode(plainDef('wall'))
    expect(footprintAABB(node({ id: 'w1', type: 'wall', position: [0, 0, 0] }))).toBeNull()
  })

  test('reads a declared alignment box footprint', () => {
    registerNode(alignmentBoxDef())
    const aabb = footprintAABB(
      node({
        id: 'box1',
        type: 'alignment-box',
        position: [10, 0, 20],
        dimensions: [2, 1, 4],
        rotation: [0, 0, 0],
      }),
    )
    expect(aabb).toEqual({ minX: 9, minZ: 18, maxX: 11, maxZ: 22 })
  })

  test('returns null when the kind predicate excludes the node', () => {
    registerNode(floorPlacedDef('lamp', (n) => !(n as { attached?: boolean }).attached))
    expect(
      footprintAABB(node({ id: 'l1', type: 'lamp', position: [0, 0, 0], attached: true })),
    ).toBeNull()
    expect(
      footprintAABB(node({ id: 'l2', type: 'lamp', position: [0, 0, 0], attached: false })),
    ).not.toBeNull()
  })
})

describe('movingFootprintAnchors', () => {
  beforeEach(() => nodeRegistry._reset())

  test('relocates the footprint corners around the proposed centre (edges only, no centre anchor)', () => {
    registerNode(floorPlacedDef('box'))
    const anchors = movingFootprintAnchors(
      node({ id: 'm', type: 'box', position: [0, 0, 0], dimensions: [2, 1, 4] }),
      10,
      20,
    )
    // 2×4 box centred at (10, 20): corners at x∈{9,11}, z∈{18,22}.
    expect(anchors).toHaveLength(4)
    expect(anchors.every((a) => a.kind === 'corner')).toBe(true)
    expect(new Set(anchors.map((a) => a.x))).toEqual(new Set([9, 11]))
    expect(new Set(anchors.map((a) => a.z))).toEqual(new Set([18, 22]))
  })

  test('rotationY override drives the AABB regardless of node rotation', () => {
    registerNode(floorPlacedDef('box'))
    const anchors = movingFootprintAnchors(
      node({
        id: 'm',
        type: 'box',
        position: [0, 0, 0],
        dimensions: [2, 1, 4],
        rotation: [0, 0, 0],
      }),
      0,
      0,
      Math.PI / 2,
    )
    const xs = anchors.map((a) => a.x)
    // Rotated 90°, the 2×4 box spans ±2 in X (its depth) rather than ±1.
    expect(Math.max(...xs)).toBeCloseTo(2, 10)
    expect(Math.min(...xs)).toBeCloseTo(-2, 10)
  })

  test('returns empty for a footprintless kind', () => {
    registerNode(plainDef('wall'))
    expect(
      movingFootprintAnchors(node({ id: 'w', type: 'wall', position: [0, 0, 0] }), 1, 1),
    ).toEqual([])
  })

  test('keeps a declared off-center footprint offset when moving and rotating its pivot', () => {
    const definition = floorPlacedDef('offset-box')
    definition.capabilities.floorPlaced!.footprint = (value) => {
      const item = value as unknown as {
        position: [number, number, number]
        rotation: [number, number, number]
      }
      const angle = item.rotation[1]
      return {
        dimensions: [2, 1, 4],
        rotation: item.rotation,
        position: [
          item.position[0] - 2 * Math.cos(angle) + Math.sin(angle),
          0,
          item.position[2] + 2 * Math.sin(angle) + Math.cos(angle),
        ],
      }
    }
    registerNode(definition)
    const item = node({
      id: 'offset',
      type: 'offset-box',
      position: [1, 0, 2],
      rotation: [0, 0, 0],
    })
    const before = JSON.stringify(item)
    expect(footprintAABB(item)).toEqual({ minX: -2, maxX: 0, minZ: 1, maxZ: 5 })
    const anchors = movingFootprintAnchors(item, 10, 20, Math.PI / 2)
    expect(Math.min(...anchors.map((anchor) => anchor.x))).toBeCloseTo(9)
    expect(Math.max(...anchors.map((anchor) => anchor.x))).toBeCloseTo(13)
    expect(Math.min(...anchors.map((anchor) => anchor.z))).toBeCloseTo(21)
    expect(Math.max(...anchors.map((anchor) => anchor.z))).toBeCloseTo(23)
    expect(JSON.stringify(item)).toBe(before)
  })
})

describe('movingAlignmentAnchors', () => {
  beforeEach(() => nodeRegistry._reset())

  test('relocates a straight stair by its segment-chain footprint', () => {
    registerNode(stairDef())
    const nodes = {
      st: node({
        id: 'st',
        type: 'stair',
        position: [0, 0, 0],
        rotation: 0,
        width: 1,
        children: ['seg'],
      }),
      seg: node({
        id: 'seg',
        type: 'stair-segment',
        parentId: 'st',
        width: 1,
        length: 3,
        height: 2.5,
      }),
    }

    const anchors = movingAlignmentAnchors(nodes.st, nodes, 10, 20, 0)
    expect(anchors).toHaveLength(4)
    expect(new Set(anchors.map((a) => a.x))).toEqual(new Set([9.5, 10.5]))
    expect(new Set(anchors.map((a) => a.z))).toEqual(new Set([20, 23]))
  })

  test('rotation override drives a moving straight stair footprint', () => {
    registerNode(stairDef())
    const nodes = {
      st: node({
        id: 'st',
        type: 'stair',
        position: [0, 0, 0],
        rotation: 0,
        width: 1,
        children: ['seg'],
      }),
      seg: node({
        id: 'seg',
        type: 'stair-segment',
        parentId: 'st',
        width: 1,
        length: 3,
        height: 2.5,
      }),
    }

    const anchors = movingAlignmentAnchors(nodes.st, nodes, 10, 20, Math.PI / 2)
    const xs = anchors.map((a) => a.x)
    const zs = anchors.map((a) => a.z)
    expect(Math.min(...xs)).toBeCloseTo(10, 10)
    expect(Math.max(...xs)).toBeCloseTo(13, 10)
    expect(Math.min(...zs)).toBeCloseTo(19.5, 10)
    expect(Math.max(...zs)).toBeCloseTo(20.5, 10)
  })
})

describe('wallSegmentAnchors', () => {
  test('returns both endpoints as corners and the chord midpoint as center', () => {
    const anchors = wallSegmentAnchors('w', [0, 0], [4, 2])
    expect(anchors).toEqual([
      { nodeId: 'w', kind: 'corner', x: 0, z: 0 },
      { nodeId: 'w', kind: 'corner', x: 4, z: 2 },
      { nodeId: 'w', kind: 'center', x: 2, z: 1 },
    ])
  })

  test('adds ±thickness/2 face corners on each endpoint when thickness is given', () => {
    // Horizontal wall along +X: perpendicular is ±Z, so faces sit at z = ±0.1.
    const anchors = wallSegmentAnchors('w', [0, 0], [4, 0], 0.2)
    expect(anchors).toEqual([
      { nodeId: 'w', kind: 'corner', x: 0, z: 0 },
      { nodeId: 'w', kind: 'corner', x: 4, z: 0 },
      { nodeId: 'w', kind: 'center', x: 2, z: 0 },
      { nodeId: 'w', kind: 'corner', x: 0, z: 0.1 },
      { nodeId: 'w', kind: 'corner', x: 0, z: -0.1 },
      { nodeId: 'w', kind: 'corner', x: 4, z: 0.1 },
      { nodeId: 'w', kind: 'corner', x: 4, z: -0.1 },
    ])
  })

  test('skips face corners for zero/degenerate input', () => {
    expect(wallSegmentAnchors('w', [0, 0], [4, 0], 0)).toHaveLength(3)
    expect(wallSegmentAnchors('w', [1, 1], [1, 1], 0.2)).toHaveLength(3)
  })
})

describe('polygonAnchors', () => {
  test('returns each vertex as a corner anchor', () => {
    expect(
      polygonAnchors('s', [
        [0, 0],
        [2, 0],
        [2, 3],
      ]),
    ).toEqual([
      { nodeId: 's', kind: 'corner', x: 0, z: 0 },
      { nodeId: 's', kind: 'corner', x: 2, z: 0 },
      { nodeId: 's', kind: 'corner', x: 2, z: 3 },
    ])
  })
})

describe('collectAlignmentAnchors', () => {
  beforeEach(() => nodeRegistry._reset())

  test('unions footprint corners, segment anchors and polygon vertices, excluding the moving node', () => {
    registerNode(floorPlacedDef('box'))
    const nodes = {
      moving: node({ id: 'moving', type: 'box', position: [0, 0, 0], dimensions: [1, 1, 1] }),
      box: node({ id: 'box', type: 'box', position: [5, 0, 5], dimensions: [2, 1, 2] }),
      wall: node({ id: 'wall', type: 'wall', start: [0, 0], end: [4, 0] }),
      slab: node({
        id: 'slab',
        type: 'slab',
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
        ],
      }),
    }
    const anchors = collectAlignmentAnchors(nodes, 'moving')
    const ids = anchors.map((a) => a.nodeId)
    expect(ids).not.toContain('moving')
    expect(ids.filter((id) => id === 'box')).toHaveLength(4) // corner anchors
    expect(ids.filter((id) => id === 'wall')).toHaveLength(7) // endpoints + midpoint + 4 face corners
    expect(ids.filter((id) => id === 'slab')).toHaveLength(3) // polygon vertices
  })

  test('levelId filter keeps only nodes resolving to that level (incl. nested)', () => {
    registerNode(floorPlacedDef('box'))
    registerNode(alignmentBoxDef())
    const nodes = {
      b: node({ id: 'b', type: 'building' }),
      L1: node({ id: 'L1', type: 'level', parentId: 'b' }),
      L2: node({ id: 'L2', type: 'level', parentId: 'b' }),
      moving: node({ id: 'moving', type: 'box', parentId: 'L1', position: [0, 0, 0] }),
      sameFloor: node({ id: 'sameFloor', type: 'box', parentId: 'L1', position: [5, 0, 5] }),
      // Item resting on `sameFloor` — resolves to L1 through the parent chain.
      nested: node({ id: 'nested', type: 'box', parentId: 'sameFloor', position: [5, 0, 5] }),
      otherFloor: node({ id: 'otherFloor', type: 'box', parentId: 'L2', position: [5, 0, 5] }),
      // Building-scoped (parented to the building, no level ancestor) — spans
      // every floor, so it stays in the pool regardless of the active level.
      buildingScoped: node({
        id: 'buildingScoped',
        type: 'alignment-box',
        parentId: 'b',
        position: [9, 0, 9],
        dimensions: [1.6, 1, 1.6],
      }),
    }
    const ids = collectAlignmentAnchors(nodes, 'moving', 'L1').map((a) => a.nodeId)
    expect(ids.filter((id) => id === 'sameFloor')).toHaveLength(4)
    expect(ids.filter((id) => id === 'nested')).toHaveLength(4)
    expect(ids.filter((id) => id === 'buildingScoped')).toHaveLength(4)
    expect(ids).not.toContain('otherFloor')
  })

  test('straight stair contributes its segment-chain footprint corners', () => {
    registerNode(stairDef())
    const nodes = {
      st: node({
        id: 'st',
        type: 'stair',
        position: [0, 0, 0],
        rotation: 0,
        width: 1,
        children: ['seg'],
      }),
      // Single 1×3 flight; origin at the run start, extending +Z by length.
      seg: node({
        id: 'seg',
        type: 'stair-segment',
        parentId: 'st',
        width: 1,
        length: 3,
        height: 2.5,
      }),
    }
    const anchors = collectAlignmentAnchors(nodes, '').filter((a) => a.nodeId === 'st')
    expect(anchors).toHaveLength(4)
    expect(anchors.every((a) => a.kind === 'corner')).toBe(true)
    expect(new Set(anchors.map((a) => a.x))).toEqual(new Set([-0.5, 0.5]))
    expect(new Set(anchors.map((a) => a.z))).toEqual(new Set([0, 3]))
  })
})
