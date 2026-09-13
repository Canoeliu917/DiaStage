import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.CAMERA_STAGE_RUNTIME_TEST) {
  test('native camera gizmo moves, cancels, commits once and restores controls without changing scene nodes', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, CAMERA_STAGE_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { PerspectiveCamera, Scene } = await import('three')
  const core = await import('@pascal-app/core')
  const effects: Array<() => (() => void) | undefined> = []
  const cleanups: Array<() => void> = []
  const frames: Array<() => void> = []
  const runEffects = () => {
    for (const effect of effects.splice(0)) {
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    }
  }
  const hooks = {
    ...React,
    useMemo: <T,>(fn: () => T) => fn(),
    useCallback: <T,>(fn: T) => fn,
    useRef: <T,>(value: T) => ({ current: value }),
    useEffect: (fn: () => (() => void) | undefined) => {
      effects.push(fn)
    },
    useLayoutEffect: (fn: () => (() => void) | undefined) => {
      effects.push(fn)
    },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    useDebugValue() {},
  }
  mock.module('react', () => ({ ...hooks, default: hooks }))
  const wrap = <T,>(state: T) =>
    Object.assign((select: (value: T) => unknown) => select(state), { getState: () => state })
  const editor = {
    workspaceMode: 'edit',
    isPreviewMode: false,
    isCaptureMode: false,
    isFirstPersonMode: false,
    viewMode: '3d',
    activeSidebarPanel: 'camera-studio',
    mode: 'select',
    phase: 'structure',
    floorplanSelectionTool: 'click',
  }
  type Scope = { kind: string; handle?: string; nodeId?: string }
  const scope = {
    scope: { kind: 'idle' } as Scope,
    begin: (next: Scope) => {
      scope.scope = next
    },
    endIf: (match: (value: Scope) => boolean) => {
      if (match(scope.scope)) scope.scope = { kind: 'idle' }
    },
  }
  mock.module('@pascal-app/editor', () => ({
    useEditor: wrap(editor),
    useInteractionScope: wrap(scope),
  }))
  const viewer = {
    renderPaused: false,
    cameraDragging: false,
    inputDragging: false,
    setInputDragging(value: boolean) {
      viewer.inputDragging = value
    },
    setSelection() {},
    setPreviewSelectedIds() {},
    sceneTheme: 'white',
  }
  mock.module('@pascal-app/viewer', () => ({
    useViewer: wrap(viewer),
    OVERLAY_LAYER: 1,
    SCENE_LAYER: 0,
    getSceneTheme: () => ({ background: '#ffffff' }),
    useIsolatedFrame: (fn: () => void) => frames.push(fn),
    ViewerErrorBoundary: ({ children }: { children: unknown }) => children,
  }))
  const camera = new PerspectiveCamera(50, 16 / 9)
  camera.position.set(4, 3, 6)
  camera.lookAt(1, 2, 3)
  camera.updateMatrixWorld()
  const mainPosition = camera.position.clone()
  const scene = new Scene()
  const controls = { enabled: true, setLookAt() {} }
  class Canvas extends EventTarget {
    style = { touchAction: '' }
    setPointerCapture() {}
    releasePointerCapture() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1280, height: 720 }
    }
  }
  const canvas = new Canvas()
  Object.assign(globalThis, {
    window: new EventTarget(),
    document: {
      hidden: false,
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} },
    },
  })
  mock.module('@react-three/fiber', () => ({
    useFrame: (fn: () => void) => frames.push(fn),
    useThree: (select?: (state: unknown) => unknown) => {
      const state = { camera, controls, scene, gl: { domElement: canvas }, invalidate() {} }
      return select ? select(state) : state
    },
  }))
  const realScene = core.useScene
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (select: (state: ReturnType<typeof realScene.getState>) => unknown) =>
        select(realScene.getState()),
      realScene,
    ),
  }))
  const { useCameraStudio } = await import('./store')
  const { CameraStageSystem } = await import('./camera-stage-system')
  const level = core.LevelNode.parse({ id: 'level_stage_test' })
  realScene.setState({ nodes: { [level.id]: level }, rootNodeIds: [level.id], readOnly: false })
  const beforeScene = realScene.getState().nodes
  useCameraStudio.getState().setProject({
    version: 1,
    shots: [
      {
        id: 'camera-a',
        name: '测试',
        duration: 2,
        follow: null,
        motion: null,
        keyframes: [{ id: 'frame-a', time: 0, position: [1, 2, 3], lookAt: [1, 2, 0], fov: 50 }],
      },
    ],
  })
  const project = useCameraStudio.getState().project
  const render = (element: React.ReactElement) => {
    assert.equal(typeof element.type, 'function')
    return (element.type as (props: unknown) => React.ReactElement)(element.props)
  }
  const children = (element: React.ReactElement) =>
    React.Children.toArray((element.props as { children: React.ReactNode }).children).filter(
      React.isValidElement,
    )
  const editorSource = '../../../../packages/editor/src/'
  mock.module(
    fileURLToPath(new URL(`${editorSource}store/use-editor.tsx`, import.meta.url)),
    () => ({
      default: wrap(editor),
    }),
  )
  mock.module(
    fileURLToPath(new URL(`${editorSource}store/use-interaction-scope.ts`, import.meta.url)),
    () => ({
      default: wrap(scope),
    }),
  )
  mock.module(
    fileURLToPath(
      new URL(`${editorSource}components/tools/select/plane-box-select-tool.tsx`, import.meta.url),
    ),
    () => ({
      PlaneBoxSelectTool: () => null,
    }),
  )
  const { BoxSelectTool } = await import(
    '../../../../packages/editor/src/components/tools/select/box-select-tool'
  )
  render(BoxSelectTool({})!)
  runEffects()
  const pointerEvent = (type: string, clientX: number) => {
    const event = new Event(type)
    Object.assign(event, { button: 0, pointerId: 1, clientX, clientY: 360 })
    return event
  }
  // The native rectangle tool arms before the camera gizmo claims the gesture.
  canvas.dispatchEvent(pointerEvent('pointerdown', 640))
  const root = CameraStageSystem({ enabled: true })!
  runEffects()
  const actor = render(children(root)[0]!)
  runEffects()
  const actorChildren = children(actor)
  const body = (actorChildren[0]!.props as { object: import('three').Group }).object
  scene.add(body)
  const transformElement = actorChildren[1]!
  const helper = render(transformElement)
  runEffects()
  const helperObject = (helper.props as { object: import('three').Object3D }).object
  scene.add(helperObject)
  const transform = (
    transformElement.props as {
      controlRef: {
        current: import('three/addons/controls/TransformControls.js').TransformControls
      }
    }
  ).controlRef.current
  scene.updateMatrixWorld(true)
  transform.axis = 'X'
  scene.updateMatrixWorld(true)
  transform.pointerDown({ x: 0, y: 0, button: 0 })
  assert.equal(controls.enabled, false)
  assert.equal(
    viewer.inputDragging,
    true,
    'claim the native marquee exclusion before its move listener',
  )
  transform.pointerMove({ x: 0.1, y: 0, button: -1 })
  window.dispatchEvent(pointerEvent('pointermove', 704))
  assert.equal(
    scope.scope.kind,
    'handle-drag',
    'the real box-select listener must yield to the camera gesture',
  )
  assert(
    useCameraStudio.getState().stageDraft,
    'native ray-plane movement publishes a temporary pose',
  )
  assert.notEqual(body.position.x, 1)
  assert.equal(useCameraStudio.getState().project, project)
  for (const frame of frames) frame()
  assert.equal(transform.enabled, true)
  assert.equal(transform.dragging, true)
  transform.pointerUp({ x: 0.1, y: 0, button: 0 })
  assert.equal(controls.enabled, true)
  assert.equal(viewer.inputDragging, false)
  assert.equal(useCameraStudio.getState().cameraUndo.length, 1)
  assert.notEqual(useCameraStudio.getState().project.shots[0]!.keyframes[0]!.position[0], 1)
  assert.deepEqual(realScene.getState().nodes, beforeScene)
  assert(camera.position.equals(mainPosition))
  useCameraStudio.getState().undoCameraEdit()
  assert.deepEqual(useCameraStudio.getState().project, project)
  transform.axis = 'X'
  scene.updateMatrixWorld(true)
  transform.pointerDown({ x: 0, y: 0, button: 0 })
  transform.pointerMove({ x: 0.2, y: 0, button: -1 })
  const escapeEvent = new Event('keydown')
  Object.defineProperty(escapeEvent, 'key', { value: 'Escape' })
  window.dispatchEvent(escapeEvent)
  assert.equal(useCameraStudio.getState().stageDraft, null)
  assert.equal(useCameraStudio.getState().cameraUndo.length, 0)
  assert.equal(scope.scope.kind, 'idle')
  assert.equal(controls.enabled, true)
  assert.equal(viewer.inputDragging, false)
  assert.deepEqual(realScene.getState().nodes, beforeScene)
  for (const cleanup of cleanups.reverse()) cleanup()
  assert.equal(useCameraStudio.getState().monitorStatus, 'paused')
  for (const patch of [
    { isFirstPersonMode: true },
    { isCaptureMode: true },
    { isPreviewMode: true },
    { workspaceMode: 'studio' },
    { activeSidebarPanel: 'remount' },
    { viewMode: '2d' },
  ]) {
    const before = { ...editor }
    Object.assign(editor, patch)
    assert.equal(CameraStageSystem({ enabled: true }), null)
    runEffects()
    assert.equal(useCameraStudio.getState().stageReady, false)
    Object.assign(editor, before)
  }
}
