import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { SaveStatus, SceneGraph } from '@pascal-app/editor'

if (!process.env.SCENE_LOADER_SAVE_TEST) {
  test('scene saving rejects failures, retains conflicts and retries only persisted data', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, SCENE_LOADER_SAVE_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { BlockNode, SiteNode } = await import('@pascal-app/core/schema')
  const { createTheatreDocument } = await import('../lib/theatre/schema')
  let displayedDocument: ReturnType<typeof createTheatreDocument> | null = null
  const site = SiteNode.parse({ id: 'site_save', name: '排演', metadata: { existing: 'retain' } })
  const prop = BlockNode.parse({ id: 'block_letter', name: '信', position: [1, 0, 3] })
  const initialScene: SceneGraph = {
    nodes: { [site.id]: site, [prop.id]: prop },
    rootNodeIds: [site.id],
    materials: {},
    collections: {},
    installedPlugins: [],
  }
  let liveGraph = structuredClone(initialScene)
  const transientPosition = [90, 0, 90]
  let hookIndex = 0
  let hooks: unknown[] = []
  let effects: (() => void)[] = []
  let forceEffects = false
  let metaVersion = 7
  let refreshes = 0
  let onApplyDirty = () => {}
  const applied: SceneGraph[] = []
  const sources: SceneEvents[] = []
  class SceneEvents {
    static CLOSED = 2
    readyState = 1
    listeners = new Map<string, (event: Event) => void>()
    constructor() {
      sources.push(this)
    }
    addEventListener(name: string, listener: (event: Event) => void) {
      this.listeners.set(name, listener)
    }
    close() {
      this.readyState = SceneEvents.CLOSED
    }
    scene(version: number, graph: SceneGraph) {
      this.listeners.get('scene')?.(
        new MessageEvent('scene', {
          data: JSON.stringify({ sceneId: 'save-test', version, graph }),
        }),
      )
    }
  }
  Object.assign(globalThis, { EventSource: SceneEvents })
  const statuses: SaveStatus[] = []
  const requests: { url: string; init: RequestInit }[] = []
  let respond: () => Promise<Response> = async () => new Response(null, { status: 500 })
  const Editor = () => null
  const empty = () => null
  mock.module('react', () => ({
    ...React,
    useCallback: <T,>(callback: T) => callback,
    useEffect: (effect: () => undefined | (() => void), deps: unknown[]) => {
      const index = hookIndex++
      const previous = hooks[index] as { deps: unknown[]; cleanup?: () => void } | undefined
      if (forceEffects || !previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.()
          hooks[index] = { deps: [...deps], cleanup: effect() }
        })
      }
    },
    useRef: <T,>(value: T) => {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = { current: value }
      return hooks[index]
    },
    useState: <T,>(value: T) => {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = value
      return [
        hooks[index],
        (next: T) => {
          hooks[index] = next
        },
      ]
    },
  }))
  mock.module('@pascal-app/core', () => ({
    SiteNode,
    useScene: { getState: () => liveGraph },
    useLiveTransforms: {
      getState: () => ({ transforms: new Map([[prop.id, { position: transientPosition }]]) }),
    },
  }))
  mock.module('@pascal-app/editor', () => ({
    Editor,
    useEditor: (select: (state: { activeSidebarPanel: string }) => unknown) =>
      select({ activeSidebarPanel: 'theatre-roles' }),
    applySceneGraphToEditor: (graph: SceneGraph) => {
      applied.push(graph)
      liveGraph = graph
      onApplyDirty()
    },
  }))
  mock.module('@pascal-app/viewer', () => ({ NeutralRenderEnvironment: { Provider: empty } }))
  mock.module('next/navigation', () => ({
    useRouter: () => ({
      refresh: () => {
        refreshes += 1
      },
      push: () => {},
    }),
    useSearchParams: () => new URLSearchParams(),
  }))
  mock.module('./studio-sidebar', () => ({
    useStudioSidebar: () => ({ group: 'director', onGroupChange: () => {}, sidebarTabs: [] }),
  }))
  mock.module('./theatre/state', () => ({
    useTheatreDocument: () => ({ document: displayedDocument, error: null }),
  }))
  mock.module('../lib/theatre/scene-adapter', () => ({
    THEATRE_METADATA_KEY: 'diastageTheatre',
  }))
  const componentModules = {
    // Save/revision behavior is independent of placement, command execution and selection UI.
    './stage-entry/runtime': ['StageCommandRuntime'],
    './stage-entry/placement-system': ['StagePlacementSystem', 'StagePlacementFloorplan'],
    './stage-entry/plan-preview-system': ['StagePlanPreviewSystem'],
    './stage-entry/stage-selection-panel': ['StageSelectionPanel'],
    './camera-rehearsal-system': ['CameraRehearsalSystem'],
    './camera-studio/camera-monitor': ['CameraMonitor'],
    './camera-studio/camera-stage-floorplan': ['CameraStageFloorplan'],
    './camera-studio/camera-stage-system': ['CameraStageSystem'],
    './camera-studio/dock': ['CameraStudioDock'],
    './camera-studio/runtime': ['CameraStudioRuntime'],
    './camera-studio/persistence': ['CameraPersistence'],
    './theatre/versions-panel': ['VersionViewSync'],
    './remount-preview-system': ['RemountPreviewSystem'],
    './stage-overview-panel': ['StageOverviewPanel'],
    './studio-navigation': ['StudioNavigation'],
    './theatre/runtime': ['RehearsalTransport', 'TheatreFloorplan', 'TheatreRuntime'],
    './viewer-toolbar': ['CommunityViewerToolbarLeft', 'CommunityViewerToolbarRight'],
  }
  for (const [path, names] of Object.entries(componentModules)) {
    mock.module(path, () => Object.fromEntries(names.map((name) => [name, empty])))
  }
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return respond()
  }
  const { SceneLoader } = await import('./scene-loader')
  type Element = { type?: unknown; props?: Record<string, unknown> }
  type EditorProps = {
    onSave: (graph: SceneGraph, options?: { keepalive?: boolean }) => Promise<void>
    onSaveStatusChange: (status: SaveStatus) => void
    onDirty: () => void
    onThumbnailCapture?: unknown
    navbarSlot: Element
  }
  function elements(value: unknown): Element[] {
    if (!value || typeof value !== 'object') return []
    if (Array.isArray(value)) return value.flatMap(elements)
    const element = value as Element
    return [element, ...elements(element.props?.children)]
  }
  function render() {
    hookIndex = 0
    effects = []
    const tree = SceneLoader({
      initialScene,
      meta: {
        id: 'save-test',
        name: '排演',
        projectId: null,
        thumbnailUrl: null,
        version: metaVersion,
        createdAt: '',
        updatedAt: '',
        ownerId: null,
        sizeBytes: 1,
        nodeCount: 2,
      },
    })
    const nodes = elements(tree)
    for (const effect of effects) effect()
    const props = nodes.find((node) => node.type === Editor)?.props as unknown as EditorProps
    assert.equal(props.onThumbnailCapture, undefined, 'the missing thumbnail endpoint is not wired')
    onApplyDirty = props.onDirty
    return { nodes, props }
  }
  function click(label: string) {
    const action = render().nodes.find(
      (node) => node.type === 'button' && node.props?.children === label,
    )?.props?.onClick
    assert.equal(typeof action, 'function', `missing action: ${label}`)
    ;(action as () => void)()
  }
  function status() {
    return elements(render().props.navbarSlot.props?.actions).find(
      (node) => node.props?.role === 'status',
    )?.props?.children
  }
  async function saveAsEditor(graph: SceneGraph, keepalive = false) {
    const { props } = render()
    props.onSaveStatusChange('saving')
    try {
      await props.onSave(graph, { keepalive })
      statuses.push('saved')
      props.onSaveStatusChange('saved')
    } catch (error) {
      statuses.push('error')
      props.onSaveStatusChange('error')
      throw error
    }
  }
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  const sentGraph = (index: number) =>
    JSON.parse(String(requests[index]?.init.body)) as { name: string; graph: SceneGraph }
  const matchVersion = (index: number) => new Headers(requests[index]?.init.headers).get('If-Match')

  await assert.rejects(saveAsEditor(initialScene, true), /500/)
  assert.deepEqual(statuses, ['error'], 'autosave cannot interpret a failed callback as saved')
  assert.equal(status(), '保存失败')
  assert.equal(requests[0]?.init.keepalive, true)
  assert.equal(matchVersion(0), '7')
  assert.deepEqual(sentGraph(0).graph, initialScene)
  assert.equal(sentGraph(0).name, '排演', 'legacy graphs keep their existing scene name')
  assert.equal(render().props.navbarSlot.props?.sceneName, '排演')

  liveGraph = structuredClone(initialScene)
  liveGraph.nodes[prop.id] = { ...prop, position: [2, 0, 4] }
  const beforeRetry = JSON.stringify(liveGraph)
  respond = async () => {
    throw new Error('offline')
  }
  click('重试保存')
  await flush()
  assert.equal(status(), '保存失败', 'retry network failure stays retryable')
  assert.equal(matchVersion(1), '7', 'failed requests do not advance the revision')
  respond = async () => Response.json({ version: 8, nodeCount: 2 })
  click('重试保存')
  await flush()
  assert.equal(status(), '已保存')
  assert.deepEqual(sentGraph(2).graph, liveGraph, 'retry reads the current persisted store')
  assert.notDeepEqual(
    (sentGraph(2).graph.nodes[prop.id] as typeof prop).position,
    transientPosition,
  )
  assert.equal(
    JSON.stringify(liveGraph),
    beforeRetry,
    'retry never rewrites nodes for the rendered pose',
  )
  await render().props.onSave(liveGraph)
  assert.equal(matchVersion(3), '8', 'only a successful save advances If-Match')
  assert.equal(
    requests.every((request) => request.url === '/api/scenes/save-test'),
    true,
  )

  hooks = []
  respond = async () =>
    Response.json({ error: 'version_conflict', currentVersion: 12 }, { status: 409 })
  await assert.rejects(saveAsEditor(liveGraph), /版本冲突/)
  assert.equal(
    render().nodes.some((node) => node.props?.children === '此场景已在其他窗口更新'),
    true,
  )
  assert.equal(
    render().nodes.some((node) => node.props?.children === '重试保存'),
    false,
  )
  assert.equal(status(), '保存失败')
  const conflictRequest = requests.length
  click('重新加载')
  assert.equal(refreshes, 1)
  assert.equal(requests.length, conflictRequest, 'reload never forces a conflicting write')

  hooks = []
  const requestsBeforeEmpty = requests.length
  await assert.rejects(saveAsEditor({ nodes: {}, rootNodeIds: [] }), /加载完成/)
  assert.equal(requests.length, requestsBeforeEmpty, 'unhydrated data cannot reach the server')
  assert.equal(status(), '保存失败')
  respond = async () => Response.json({ error: 'empty_graph_rejected' }, { status: 409 })
  await assert.rejects(saveAsEditor(liveGraph), /空场景覆盖/)
  assert.equal(
    render().nodes.some((node) => node.props?.children === '此场景已在其他窗口更新'),
    false,
  )
  assert.equal(
    render().nodes.some((node) => node.props?.children === '重试保存'),
    true,
  )
  assert.equal(statuses.includes('saved'), false)

  hooks = []
  liveGraph = structuredClone(initialScene)
  render().props.onDirty()
  liveGraph.nodes[prop.id] = { ...prop, position: [4, 0, 4] }
  const dirtyGraph = structuredClone(liveGraph)
  const remoteGraph = structuredClone(initialScene)
  remoteGraph.nodes[prop.id] = { ...prop, position: [-4, 0, -4] }
  sources.at(-1)!.scene(8, remoteGraph)
  assert.equal(applied.length, 0, 'a different remote revision cannot overwrite local edits')
  assert.deepEqual(liveGraph, dirtyGraph)
  assert.equal(
    render().nodes.some((node) => node.props?.children === '此场景已在其他窗口更新'),
    true,
  )

  hooks = []
  liveGraph = structuredClone(initialScene)
  let completeSave: (response: Response) => void = () => {
    throw new Error('save did not start')
  }
  respond = () =>
    new Promise<Response>((resolve) => {
      completeSave = resolve
    })
  const saving = render().props.onSave(liveGraph)
  liveGraph = structuredClone(dirtyGraph)
  render().props.onDirty()
  sources.at(-1)!.scene(8, initialScene)
  assert.equal(
    applied.length,
    0,
    'the SSE acknowledgement does not restore an earlier submitted graph',
  )
  completeSave(Response.json({ version: 8, nodeCount: 2 }))
  await saving
  sources.at(-1)!.scene(9, remoteGraph)
  assert.equal(applied.length, 0, 'saving an earlier graph does not clear newer local edits')
  assert.deepEqual(liveGraph, dirtyGraph)
  assert.equal(
    render().nodes.some((node) => node.props?.children === '此场景已在其他窗口更新'),
    true,
  )

  metaVersion = 12
  render()
  assert.equal(
    render().nodes.some((node) => node.props?.children === '此场景已在其他窗口更新'),
    false,
  )
  respond = async () => Response.json({ version: 13, nodeCount: 2 })
  const beforeRefreshedSave = requests.length
  await render().props.onSave(liveGraph)
  assert.equal(
    matchVersion(beforeRefreshedSave),
    '12',
    'refresh establishes the new server baseline',
  )

  hooks = []
  render()
  sources.at(-1)!.scene(13, remoteGraph)
  assert.deepEqual(applied, [remoteGraph], 'a clean editor still receives remote updates')
  assert.deepEqual(liveGraph, remoteGraph)
  sources.at(-1)!.scene(14, initialScene)
  assert.deepEqual(
    applied,
    [remoteGraph, initialScene],
    'remote application does not dirty the editor',
  )
  const beforeRemoteAutosave = requests.length
  await render().props.onSave(liveGraph)
  assert.equal(
    requests.length,
    beforeRemoteAutosave,
    'the exact remote graph is not echoed back to the server',
  )
  sources.at(-1)!.scene(15, initialScene)
  liveGraph = structuredClone(dirtyGraph)
  render().props.onDirty()
  respond = async () => Response.json({ version: 16, nodeCount: 2 })
  const beforeImmediateSave = requests.length
  await render().props.onSave(liveGraph)
  assert.equal(
    requests.length,
    beforeImmediateSave + 1,
    'an immediate edit after SSE must not be swallowed by a time window',
  )
  assert.equal(matchVersion(beforeImmediateSave), '15')
  assert.deepEqual(sentGraph(beforeImmediateSave).graph, dirtyGraph)
  forceEffects = true
  render()
  forceEffects = false
  liveGraph = structuredClone(initialScene)
  render().props.onDirty()
  await render().props.onSave(liveGraph)
  assert.equal(
    matchVersion(beforeImmediateSave + 1),
    '16',
    'a UI hot refresh does not reset the saved version to initial page metadata',
  )
  assert.equal(
    requests.length,
    beforeImmediateSave + 2,
    'returning to an older remote pose after saving a local edit is still saved',
  )

  sources.at(-1)!.scene(17, remoteGraph)
  liveGraph = structuredClone(dirtyGraph)
  render().props.onDirty()
  forceEffects = true
  render()
  forceEffects = false
  sources.at(-1)!.scene(18, initialScene)
  assert.equal(
    applied.length,
    4,
    'SSE cannot overwrite a user edit made immediately after the preceding SSE',
  )
  assert.deepEqual(liveGraph, dirtyGraph)
  hooks = []
  liveGraph = structuredClone(initialScene)
  const renamed = createTheatreDocument('夜航 · 第二稿')
  liveGraph.nodes[site.id] = {
    ...site,
    metadata: { ...site.metadata, diastageTheatre: renamed },
  }
  displayedDocument = renamed
  assert.equal(
    render().props.navbarSlot.props?.sceneName,
    renamed.production.name,
    'the navigation title follows the live validated production name',
  )
  const beforeRename = requests.length
  await render().props.onSave(liveGraph)
  assert.equal(
    sentGraph(beforeRename).name,
    renamed.production.name,
    'the saved library title comes from theatre metadata in the submitted graph',
  )
  assert.deepEqual(sentGraph(beforeRename).graph, liveGraph)

  liveGraph.nodes[site.id] = {
    ...site,
    metadata: { ...site.metadata, diastageTheatre: { production: { name: '损坏的剧目' } } },
  }
  displayedDocument = null
  const beforeInvalidRename = requests.length
  await render().props.onSave(liveGraph)
  assert.equal(
    sentGraph(beforeInvalidRename).name,
    '排演',
    'unvalidated theatre metadata cannot replace a legacy scene name',
  )
  assert.deepEqual(
    sentGraph(beforeInvalidRename).graph,
    liveGraph,
    'invalid theatre metadata remains preserved for recovery',
  )
  assert.equal(render().props.navbarSlot.props?.sceneName, '排演')
  for (const source of sources) source.close()
}
