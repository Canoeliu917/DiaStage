import assert from 'node:assert/strict'
import { test } from 'node:test'
import { focalLengthToVerticalFov } from '../../lib/camera-director'
import { cameraFrameToDirectorKey } from './director-key'
import type { CameraKeyframe } from './model'

const frame: CameraKeyframe = {
  id: 'key',
  time: 2,
  position: [2, 1.6, 4],
  lookAt: [0, 0.8, 0],
  fov: 50,
}

test('a camera frame transfers its exact framing to a sequence without sharing mutable vectors', () => {
  const key = cameraFrameToDirectorKey(frame, 20.25, 4)
  assert.deepEqual(key.position, frame.position)
  assert.deepEqual(key.target, frame.lookAt)
  assert.equal(key.focusDistanceM, 4)
  assert.ok(Math.abs(focalLengthToVerticalFov(key.focalLengthMm, 20.25) - frame.fov) < 1e-10)
  key.position[0] = 9
  assert.equal(frame.position[0], 2)
})

test('invalid coordinates or lens inputs cannot become a sequence key', () => {
  assert.throws(() => cameraFrameToDirectorKey({ ...frame, position: [NaN, 1, 2] }, 20.25, 4))
  for (const fov of [0, 180, Infinity]) {
    assert.throws(() => cameraFrameToDirectorKey({ ...frame, fov }, 20.25, 4))
  }
  for (const sensor of [0, -1, Infinity]) {
    assert.throws(() => cameraFrameToDirectorKey(frame, sensor, 4))
  }
  assert.throws(() => cameraFrameToDirectorKey(frame, 20.25, -1))
})
