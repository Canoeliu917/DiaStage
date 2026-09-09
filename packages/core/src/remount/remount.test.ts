import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  composeRotations,
  createDeploymentPlan,
  createStageFrame,
  fromFrameCoordinates,
  getObjectCorners,
  inverseRotatePoint,
  objectSeparation,
  relativeRotation,
  rotatePoint,
  toFrameCoordinates,
  transformPoint,
  transformRotation,
} from './index'
import type { RemountObject, Vec3, VenueProfile } from './schema'

function close(actual: Vec3, expected: Vec3) {
  actual.forEach((n, i) => {
    assert(Math.abs(n - expected[i]!) < 1e-6, `${actual} != ${expected}`)
  })
}

function venue(id: string, origin: Vec3 = [0, 0, 0], yaw = 0): VenueProfile {
  const anchors = [
    [0, 0, 0],
    [5, 0, 0],
    [0, 0, -4],
  ].map((p, i) => {
    const rotated = rotatePoint(p as Vec3, [0, yaw, 0])
    return {
      id: `${id}-${i}`,
      name: ['原点', '右侧', '后方'][i]!,
      position: rotated.map((n, a) => n + origin[a]!) as Vec3,
    }
  }) as VenueProfile['anchors']
  return {
    id,
    name: id,
    anchors,
    frame: createStageFrame(anchors),
    bounds: { width: 20, depth: 20, height: 10 },
  }
}

function object(nodeId = 'a', overrides: Partial<RemountObject> = {}): RemountObject {
  return {
    nodeId,
    name: nodeId,
    representation: 'physical',
    position: [0, 0, -4],
    rotation: [0, 0, 0],
    dimensions: [1, 1, 1],
    boundsCenter: [0, 0.5, 0],
    ...overrides,
  }
}

function plan(objects = [object()], sourceVenue = venue('source'), targetVenue = venue('target')) {
  return createDeploymentPlan({
    sourceVenue,
    targetVenue,
    layout: {
      id: 'layout',
      name: '布局',
      sourceVenueId: sourceVenue.id,
      objectNodeIds: objects.map((o) => o.nodeId),
    },
    objects,
    clearance: 0.2,
    tolerance: 0.01,
  })
}

test('1: identity and translation preserve physical dimensions and source snapshots', () => {
  const item = object()
  const original = structuredClone(item)
  const identity = plan([item])
  close(identity.placements[0]!.targetPosition, item.position)
  const translated = plan([item], venue('source'), venue('target', [8, 2, -3]))
  close(translated.placements[0]!.targetPosition, [8, 2, -7])
  assert.equal(translated.scale, 1)
  assert.deepEqual(translated.placements[0]!.dimensions, [1, 1, 1])
  assert.deepEqual(item, original)
  assert(translated.calibration.valid)
})

test('2: ninety degree stage mapping rotates position and orientation with no scale', () => {
  const source = venue('source'),
    target = venue('target', [10, 0, 10], Math.PI / 2)
  const mapped = plan([object()], source, target)
  close(mapped.placements[0]!.targetPosition, [6, 0, 10])
  close(rotatePoint([1, 0, 0], mapped.placements[0]!.targetRotation), [0, 0, -1])
  close(toFrameCoordinates(mapped.placements[0]!.targetPosition, target.frame), [0, 0, 4])
  close(fromFrameCoordinates([0, 0, 4], target.frame), [6, 0, 10])
})

test('3: general XYZ rotation and world/local composition round trip', () => {
  const source = venue('source', [2, 1, 3], 0.74),
    target = venue('target', [-3, 2, 4], -1.23)
  const rotation: Vec3 = [0.42, 0.66, -0.53],
    parent: Vec3 = [-0.2, 0.7, 1.1]
  const vector: Vec3 = [1.2, -0.4, 2.3]
  const expected = rotatePoint(rotatePoint(vector, rotation), parent)
  close(rotatePoint(vector, composeRotations(parent, rotation)), expected)
  close(
    rotatePoint(vector, relativeRotation(composeRotations(parent, rotation), parent)),
    rotatePoint(vector, rotation),
  )
  close(inverseRotatePoint(rotatePoint(vector, rotation), rotation), vector)
  const mapped = transformRotation(rotation, source.frame, target.frame)
  close(
    rotatePoint(vector, transformRotation(mapped, target.frame, source.frame)),
    rotatePoint(vector, rotation),
  )
  close(
    transformPoint(transformPoint(vector, source.frame, target.frame), target.frame, source.frame),
    vector,
  )
  for (const y of [Math.PI / 2, Math.PI / 2 - 0.0001, -Math.PI / 2 + 0.0001]) {
    const nearSingular: Vec3 = [0.8, y, -0.4]
    close(
      rotatePoint(vector, composeRotations([0, 0, 0], nearSingular)),
      rotatePoint(vector, nearSingular),
    )
  }
})

test('4: nonfinite, coincident, collinear, downward, tilted and stale axes reject', () => {
  const source = venue('source')
  for (const point of [
    [NaN, 0, 0],
    [0, 0, 0],
    [2, 0, 0],
    [0, 0, 2],
    [0, 1, -2],
  ] as Vec3[]) {
    const anchors = structuredClone(source.anchors)
    anchors[2].position = point
    assert.throws(() => createStageFrame(anchors))
  }
  const stale = structuredClone(source)
  stale.frame.stageRight = [0, 0, 1]
  assert.throws(() => plan([object()], stale))
})

