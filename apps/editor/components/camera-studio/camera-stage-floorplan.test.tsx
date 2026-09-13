import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.CAMERA_FLOORPLAN_TEST) {
  test('floorplan camera gestures share world coordinates, preview and one-step history without crossing owners', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, CAMERA_FLOORPLAN_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  mock.module('@/lib/beta-capabilities', () => ({ BETA_EXPERT_MEDIA_ENABLED: true }))
  const React = await import('react')
  const core = await import('@pascal-app/core')
  const { Vector3 } = await import('three')
  const { useCameraStudio: store } = await import('./store')
  const effects: Array<() => undefined | (() => void)> = []
  const keyListeners = new Set<(event: unknown) => void>()
  const editor = {
    workspaceMode: 'edit',
    mode: 'select',
    viewMode: '2d',
    isPreviewMode: false,
    isCaptureMode: false,
    isFirstPersonMode: false,
  }
  const viewer = {
    selection: { levelId: 'level_upper', selectedIds: [] as string[] },
    setSelection: (patch: object) => Object.assign(viewer.selection, patch),
  }
  const interaction = {
    scope: { kind: 'idle' } as { kind: string; nodeId?: string; handle?: string },
    begin: (scope: typeof interaction.scope) => {
      interaction.scope = scope
    },
    endIf: (match: (scope: typeof interaction.scope) => boolean) => {
      if (match(interaction.scope)) interaction.scope = { kind: 'idle' }
    },
  }
  mock.module('react', () => ({
    ...React,
    useMemo: <T,>(fn: () => T) => fn(),
    useRef: <T,>(value: T) => ({ current: value }),
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
  }))
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (selector: (state: ReturnType<typeof core.useScene.getState>) => unknown) =>
        selector(core.useScene.getState()),
      core.useScene,
    ),
  }))
  mock.module('@pascal-app/editor', () => ({
    useEditor: Object.assign((selector: (state: typeof editor) => unknown) => selector(editor), {
      getState: () => editor,
    }),
    useInteractionScope: Object.assign(
      (selector: (state: typeof interaction) => unknown) => selector(interaction),
      { getState: () => interaction },
    ),
    useFloorplanRender: () => ({
      unitsPerPixel: 0.02,
      sceneRotationDeg: 90,
      palette: {
        selectedStroke: '#fff',
        measurementStroke: '#aaa',
        measurementLabelBackground: '#111',
        measurementLabelText: '#eee',
      },
    }),
  }))
  mock.module('@pascal-app/viewer', () => ({
    useViewer: Object.assign((selector: (state: typeof viewer) => unknown) => selector(viewer), {
      getState: () => viewer,
    }),
  }))
  mock.module('./store', () => ({
    useCameraStudio: Object.assign(
      (selector: (state: ReturnType<typeof store.getState>) => unknown) =>
        selector(store.getState()),
      store,
    ),
  }))
  Object.assign(globalThis, {
    window: {
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        if (type === 'keydown') keyListeners.add(fn)
      },
      removeEventListener: (_: string, fn: (event: unknown) => void) => keyListeners.delete(fn),
    },
  })
  const {
    CameraStageFloorplan,
    cameraFloorplanMatrix,
    cameraPlanPoint,
    cameraPointerToPlan,
    moveCameraInPlan,
  } = await import('./camera-stage-floorplan')
  const building = core.BuildingNode.parse({
    id: 'building_floorplan',
    position: [10, 4, -6],
    rotation: [0, Math.PI / 2, 0],
    children: ['level_ground', 'level_upper'],
  })
  const ground = core.LevelNode.parse({ id: 'level_ground', parentId: building.id, height: 3 })
  const upper = core.LevelNode.parse({
    id: 'level_upper',
    parentId: building.id,
    level: 1,
    baseElevation: 0.5,
  })
  const nodes = { [building.id]: building, [ground.id]: ground, [upper.id]: upper }
  core.useScene.setState({ nodes, rootNodeIds: [building.id], readOnly: false })
  const matrix = cameraFloorplanMatrix(nodes, upper.id)!
  const position = new Vector3(2, 1, 3).applyMatrix4(matrix).toArray()
  const lookAt = new Vector3(2, 0, 0).applyMatrix4(matrix).toArray()
  const near = (actual: number[], expected: number[]) =>
    actual.forEach((value, i) => {
      assert.ok(Math.abs(value - expected[i]!) < 1e-8, `${actual} != ${expected}`)
    })
  near(position, [13, 8.5, -8])
  near(cameraPlanPoint(position, matrix), [2, 1, 3])
  assert.equal(cameraFloorplanMatrix(nodes, 'missing'), null)
  const original = { position, lookAt, fov: 60 }
  const moved = moveCameraInPlan(original, matrix, [2, 3], [5, 4], 'translate')
  near(moved.position, [14, 8.5, -11])
  near(moved.lookAt, [11, 7.5, -11])
  const rotated = moveCameraInPlan(original, matrix, [2, 3], [5, 3], 'rotate')
  near(rotated.position, position)
  near(cameraPlanPoint(rotated.lookAt, matrix), [5, 0, 3])
  assert.equal(rotated.fov, original.fov)
  near([Math.hypot(...rotated.lookAt.map((v, i) => v - position[i]!))], [Math.sqrt(10)])

  type Element = { type: string; props: Record<string, any> }
  const project = {
    version: 1 as const,
    shots: [
      {
        id: 'shot',
        name: '二维机位',
        duration: 4,
        follow: null,
        motion: null,
        keyframes: [
          { id: 'key', time: 0, ...original },
          { id: 'end', time: 4, ...original },
        ],
      },
    ],
  }
  const captures = new Set<number>()
  const svg = {
    ownerSVGElement: {
      createSVGPoint: () => ({
        x: 0,
        y: 0,
        matrixTransform(
          this: { x: number; y: number },
          m: { a: number; b: number; c: number; d: number; e: number; f: number },
        ) {
          return { x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f }
        },
      }),
    },
    getScreenCTM: () => ({ inverse: () => ({ a: 0, b: -0.1, c: 0.1, d: 0, e: -20, f: 10 }) }),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  }
  near(cameraPointerToPlan(svg as unknown as SVGGElement, 70, 250)!, [5, 3])
  const pointer = (clientX: number, clientY: number, pointerId = 1) => ({
    clientX,
    clientY,
    pointerId,
    button: 0,
    preventDefault() {},
    stopPropagation() {},
  })
  function reset() {
    store.getState().setProject(project)
    store.getState().setStageDraft(null)
    store.getState().setStageTransformMode('translate')
    interaction.scope = { kind: 'idle' }
    captures.clear()
  }
  function mount() {
    effects.length = 0
    const tree = CameraStageFloorplan({ enabled: true }) as unknown as Element
    assert.ok(tree)
    tree.props.ref.current = svg
    const cleanups = effects.map((effect) => effect())
    return {
      tree,
      actor: tree.props.children[0] as Element,
      dispose: () =>
        cleanups.reverse().forEach((cleanup) => {
          cleanup?.()
        }),
    }
  }
  reset()
  let view = mount()
  assert.equal(store.getState().floorplanReady, true)
  const before = store.getState().project
  view.actor.props.onPointerDown(pointer(70, 220))
  assert.equal(interaction.scope.kind, 'handle-drag')
  view.tree.props.onPointerMove(pointer(60, 250, 2))
  assert.equal(store.getState().stageDraft, null, 'foreign pointer does not change preview')
  view.tree.props.onPointerMove(pointer(60, 250))
  assert.equal(store.getState().project, before, 'drag has no persistent writes')
  near(store.getState().stageDraft!.pose.position, moved.position)
  view.tree.props.onPointerUp(pointer(60, 250))
  assert.equal(store.getState().cameraUndo.length, 1)
  near(store.getState().project.shots[0]!.keyframes[0]!.position, moved.position)
  near(store.getState().project.shots[0]!.keyframes[1]!.position, original.position)
  assert.equal(core.useScene.getState().nodes, nodes, 'scene node map is unchanged')
  assert.equal(store.getState().stageDraft, null)
  assert.equal(interaction.scope.kind, 'idle')
  assert.equal(captures.size, 0)
  store.getState().undoCameraEdit()
  assert.deepEqual(store.getState().project, before)
  view.dispose()
  assert.equal(store.getState().floorplanReady, false, 'unmount immediately clears readiness')

  reset()
  store.getState().selectKeyframe('end')
  view = mount()
  view.actor.props.onPointerDown(pointer(70, 220))
  view.tree.props.onPointerMove(pointer(60, 250))
  view.tree.props.onPointerUp(pointer(60, 250))
  near(store.getState().project.shots[0]!.keyframes[0]!.position, original.position)
  near(store.getState().project.shots[0]!.keyframes[1]!.position, moved.position)
  assert.equal(store.getState().selectedKeyframeId, 'end')
  assert.equal(store.getState().cameraUndo.length, 1)
  view.dispose()

  for (const cancellation of ['escape', 'pointercancel', 'unmount'] as const) {
    reset()
    view = mount()
    const untouched = store.getState().project
    view.actor.props.onPointerDown(pointer(70, 220))
    view.tree.props.onPointerMove(pointer(60, 250))
    if (cancellation === 'escape')
      for (const listener of keyListeners)
        listener({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} })
    if (cancellation === 'pointercancel') view.tree.props.onPointerCancel()
    view.dispose()
    assert.equal(store.getState().project, untouched, cancellation)
    assert.equal(store.getState().cameraUndo.length, 0)
    assert.equal(store.getState().stageDraft, null)
    assert.equal(interaction.scope.kind, 'idle')
    assert.equal(captures.size, 0)
  }
  reset()
  view = mount()
  const externalDraft = { shotId: 'shot', frameId: 'key', pose: moved }
  interaction.scope = { kind: 'handle-drag', handle: 'camera-stage', nodeId: 'camera:shot:key' }
  store.getState().setStageDraft(externalDraft)
  view.actor.props.onPointerDown(pointer(70, 220))
  view.tree.props.onPointerMove(pointer(60, 250))
  view.dispose()
  assert.equal(
    store.getState().stageDraft,
    externalDraft,
    '2D cannot steal or clear an active 3D gesture',
  )
  assert.equal(interaction.scope.kind, 'handle-drag')

  reset()
  view = mount()
  view.actor.props.onPointerDown(pointer(70, 220))
  view.tree.props.onPointerMove(pointer(60, 250))
  store.getState().updateShot('shot', { name: '外部新修改' })
  view.tree.props.onPointerUp(pointer(60, 250))
  assert.equal(store.getState().project.shots[0]!.name, '外部新修改')
  near(store.getState().project.shots[0]!.keyframes[0]!.position, original.position)
  view.dispose()
  assert.equal(keyListeners.size, 0)
  for (const mode of ['isCaptureMode', 'isFirstPersonMode', 'isPreviewMode'] as const) {
    reset()
    view = mount()
    const unchanged = store.getState().project
    view.actor.props.onPointerDown(pointer(70, 220))
    view.tree.props.onPointerMove(pointer(60, 250))
    editor[mode] = true
    view.tree.props.onPointerUp(pointer(60, 250))
    assert.equal(store.getState().project, unchanged, `${mode} entered before React cleanup`)
    assert.equal(store.getState().cameraUndo.length, 0)
    editor[mode] = false
    view.dispose()
  }
  for (const hidden of ['3d', 'capture', 'playing', 'readOnly'] as const) {
    reset()
    if (hidden === '3d') editor.viewMode = '3d'
    if (hidden === 'capture') editor.isCaptureMode = true
    if (hidden === 'playing') store.setState({ playing: true })
    if (hidden === 'readOnly') core.useScene.setState({ readOnly: true })
    effects.length = 0
    assert.equal(CameraStageFloorplan({ enabled: true }), null)
    const cleanups = effects.map((effect) => effect())
    assert.equal(store.getState().floorplanReady, false, hidden)
    cleanups.reverse().forEach((cleanup) => {
      cleanup?.()
    })
    editor.viewMode = '2d'
    editor.isCaptureMode = false
    core.useScene.setState({ readOnly: false })
  }
}
