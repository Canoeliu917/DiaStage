import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.LIGHTING_RUNTIME_TEST) {
  test('lighting keeps real scene lights, isolates helpers, and shares cancellable 3D/2D edits', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, LIGHTING_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const THREE = await import('three')
  const { TransformControls } = await import('three/addons/controls/TransformControls.js')
  const core = await import('@pascal-app/core')
  const effects: Array<() => undefined | (() => void)> = [],
    cleanups: Array<() => void> = [],
    frames: Array<() => void> = []
  const transforms: InstanceType<typeof TransformControls>[] = []
  const runEffects = () => {
    for (const effect of effects.splice(0)) {
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    }
  }
  const dispose = () => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    frames.length = 0
  }
  const hooks = {
    ...React,
    useMemo: <T,>(fn: () => T) => {
      const value = fn()
      if (value instanceof TransformControls) transforms.push(value)
      return value
    },
    useRef: <T,>(value: T) => ({ current: value }),
    useCallback: <T,>(fn: T) => fn,
    useEffect: (fn: () => undefined | (() => void)) => effects.push(fn),
    useLayoutEffect: (fn: () => undefined | (() => void)) => effects.push(fn),
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    useDebugValue() {},
  }
  mock.module('react', () => ({ ...hooks, default: hooks }))
  const wrap = <T,>(state: T) =>
    Object.assign((select?: (value: T) => unknown) => (select ? select(state) : state), {
      getState: () => state,
    })
  const editor = {
    workspaceMode: 'edit',
    mode: 'select',
    viewMode: '3d',
    activeSidebarPanel: 'picture',
    isPreviewMode: false,
    isCaptureMode: false,
    isFirstPersonMode: false,
  }
  type Scope = { kind: string; handle?: string; nodeId?: string }
  const interaction = {
    scope: { kind: 'idle' } as Scope,
    begin(scope: Scope) {
      interaction.scope = scope
    },
    endIf(match: (scope: Scope) => boolean) {
      if (match(interaction.scope)) interaction.scope = { kind: 'idle' }
    },
  }
  const context = {
    unitsPerPixel: 0.02,
    sceneRotationDeg: 0,
    palette: {
      selectedStroke: '#fff',
      measurementStroke: '#888',
      measurementLabelBackground: '#111',
      measurementLabelText: '#fff',
    },
  }
  mock.module('@pascal-app/editor', () => ({
    useEditor: wrap(editor),
    useInteractionScope: wrap(interaction),
    useFloorplanRender: () => context,
  }))
  const viewer = {
    renderPaused: false,
    inputDragging: false,
    selection: { levelId: 'level_lighting', selectedIds: [] as string[] },
    previewSelectedIds: [] as string[],
    setInputDragging(value: boolean) {
      viewer.inputDragging = value
    },
    setSelection(patch: { selectedIds?: string[] }) {
      if (patch.selectedIds) viewer.selection.selectedIds = patch.selectedIds
    },
    setPreviewSelectedIds(ids: string[]) {
      viewer.previewSelectedIds = ids
    },
  }
  mock.module('@pascal-app/viewer', () => ({
    useViewer: wrap(viewer),
    OVERLAY_LAYER: 1,
    SCENE_LAYER: 0,
    SHADOW_ONLY_LAYER: 4,
    getSceneTheme: () => ({ background: '#ffffff' }),
  }))
  mock.module(
    fileURLToPath(new URL('../../../../packages/viewer/src/store/use-viewer.ts', import.meta.url)),
    () => ({ default: wrap(viewer) }),
  )
  const { useNodeEvents: nodeEventHandlers } = await import(
    '../../../../packages/viewer/src/hooks/use-node-events'
  )
  const realScene = core.useScene
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (select: (state: ReturnType<typeof realScene.getState>) => unknown) =>
        select(realScene.getState()),
      realScene,
    ),
  }))
  const camera = new THREE.PerspectiveCamera(50, 16 / 9)
  camera.position.set(8, 7, 8)
  camera.lookAt(2, 4, 2)
  camera.updateMatrixWorld()
  const controls = { enabled: true },
    scene = new THREE.Scene()
  class Canvas extends EventTarget {
    style = { touchAction: '' }
    setPointerCapture() {}
    releasePointerCapture() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1280, height: 720 }
    }
  }
  const canvas = new Canvas()
  Object.assign(globalThis, { window: new EventTarget(), document: { hidden: false } })
  mock.module('@react-three/fiber', () => ({
    useFrame: (fn: () => void) => frames.push(fn),
    useThree: (select?: (value: unknown) => unknown) => {
      const value = { camera, controls, scene, gl: { domElement: canvas }, invalidate() {} }
      return select ? select(value) : value
    },
  }))
  const { useLighting } = await import('./store')
  const { useCameraStudio } = await import('../camera-studio/store')
  const { createStageLight } = await import('./model')
  const { LightingSystem } = await import('./system')
  const { LightingFloorplan, moveLightInPlan } = await import('./floorplan')
  const building = core.BuildingNode.parse({
    id: 'building_lighting',
    position: [10, 0, 20],
    rotation: [0, Math.PI / 2, 0],
    children: ['level_lighting'],
  })
  const level = core.LevelNode.parse({ id: 'level_lighting', parentId: building.id })
  const nodeEvents = nodeEventHandlers(level, 'level')
  let nodeClickCount = 0
  const onNodeClick = () => {
    nodeClickCount++
    viewer.setSelection({ selectedIds: [level.id] })
  }
  core.emitter.on('node:click', onNodeClick)
  const nodePointerUp = {
    button: 0,
    object: new THREE.Group(),
    point: new THREE.Vector3(),
    stopPropagation() {},
  } as unknown as Parameters<typeof nodeEvents.onPointerUp>[0]
  realScene.setState({
    nodes: { [building.id]: building, [level.id]: level },
    rootNodeIds: [building.id],
    readOnly: false,
  })
  const nodes = realScene.getState().nodes
  const initial = { version: 1 as const, lights: [createStageLight('light-a', 0)] }
  const reset = () => {
    useLighting.getState().setProject(initial)
    useLighting.setState({ loadedSceneId: 'scene-a', editTarget: 'position', showHelpers: true })
    interaction.scope = { kind: 'idle' }
    useCameraStudio.setState({ playing: false, recording: false, previewing: false })
    controls.enabled = true
  }
  const children = (element: React.ReactElement) =>
    React.Children.toArray((element.props as { children: React.ReactNode }).children).filter(
      React.isValidElement,
    )
  const render = (element: React.ReactElement) =>
    (element.type as (props: unknown) => React.ReactElement)(element.props)
  reset()
  const root = LightingSystem({ enabled: true, sceneId: 'scene-a' })
  const entries = children(root)
  assert.equal(entries.length, 5)
  for (let index = 0; index < 4; index++) {
    const sourceTree = render(entries[index]!)
    runEffects()
    const source = (
      children(sourceTree)[0]!.props as { object: InstanceType<typeof THREE.SpotLight> }
    ).object
    assert(source instanceof THREE.SpotLight)
    assert.equal(source.castShadow, true)
    assert.equal(source.shadow.mapSize.x, 512)
    assert.equal(source.layers.mask, 1)
    assert(source.position.distanceTo(source.target.position) > 0)
    assert.equal(source.intensity, index === 0 ? 150 : 0)
    assert.equal(source.angle, Math.PI / 8)
  }
  const actor = render(entries[4]!)
  runEffects()
  const actorEntries = children(actor)
  const helper = (actorEntries[0]!.props as { object: InstanceType<typeof THREE.Group> }).object
  const gizmo = (actorEntries[1]!.props as { object: InstanceType<typeof THREE.Object3D> }).object
  helper.traverse((object) => assert.equal(object.layers.mask, 2))
  scene.add(helper, gizmo)
  scene.updateMatrixWorld(true)
  const control = transforms.at(-1)!
  control.axis = 'X'
  scene.updateMatrixWorld(true)
  const before = useLighting.getState().project
  control.pointerDown({ x: 0, y: 0, button: 0 })
  assert.equal(viewer.inputDragging, true)
  assert.equal(controls.enabled, false)
  control.pointerMove({ x: 0.1, y: 0, button: -1 })
  assert(useLighting.getState().draft)
  assert.equal(useLighting.getState().project, before)
  assert.deepEqual(useLighting.getState().draft!.target, initial.lights[0]!.target)
  for (const frame of frames) frame()
  control.pointerUp({ x: 0.1, y: 0, button: 0 })
  assert.equal(
    viewer.inputDragging,
    true,
    'pointerup selection remains suppressed until event dispatch ends',
  )
  const trailingClick = new Event('click', { cancelable: true })
  window.dispatchEvent(trailingClick)
  assert.equal(trailingClick.defaultPrevented, true)
  await Promise.resolve()
  // A trusted event can checkpoint microtasks before R3F's separate native listener.
  nodeEvents.onPointerUp(nodePointerUp)
  assert.equal(nodeClickCount, 0, 'the real useNodeEvents hook cannot emit a trailing node click')
  viewer.selection.selectedIds = [level.id]
  viewer.previewSelectedIds = [level.id]
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(viewer.selection.selectedIds, [])
  assert.deepEqual(viewer.previewSelectedIds, [])
  nodeEvents.onPointerUp(nodePointerUp)
  assert.equal(nodeClickCount, 1, 'ordinary later node selection is restored')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(viewer.selection.selectedIds, [level.id])
  core.emitter.off('node:click', onNodeClick)
  assert.equal(useLighting.getState().past.length, 1)
  assert.equal(viewer.inputDragging, false)
  assert.equal(controls.enabled, true)
  assert.equal(realScene.getState().nodes, nodes)
  useLighting.getState().undo()
  assert.deepEqual(useLighting.getState().project, before)
  control.axis = 'X'
  scene.updateMatrixWorld(true)
  control.pointerDown({ x: 0, y: 0, button: 0 })
  control.pointerMove({ x: 0.2, y: 0, button: -1 })
  const escapeEvent = new Event('keydown')
  Object.defineProperty(escapeEvent, 'key', { value: 'Escape' })
  window.dispatchEvent(escapeEvent)
  assert.equal(useLighting.getState().draft, null)
  assert.equal(useLighting.getState().past.length, 0)
  assert.equal(controls.enabled, true)
  dispose()
  reset()
  useLighting.getState().setProject({
    version: 1,
    lights: [createStageLight('first', 0), createStageLight('second', 1)],
  })
  const multiple = children(LightingSystem({ enabled: true, sceneId: 'scene-a' }))
  render(multiple[5]!)
  runEffects()
  assert.equal(
    transforms.at(-1)!.domElement,
    null,
    'an unselected light never connects native pointer listeners',
  )
  dispose()
  reset()
  useLighting.getState().setEditTarget('target')
  const targetActor = render(children(LightingSystem({ enabled: true, sceneId: 'scene-a' }))[4]!)
  runEffects()
  for (const element of children(targetActor))
    scene.add((element.props as { object: InstanceType<typeof THREE.Object3D> }).object)
  const targetControl = transforms.at(-1)!
  targetControl.axis = 'X'
  scene.updateMatrixWorld(true)
  targetControl.pointerDown({ x: 0, y: 0, button: 0 })
  targetControl.pointerMove({ x: 0.1, y: 0, button: -1 })
  assert(useLighting.getState().draft)
  assert.deepEqual(useLighting.getState().draft!.position, initial.lights[0]!.position)
  targetControl.pointerUp({ x: 0.1, y: 0, button: 0 })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(useLighting.getState().past.length, 1)
  assert.notDeepEqual(useLighting.getState().project.lights[0]!.target, initial.lights[0]!.target)
  dispose()
  for (const busy of ['playing', 'recording', 'previewing'] as const) {
    reset()
    useCameraStudio.setState({ [busy]: true })
    assert.equal(
      children(LightingSystem({ enabled: true, sceneId: 'scene-a' })).length,
      4,
      'only real lights remain during capture',
    )
  }
  reset()
  assert.equal(children(LightingSystem({ enabled: false, sceneId: 'scene-a' })).length, 4)
  assert.equal(children(LightingSystem({ enabled: true, sceneId: 'other-scene' })).length, 4)
  const wrongScene = render(children(LightingSystem({ enabled: true, sceneId: 'other-scene' }))[0]!)
  runEffects()
  assert.equal(
    (children(wrongScene)[0]!.props as { object: InstanceType<typeof THREE.SpotLight> }).object
      .intensity,
    0,
  )
  dispose()
  editor.viewMode = '2d'
  const captured = new Set<number>()
  const svg = {
    ownerSVGElement: {
      createSVGPoint: () => ({
        x: 0,
        y: 0,
        matrixTransform() {
          return { x: this.x / 10, y: this.y / 10 }
        },
      }),
    },
    getScreenCTM: () => ({ inverse: () => ({}) }),
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  }
  type PlanElement = {
    props: {
      children: PlanElement[]
      ref: { current: unknown }
      onPointerDown: (event: ReturnType<typeof pointer>) => void
      onPointerMove: (event: ReturnType<typeof pointer>) => void
      onPointerUp: (event: ReturnType<typeof pointer>) => void
      onPointerCancel: () => void
    }
  }
  const pointer = (clientX: number, clientY: number) => ({
    clientX,
    clientY,
    pointerId: 1,
    button: 0,
    preventDefault() {},
    stopPropagation() {},
  })
  for (const field of ['position', 'target'] as const) {
    reset()
    useLighting.getState().setEditTarget(field)
    const tree = LightingFloorplan({ enabled: true, sceneId: 'scene-a' }) as unknown as PlanElement
    tree.props.ref.current = svg
    runEffects()
    const actor = tree.props.children[0]!.props.children[3]!
    const before = useLighting.getState().project
    actor.props.onPointerDown(pointer(0, 0))
    tree.props.onPointerMove(pointer(10, 20))
    const draft = useLighting.getState().draft!
    assert(draft)
    assert.equal(useLighting.getState().project, before)
    const unchangedField = field === 'position' ? 'target' : 'position'
    assert.deepEqual(draft[unchangedField], before.lights[0]![unchangedField])
    const { cameraFloorplanMatrix } = await import('../camera-studio/camera-stage-floorplan')
    const expected = moveLightInPlan(
      before.lights[0]!,
      cameraFloorplanMatrix(nodes, level.id)!,
      [0, 0],
      [1, 2],
      field,
    )
    assert.deepEqual(draft[field], expected[field])
    tree.props.onPointerUp(pointer(10, 20))
    assert.equal(useLighting.getState().past.length, 1)
    assert.equal(captured.size, 0)
    assert.equal(realScene.getState().nodes, nodes)
    useLighting.getState().undo()
    assert.deepEqual(useLighting.getState().project, before)
    dispose()
  }
  reset()
  const tree = LightingFloorplan({ enabled: true, sceneId: 'scene-a' }) as unknown as PlanElement
  tree.props.ref.current = svg
  runEffects()
  tree.props.children[0]!.props.children[3]!.props.onPointerDown(pointer(0, 0))
  tree.props.onPointerMove(pointer(10, 20))
  tree.props.onPointerCancel()
  assert.equal(useLighting.getState().draft, null)
  assert.equal(useLighting.getState().past.length, 0)
  assert.equal(interaction.scope.kind, 'idle')
  assert.equal(captured.size, 0)
  dispose()
  editor.viewMode = '3d'
  useCameraStudio.getState().setProject({
    version: 1,
    shots: [
      {
        id: 'shot-a',
        name: '监看',
        duration: 2,
        follow: null,
        motion: null,
        keyframes: [{ id: 'key-a', time: 0, position: [2, 3, 4], lookAt: [0, 0, 0], fov: 50 }],
      },
    ],
  })
  interaction.scope = { kind: 'handle-drag', handle: 'lighting', nodeId: 'light:scene-a:light-a' }
  const { CameraStageSystem } = await import('../camera-studio/camera-stage-system')
  const monitorOnly = children(CameraStageSystem({ enabled: true })!)
  assert.equal(monitorOnly.length, 1, 'lighting drag keeps the monitor and hides camera actors')
  assert.equal((monitorOnly[0]!.type as { name: string }).name, 'MonitorRenderer')
  runEffects()
  dispose()
}
