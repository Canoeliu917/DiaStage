import { expect, test } from 'bun:test'
import type { CameraPose } from '@pascal-app/core'
import type { CameraIntentCommand } from './camera-intents'
import { applyCameraRuntimeActions, mapCameraIntent } from './camera-runtime-actions'

const source: CameraPose = {
  position: [4, 5, 9],
  target: [1, 1, 2],
  projection: 'perspective',
  viewWidth: 12,
  fov: 50,
}
const run = (...intents: CameraIntentCommand['intents']) =>
  applyCameraRuntimeActions(
    source,
    mapCameraIntent({ type: 'CAMERA_INTENT', intents, clarify: false })!,
  )
const direction = (pose: CameraPose) => {
  const v = pose.target.map((n, i) => n - pose.position[i]!)
  const d = Math.hypot(...v)
  return v.map((n) => n / d)
}

test('top is orthographic and above the same target', () => {
  const pose = run('top_orthographic')
  expect(pose.projection).toBe('orthographic')
  expect(pose.target).toEqual(source.target)
  expect(direction(pose)[1]).toBeCloseTo(-1, 8)
})
test('elevated view is 45 degree perspective, including from a top view', () => {
  for (const initial of [source, run('top_orthographic')]) {
    const pose = applyCameraRuntimeActions(initial, [{ type: 'elevate', radians: Math.PI / 4 }])
    expect(pose.projection).toBe('perspective')
    expect(direction(pose)[1]).toBeCloseTo(-Math.SQRT1_2)
    expect(pose.viewWidth).toBeUndefined()
  }
})
test('raise translates camera and target vertically without pitching', () => {
  const pose = run('raise_camera')
  expect(pose.position[1]).toBeGreaterThan(source.position[1])
  expect(pose.position[0]).toBe(source.position[0])
  expect(pose.position[2]).toBe(source.position[2])
  direction(pose).forEach((v, i) => {
    expect(v).toBeCloseTo(direction(source)[i]!)
  })
})
test('tilt lowers gaze by ten degrees without translating the camera', () => {
  const pose = run('tilt_down')
  expect(pose.position).toEqual(source.position)
  expect(Math.asin(-direction(pose)[1]!) - Math.asin(-direction(source)[1]!)).toBeCloseTo(
    Math.PI / 18,
  )
})
test('compound raise then tilt preserves both actions and input pose', () => {
  const before = structuredClone(source)
  const pose = run('raise_camera', 'tilt_down')
  expect(pose.position).toEqual(run('raise_camera').position)
  expect(direction(pose)[1]).toBeLessThan(direction(source)[1]!)
  expect(source).toEqual(before)
})
test('clarification and unsupported compounds do not map partial actions', () => {
  expect(
    mapCameraIntent({
      type: 'CAMERA_INTENT',
      intents: ['raise_camera', 'audience_view'],
      clarify: false,
    }),
  ).toBeNull()
  expect(
    mapCameraIntent({ type: 'CAMERA_INTENT', intents: ['raise_camera'], clarify: true }),
  ).toBeNull()
})
test('repeated down tilts remain finite and never cross the pole', () => {
  let pose = source
  for (let i = 0; i < 100; i++)
    pose = applyCameraRuntimeActions(pose, [{ type: 'pitch-down', radians: Math.PI / 18 }])
  expect(pose.position).toEqual(source.position)
  expect(direction(pose)[1]).toBeLessThan(-0.99)
  expect(direction(pose)[1]).toBeGreaterThan(-1)
})
test('tilt from an already vertical view never tilts upward', () => {
  const top = run('top_orthographic')
  const down = applyCameraRuntimeActions(top, [{ type: 'pitch-down', radians: Math.PI / 18 }])
  expect(down.position).toEqual(top.position)
  expect(direction(down)[1]!).toBeLessThanOrEqual(direction(top)[1]! + 1e-12)
})
test('target bounds frame both landscape and portrait projections', () => {
  for (const aspect of [0.4, 2]) {
    const target = { center: [10, 2, -7] as [number, number, number], radius: 5, aspect }
    const top = applyCameraRuntimeActions(source, [{ type: 'top' }], target)
    expect(top.target).toEqual(target.center)
    expect(top.viewWidth! / Math.max(1, aspect)).toBeGreaterThan(10)
    const perspective = applyCameraRuntimeActions(
      source,
      [{ type: 'elevate', radians: Math.PI / 4 }],
      target,
    )
    const distance = Math.hypot(...perspective.position.map((n, i) => n - target.center[i]!))
    const halfFov = Math.atan(Math.tan((25 * Math.PI) / 180) * Math.min(1, aspect))
    expect(distance * Math.sin(halfFov)).toBeGreaterThan(5)
  }
})