test('5: noisy/noncongruent calibration reports residual and refuses confirmation', () => {
  const source = venue('source'),
    target = venue('target')
  target.anchors[1].position[0] += 1
  target.frame = createStageFrame(target.anchors)
  const result = plan([object()], source, target)
  assert.equal(result.calibration.valid, false)
  assert.equal(result.calibration.maxError, 1)
  assert(Math.abs(result.calibration.rmsError - Math.sqrt(1 / 3)) < 1e-8)
  assert.equal(result.scale, 1)
  close(result.placements[0]!.dimensions, [1, 1, 1])
})

test('6: smaller venues flag all eight rotated corners and vertical overflow', () => {
  const target = venue('target')
  target.bounds = { width: 2, depth: 4, height: 1 }
  const items = [
    object('wide', { position: [0, 0, -2], dimensions: [3, 1, 1], rotation: [0, Math.PI / 4, 0] }),
    object('tall', { position: [0, 0.5, -1] }),
  ]
  const result = plan(items, venue('source'), target)
  assert.deepEqual(
    result.conflicts.filter((c) => c.type === 'out-of-bounds').map((c) => c.nodeId),
    ['wide', 'tall'],
  )
  assert.equal(getObjectCorners(items[0]!).length, 8)
})

test('floor bounds tolerate baked mesh rounding but reject one millimeter below ground', () => {
  for (const [offset, outside] of [
    [1.00000002e-8, false],
    [0.001, true],
  ] as const) {
    const item = object('floor-contact', { boundsCenter: [0, 0.5 - offset, 0] })
    const result = plan([item])
    assert.equal(
      result.conflicts.some((conflict) => conflict.type === 'out-of-bounds'),
      outside,
    )
    assert.deepEqual(result.placements[0]!.targetPosition, item.position)
    assert.deepEqual(result.placements[0]!.boundsCenter, item.boundsCenter)
    assert.deepEqual(result.placements[0]!.dimensions, item.dimensions)
  }
})

test('7: full 3D OBB collision distinguishes overlap, height and rotated separation', () => {
  assert(objectSeparation(object('a'), object('b', { position: [0.2, 0, -4] })).intersects)
  assert(!objectSeparation(object('a'), object('b', { position: [0, 2, -4] })).intersects)
  const a = object('a', { dimensions: [4, 0.4, 0.2], rotation: [0, Math.PI / 4, 0] })
  const b = {
    ...a,
    nodeId: 'b',
    position: [Math.SQRT1_2 * 0.6, 0, -4 + Math.SQRT1_2 * 0.6] as Vec3,
  }
  const separation = objectSeparation(a, b)
  assert(!separation.intersects)
  assert(Math.abs(separation.distance - 0.4) < 1e-6)
  assert.equal(
    plan([object('a'), object('b', { position: [1.1, 0, -4] })]).conflicts[0]!.type,
    'clearance',
  )
})

test('8: virtual objects only report venue bounds; proxies retain true size; assembly ignores self collision', () => {
  const virtual = object('virtual', { representation: 'virtual', dimensions: [30, 1, 1] })
  const proxy = object('proxy', { representation: 'proxy' })
  const result = plan([object(), virtual, proxy])
  assert(result.conflicts.some((c) => c.type === 'out-of-bounds' && c.nodeId === 'virtual'))
  assert(
    !result.conflicts.some(
      (c) => c.type === 'collision' && (c.nodeId === 'virtual' || c.otherNodeId === 'virtual'),
    ),
  )
  assert(result.conflicts.some((c) => c.type === 'collision' && c.otherNodeId === 'proxy'))
  close(result.placements.find((p) => p.nodeId === 'proxy')!.dimensions, proxy.dimensions)
  assert.equal(
    plan([object('a', { assemblyId: 'table' }), object('b', { assemblyId: 'table' })]).conflicts
      .length,
    0,
  )
})

test('9: unsupported modes and scaling reject; world paths migrate and target obstacles stay fixed', () => {
  const sourceVenue = venue('source'),
    targetVenue = venue('target', [3, 0, 0])
  const input = {
    sourceVenue,
    targetVenue,
    layout: {
      id: 'layout',
      name: '布局',
      sourceVenueId: sourceVenue.id,
      objectNodeIds: ['a'],
      paths: [
        {
          id: 'walk',
          name: '走位',
          points: [
            [0, 0, -2],
            [1, 0, -3],
          ] as Vec3[],
        },
      ],
    },
    objects: [object()],
    obstacles: [object('obstacle', { position: [3, 0, -4] })],
    clearance: 0.2,
    tolerance: 0.01,
  }
  assert.throws(() => createDeploymentPlan({ ...input, mode: 'focus-zone' }))
  assert.throws(() => createDeploymentPlan({ ...input, mode: 'teaching-scale' }))
  assert.throws(() => createDeploymentPlan({ ...input, scale: 2 as 1 }))
  const result = createDeploymentPlan(input)
  close(result.paths[0]!.targetPoints[1]!, [4, 0, -3])
  assert(result.conflicts.some((c) => c.type === 'collision' && c.otherNodeId === 'obstacle'))
  close(input.obstacles[0]!.position, [3, 0, -4])
})
