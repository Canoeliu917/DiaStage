import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.CAMERA_STUDIO_DOCK_TEST) {
  test('dock cancels pending recordings, starts duplicates once and expands requested panels', () => {
    // Isolate component hook mocks from the real recording effects in other suites.
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, CAMERA_STUDIO_DOCK_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { useCameraStudio: store } = await import('./store')
  const effects: Array<() => undefined | (() => void)> = []
  const raf: Array<FrameRequestCallback> = []
  let starts = 0
  let collapsed = true
  const editor = {
    isPreviewMode: false,
    activeSidebarPanel: 'camera-studio',
    workspaceMode: 'edit',
    setPreviewMode: (value: boolean) => {
      editor.isPreviewMode = value
    },
    setActiveSidebarPanel: (value: string) => {
      editor.activeSidebarPanel = value
    },
  }
  mock.module('@pascal-app/editor', () => ({
    useEditor: Object.assign((select: (state: typeof editor) => unknown) => select(editor), {
      getState: () => editor,
    }),
    useSidebarStore: {
      getState: () => ({
        setIsCollapsed: (value: boolean) => {
          collapsed = value
        },
      }),
    },
  }))
  mock.module('@pascal-app/viewer', () => ({ useViewer: {} }))
  mock.module('./store', () => ({ useCameraStudio: Object.assign(() => store.getState(), store) }))
  mock.module('./panel', () => ({ downloadFile: () => {} }))
  mock.module('./recording', () => ({
    startCanvasRecording: () => {
      starts += 1
      return {
        cancel: () => {},
        stop: async () => ({ blob: new Blob(['video']), extension: 'webm' }),
      }
    },
  }))
  mock.module('react', () => ({
    ...React,
    useCallback: <T>(value: T) => value,
    useRef: <T>(value: T) => ({ current: value }),
    useState: <T>(value: T) => [value, () => {}],
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
  }))
  const project = {
    version: 1 as const,
    shots: [
      {
        id: 'test',
        name: 'Test',
        duration: 8,
        keyframes: [{ id: 'key', time: 0, position: [4, 3, 6], lookAt: [0, 1, 0], fov: 50 }],
        follow: null,
        motion: null,
      },
    ],
  }
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      raf.push(callback)
      return raf.length
    },
    localStorage: { getItem: () => JSON.stringify(project), setItem: () => {} },
  })
  const { CameraStudioDock } = await import('./dock')
  type Element = { props?: Record<string, unknown> }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    return [element, ...elements(element.props?.children)]
  }
  for (const action of ['stop', 'canvas', 'shot', 'project', 'unmount', 'duplicate']) {
    effects.length = 0
    raf.length = 0
    starts = 0
    store.getState().setProject(project as never)
    store
      .getState()
      .setRuntime({ canvas: {} as HTMLCanvasElement, runtimeReady: true, capture: null })
    const nodes = elements(CameraStudioDock({ sceneId: 'test-scene' }))
    const cleanup = effects.map((effect) => effect())
    const record = nodes.find((node) => String(node.props?.className).startsWith('cs-record '))
      ?.props?.onClick as () => void
    const stop = nodes.find((node) => node.props?.['aria-label'] === '停止并还原')?.props
      ?.onClick as () => void
    assert.equal(typeof record, 'function')
    record()
    assert.equal(starts, 0, 'the encoder waits for the source frame')
    assert.equal(
      store.getState().recording,
      true,
      'preparing a recording locks stage editing and monitoring',
    )
    if (action === 'stop') stop()
    if (action === 'canvas') store.setState({ canvas: {} as HTMLCanvasElement })
    if (action === 'shot') store.setState({ selectedShotId: 'another-shot' })
    if (action === 'project') store.getState().setProject(project as never)
    if (action === 'unmount') for (const dispose of cleanup.reverse()) dispose?.()
    if (action === 'duplicate') record()
    while (raf.length) raf.shift()?.(0)
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(
      starts,
      action === 'duplicate' ? 1 : 0,
      `${action} must invalidate the pending recording`,
    )
    assert.equal(
      store.getState().recording,
      action === 'duplicate',
      'cancelled starts release the rendering lock',
    )
    if (action === 'stop') assert.equal(store.getState().playing, false)
    if (action !== 'unmount') for (const dispose of cleanup.reverse()) dispose?.()
  }

  for (const workspace of ['edit', 'studio']) {
    collapsed = true
    editor.workspaceMode = workspace
    editor.activeSidebarPanel = 'build'
    editor.isPreviewMode = true
    const nodes = elements(CameraStudioDock({ sceneId: 'test-scene' }))
    const openPanel = nodes.find((node) =>
      workspace === 'studio'
        ? node.props?.children === '返回工作区'
        : node.props?.title === '打开机位面板',
    )?.props?.onClick as () => void
    assert.equal(typeof openPanel, 'function')
    openPanel()
    assert.equal(editor.isPreviewMode, false)
    assert.equal(editor.workspaceMode, workspace, 'opening a panel preserves the workspace')
    assert.equal(
      editor.activeSidebarPanel,
      workspace === 'studio' ? 'camera-rehearsal' : 'camera-studio',
    )
    assert.equal(collapsed, false, `${workspace} panel opens from a collapsed sidebar`)
  }

  editor.workspaceMode = 'studio'
  editor.activeSidebarPanel = 'camera-studio'
  const cameraDock = elements(CameraStudioDock({ sceneId: 'test-scene' }))
  assert.ok(
    cameraDock.some((node) => String(node.props?.className).startsWith('cs-record ')),
    'the camera panel keeps its own recording controls when studio mode is active',
  )
}
