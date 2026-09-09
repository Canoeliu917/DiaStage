import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { ReactNode } from 'react'

if (!process.env.SIDEBAR_SPLIT_TEST) {
  test('desktop sidebar keeps its top slot across panel changes and bounds cancellable resizing', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, SIDEBAR_SPLIT_TEST: '1' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  type HookFrame = { values: unknown[]; cursor: number }
  let active: HookFrame = { values: [], cursor: 0 }
  const hooks = new WeakMap<object, HookFrame>()
  // Keep local state and refs across renders while exercising the real JSX event handlers.
  function useFixtureState<T>(initial: T | (() => T)) {
    const frame = active
    const index = frame.cursor++
    if (!(index in frame.values))
      frame.values[index] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [
      frame.values[index] as T,
      (next: T | ((previous: T) => T)) => {
        frame.values[index] =
          typeof next === 'function' ? (next as (previous: T) => T)(frame.values[index] as T) : next
      },
    ] as const
  }
  mock.module('react', () => ({
    ...React,
    useState: useFixtureState,
    useRef: <T,>(initial: T) => useFixtureState({ current: initial })[0],
    useCallback: <T,>(callback: T) => callback,
    useEffect: () => {},
    useLayoutEffect: () => {},
  }))
  let mobile = false
  let activate: (id: string) => void = () => {}
  const editor = {
    isCaptureMode: false,
    activeSidebarPanel: 'build',
    phase: 'structure',
    mode: 'select',
    mobilePanelSheetHeight: 0,
    setActiveSidebarPanel: (id: string) => {
      editor.activeSidebarPanel = id
    },
    setMode: (mode: string) => {
      editor.mode = mode
    },
  }
  const sidebar = {
    width: 320,
    isCollapsed: false,
    isDragging: false,
    setIsCollapsed: (value: boolean) => {
      sidebar.isCollapsed = value
    },
    setWidth: (value: number) => {
      sidebar.width = value
    },
    setIsDragging: (value: boolean) => {
      sidebar.isDragging = value
    },
  }
  const selectorStore = <T extends object>(state: T) =>
    Object.assign(<R,>(selector: (value: T) => R) => selector(state), { getState: () => state })
  mock.module('../../hooks/use-mobile', () => ({ useIsMobile: () => mobile }))
  mock.module('../../store/use-editor', () => ({ default: selectorStore(editor) }))
  mock.module('../ui/primitives/sidebar', () => ({ useSidebarStore: selectorStore(sidebar) }))
  mock.module('@pascal-app/viewer', () => ({
    useViewer: selectorStore({ sceneTheme: 'studio' }),
    getSceneTheme: () => ({ appearance: 'dark' }),
  }))
  mock.module('../ui/sidebar/tab-bar', () => ({
    IconRail: ({
      activeTab,
      onIconClick,
    }: {
      activeTab: string
      onIconClick: (id: string) => void
    }) => {
      activate = onIconClick
      return <nav data-rail="desktop" data-active={activeTab} />
    },
  }))
  mock.module('../ui/sidebar/mobile-tab-bar', () => ({
    MobileTabBar: () => <nav data-rail="mobile" />,
  }))
  mock.module('./bottom-sheet', () => ({
    BottomSheet: ({ children }: { children: ReactNode }) => (
      <section data-sheet>{children}</section>
    ),
  }))
  const { EditorLayoutV2 } = await import('./editor-layout-v2')
  type Element = { type: unknown; props: Record<string, unknown> }
  const bounds = { getBoundingClientRect: () => ({ top: 100, height: 1008 }) }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    if (typeof element.type === 'function') {
      const previous = active
      active = hooks.get(element.type) ?? { values: [], cursor: 0 }
      hooks.set(element.type, active)
      active.cursor = 0
      const result = element.type(element.props)
      active = previous
      return elements(result)
    }
    const ref = element.props.ref
    if (ref && typeof ref === 'object' && 'current' in ref) ref.current = bounds
    return [element, ...elements(element.props.children)]
  }
  let topRenders = 0
  function TopProbe() {
    topRenders++
    return <section data-top="overview" />
  }
  function render(withSlot = true) {
    topRenders = 0
    const tree = elements(
      <EditorLayoutV2
        sidebarTopSlot={withSlot ? <TopProbe /> : undefined}
        sidebarTabs={[
          { id: 'build', label: '建模' },
          { id: 'picture', label: '画面' },
          { id: 'camera-rehearsal', label: '编排' },
        ]}
        renderTabContent={(id) => <section data-panel={id} />}
        viewerContent={<main data-viewer />}
      />,
    )
    return {
      tree,
      separator: () => {
        const found = tree.find((node) => node.props.role === 'separator')
        assert.ok(found, 'desktop split separator is present')
        return found.props
      },
      has: (attribute: string, value?: unknown) =>
        tree.some(
          (node) =>
            attribute in node.props && (value === undefined || node.props[attribute] === value),
        ),
    }
  }
  const captured = new Set<number>()
  const target = {
    focus: () => {},
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  }
  function pointer(action: string, clientY = 500) {
    const handler = render().separator()[action]
    assert.equal(typeof handler, 'function', action)
    ;(handler as (event: object) => void)({
      button: 0,
      pointerId: 1,
      clientY,
      currentTarget: target,
      preventDefault: () => {},
      stopPropagation: () => {},
    })
  }
  function key(keyValue: string) {
    const handler = render().separator().onKeyDown as (event: object) => void
    handler({
      key: keyValue,
      currentTarget: target,
      preventDefault: () => {},
      stopPropagation: () => {},
    })
  }
  function ratio() {
    return render().separator()['aria-valuenow']
  }

  let view = render()
  assert.equal(topRenders, 1)
  assert.ok(view.has('data-top', 'overview'))
  assert.ok(view.has('data-rail', 'desktop'))
  assert.ok(view.has('data-panel', 'build'))
  assert.ok(view.has('data-viewer'))
  assert.equal(view.separator()['aria-orientation'], 'horizontal')
  assert.equal(view.separator()['aria-valuemin'], 30)
  assert.equal(view.separator()['aria-valuemax'], 70)
  assert.equal(ratio(), 50)
  key('ArrowUp')
  assert.equal(ratio(), 45)
  key('ArrowDown')
  assert.equal(ratio(), 50)
  key('Home')
  assert.equal(ratio(), 30)
  key('ArrowUp')
  assert.equal(ratio(), 30)
  key('End')
  assert.equal(ratio(), 70)
  key('ArrowDown')
  assert.equal(ratio(), 70)

  for (const panel of ['picture', 'camera-rehearsal', 'build']) {
    activate(panel)
    view = render()
    assert.equal(topRenders, 1, 'changing the lower panel never duplicates or hides the upper slot')
    assert.ok(view.has('data-panel', panel))
    assert.equal(view.separator()['aria-valuenow'], 70)
  }
  activate('build')
  assert.equal(sidebar.isCollapsed, false, 'the active lower tab cannot hide the upper overview')
  assert.ok(render().has('data-top'))
  pointer('onPointerDown', 500)
  assert.ok(captured.has(1))
  assert.equal(ratio(), 70, 'grabbing the divider does not jump its position')
  pointer('onPointerMove', 400)
  assert.equal(ratio(), 60)
  pointer('onPointerUp', 400)
  assert.equal(ratio(), 60)
  assert.equal(captured.size, 0)
  for (const cancellation of ['onPointerCancel', 'onLostPointerCapture', 'Escape']) {
    pointer('onPointerDown', 500)
    pointer('onPointerMove', 9000)
    assert.equal(ratio(), 70)
    if (cancellation === 'Escape') key('Escape')
    else pointer(cancellation)
    assert.equal(ratio(), 60, `${cancellation} restores the starting split`)
  }
  pointer('onPointerDown', 500)
  pointer('onPointerMove', -9000)
  assert.equal(ratio(), 30)
  pointer('onPointerUp')

  view = render(false)
  assert.equal(topRenders, 0)
  assert.ok(!view.tree.some((node) => node.props.role === 'separator'))
  assert.ok(view.has('data-rail', 'desktop') && view.has('data-panel', 'build'))
  activate('build')
  assert.equal(sidebar.isCollapsed, true, 'without a top slot the original collapse action remains')
  view = render(false)
  assert.ok(view.has('data-rail', 'desktop'))
  assert.ok(!view.has('data-panel'))
  sidebar.isCollapsed = false
  mobile = true
  view = render()
  assert.equal(topRenders, 0, 'mobile retains its existing bottom sheet without the desktop slot')
  assert.ok(view.has('data-rail', 'mobile') && view.has('data-sheet'))
  assert.ok(view.has('data-panel', 'build') && view.has('data-viewer'))
  for (const isMobile of [false, true]) {
    mobile = isMobile
    editor.isCaptureMode = true
    view = render()
    assert.equal(topRenders, 0)
    assert.ok(!view.has('data-rail') && !view.has('data-panel'))
    assert.ok(view.has('data-viewer'), 'Capture retains the viewer without sidebar content')
  }
}
