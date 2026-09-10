import { describe, expect, test } from 'bun:test'
import type { SceneContextSummary } from '@pascal-app/core/stage'
import { footprintHalfSize, snapStagePlacement } from './placement-math'

const context: SceneContextSummary = {
  documentVersion: 1,
  selectedObjectIds: [],
  objects: [],
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 3 },
}
const size = { width: 2, height: 1, depth: 1 }

describe('stage placement snapping', () => {
  test('uses the selected metric grid or leaves free positions unchanged', () => {
    for (const grid of [0.1, 0.25, 0.5] as const) {
      const actual = snapStagePlacement({ x: 1.32, y: 0, z: 2.87 }, size, 0, context, {
        grid,
        guides: false,
      })
      expect(actual.position.x).toBeCloseTo(Math.round(1.32 / grid) * grid)
      expect(actual.position.z).toBeCloseTo(Math.round(2.87 / grid) * grid)
    }
    expect(
      snapStagePlacement({ x: 1.32, y: 0, z: 2.87 }, size, 0, context, { grid: 0, guides: false })
        .position,
    ).toEqual({ x: 1.32, y: 0, z: 2.87 })
  })
  test('centerline and portal-line snaps account for object footprint', () => {
    const actual = snapStagePlacement({ x: 0.08, y: 0, z: 0.57 }, size, 0, context, {
      grid: 0.25,
      guides: true,
    })
    expect(actual.position).toEqual({ x: 0, y: 0, z: 0.5 })
    expect(actual.labels).toContain('中心线')
    expect(actual.labels).toContain('台口基准线')
  })
  test('rotated boundaries keep full width and depth inside the stage', () => {
    const half = footprintHalfSize(size, 90)
    expect(half.x).toBeCloseTo(0.5)
    expect(half.z).toBeCloseTo(1)
    const actual = snapStagePlacement({ x: 3.56, y: 0, z: 5.05 }, size, 90, context, {
      grid: 0,
      guides: true,
    })
    expect(actual.position.x).toBeCloseTo(3.5)
    expect(actual.position.z).toBeCloseTo(5)
  })
  test('adjacency uses both object edges and ignores a moving object itself', () => {
    const withObject: SceneContextSummary = {
      ...context,
      objects: [
        {
          id: 'sofa',
          name: '沙发',
          kind: 'sofa',
          dimensionsMeters: size,
          transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
        },
      ],
    }
    const actual = snapStagePlacement({ x: 2.06, y: 0, z: 3.04 }, size, 0, withObject, {
      grid: 0,
      guides: true,
    })
    expect(actual.position).toEqual({ x: 2, y: 0, z: 3 })
    expect(actual.labels).toContain('紧邻 沙发')
    expect(
      snapStagePlacement(
        { x: 2.06, y: 0, z: 3.04 },
        size,
        0,
        withObject,
        { grid: 0, guides: true },
        'sofa',
      ).position,
    ).toEqual({ x: 2.06, y: 0, z: 3.04 })
  })
  test('invalid coordinates are refused before producing a ghost position', () => {
    expect(() =>
      snapStagePlacement({ x: NaN, y: 0, z: 0 }, size, 0, context, { grid: 0.25, guides: true }),
    ).toThrow()
  })
})
