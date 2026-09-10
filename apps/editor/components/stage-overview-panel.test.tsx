import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.STAGE_OVERVIEW_PANEL_TEST) {
  test('stage overview exposes scenery without lights and protects scene edits', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, STAGE_OVERVIEW_PANEL_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  const { mock } = await import('bun:test')
  const React = await import('react')
  const core = await import('@pascal-app/core')
  const editor = await import('@pascal-app/editor')
  const viewer = await import('@pascal-app/viewer')
  const { useCameraStudio: camera } = await import('./camera-studio/store')
  const director = await import('@/lib/camera-director')
  const scene = core.useScene
  const editorStore = editor.useEditor
  const viewerStore = viewer.useViewer
  const scope = editor.useInteractionScope
  const calls: string[] = []
  const updateNode = scene.getState().updateNode
  const setSelection = viewerStore.getState().setSelection
  const setMode = editorStore.getState().setMode
  scene.setState({
    updateNode: (...args: Parameters<typeof updateNode>) => {
      calls.push('updateNode')
      return updateNode(...args)
    },
  })
  viewerStore.setState({
    setSelection: (...args: Parameters<typeof setSelection>) => {
      calls.push('selection')
      setSelection(...args)
    },
  })
  editorStore.setState({
    setMode: (...args: Parameters<typeof setMode>) => {
      calls.push('mode')
      setMode(...args)
    },
  })
  mock.module('react', () => ({
    ...React,
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initial: T) => [initial, () => {}],
  }))
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (select: (state: ReturnType<typeof scene.getState>) => unknown) => select(scene.getState()),
      scene,
    ),
    useInteractive: Object.assign(
      (select: (state: ReturnType<typeof core.useInteractive.getState>) => unknown) =>
        select(core.useInteractive.getState()),
      core.useInteractive,
    ),
  }))
  mock.module('@pascal-app/editor', () => ({
    ...editor,
    useEditor: Object.assign(
      (select: (state: ReturnType<typeof editorStore.getState>) => unknown) =>
        select(editorStore.getState()),
      editorStore,
    ),
    useInteractionScope: Object.assign(
      (select: (state: ReturnType<typeof scope.getState>) => unknown) => select(scope.getState()),
      scope,
    ),
    routeTreeSelectionToNode: () => {
      calls.push('route')
      // Phase routing can reset the context; the panel must apply the full path afterwards.
      setSelection({ buildingId: 'building_default', levelId: 'level_default' })
    },
  }))
  mock.module('@pascal-app/viewer', () => ({
    ...viewer,
    useViewer: Object.assign(
      (select: (state: ReturnType<typeof viewerStore.getState>) => unknown) =>
        select(viewerStore.getState()),
      viewerStore,
    ),
  }))
  mock.module('./camera-studio/store', () => ({
    useCameraStudio: Object.assign(
      (select?: (state: ReturnType<typeof camera.getState>) => unknown) =>
        select ? select(camera.getState()) : camera.getState(),
      camera,
    ),
  }))
  mock.module('./theatre/simulation-panel', () => ({
    useStageDocument: () => ({ document: null }),
    useSimulationSelection: { setState: () => {} },
  }))
  mock.module('@/lib/camera-director', () => ({
    ...director,
    useCameraDirectorState: director.getCameraDirectorState,
  }))
  mock.module('./studio-navigation', () => ({
    openStudioPanel: (id: string) => {
      calls.push(`open:${id}`)
      return true
    },
  }))
  core.emitter.on('camera-controls:focus', () => calls.push('focus'))
  const { StageOverviewPanel } = await import('./stage-overview-panel')

  type Element = { type?: unknown; props?: Record<string, unknown> }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    return [element, ...elements(element.props?.children)]
  }
  function text(node: unknown): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(text).join('')
    return node && typeof node === 'object' ? text((node as Element).props?.children) : ''
  }
  function render(sceneId = 'scene-a') {
    const nodes = elements(StageOverviewPanel({ sceneId }))
    const tbody = nodes.find((node) => node.type === 'tbody')
    assert.ok(tbody, 'all entries share a directly visible table body')
    const rows = elements(tbody.props?.children).filter((node) => node.type === 'tr')
    function row(name: string) {
      const found = rows.find((node) => text(node).includes(name))
      assert.ok(found, `missing direct row: ${name}`)
      return found
    }
    function button(name: string, selector: 'toggle' | 'select' | 'action' = 'toggle') {
      const buttons = elements(row(name)).filter((node) => node.type === 'button')
      const found =
        selector === 'select'
          ? buttons.find((node) => node.props?.className === 'stage-overview-name')
          : selector === 'action'
            ? buttons.at(-1)
            : buttons[0]
      assert.ok(found)
      return found.props as { disabled?: boolean; onClick: () => void }
    }
    return { nodes, rows, row, button }
  }
  const asset = { id: 'asset', name: '素材', category: 'test', thumbnail: '', src: '/item.glb' }
  const fixtures = [
    core.SiteNode.parse({ id: 'site_stage', name: '测试剧场' }),
    core.BuildingNode.parse({ id: 'building_stage', parentId: 'site_stage', name: '测试建筑' }),
    core.LevelNode.parse({ id: 'level_lower', parentId: 'building_stage', name: '下层' }),
    core.LevelNode.parse({
      id: 'level_upper',
      parentId: 'building_stage',
      name: '上层',
      level: 1,
      visible: false,
    }),
    core.ItemNode.parse({ id: 'item_lower', parentId: 'level_lower', name: '下层座椅', asset }),
    core.ItemNode.parse({ id: 'item_upper', parentId: 'level_upper', name: '上层座椅', asset }),
    core.ItemNode.parse({
      id: 'item_lamp',
      parentId: 'level_upper',
      name: '原生灯具',
      visible: false,
      asset: {
        ...asset,
        interactive: {
          controls: [{ kind: 'toggle', label: '开关', default: true }],
          effects: [{ kind: 'light', intensityRange: [0, 100] }],
        },
      },
    }),
  ]
  function reset() {
    scene.setState({
      nodes: Object.fromEntries(fixtures.map((node) => [node.id, node])),
      rootNodeIds: ['site_stage'],
      readOnly: false,
    })
    camera.setState({ playing: false, previewing: false, recording: false })
    director.updateCameraDirector(
      'scene-a',
      (current) => ({ ...current, transport: { ...current.transport, status: 'idle' } }),
      { persist: false },
    )
    editorStore.setState({ isCaptureMode: false, isFirstPersonMode: false })
    scope.setState({ scope: { kind: 'idle' } })
    viewerStore.setState({ sceneTheme: 'studio', shading: 'rendered', shadows: true })
    calls.length = 0
  }

  reset()
  const view = render()
  view.row('下层座椅')
  view.row('上层座椅')
  assert.equal(view.rows.length, 2)
  assert.ok(!text(view.nodes).includes('原生灯具'))
  assert.ok(!view.nodes.some((node) => node.type === 'details'))
  assert.match(text(view.row('上层座椅')), /随上级隐藏/)

  view.button('上层座椅', 'select').onClick()
  assert.deepEqual(calls, ['mode', 'route', 'selection'])
  assert.deepEqual(viewerStore.getState().selection, {
    buildingId: 'building_stage',
    levelId: 'level_upper',
    zoneId: null,
    selectedIds: ['item_upper'],
  })
  calls.length = 0
  view.button('下层座椅').onClick()
  assert.deepEqual(calls, ['updateNode'])
  assert.equal(scene.getState().nodes.item_lower?.visible, false)

  for (const lock of [
    'readOnly',
    'playing',
    'previewing',
    'recording',
    'capture',
    'firstPerson',
    'interaction',
  ] as const) {
    reset()
    const stale = render()
    if (lock === 'readOnly') scene.setState({ readOnly: true })
    else if (lock === 'capture') editorStore.setState({ isCaptureMode: true })
    else if (lock === 'firstPerson') editorStore.setState({ isFirstPersonMode: true })
    else if (lock === 'interaction') scope.setState({ scope: { kind: 'box-select' } })
    else camera.setState({ [lock]: true })
    const beforeNodes = scene.getState().nodes
    stale.button('下层座椅').onClick()
    assert.equal(scene.getState().nodes, beforeNodes, `${lock}: stale model toggle is blocked`)
    const locked = render()
    assert.equal(locked.button('下层座椅').disabled, true)
  }
  for (const status of ['playing', 'recording', 'exporting'] as const) {
    reset()
    const stale = render()
    director.updateCameraDirector(
      'scene-a',
      (current) => ({ ...current, transport: { ...current.transport, status } }),
      { persist: false },
    )
    const beforeNodes = scene.getState().nodes
    const beforeSelection = viewerStore.getState().selection
    for (const name of ['下层座椅']) {
      stale.button(name, 'select').onClick()
      stale.button(name, 'action').onClick()
    }
    stale.button('下层座椅').onClick()
    assert.deepEqual(calls, [], `${status}: stale actions cannot select, focus, or switch panels`)
    assert.equal(scene.getState().nodes, beforeNodes, `${status}: model visibility is unchanged`)
    assert.equal(viewerStore.getState().selection, beforeSelection)
    assert.equal(viewerStore.getState().shadows, true, `${status}: shadows are unchanged`)
    const locked = render()
    for (const name of ['下层座椅']) {
      assert.equal(locked.button(name, 'select').disabled, true)
      assert.equal(locked.button(name, 'action').disabled, true)
    }
    assert.equal(locked.button('下层座椅').disabled, true)
  }
}
