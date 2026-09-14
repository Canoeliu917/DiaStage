import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.TOUCH_GIZMO_TEST) {
  test('touch/pen/mouse XYZ gestures arbitrate once, exclude camera, cancel and commit one history step', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, TOUCH_GIZMO_TEST: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const core = await import('@pascal-app/core')
  const { Group, PerspectiveCamera, Raycaster, Vector3 } = await import('three')
  const effects: Array<() => undefined | (() => void)> = []
  const cleanups: Array<() => void> = []
  const frames: Array<() => void> = []
  let stateIndex = 0
  const hooks = {
    ...React,
    useMemo: <T,>(fn: () => T) => fn(),
    useCallback: <T,>(fn: T) => fn,
    useRef: <T,>(current: T) => ({ current }),
    useState: <T,>(initial: T) => [stateIndex++ === 0 ? true : initial, () => {}],
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
    useLayoutEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
    useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
    useDebugValue() {},
  }
  mock.module('react', () => ({ ...hooks, default: hooks }))
  const runEffects = () => {
    for (const effect of effects.splice(0)) {
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    }
  }
  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(5, 4, 7)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  let freezes = 0
  const controls = {
    enabled: true,
    getPosition: (out: InstanceType<typeof Vector3>, end: boolean) => {
      assert.equal(end, false)
      return out.copy(camera.position)
    },
    getTarget: (out: InstanceType<typeof Vector3>, end: boolean) => {
      assert.equal(end, false)
      return out.set(0, 0, 0)
    },
    setLookAt: (...args: unknown[]) => {
      assert.deepEqual(args, [...camera.position.toArray(), 0, 0, 0, false])
      freezes++
    },
  }
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) }
  Object.assign(globalThis, {
    window: new EventTarget(),
    document: { body: { style: {} } },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  })
  const wrap = <T,>(state: T) =>
    Object.assign((fn: (s: T) => unknown) => fn(state), { getState: () => state })
  const viewer = {
    selection: { selectedIds: ['item_touch_test'] },
    inputDragging: false,
    setInputDragging(value: boolean) {
      viewer.inputDragging = value
    },
  }
  mock.module('@pascal-app/viewer', () => ({ useViewer: wrap(viewer), markPerfAction() {} }))
  mock.module('@react-three/fiber', () => ({
    useFrame: (fn: () => void) => frames.push(fn),
    useThree: () => ({
      camera,
      raycaster: new Raycaster(),
      gl: { domElement: canvas },
      controls,
      size: { width: 800, height: 800 },
      invalidate() {},
    }),
  }))
  mock.module('@react-three/drei', () => ({ Html: () => null }))
  const realScene = core.useScene
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (fn: (s: ReturnType<typeof realScene.getState>) => unknown) => fn(realScene.getState()),
      realScene,
    ),
  }))
  mock.module('../../../../packages/editor/src/lib/sfx-bus', () => ({ sfxEmitter: { emit() {} } }))
  const { useHandleDrag } = await import(
    '../../../../packages/editor/src/components/editor/handles/use-handle-drag'
  )
  const scope = {
    scope: { kind: 'idle' } as { kind: string; nodeId?: string; handle?: string },
    begin(next: typeof scope.scope) {
      scope.scope = next
    },
    endIf(match: (s: typeof scope.scope) => boolean) {
      if (match(scope.scope)) scope.scope = { kind: 'idle' }
    },
  }
  mock.module('@pascal-app/editor', () => ({
    useHandleDrag,
    useInteractionScope: wrap(scope),
    useEditor: wrap({ gridSnapStep: 0.1 }),
    isGridSnapActive: () => false,
    isMagneticSnapActive: () => false,
    ELEVATION_ALIGNMENT_THRESHOLD_M: 0.1,
  }))
  mock.module('@/lib/stage/context', () => ({
    currentStageContext: () => ({ objects: [] }),
    stageContextObject: () => null,
    stageFrame: () => null,
  }))
  const { nearestRotationRing } = await import('../../lib/stage/rotation-ring-hit')
  const { StageTransformGizmo } = await import('./transform-gizmo')
  const { useStageTransform } = await import('./transform-mode')
  useStageTransform.setState({ mode: 'rotate' })
  const node = core.ItemNode.parse({
    id: 'item_touch_test',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    asset: {
      id: 'SCN-CHAIR-045',
      name: 'QA chair',
      src: '/qa.glb',
      category: 'scenery',
      thumbnail: '/qa.png',
      dimensions: [0.5, 1, 0.5],
    },
  })
  realScene.setState({ nodes: { [node.id]: node }, rootNodeIds: [node.id], readOnly: false })
  const object = new Group()
  core.sceneRegistry.nodes.set(node.id, object)
  const root = StageTransformGizmo({ enabled: true })!
  const children = React.Children.toArray(root.props.children) as React.ReactElement<any>[]
  const buttons = children[0]!.props.children.props.children as React.ReactElement<any>[]
  assert.deepEqual(
    buttons.map((button) => button.props['data-rotation-axis']),
    ['X', 'Y', 'Z'],
  )
  const elements = children.filter((element) => element.props.axis !== undefined)
  const axes = elements.map((element) => (element.type as Function)(element.props))
  runEffects()
  for (const frame of frames) frame()
  const input = elements[0]!.props.input
  const project = (axis: number, angle: number) => {
    const group = input.handles.get(axis).group
    group.updateMatrixWorld()
    const point = new Vector3(Math.cos(angle), Math.sin(angle), 0)
      .applyMatrix4(group.matrixWorld)
      .project(camera)
    return { x: (point.x + 1) * 400, y: (1 - point.y) * 400 }
  }
  const pointer = (
    type: string,
    pointerType: string,
    point: { x: number; y: number },
    id = 1,
    shiftKey = false,
  ) => {
    const event = new Event(type, { cancelable: true })
    Object.assign(event, {
      pointerType,
      pointerId: id,
      clientX: point.x,
      clientY: point.y,
      button: 0,
      shiftKey,
      altKey: false,
    })
    Object.defineProperty(event, 'target', { value: canvas })
    return event
  }
  let commits = 0
  const stopCommits = core.subscribeSceneCommits((commit) => {
    if (commit.origin === 'local') commits++
  })
  const originalCamera = camera.matrixWorld.clone()
  for (const type of ['touch', 'pen', 'mouse']) {
    window.dispatchEvent(pointer('pointerover', type, { x: 0, y: 0 }))
    assert.equal(input.pointerType, type)
    const expectedScale =
      (2 *
        Math.tan((50 * Math.PI) / 360) *
        camera.position.distanceTo(input.handles.get(0).group.position) *
        100) /
      800
    assert(Math.abs(input.handles.get(0).group.scale.x - expectedScale) < 1e-9)
    assert.equal(input.handles.get(0).group.visible, type === 'mouse')
    for (const axis of [0, 1, 2])
      for (let attempt = 0; attempt < 3; attempt++) {
        realScene.setState({ nodes: { [node.id]: node } })
        core.clearSceneHistory()
        commits = 0
        const angle = [0.4, 0.8, 1.2, 1.7, 2.1].find(
          (angle) =>
            nearestRotationRing(
              project(axis, angle),
              input.handles,
              camera,
              canvas.getBoundingClientRect(),
              8,
            ) === axis,
        )!
        assert.notEqual(angle, undefined)
        const start = project(axis, angle),
          end = type === 'mouse' ? project(axis, angle + 0.5) : { x: start.x + 65, y: start.y }
        const down = pointer('pointerdown', type, start)
        const previousFreezes = freezes
        if (type === 'mouse') {
          const children = React.Children.toArray(
            axes[axis].props.children,
          ) as React.ReactElement<any>[]
          children[0]!.props.onPointerDown({
            ...Object.fromEntries(
              ['button', 'clientX', 'clientY', 'pointerId'].map((key) => [key, (down as any)[key]]),
            ),
            nativeEvent: down,
            stopPropagation() {},
          })
        } else
          buttons[axis]!.props.onPointerDown({
            ...Object.fromEntries(
              ['button', 'clientX', 'clientY', 'pointerId', 'pointerType'].map((key) => [
                key,
                (down as any)[key],
              ]),
            ),
            nativeEvent: down,
            preventDefault() {},
            stopPropagation() {},
          })
        assert.equal(input.axis, axis)
        assert.equal(freezes - previousFreezes, type === 'mouse' ? 0 : 1)
        assert.equal(controls.enabled, false)
        assert.equal(viewer.inputDragging, true)
        assert.equal(commits, 0)
        if (type !== 'mouse') {
          window.dispatchEvent(pointer('pointerdown', type, project((axis + 1) % 3, 0.8), 2))
          assert.equal(input.axis, axis, 'another ring cannot take the active gesture')
        }
        window.dispatchEvent(pointer('pointermove', type, end, 2))
        window.dispatchEvent(pointer('pointerup', type, end, 2))
        assert.equal(input.axis, axis, 'another pointer cannot finish or steal the axis')
        assert.equal(core.useLiveNodeOverrides.getState().get(node.id), undefined)
        window.dispatchEvent(pointer('pointermove', type, end))
        const preview = core.useLiveNodeOverrides.getState().get(node.id)!.rotation as number[]
        assert.notEqual(preview[axis], 0)
        assert(preview.every((value, i) => i === axis || value === 0))
        assert.equal(realScene.getState().nodes[node.id], node)
        assert.equal(commits, 0)
        assert(camera.matrixWorld.equals(originalCamera))
        window.dispatchEvent(pointer('pointerup', type, end))
        assert.equal(commits, 1)
        assert.equal(realScene.temporal.getState().pastStates.length, 1)
        const committed = realScene.getState().nodes[node.id]
        realScene.temporal.getState().undo()
        assert.deepEqual(realScene.getState().nodes[node.id], node)
        realScene.temporal.getState().redo()
        assert.deepEqual(realScene.getState().nodes[node.id], committed)
        assert.equal(input.axis, null)
        assert.equal(controls.enabled, true)
      }
  }
  for (const cancel of ['pointercancel', 'Escape']) {
    realScene.setState({ nodes: { [node.id]: node } })
    core.clearSceneHistory()
    commits = 0
    window.dispatchEvent(pointer('pointerover', 'touch', { x: 0, y: 0 }))
    const start = project(0, 0.4),
      end = { x: start.x + 65, y: start.y }
    const down = pointer('pointerdown', 'touch', start)
    buttons[0]!.props.onPointerDown({
      button: 0,
      clientX: start.x,
      clientY: start.y,
      pointerId: 1,
      pointerType: 'touch',
      nativeEvent: down,
      preventDefault() {},
      stopPropagation() {},
    })
    window.dispatchEvent(pointer('pointermove', 'touch', end))
    if (cancel === 'Escape') {
      const event = new Event('keydown', { cancelable: true })
      Object.assign(event, { key: 'Escape' })
      window.dispatchEvent(event)
    } else window.dispatchEvent(pointer(cancel, 'touch', end))
    assert.equal(commits, 0)
    assert.equal(realScene.temporal.getState().pastStates.length, 0)
    assert.equal(core.useLiveNodeOverrides.getState().get(node.id), undefined)
    assert.equal(input.axis, null)
    assert.equal(controls.enabled, true)
  }
  stopCommits()
  for (const cleanup of cleanups.reverse()) cleanup()
  core.sceneRegistry.nodes.delete(node.id)
  console.log(
    'PASS: 9 touch + 9 pen + 9 mouse XYZ drags; pointer ownership, camera exclusion, cancel, commit, undo/redo',
  )
}
