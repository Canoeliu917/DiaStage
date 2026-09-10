import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.CAMERA_STUDIO_RUNTIME_TEST) {
  test('runtime motion, floor support, following and Stop share the rendered pose', () => {
    // Bun module mocks persist process-wide; isolate hooks so recording tests
    // continue to exercise the real React Three Fiber after-render effects.
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, CAMERA_STUDIO_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { Object3D, PerspectiveCamera, Vector3 } = await import('three')
  const { z } = await import('zod')
  const frames: Array<{ callback: (state: unknown, delta: number) => void; priority: number }> = []
  const effects: Array<() => undefined | (() => void)> = []
  const camera = new PerspectiveCamera(50)
  camera.position.set(4, 3, 6)
  const target = new Vector3(0, 1, 0)
  const controls = {
    enabled: true,
    minDistance: 0.1,
    maxDistance: 100,
    minPolarAngle: 0.1,
    maxPolarAngle: 3,
    getPosition: (out: InstanceType<typeof Vector3>) => out.copy(camera.position),
    getTarget: (out: InstanceType<typeof Vector3>) => out.copy(target),
    setLookAt: (x: number, y: number, zz: number, tx: number, ty: number, tz: number) => {
      camera.position.set(x, y, zz)
      target.set(tx, ty, tz)
      return Promise.resolve()
    },
    update: () => {},
  }
  class Canvas extends EventTarget {}
  Object.assign(globalThis, { HTMLCanvasElement: Canvas, document: new EventTarget() })
  const canvas = new Canvas()
  const defaultEditorState = {
    viewMode: '3d',
    isPreviewMode: false,
    isFirstPersonMode: false,
    isCaptureMode: false,
    workspaceMode: 'edit',
  }
  const editorState = { ...defaultEditorState }
  const viewerState = { renderPaused: false, cameraMode: 'perspective' }
  const hook = <T>(state: T) =>
    Object.assign((select: (value: T) => unknown) => select(state), {
      getState: () => state,
    })
  mock.module('@pascal-app/editor', () => ({ useEditor: hook(editorState) }))
  mock.module('@pascal-app/viewer', () => ({
    useViewer: hook(viewerState),
    useIsolatedFrame: (callback: (state: unknown, delta: number) => void, priority = 0) =>
      frames.push({ callback, priority }),
  }))
  const reactHooks = {
    ...React,
    useRef: <T>(value: T) => ({ current: value }),
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
  }
  mock.module('react', () => ({ ...reactHooks, default: reactHooks }))
  mock.module('@react-three/fiber', () => ({
    useFrame: (callback: (state: unknown, delta: number) => void, priority = 0) =>
      frames.push({ callback, priority }),
    useThree: (select: (state: unknown) => unknown) =>
      select({ camera, controls, gl: { domElement: canvas }, invalidate: () => {} }),
  }))

  const core = await import('@pascal-app/core')
  const sceneStore = core.useScene
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (select: (state: ReturnType<typeof sceneStore.getState>) => unknown) =>
        select(sceneStore.getState()),
      sceneStore,
    ),
  }))
  const { spatialGridManager } = core

  core.registerNode({
    kind: 'block',
    schemaVersion: 1,
    schema: z.object({ type: z.literal('block') }),
    category: 'structure',
    defaults: () => ({}),
    capabilities: {
      floorPlaced: { footprint: () => ({ dimensions: [0.4, 1, 0.4], rotation: [0, 0, 0] }) },
    },
  } as never)
  const level = { id: 'level_runtime_test', type: 'level', level: 0, parentId: null, children: [] }
  const subject = {
    id: 'block_runtime_test',
    type: 'block',
    parentId: level.id,
    position: [0, 0, 0],
    rotation: 0,
  }
  const slab = {
    id: 'slab_runtime_test',
    type: 'slab',
    parentId: level.id,
    visible: true,
    polygon: [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    holes: [],
    elevation: 0.5,
    thickness: 0.5,
    autoFromWalls: false,
  }
  core.useScene.setState({
    nodes: Object.fromEntries([level, subject, slab].map((node) => [node.id, node])) as never,
    dirtyNodes: new Set(),
    rootNodeIds: [level.id] as never,
  })
  spatialGridManager.handleNodeCreated(slab as never, level.id)
  const object = new Object3D()
  object.position.set(0, 0.5, 0)
  core.sceneRegistry.nodes.set(subject.id, object)
  const { useCameraStudio } = await import('./store')
  const { CameraStudioRuntime } = await import('./runtime')
  const { FloorElevationSystem } = await import(
    '../../../../packages/viewer/src/systems/floor-elevation/floor-elevation-system'
  )
  useCameraStudio.getState().setProject({
    version: 1,
    shots: [
      {
        id: 'motion',
        name: 'Motion',
        duration: 2,
        keyframes: [{ id: 'camera', time: 0, position: [4, 3, 6], lookAt: [0, 1, 0], fov: 35 }],
        follow: {
          nodeId: subject.id,
          mode: 'offset',
          offset: [0, 1, 4],
          lookAtOffset: [0, 0.6, 0],
        },
        motion: {
          nodeId: subject.id,
          keyframes: [
            { time: 0, position: [0, 0, 0] },
            { time: 1, position: [0, 2, 0] },
            { time: 2, position: [3, 2, 0] },
          ],
        },
      },
    ],
  })
  CameraStudioRuntime()
  FloorElevationSystem()
  const cleanup = effects.map((effect) => effect())
  const tick = (delta = 0) => {
    for (const frame of [...frames].sort((a, b) => a.priority - b.priority))
      frame.callback({}, delta)
  }
  assert.equal(useCameraStudio.getState().runtimeReady, true)
  useCameraStudio.getState().seek(1)
  tick()
  assert.equal(object.position.y, 2.5, 'track Y must survive the later floor-elevation pass')
  assert.equal(target.y, 3.1, 'follow target must use the same rendered floor height')
  assert.equal(camera.position.y, 3.5)
  assert.equal(controls.enabled, false)
  useCameraStudio.getState().seek(2)
  tick()
  assert.equal(object.position.y, 2, 'moving off the slab must resolve the new support footprint')
  assert.equal(target.y, 2.6)
  assert.deepEqual(subject.position, [0, 0, 0], 'preview must not mutate the scene graph')

  useCameraStudio.getState().stop()
  assert.deepEqual(camera.position.toArray(), [4, 3, 6])
  assert.deepEqual(target.toArray(), [0, 1, 0])
  assert.equal(camera.fov, 50)
  assert.equal(controls.enabled, true)
  assert.equal(core.useLiveNodeOverrides.getState().get(subject.id), undefined)
  // React rebinds base position when the transient override is cleared.
  object.position.set(0, 0, 0)
  tick()
  assert.equal(
    object.position.y,
    0.5,
    'Stop must retain the original raised floor after React commits',
  )
  useCameraStudio.getState().seek(1)
  tick()
  for (const dispose of cleanup.reverse()) dispose?.()
  assert.equal(useCameraStudio.getState().runtimeReady, false)
  assert.equal(useCameraStudio.getState().canvas, null)
  assert.equal(useCameraStudio.getState().previewing, false)
  assert.deepEqual(camera.position.toArray(), [4, 3, 6])
  assert.equal(object.position.y, 0.5, 'unmount must restore without waiting for another frame')

  for (const [mode, editorPatch, paused, ready] of [
    ['Studio', { workspaceMode: 'studio' }, false, false],
    ['Edit 3D after Studio', {}, false, true],
    ['Capture', { isCaptureMode: true }, false, false],
    ['Preview after Capture', { isPreviewMode: true }, false, true],
    ['first person', { isFirstPersonMode: true }, false, false],
    ['2D', { viewMode: '2d' }, false, false],
    ['paused renderer', {}, true, false],
    ['Preview with editor 2D state', { viewMode: '2d', isPreviewMode: true }, false, true],
    ['Edit 3D restored', {}, false, true],
  ] as const) {
    frames.length = 0
    effects.length = 0
    Object.assign(editorState, defaultEditorState, editorPatch)
    viewerState.renderPaused = paused
    CameraStudioRuntime()
    const disposers = effects.map((effect) => effect())
    assert.equal(useCameraStudio.getState().runtimeReady, ready, mode)
    if (!ready) {
      useCameraStudio.getState().play()
      assert.equal(
        useCameraStudio.getState().playing,
        false,
        'a hidden canvas cannot begin playback',
      )
      assert.equal(useCameraStudio.getState().captureCamera(), null)
      // A pending command can outlive a mode change; even then the frame
      // callback must not compete with Studio, capture or first-person rigs.
      useCameraStudio.setState({ previewing: true, playing: true, time: 1 })
      tick(0.1)
      assert.deepEqual(camera.position.toArray(), [4, 3, 6], `${mode}: camera stays unchanged`)
      assert.deepEqual(target.toArray(), [0, 1, 0], `${mode}: target stays unchanged`)
      assert.equal(camera.fov, 50)
      assert.equal(object.position.y, 0.5)
      assert.equal(controls.enabled, true)
      assert.equal(useCameraStudio.getState().time, 1, `${mode}: time does not advance`)
      assert.equal(core.useLiveNodeOverrides.getState().get(subject.id), undefined)
    } else {
      assert.notEqual(useCameraStudio.getState().captureCamera(), null, mode)
      useCameraStudio.getState().seek(1)
      tick()
      assert.equal(camera.position.y, 3.5, `${mode}: the camera resumes following`)
      assert.equal(object.position.y, 2.5)
    }
    for (const dispose of disposers.reverse()) dispose?.()
  }
}
