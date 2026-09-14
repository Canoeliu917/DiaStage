import { expect, test } from 'bun:test'
import { Group, OrthographicCamera, Vector3 } from 'three'
import { nearestRotationRing, rotationPointerMetrics } from './rotation-ring-hit'

const camera = new OrthographicCamera(-200, 200, 200, -200, 0.1, 1000)
camera.position.z = 400
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
const viewport = { left: 20, top: 30, width: 400, height: 400 }

test('mouse retains 100/22 px; finger 145/14 px and Pencil 120/8 px stay distinct', () => {
  expect(rotationPointerMetrics('mouse')).toEqual({ radius: 100, hitRadius: 22 })
  expect(rotationPointerMetrics('touch')).toEqual({ radius: 145, hitRadius: 14 })
  expect(rotationPointerMetrics('pen')).toEqual({ radius: 120, hitRadius: 8 })
})

test('nearest curve wins in overlapping hit areas independent of insertion/depth order', () => {
  const x = new Group(),
    y = new Group()
  x.scale.setScalar(100)
  y.scale.setScalar(110)
  x.position.z = 10
  const rings = new Map([
    [1 as const, { group: y }],
    [0 as const, { group: x }],
  ])
  expect(nearestRotationRing({ x: 323, y: 230 }, rings, camera, viewport, 14)).toBe(0)
  expect(nearestRotationRing({ x: 327, y: 230 }, rings, camera, viewport, 14)).toBe(1)
  expect(
    nearestRotationRing({ x: 323, y: 230 }, new Map([...rings].reverse()), camera, viewport, 14),
  ).toBe(0)
  expect(
    nearestRotationRing(
      { x: 320, y: 230 },
      new Map([
        [1, { group: x }],
        [0, { group: x }],
      ]),
      camera,
      viewport,
      14,
    ),
  ).toBe(0)
  expect(nearestRotationRing({ x: 365, y: 230 }, rings, camera, viewport, 14)).toBeNull()
})

test('ring selection follows actual projected axes and ignores clipped rings', () => {
  const ring = new Group()
  ring.scale.setScalar(120)
  ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0.4, 0.6, 1).normalize())
  ring.updateMatrixWorld()
  const point = new Vector3(Math.cos(0.7), Math.sin(0.7), 0)
    .applyMatrix4(ring.matrixWorld)
    .project(camera)
  const pointer = { x: viewport.left + (point.x + 1) * 200, y: viewport.top + (1 - point.y) * 200 }
  expect(nearestRotationRing(pointer, new Map([[2, { group: ring }]]), camera, viewport, 8)).toBe(2)
  ring.position.z = 1000
  expect(
    nearestRotationRing(pointer, new Map([[2, { group: ring }]]), camera, viewport, 8),
  ).toBeNull()
})
