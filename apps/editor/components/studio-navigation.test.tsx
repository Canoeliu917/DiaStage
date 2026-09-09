import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.STUDIO_NAVIGATION_TEST) {
  test('workspace navigation stops recording, selects and expands panels, and exits exclusive modes', () => {
    // Keep component hook mocks out of the other recording and runtime suites.
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, STUDIO_NAVIGATION_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { useCameraStudio: store } = await import('./camera-studio/store')
  const effects: Array<() => undefined | (() => void)> = []
  const frames: FrameRequestCallback[] = []
  const calls: string[] = []
  let recordingsFinished = 0
  let collapsed = true
  let navigationGroup = 'space'
  let isMobile = false
  const editor = {
    workspaceMode: 'edit',
    mode: 'build',
    activeSidebarPanel: 'camera-studio',
    isPreviewMode: false,
    isFirstPersonMode: false,
    isCaptureMode: false,
    setPhase: () => {},
    setStructureLayer: () => {},
    setMode: (value: string) => {
      calls.push(`mode:${value}`)
      editor.mode = value
    },
    setWorkspaceMode: (value: string) => {
      calls.push('workspace')
      editor.workspaceMode = value
    },
    setActiveSidebarPanel: (value: string) => {
      editor.activeSidebarPanel = value
    },
    setPreviewMode: (value: boolean) => {
      editor.isPreviewMode = value
    },
    setFirstPersonMode: (value: boolean) => {
      editor.isFirstPersonMode = value
    },
    setCaptureMode: (value: boolean) => {
      editor.isCaptureMode = value
    },
  }
  mock.module('@pascal-app/editor', () => ({
    useEditor: Object.assign((select: (state: typeof editor) => unknown) => select(editor), {
      getState: () => editor,
    }),
    ItemsPanel: () => null,
    useIsMobile: () => isMobile,
    useSidebarStore: {
      getState: () => ({
        setIsCollapsed: (value: boolean) => {
          collapsed = value
        },
      }),
    },
  }))
  mock.module('@pascal-app/viewer', () => ({ useViewer: {} }))
  mock.module('./camera-studio/store', () => ({
    useCameraStudio: Object.assign(() => store.getState(), store),
  }))
  mock.module('./camera-studio/panel', () => ({ CameraPanel: () => null, downloadFile: () => {} }))
  mock.module('./build-tab', () => ({ BuildTab: () => null }))
  mock.module('./camera-rehearsal-panel', () => ({ CameraRehearsalPanel: () => null }))
  mock.module('./remount-panel', () => ({ RemountPanel: () => null }))
  const StageOverviewPanel = () => null
  mock.module('./stage-overview-panel', () => ({ StageOverviewPanel }))
  mock.module('./viewer-toolbar', () => ({ StudioPicturePanel: () => null }))
  mock.module('./camera-studio/recording', () => ({
    startCanvasRecording: () => ({
      cancel: () => {},
      stop: async () => {
        recordingsFinished += 1
        return { blob: new Blob(['video']), extension: 'webm' }
      },
    }),
  }))
  mock.module('react', () => ({
    ...React,
    useCallback: <T,>(value: T) => value,
    useRef: <T,>(value: T) => ({ current: value }),
    useState: <T,>(value: T) =>
      value === 'space'
        ? [
            navigationGroup,
            (next: string) => {
              navigationGroup = next
            },
          ]
        : [value, () => {}],
    useMemo: <T,>(factory: () => T) => factory(),
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
  }))
  const project = {
    version: 1 as const,
    shots: [
      {
        id: 'shot',
        name: '导航测试',
        duration: 8,
        follow: null,
        motion: null,
        keyframes: [{ id: 'key', time: 0, position: [4, 3, 6], lookAt: [0, 1, 0], fov: 50 }],
      },
    ],
  }
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    localStorage: { getItem: () => JSON.stringify(project), setItem: () => {} },
  })
  const { CameraStudioDock } = await import('./camera-studio/dock')
  const { StudioNavigation, openStudioPanel } = await import('./studio-navigation')
  const { useStudioSidebar: renderSidebar } = await import('./studio-sidebar')
  type Element = { type?: unknown; props?: Record<string, unknown> }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    return [element, ...elements(element.props?.children)]
  }
  function renderNavigation() {
    return elements(
      StudioNavigation({ sceneName: '导航测试', ...renderSidebar('navigation-test') }),
    ).filter((node) => node.type === 'button')
  }
  function button(label: string) {
    const found = renderNavigation().find((node) => [node.props?.children].flat().includes(label))
    assert.ok(found, `missing button: ${label}`)
    return found.props as { disabled?: boolean; 'aria-pressed'?: boolean; onClick: () => void }
  }
  store.getState().setProject(project as never)
  const dock = elements(CameraStudioDock({ sceneId: 'navigation-test' }))
  const cleanup = effects.map((effect) => effect())
  store
    .getState()
    .setRuntime({ canvas: {} as HTMLCanvasElement, runtimeReady: true, capture: null })
  const record = dock.find((node) => String(node.props?.className).startsWith('cs-record '))?.props
    ?.onClick as () => void
  assert.equal(typeof record, 'function')
  record()
  while (frames.length) frames.shift()?.(0)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(store.getState().playing, true, 'the old dock recording is active')
  const unsubscribe = store.subscribe((next, previous) => {
    if (previous.playing && !next.playing) calls.push('stop')
  })

  for (const [label, group, panel] of [
    ['搭台', 'space', 'build'],
    ['看台', 'director', 'camera-studio'],
    ['复台', 'remount', 'remount'],
  ]) {
    collapsed = true
    editor.isPreviewMode = true
    editor.mode = 'build'
    store.setState({ playing: true, previewing: true, time: 3 })
    calls.length = 0
    assert.equal(button(label).disabled, false)
    button(label).onClick()
    assert.equal(editor.workspaceMode, 'edit')
    assert.equal(editor.activeSidebarPanel, panel)
    assert.equal(renderSidebar('navigation-test').group, group)
    assert.equal(editor.isPreviewMode, false)
    assert.equal(collapsed, false)
    assert.equal(store.getState().playing, false)
    assert.equal(store.getState().previewing, false)
    assert.equal(store.getState().time, 0)
    assert.equal(editor.mode, group === 'space' ? 'build' : 'select')
    assert.deepEqual(
      calls,
      group === 'space' ? ['stop', 'workspace'] : ['stop', 'mode:select', 'workspace'],
      'stop and disarm precede the workspace change',
    )
    assert.equal(button(label)['aria-pressed'], true)
    assert.equal(renderNavigation().filter((node) => node.props?.['aria-pressed']).length, 1)
    await Promise.resolve()
  }
  assert.equal(renderNavigation().length, 3, 'three peer workspace options')
  for (const [label, expected, group] of [
    ['搭台', ['build', 'items', 'settings'], 'space'],
    ['看台', ['picture', 'camera-studio', 'camera-rehearsal', 'settings'], 'director'],
    ['复台', ['remount', 'settings'], 'remount'],
  ] as const) {
    button(label).onClick()
    assert.deepEqual(
      renderSidebar('navigation-test').sidebarTabs.map((tab) => tab.id),
      expected,
    )
    for (const panel of expected) {
      store.setState({ playing: true, previewing: true, time: 2 })
      editor.mode = 'build'
      collapsed = true
      const tab = renderSidebar('navigation-test').sidebarTabs.find((entry) => entry.id === panel)
      assert.ok(tab?.onSelect)
      assert.equal(tab.onSelect(), true)
      assert.equal(editor.activeSidebarPanel, panel)
      assert.equal(editor.workspaceMode, panel === 'camera-rehearsal' ? 'studio' : 'edit')
      assert.equal(
        editor.mode,
        ['stage-overview', 'camera-studio', 'camera-rehearsal', 'picture', 'remount'].includes(
          panel,
        )
          ? 'select'
          : 'build',
        'director panels disarm the modeling tool even when workspace remains edit',
      )
      assert.equal(
        renderSidebar('navigation-test').group,
        group,
        'shared scene/settings retain their group',
      )
      assert.equal(collapsed, false)
      assert.equal(store.getState().playing, false)
    }
  }
  isMobile = true
  for (const label of ['搭台', '看台', '复台']) {
    button(label).onClick()
    const tab = renderSidebar('navigation-test').sidebarTabs.find(
      (entry) => entry.id === 'stage-overview',
    )
    assert.ok(tab, 'mobile retains the existing overview entry')
    const content = (tab.component as () => unknown)() as Element
    assert.equal(content.type, StageOverviewPanel)
    assert.equal(content.props?.sceneId, 'navigation-test')
  }
  isMobile = false
  assert.equal(recordingsFinished, 1, 'navigation finishes the active dock recording once')

  for (const mode of ['isFirstPersonMode', 'isCaptureMode'] as const) {
    editor[mode] = true
    const previousWorkspace = editor.workspaceMode
    const previousPanel = editor.activeSidebarPanel
    const previousMode = editor.mode
    assert.equal(openStudioPanel('camera-rehearsal'), false)
    assert.equal(editor.activeSidebarPanel, previousPanel)
    assert.equal(editor.workspaceMode, previousWorkspace)
    assert.equal(editor.mode, previousMode)
    for (const label of ['搭台', '看台', '复台']) assert.equal(button(label).disabled, true)
    assert.equal(button('退出取景').disabled, undefined)
    button('退出取景').onClick()
    assert.equal(editor.isFirstPersonMode, false)
    assert.equal(editor.isCaptureMode, false)
    assert.equal(editor.workspaceMode, previousWorkspace)
    for (const label of ['搭台', '看台', '复台']) assert.equal(button(label).disabled, false)
    assert.equal(
      renderNavigation().some((node) => node.props?.children === '退出取景'),
      false,
    )
  }
  unsubscribe()
  for (const dispose of cleanup.reverse()) dispose?.()
}
