import { expect, test } from 'bun:test'
import { rotatePoint } from '../remount/geometry'
import { stageObjectsTouch } from './collision'
import { stageFoldGeometry } from './fold-geometry'

test('fold leaf volumes preserve the authored pivot and leave the enclosure empty', () => {
  expect(stageFoldGeometry('SCN-FOLD-02')!.dimensions).toEqual([0.94, 2.4, 0.94])
  const shape = stageFoldGeometry('SCN-FOLD-03')!
  expect(shape.dimensions).toEqual([0.94, 2.4, 0.98])
  expect(shape.boundsCenter).toEqual([0.47, 1.2, -0.47])
  expect(shape.collisionGeometry).toHaveLength(3)
  const fold = {
    kind: 'scenic-flat' as const,
    libraryAssetId: 'SCN-FOLD-03',
    dimensionsMeters: { width: 0.94, height: 2.4, depth: 0.98 },
    transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
  const probe = {
    kind: 'neutral-block' as const,
    dimensionsMeters: { width: 0.1, height: 0.2, depth: 0.1 },
    transform: { position: { x: 0.45, y: 0, z: 2.53 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
  expect(stageObjectsTouch(fold, probe, true)).toBe(false)
  for (const [x, z] of [
    [0.45, 3],
    [0.92, 2.53],
    [0.45, 2.06],
  ]) {
    probe.transform.position = { x: x!, y: 0, z: z! }
    expect(stageObjectsTouch(fold, probe, true)).toBe(true)
  }
  probe.transform.position = { x: 0.45, y: 0, z: 2.93 }
  expect(stageObjectsTouch(fold, probe)).toBe(true)
  expect(stageObjectsTouch(fold, probe, true)).toBe(false)
  probe.transform.position.y = 2.4
  expect(stageObjectsTouch(fold, probe, true)).toBe(false)
})

test('fold nonuniform scale and yaw preserve the hollow interior and wall thickness', () => {
  const shape = stageFoldGeometry('SCN-FOLD-03', {}, [1.5, 2, 0.5])!
  const fold = {
    kind: 'scenic-flat' as const,
    collisionGeometry: shape.collisionGeometry,
    dimensionsMeters: {
      width: shape.dimensions[0],
      height: shape.dimensions[1],
      depth: shape.dimensions[2],
    },
    transform: { position: { x: 1, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 37, z: 0 } },
  }
  const probe = {
    kind: 'neutral-block' as const,
    dimensionsMeters: { width: 0.05, height: 0.2, depth: 0.05 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 37, z: 0 } },
  }
  for (const [x, expected] of [
    [0.675, false],
    [1.38, true],
  ] as const) {
    const point = rotatePoint([x, 0, -0.235], [0, (37 * Math.PI) / 180, 0])
    probe.transform.position = { x: point[0] + 1, y: 0, z: point[2] + 3 }
    expect(stageObjectsTouch(fold, probe, true)).toBe(expected)
  }
})
