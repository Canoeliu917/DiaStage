import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.STAGE_CAMERA_GUARD_TEST) {
  test('stage camera lock and object gestures freeze controls without changing the Scene', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, STAGE_CAMERA_GUARD_TEST: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { createStore } = await import('zustand/vanilla')
  let effect: (() => (() => void) | undefined) | undefined
  mock.module('react', () => ({
    ...React,
    useEffect: (fn: typeof effect) => {
      effect = fn
    },
  }))
  const viewer = createStore(() => ({ inputDragging: false }))
  const scope = createStore(() => ({ scope: { kind: 'idle' } }))
  let freezes = 0
  const controls = {
    enabled: true,
    getPosition: (out: { set: (...args: number[]) => unknown }) => out.set(3, 4, 5),
    getTarget: (out: { set: (...args: number[]) => unknown }) => out.set(0, 0, 0),
    setLookAt: (...args: unknown[]) => {
      assert.deepEqual(args, [3, 4, 5, 0, 0, 0, false])
      freezes++
    },
  }
  mock.module('@react-three/fiber', () => ({ useThree: () => ({ controls }) }))
  mock.module('@pascal-app/viewer', () => ({ useViewer: viewer }))
  mock.module('@pascal-app/editor', () => ({
    useInteractionScope: scope,
    useEditor: { getState: () => ({ viewMode: '3d' }) },
  }))
  mock.module('@/lib/stage/context', () => ({
    currentStageContext: () => ({ venue: null }),
    stageFrame: () => null,
  }))
  Object.assign(globalThis, { window: new EventTarget(), Element: class {} })
  const { useScene } = await import('@pascal-app/core')
  const { useStageTransform } = await import('./transform-mode')
  const { StageCameraGuard } = await import('./stage-camera-guard')
  const before = useScene.getState().nodes
  StageCameraGuard({ enabled: true })
  const cleanup = effect?.()
  viewer.setState({ inputDragging: true })
  assert.equal(controls.enabled, false)
  assert.equal(freezes, 1)
  scope.setState({ scope: { kind: 'handle-drag' } })
  viewer.setState({ inputDragging: false })
  assert.equal(controls.enabled, false, 'scope retains camera lock through release cleanup')
  scope.setState({ scope: { kind: 'idle' } })
  assert.equal(controls.enabled, true)
  useStageTransform.setState({ cameraLocked: true })
  assert.equal(controls.enabled, false)
  viewer.setState({ inputDragging: true })
  viewer.setState({ inputDragging: false })
  assert.equal(controls.enabled, false, 'gesture end must retain explicit camera lock')
  const key = new Event('keydown', { cancelable: true })
  Object.defineProperty(key, 'code', { value: 'KeyW' })
  window.dispatchEvent(key)
  assert.equal(key.defaultPrevented, true)
  useStageTransform.setState({ cameraLocked: false })
  assert.equal(controls.enabled, true)
  controls.enabled = false
  viewer.setState({ inputDragging: true })
  viewer.setState({ inputDragging: false })
  assert.equal(controls.enabled, false, 'respect a pre-existing camera disable')
  cleanup?.()
  assert.equal(useScene.getState().nodes, before)
}
