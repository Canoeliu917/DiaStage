import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.CAMERA_PANEL_TEST) {
  test('camera panels edit selected frames, bridge them to the director and expose explicit display options', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, CAMERA_PANEL_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const core = await import('@pascal-app/core')
  const editor = await import('@pascal-app/editor')
  const viewer = await import('@pascal-app/viewer')
  const scene = core.useScene
  const viewerStore = viewer.useViewer
  const editorStore = editor.useEditor
  const { useCameraStudio: store } = await import('./store')
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (select: (state: ReturnType<typeof scene.getState>) => unknown) => select(scene.getState()),
      scene,
    ),
  }))
  mock.module('@pascal-app/editor', () => ({
    ...editor,
    useIsMobile: () => false,
    useEditor: Object.assign(
      (select: (state: ReturnType<typeof editorStore.getState>) => unknown) =>
        select(editorStore.getState()),
      editorStore,
    ),
  }))
  mock.module('@pascal-app/viewer', () => ({
    ...viewer,
    useViewer: Object.assign(
      (select: (state: ReturnType<typeof viewerStore.getState>) => unknown) =>
        select ? select(viewerStore.getState()) : viewerStore.getState(),
      viewerStore,
    ),
  }))
  mock.module('./store', () => ({ useCameraStudio: Object.assign(() => store.getState(), store) }))
  mock.module('../theatre/simulation-panel', () => ({ useSimulationSelection: () => true }))
  mock.module('react', () => ({
    ...React,
    useState: <T>(value: T) => [value, () => {}],
    useRef: <T>(value: T) => ({ current: value }),
    useEffect: () => {},
    useCallback: <T>(callback: T) => callback,
    useSyncExternalStore: <T>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot(),
  }))
  const { CameraPanel } = await import('./panel')
  const { CameraRehearsalPanel } = await import('../camera-rehearsal-panel')
  const { CommunityViewerToolbarRight, StudioPicturePanel } = await import('../viewer-toolbar')
  const { getCameraDirectorState } = await import('../../lib/camera-director')
  const { validateCameraProject } = await import('./model')

  type Element = { type?: unknown; props?: Record<string, unknown> }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    return [element, ...elements(element.props?.children)]
  }
  function click(nodes: Element[], label: string) {
    const element = nodes.find(
      (entry) =>
        entry.props?.children === label ||
        entry.props?.label === label ||
        entry.props?.['aria-label'] === label,
    )
    assert.ok(element, `missing action: ${label}`)
    const action = element.props?.onClick
    assert.equal(typeof action, 'function')
    ;(action as () => void)()
  }
  function input(nodes: Element[], label: string) {
    const element = nodes.find((entry) => entry.props?.['aria-label'] === label)
    assert.ok(element, `missing input: ${label}`)
    return element.props as {
      value: unknown
      onChange: (event: { target: { valueAsNumber: number; value: string } }) => void
    }
  }
  const project = validateCameraProject({
    version: 1,
    shots: [
      {
        id: 'panel-shot',
        name: '测试机位',
        duration: 8,
        follow: null,
        motion: null,
        keyframes: [
          { id: 'key-a', time: 0, position: [1, 2, 3], lookAt: [0, 1, 0], fov: 60 },
          { id: 'key-b', time: 4, position: [4, 5, 6], lookAt: [1, 1, 1], fov: 70 },
        ],
      },
    ],
  })
  store.getState().setProject(project)
  store.getState().setRuntime({
    canvas: null,
    runtimeReady: true,
    capture: (time) => ({ id: 'captured', time, position: [8, 3, 6], lookAt: [0, 0, 0], fov: 90 }),
  })
  const runtime = {
    canvas: store.getState().canvas,
    runtimeReady: store.getState().runtimeReady,
    capture: store.getState().capture,
  }
  let focusCalls = 0
  let focusedShotId: string | null = null
  store.getState().setStageReady(true)
  store.getState().setStageFocus(() => {
    focusCalls += 1
    focusedShotId = store.getState().selectedShotId
  })
  let creationPanel = elements(CameraPanel())
  assert.equal(focusCalls, 0, 'opening the panel does not move the observation camera')
  click(creationPanel, '添加机位')
  const createdShot = store.getState().project.shots[1]
  assert.ok(createdShot)
  assert.deepEqual(
    createdShot.keyframes,
    [
      {
        id: 'captured',
        time: 0,
        position: [8, 3, 6],
        lookAt: [0, 0, 0],
        fov: 90,
      },
    ],
    'the new camera uses the actual captured view without preset coordinates',
  )
  assert.equal(focusCalls, 1)
  assert.equal(
    focusedShotId,
    createdShot.id,
    'the observation camera focuses after the new shot is selected',
  )
  assert.deepEqual(store.getState().project.shots[0], project.shots[0])
  creationPanel = elements(CameraPanel())
  assert.equal(focusCalls, 1, 'rerendering does not reposition the observation camera')
  store.getState().setRuntime({ canvas: null, runtimeReady: false, capture: null })
  creationPanel = elements(CameraPanel())
  assert.equal(
    creationPanel.find((entry) => entry.props?.['aria-label'] === '添加机位')?.props?.disabled,
    false,
  )
  click(creationPanel, '添加机位')
  assert.equal(
    store.getState().project.shots.length,
    3,
    'SET can add a default camera without loading the recorder runtime',
  )
  assert.equal(focusCalls, 2)
  store.getState().setProject(project)
  store.getState().setRuntime(runtime)
  store.getState().setStageFocus(null)
  store.getState().setStageReady(false)
  let panel = elements(CameraPanel())
  assert.deepEqual(
    panel.filter((entry) => entry.type === 'h3').map((entry) => entry.props?.children),
    ['摄像机', '运镜', '工程文件'],
  )
  click(panel, '编辑 4.0 秒关键帧')
  assert.equal(store.getState().selectedKeyframeId, 'key-b')
  assert.equal(
    store.getState().previewing,
    false,
    'selecting a frame does not take over the main camera',
  )
  panel = elements(CameraPanel())
  click(panel, '从当前视角设置')
  assert.deepEqual(store.getState().project.shots[0]?.keyframes[0], project.shots[0]?.keyframes[0])
  assert.deepEqual(store.getState().project.shots[0]?.keyframes[1], {
    id: 'key-b',
    time: 4,
    position: [8, 3, 6],
    lookAt: [0, 0, 0],
    fov: 90,
  })
  assert.equal(store.getState().cameraUndo.length, 1)
  panel = elements(CameraPanel())
  const beforeInvalid = store.getState().project
  input(panel, '摄像机视角').onChange({ target: { valueAsNumber: Number.NaN, value: '' } })
  assert.equal(store.getState().project, beforeInvalid)
  click(panel, '撤销机位修改')
  assert.deepEqual(store.getState().project, project)
  store.getState().setRecording(true)
  panel = elements(CameraPanel())
  assert.ok(panel.some((entry) => entry.type === 'fieldset' && entry.props?.disabled === true))
  click(panel, '从当前视角设置')
  assert.deepEqual(
    store.getState().project,
    project,
    'recording prevents camera edits even through a stale callback',
  )
  store.getState().setRecording(false)
  panel = elements(CameraPanel())
  click(panel, '从此机位观察')
  assert.equal(store.getState().previewing, true, 'main-camera takeover remains an explicit action')
  store.getState().stop()

  store.getState().setFloorplanReady(true)
  panel = elements(CameraPanel())
  assert.equal(
    panel.find((entry) => entry.props?.children === '移动摄像机')?.props?.disabled,
    false,
  )
  assert.equal(
    panel.find((entry) => entry.props?.children === '旋转摄像机')?.props?.disabled,
    false,
  )
  click(panel, '旋转摄像机')
  assert.equal(
    store.getState().stageTransformMode,
    'rotate',
    'a ready floorplan can select rotation without a 3D stage',
  )
  assert.equal(
    panel.find((entry) => entry.props?.children === '定位摄像机')?.props?.disabled,
    true,
    'locating a camera still requires the 3D stage',
  )
  store.getState().setFloorplanReady(false)
  store.getState().setStageTransformMode('translate')
  panel = elements(CameraPanel())
  assert.equal(panel.find((entry) => entry.props?.children === '旋转摄像机')?.props?.disabled, true)

  const sceneId = 'camera-panel-bridge-test'
  store.getState().selectKeyframe('key-b')
  let rehearsal = elements(CameraRehearsalPanel({ sceneId }))
  click(rehearsal, '用当前关键帧设置起点 A')
  assert.deepEqual(getCameraDirectorState(sceneId).sequence.start?.position, [4, 5, 6])
  assert.deepEqual(getCameraDirectorState(sceneId).sequence.start?.target, [1, 1, 1])
  assert.equal(getCameraDirectorState(sceneId).sequence.end, null)
  const expectedFocal =
    getCameraDirectorState(sceneId).lens.sensorHeightMm / (2 * Math.tan((70 * Math.PI) / 360))
  assert.ok(
    Math.abs(getCameraDirectorState(sceneId).sequence.start!.focalLengthMm - expectedFocal) < 1e-10,
  )
  store.getState().selectKeyframe('key-a')
  click(rehearsal, '用当前关键帧设置终点 B')
  assert.deepEqual(
    getCameraDirectorState(sceneId).sequence.end?.position,
    [1, 2, 3],
    'the bridge reads the current selection at click time',
  )
  const beforeFollow = getCameraDirectorState(sceneId)
  store.getState().updateShot('panel-shot', {
    follow: { nodeId: 'item_subject', mode: 'offset', offset: [2, 2, 2], lookAtOffset: [0, 1, 0] },
  })
  rehearsal = elements(CameraRehearsalPanel({ sceneId }))
  assert.equal(
    rehearsal.find((entry) => entry.props?.label === '用当前关键帧设置起点 A')?.props?.disabled,
    true,
  )
  click(rehearsal, '用当前关键帧设置起点 A')
  assert.equal(
    getCameraDirectorState(sceneId),
    beforeFollow,
    'follow-dependent poses are not guessed',
  )
  assert.deepEqual(
    rehearsal
      .filter((entry) => entry.props?.className === 'ds-rehearsal-section')
      .map((entry) => entry.props?.title),
    ['01 运动路径', '02 播放预演', '03 运动平滑', '04 镜头参数', '05 记录手动运镜', '06 输出视频'],
  )

  const previousLevelMode = viewerStore.getState().levelMode
  const toolbar = elements(CommunityViewerToolbarRight()).flatMap((entry) =>
    typeof entry.type === 'function' && entry.type.name === 'WallModeToggle'
      ? elements((entry.type as () => unknown)())
      : [entry],
  )
  assert.equal(
    toolbar.some((entry) => entry.props?.['aria-label'] === '楼层显示'),
    false,
  )
  assert.equal(viewerStore.getState().levelMode, previousLevelMode)
  const walls = input(toolbar, '景片显示')
  walls.onChange({ target: { value: 'translucent', valueAsNumber: Number.NaN } })
  assert.equal(viewerStore.getState().wallMode, 'translucent')
  const picture = elements(StudioPicturePanel())
  assert.ok(picture.some((entry) => entry.type === 'h2' && entry.props?.children === '显示'))
  assert.ok(!JSON.stringify(picture).includes('光影'))
  assert.equal(
    picture.some((entry) => entry.props?.['aria-label'] === '楼层显示'),
    false,
  )
}
