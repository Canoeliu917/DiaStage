import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type CameraProject,
  type Shot,
  sampleMotion,
  sampleShot,
  validateCameraProject,
} from './model.ts'

const shot: Shot = {
  id: 'wide',
  name: '广角',
  duration: 6,
  keyframes: [
    { id: 'a', time: 0, position: [0, 2, 5], lookAt: [0, 1, 0], fov: 50 },
    { id: 'b', time: 2, position: [3, 3, 4], lookAt: [1, 1, 0], fov: 35 },
    { id: 'c', time: 6, position: [4, 2, 2], lookAt: [2, 1, 0], fov: 65 },
  ],
  follow: null,
  motion: null,
}
const project = (): CameraProject => structuredClone({ version: 1, shots: [shot] })

test('validation produces clean, sorted data without mutating the input', () => {
  const input = { ...project(), canvas: 'runtime only' }
  input.shots[0]!.keyframes.reverse()
  const parsed = validateCameraProject(input)
  assert.equal(parsed.shots[0]!.keyframes[0]!.time, 0)
  assert.equal(input.shots[0]!.keyframes[0]!.time, 6)
  assert.equal('canvas' in parsed, false)
  assert.deepEqual(validateCameraProject(JSON.parse(JSON.stringify(parsed))), parsed)
})

test('invalid times, IDs and degenerate camera poses are rejected', () => {
  const duplicate = project()
  duplicate.shots[0]!.keyframes[1]!.time = 0
  assert.throws(() => validateCameraProject(duplicate), /关键帧时间/)
  assert.throws(() => validateCameraProject({ ...project(), shots: [shot, shot] }), /机位 ID/)
  const invalid = project()
  invalid.shots[0]!.keyframes[0]!.position = [NaN, 2, 3]
  assert.throws(() => validateCameraProject(invalid))
  const coincident = project()
  coincident.shots[0]!.keyframes[0]!.lookAt = [...coincident.shots[0]!.keyframes[0]!.position]
  assert.throws(() => validateCameraProject(coincident), /重合/)
  const outside = project()
  outside.shots[0]!.duration = 3
  assert.throws(() => validateCameraProject(outside), /时长/)
})

test('path passes exactly through each keyframe and clamps outside the shot', () => {
  for (const key of shot.keyframes) {
    assert.deepEqual(sampleShot(shot, key.time), {
      position: key.position,
      lookAt: key.lookAt,
      fov: key.fov,
    })
  }
  assert.deepEqual(sampleShot(shot, -1), sampleShot(shot, 0))
  assert.deepEqual(sampleShot(shot, 20), sampleShot(shot, 6))
})

test('smooth interpolation has no segment overshoot and has continuous interior velocity', () => {
  for (let i = 0; i < shot.keyframes.length - 1; i++) {
    const left = shot.keyframes[i]!,
      right = shot.keyframes[i + 1]!
    for (let step = 0; step <= 100; step++) {
      const pose = sampleShot(shot, left.time + ((right.time - left.time) * step) / 100)
      for (let axis = 0; axis < 3; axis++) {
        assert(pose.position[axis]! >= Math.min(left.position[axis]!, right.position[axis]!) - 1e-9)
        assert(pose.position[axis]! <= Math.max(left.position[axis]!, right.position[axis]!) + 1e-9)
      }
    }
  }
  const epsilon = 1e-5
  const a = sampleShot(shot, 2 - epsilon),
    b = sampleShot(shot, 2),
    c = sampleShot(shot, 2 + epsilon)
  for (let axis = 0; axis < 3; axis++) {
    const before = (b.position[axis]! - a.position[axis]!) / epsilon
    const after = (c.position[axis]! - b.position[axis]!) / epsilon
    assert(Math.abs(before - after) < 0.0001)
  }
})

test('look-at follows the moving target; offset mode moves the camera too', () => {
  const follow: NonNullable<Shot['follow']> = {
    nodeId: 'chair',
    mode: 'lookAt',
    offset: [0, 2, 4],
    lookAtOffset: [0, 0.8, 0],
  }
  const aimed = sampleShot({ ...shot, follow }, 1, [2, 0, -1])
  assert.deepEqual(aimed.position, sampleShot(shot, 1).position)
  assert.deepEqual(aimed.lookAt, [2, 0.8, -1])
  const moved = sampleShot({ ...shot, follow: { ...follow, mode: 'offset' } }, 1, [2, 0, -1])
  assert.deepEqual(moved.position, [2, 2, 3])
  assert.deepEqual(moved.lookAt, aimed.lookAt)
})

test('object motion uses local positions and supports stationary single-keyframe tracks', () => {
  const motion = {
    nodeId: 'chair',
    keyframes: [
      { time: 0, position: [1, 0, 0] as [number, number, number] },
      { time: 4, position: [1, 0, 2] as [number, number, number] },
    ],
  }
  assert.deepEqual(sampleMotion(motion, 2), [1, 0, 1])
  assert.deepEqual(sampleMotion({ ...motion, keyframes: [motion.keyframes[0]!] }, 3), [1, 0, 0])
})
