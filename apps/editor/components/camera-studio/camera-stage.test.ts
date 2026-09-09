import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Color, PerspectiveCamera, Scene } from 'three'
import { RenderTarget } from 'three/webgpu'
import { type MonitorRenderer, renderMonitorPixels } from './camera-monitor-render'
import { transformedCameraPose, unpackMonitorPixels } from './camera-stage-math'
import type { CameraProject, Shot } from './model'
import { useCameraStudio } from './store'

const shot: Shot = {
  id: 'camera-a',
  name: '主机位',
  duration: 4,
  follow: null,
  motion: null,
  keyframes: [
    { id: 'frame-a', time: 0, position: [1, 2, 3], lookAt: [1, 2, 0], fov: 50 },
    { id: 'frame-b', time: 4, position: [2, 2, 3], lookAt: [2, 2, 0], fov: 65 },
  ],
}
const project: CameraProject = { version: 1, shots: [shot] }
beforeEach(() => {
  useCameraStudio.setState({ recording: false })
  useCameraStudio.getState().setProject(project)
})
afterEach(() => {
  useCameraStudio.setState({ recording: false })
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
})

test('translation preserves aim vector and rotation preserves focus distance', () => {
  const moved = transformedCameraPose(shot.keyframes[0]!, [4, 5, 6], [0, 0, -1], 'translate')
  expect(moved.lookAt).toEqual([4, 5, 3])
  const rotated = transformedCameraPose(shot.keyframes[0]!, [1, 2, 3], [1, 0, 0], 'rotate')
  expect(rotated.lookAt).toEqual([4, 2, 3])
  expect(rotated.fov).toBe(50)
  expect(() =>
    transformedCameraPose(shot.keyframes[0]!, [0, Number.NaN, 0], [1, 0, 0], 'translate'),
  ).toThrow('有限')
})

test('selected keyframe and one committed drag share existing project history', () => {
  const state = useCameraStudio.getState()
  state.selectKeyframe('frame-b')
  expect(useCameraStudio.getState().time).toBe(4)
  expect(useCameraStudio.getState().previewing).toBe(false)
  const before = useCameraStudio.getState().project
  state.setStageDraft({
    shotId: shot.id,
    frameId: 'frame-b',
    pose: { position: [5, 2, 3], lookAt: [5, 2, 0], fov: 65 },
  })
  expect(useCameraStudio.getState().project).toBe(before)
  expect(useCameraStudio.getState().cameraUndo).toHaveLength(0)
  const pose = useCameraStudio.getState().stageDraft!.pose
  state.setStageDraft(null)
  state.updateShot(shot.id, {
    keyframes: shot.keyframes.map((frame) =>
      frame.id === 'frame-b' ? { ...frame, ...pose } : frame,
    ),
  })
  expect(useCameraStudio.getState().cameraUndo).toHaveLength(1)
  expect(useCameraStudio.getState().project.shots[0]?.keyframes[0]).toEqual(shot.keyframes[0])
  state.undoCameraEdit()
  expect(useCameraStudio.getState().project).toEqual(before)
  state.redoCameraEdit()
  expect(useCameraStudio.getState().project.shots[0]?.keyframes[1]?.position).toEqual([5, 2, 3])
})

test('loading another scene clears temporary pose and camera edit history', () => {
  const state = useCameraStudio.getState()
  state.updateShot(shot.id, { name: '已改名' })
  state.setStageDraft({ shotId: shot.id, frameId: 'frame-a', pose: shot.keyframes[0]! })
  state.setProject({ version: 1, shots: [{ ...shot, id: 'scene-b-camera' }] })
  state.undoCameraEdit()
  expect(useCameraStudio.getState().selectedShotId).toBe('scene-b-camera')
  expect(useCameraStudio.getState().cameraUndo).toHaveLength(0)
  expect(useCameraStudio.getState().cameraRedo).toHaveLength(0)
  expect(useCameraStudio.getState().stageDraft).toBeNull()
})

test('recording blocks camera edits while playback controls remain available', () => {
  const state = useCameraStudio.getState()
  state.setRecording(true)
  const before = useCameraStudio.getState().project
  state.updateShot(shot.id, { name: '不可提交' })
  state.removeShot(shot.id)
  expect(useCameraStudio.getState().project).toBe(before)
  state.setRuntime({ canvas: null, capture: null, runtimeReady: true })
  state.seek(2)
  expect(useCameraStudio.getState().time).toBe(2)
  state.play()
  expect(useCameraStudio.getState().playing).toBe(true)
  state.stop()
  expect(useCameraStudio.getState().playing).toBe(false)
})

test('readback preserves WebGPU top-down rows and flips WebGL rows', () => {
  const padded = new Uint8Array(512)
  padded.set([1, 2, 3, 255], 0)
  padded.set([4, 5, 6, 255], 256)
  expect([...unpackMonitorPixels(padded, 1, 2, true)]).toEqual([1, 2, 3, 255, 4, 5, 6, 255])
  expect([
    ...unpackMonitorPixels(new Uint8Array([4, 5, 6, 255, 1, 2, 3, 255]), 1, 2, false),
  ]).toEqual([1, 2, 3, 255, 4, 5, 6, 255])
})

test('monitor restores shared renderer state before asynchronous readback and on render failure', async () => {
  const originalTarget = new RenderTarget(1, 1)
  const target = new RenderTarget(1, 1)
  const originalMrt = { name: 'main-mrt' }
  let bound: RenderTarget | null = originalTarget
  let mrt: unknown = originalMrt
  const clear = new Color('#123456')
  let alpha = 0.3
  let fail = false
  let finish: (pixels: Uint8Array) => void = () => {}
  const renderer = {
    backend: { isWebGPUBackend: true },
    autoClear: false,
    getRenderTarget: () => bound,
    getActiveCubeFace: () => 2,
    getActiveMipmapLevel: () => 1,
    setRenderTarget: (value: RenderTarget | null) => {
      bound = value
    },
    getMRT: () => mrt,
    setMRT: (value: unknown) => {
      mrt = value
    },
    getClearColor: (out: Color) => out.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (value: Color, nextAlpha: number) => {
      clear.copy(value)
      alpha = nextAlpha
    },
    render: () => {
      expect(bound).toBe(target)
      expect(mrt).toBeNull()
      if (fail) throw new Error('gpu failure')
    },
    readRenderTargetPixelsAsync: () =>
      new Promise<Uint8Array>((resolve) => {
        finish = resolve
      }),
  }
  const pending = renderMonitorPixels(
    renderer as unknown as MonitorRenderer,
    new Scene(),
    new PerspectiveCamera(),
    target,
    '#ffffff',
  )
  expect(bound).toBe(originalTarget)
  expect(mrt).toBe(originalMrt)
  expect(clear.getHexString()).toBe('123456')
  expect(alpha).toBe(0.3)
  expect(renderer.autoClear).toBe(false)
  finish(new Uint8Array([1, 2, 3, 255]))
  expect([...(await pending)]).toEqual([1, 2, 3, 255])
  fail = true
  await expect(
    renderMonitorPixels(
      renderer as unknown as MonitorRenderer,
      new Scene(),
      new PerspectiveCamera(),
      target,
      '#ffffff',
    ),
  ).rejects.toThrow('gpu failure')
  expect(bound).toBe(originalTarget)
  expect(mrt).toBe(originalMrt)
  expect(renderer.autoClear).toBe(false)
  originalTarget.dispose()
  target.dispose()
})
