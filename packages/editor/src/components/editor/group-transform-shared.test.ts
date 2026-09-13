import { beforeAll, describe, expect, test } from 'bun:test'
import { type AnyNode, type AnyNodeDefinition, nodeRegistry, registerNode } from '@pascal-app/core'
import { z } from 'zod'
import {
  classifyParticipant,
  collectParticipants,
  rotateGroupPatches,
  translateGroupPatches,
} from './group-transform-shared'
import { WallNode } from '@pascal-app/core'

const BUILDING_SCOPED_KIND = 'group-transform-building-scoped-test'

function registerBuildingScopedTestKind() {
  if (nodeRegistry.has(BUILDING_SCOPED_KIND)) return

  registerNode({
    kind: BUILDING_SCOPED_KIND,
    schemaVersion: 1,
    schema: z.object({ type: z.literal(BUILDING_SCOPED_KIND) }) as never,
    category: 'structure',
    defaults: () => ({}),
    capabilities: {},
    floorplanScope: 'building',
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
  } as AnyNodeDefinition)
}

describe('group transform participants', () => {
  beforeAll(() => {
    registerBuildingScopedTestKind()
  })

  test('a fixed group member or welded neighbour prevents a partial group preview', () => {
    const fixed = WallNode.parse({
      parentId: 'level_test',
      start: [0, 0],
      end: [1, 0],
      metadata: { stageLocked: true },
    })
    const connected = WallNode.parse({ parentId: 'level_test', start: [1, 0], end: [2, 0] })
    const nodes = { [fixed.id]: fixed, [connected.id]: connected }
    expect(collectParticipants([fixed.id, connected.id], nodes, 'level_test')).toEqual({
      starts: [],
      links: [],
    })
    expect(collectParticipants([connected.id], nodes, 'level_test')).toEqual({
      starts: [],
      links: [],
    })
    const unlocked = { ...nodes, [fixed.id]: { ...fixed, metadata: { stageLocked: false } } }
    expect(collectParticipants([connected.id], unlocked, 'level_test').starts).toHaveLength(1)
  })

  test('classifies and transforms polygon kinds (slab / zone)', () => {
    const nodes = {
      building_test: {
        id: 'building_test',
        type: 'building',
        children: ['level_test'],
      },
      level_test: {
        id: 'level_test',
        type: 'level',
        parentId: 'building_test',
        children: ['slab_test', 'zone_test'],
      },
      slab_test: {
        id: 'slab_test',
        type: 'slab',
        parentId: 'level_test',
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
        holes: [
          [
            [0.5, 0.5],
            [1, 0.5],
            [1, 1],
          ],
        ],
      },
      zone_test: {
        id: 'zone_test',
        type: 'zone',
        parentId: 'level_test',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      slab_elsewhere: {
        id: 'slab_elsewhere',
        type: 'slab',
        parentId: 'level_other',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
    } as unknown as Record<string, AnyNode>

    expect(classifyParticipant(nodes.slab_test, 'level_test', nodes)).toBe('polygon')
    expect(classifyParticipant(nodes.zone_test, 'level_test', nodes)).toBe('polygon')
    // Not in the active level frame → excluded.
    expect(classifyParticipant(nodes.slab_elsewhere, 'level_test', nodes)).toBeNull()

    const { starts, links } = collectParticipants(['slab_test', 'zone_test'], nodes, 'level_test')
    expect(links).toEqual([])
    expect(starts).toEqual([
      {
        id: 'slab_test',
        kind: 'polygon',
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
        holes: [
          [
            [0.5, 0.5],
            [1, 0.5],
            [1, 1],
          ],
        ],
      },
      {
        id: 'zone_test',
        kind: 'polygon',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        holes: null,
      },
    ])

    // Translate: every vertex (holes included) shifts; the hole-less zone's
    // patch never grows a `holes` field.
    const moved = translateGroupPatches(starts, [], 1, -2)
    expect(moved).toEqual([
      [
        'slab_test',
        {
          polygon: [
            [1, -2],
            [3, -2],
            [3, 0],
            [1, 0],
          ],
          holes: [
            [
              [1.5, -1.5],
              [2, -1.5],
              [2, -1],
            ],
          ],
        },
      ],
      [
        'zone_test',
        {
          polygon: [
            [1, -2],
            [2, -2],
            [2, -1],
          ],
        },
      ],
    ])

    // Rotate 90° in the atan2 x→z sense around the origin: (x, z) → (-z, x).
    const rotated = rotateGroupPatches(
      starts.filter((s) => s.id === 'zone_test'),
      [],
      { x: 0, z: 0 },
      Math.PI / 2,
    )
    expect(rotated).toHaveLength(1)
    const rotatedPolygon = (rotated[0]![1] as { polygon: [number, number][] }).polygon
    const expected = [
      [0, 0],
      [0, 1],
      [-1, 1],
    ]
    rotatedPolygon.forEach((point, i) => {
      expect(point[0]).toBeCloseTo(expected[i]![0]!)
      expect(point[1]).toBeCloseTo(expected[i]![1]!)
    })
  })
})
