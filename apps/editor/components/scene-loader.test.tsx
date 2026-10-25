import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { SaveStatus, SceneGraph } from '@pascal-app/editor'

if (!process.env.SCENE_LOADER_SAVE_TEST) {
  test('scene loading honors workspace entry and keeps saves recoverable', () => {
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
  const { sceneGraphSignature } = await import('../lib/scene-signature')
  const { validateBuildJson } = await import('../../../packages/core/src/validation/validate-build-json')
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
  let forgetMemo = false
  let metaVersion = 7
  let workspaceQuery = ''
  let panelOpeningAllowed = true
  const editorState = { activeSidebarPanel: 'theatre-roles' }
  let exports = 0,
    retries = 0
  let reloads = 0
  const navigations: string[] = []
  const windowEvents = Object.assign(new EventTarget(), {
    document: { createElement: () => ({ click: () => exports++ }) },
    confirm: () => { throw new Error('server recovery must use the in-page confirmation') },
    location: { reload: () => reloads++ },
  })
  windowEvents.addEventListener('scene:retry-save', () => retries++)
  Object.assign(globalThis, { window: windowEvents })
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
  let proposalInvalidations = 0
  let checkProposal = async () => {}
  mock.module('../lib/rehearsal-intelligence/authority', () => ({
    bindRehearsalScene: (_id: string, check: () => Promise<void>) => {
      checkProposal = check
      return () => {}
    },
    clearProposalGhost: () => {
      proposalInvalidations++
    },
    observeRehearsalFeedback: () => () => {},
  }))
  const requests: { url: string; init: RequestInit }[] = []
  const coverRequests: { version: number; signature: string }[] = []
  const onThumbnailCapture = () => {}
  const scheduleCover = (request: { version: number; signature: string }) =>
    coverRequests.push(request)
  mock.module('./use-audience-cover', () => ({
    useAudienceCover: () => ({
      onThumbnailCapture,
      scheduleCover,
    }),
  }))
  let respond: () => Promise<Response> = async () => new Response(null, { status: 500 })
  const Editor = () => null
  const empty = () => null
  mock.module('react', () => ({
    ...React,
    useMemo: <T,>(factory: () => T, deps: unknown[]) => {
      const index = hookIndex++
      const previous = hooks[index] as { deps: unknown[]; value: T } | undefined
      if (forgetMemo || !previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i])))
        hooks[index] = { deps: [...deps], value: factory() }
      return (hooks[index] as { value: T }).value
    },
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
    validateBuildJson,
    acquireSceneReadOnlyLease: () => () => {},
    useScene: { getState: () => liveGraph },
    useLiveTransforms: {
      getState: () => ({ transforms: new Map([[prop.id, { position: transientPosition }]]) }),
    },
  }))
  mock.module('@pascal-app/editor', () => ({
    Editor,
    useSidebarStore: { getState: () => ({ isCollapsed: false, setIsCollapsed: () => {} }) },
    useEditor: Object.assign(
      (select: (state: typeof editorState) => unknown) => select(editorState),
      { getState: () => editorState },
    ),
    useIsMobile: () => false,
    applySceneGraphToEditor: (graph: SceneGraph) => {
      applied.push(graph)
      liveGraph = graph
      onApplyDirty()
    },
  }))
  mock.module('@pascal-app/viewer', () => ({
    NeutralRenderEnvironment: { Provider: empty },
    StableRenderMode: { Provider: empty },
    ViewerErrorBoundary: empty,
  }))
  let recoveryPending = false
  let journalInstances = 0
  const serverAccepts: { graph: SceneGraph; version: number }[] = []
  mock.module('../lib/scene-journal', () => ({
    SceneJournal: class {
      loaded = false
      constructor() { journalInstances++ }
      async recover(graph: SceneGraph) {
        this.loaded = true
        return { graph, pending: recoveryPending, conflict: false }
      }
      async append() { if (!this.loaded) throw new Error('本机日志尚未加载') }
      async acknowledge() {}
      async assertCurrent() {}
      async acceptServer(graph: SceneGraph, version: number) { serverAccepts.push({ graph, version }) }
    },
  }))
  mock.module('next/navigation', () => ({
    useRouter: () => ({
      refresh: () => {
        throw new Error('conflicts must not discard local data by refreshing')
      },
      push: (path: string) => navigations.push(path),
    }),
    useSearchParams: () => new URLSearchParams(workspaceQuery),
  }))
  mock.module('./theatre/state', () => ({
    useTheatreDocument: () => ({ document: displayedDocument, error: null }),
  }))
  mock.module('../lib/theatre/scene-adapter', () => ({
    THEATRE_METADATA_KEY: 'diastageTheatre',
    assertTheatreWritable: () => {},
    stageFloorUpdates: () => [],
    parseSnapshot: (graph: SceneGraph) => graph,
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
    './theatre/scene-visibility': ['SceneLayersRuntime'],
    './remount-preview-system': ['RemountPreviewSystem'],
    './stage-overview-panel': ['StageOverviewPanel'],
    './scene-backup-controls': ['SceneBackupControls'],
    './theatre/runtime': ['RehearsalTransport', 'TheatreFloorplan', 'TheatreRuntime'],
    './viewer-toolbar': ['EditorViewerToolbarLeft', 'EditorViewerToolbarRight'],
  }
  for (const [path, names] of Object.entries(componentModules)) {
    mock.module(path, () => Object.fromEntries(names.map((name) => [name, empty])))
  }
  mock.module('./studio-navigation', () => ({
    StudioNavigation: empty,
    openStudioPanel: (panel: string) => {
      if (!panelOpeningAllowed) return false
      editorState.activeSidebarPanel = panel
      return true
    },
  }))
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return respond()
  }
  const { SceneLoader } = await import('./scene-loader')
  type Element = { type?: unknown; props?: Record<string, unknown> }
  type EditorProps = {
    onLoad: () => Promise<SceneGraph>
    onLocalSave: (graph: SceneGraph) => Promise<void>
    onLoaderChange: (visible: boolean) => void
    onSave: (graph: SceneGraph, options?: { keepalive?: boolean }) => Promise<void>
    onSaveStatusChange: (status: SaveStatus) => void
    onDirty: () => void
    onThumbnailCapture?: unknown
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
    assert.equal(
      props.onThumbnailCapture,
      onThumbnailCapture,
      'editor captures reach the cover hook',
    )
    onApplyDirty = props.onDirty
    const navigation = nodes.find((node) => node.props?.actions)?.props
    return { nodes, props, navigation }
  }
  function click(label: string) {
    const action = render().nodes.find(
      (node) => node.type === 'button' && node.props?.children === label,
    )?.props?.onClick
    assert.equal(typeof action, 'function', `missing action: ${label}`)
    return (action as () => void | Promise<void>)()
  }
  function status() {
    return elements(render().navigation?.actions).find((node) => node.props?.role === 'status')
      ?.props?.children
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
    JSON.parse(String(requests[index]?.init.body)) as {
      name: string
      graph: SceneGraph
      thumbnailUrl?: string | null
    }
  const matchVersion = (index: number) => new Headers(requests[index]?.init.headers).get('If-Match')

  for (const [previousPanel, workspace, expectedPanel] of [
    ['remount', 'set', 'items'],
    ['items', 'remount', 'remount'],
  ] as const) {
    hooks = []
    workspaceQuery = `workspace=${workspace}`
    editorState.activeSidebarPanel = previousPanel
    const loading = render()
    editorState.activeSidebarPanel = previousPanel
    panelOpeningAllowed = false
    loading.props.onLoaderChange(false)
    render()
    assert.equal(editorState.activeSidebarPanel, previousPanel)
    panelOpeningAllowed = true
    render()
    const ready = render()
    assert.equal(ready.navigation?.group, workspace, 'the URL workspace wins after layout hydration')
    assert.equal(editorState.activeSidebarPanel, expectedPanel, 'the sidebar opens the requested workspace')
    const otherWorkspace = workspace === 'set' ? 'remount' : 'set'
    const changeGroup = ready.navigation?.onGroupChange as (group: string) => void
    changeGroup(otherWorkspace)
    render()
    assert.equal(render().navigation?.group, otherWorkspace, 'a consumed URL does not override later manual navigation')
  }
  hooks = []
  workspaceQuery = ''
  editorState.activeSidebarPanel = 'remount'
  render().props.onLoaderChange(false)
  render()
  assert.equal(render().navigation?.group, 'remount', 'entry without a workspace keeps the saved preference')
  hooks = []
  editorState.activeSidebarPanel = 'theatre-roles'

  await render().props.onLoad()
  const initializedJournalCount = journalInstances
  forgetMemo = true
  await render().props.onLocalSave(initialScene)
  forgetMemo = false
  assert.equal(journalInstances, initializedJournalCount, 'Fast Refresh must retain the initialized journal when the scene and account are unchanged')
  liveGraph.nodes[prop.id] = { ...prop, slots: { body: 'library:metal-steel' } }
  render().props.onLoaderChange(false)
  assert.deepEqual(
    coverRequests.at(-1),
    {
      version: 7,
      signature: sceneGraphSignature(liveGraph),
    },
    'initial covers use the hydrated material slots without rewriting the server graph',
  )
  const initialCovers = coverRequests.length
  render().props.onDirty()
  render().props.onLoaderChange(false)
  assert.equal(coverRequests.length, initialCovers, 'loading cannot capture unsaved edits')
  hooks = []
  recoveryPending = true
  await render().props.onLoad()
  render().props.onLoaderChange(false)
  assert.equal(coverRequests.length, initialCovers, 'recovered work waits for a successful save')
  hooks = []
  recoveryPending = false
  coverRequests.length = 0
  liveGraph = structuredClone(initialScene)

  await assert.rejects(saveAsEditor(initialScene, true), /500/)
  assert.equal(coverRequests.length, 0, 'a failed save cannot replace the cover')
  assert.deepEqual(statuses, ['error'], 'autosave cannot interpret a failed callback as saved')
  assert.equal(status(), '保存失败')
  assert.equal(requests[0]?.init.keepalive, undefined)
  assert.equal(matchVersion(0), '7')
  assert.deepEqual(sentGraph(0).graph, initialScene)
  assert.equal(sentGraph(0).name, '排演', 'legacy graphs keep their existing scene name')
  assert.equal(render().navigation?.sceneName, '排演')

  liveGraph = structuredClone(initialScene)
  liveGraph.nodes[prop.id] = { ...prop, position: [2, 0, 4] }
  const beforeRetry = JSON.stringify(liveGraph)
  respond = async () => {
    throw new Error('offline')
  }
  click('重试保存')
  assert.equal(retries, 1, 'retry wakes the single save queue')
  assert.equal(requests.length, 1, 'retry does not bypass the queue with another PUT')
  await assert.rejects(saveAsEditor(liveGraph), /offline/)
  await flush()
  assert.equal(status(), '保存失败', 'retry network failure stays retryable')
  assert.equal(matchVersion(1), '7', 'failed requests do not advance the revision')
  respond = async () => Response.json({ version: 8, nodeCount: 2 })
  click('重试保存')
  await saveAsEditor(liveGraph)
  await flush()
  assert.equal(status(), '本机已保存 · 已同步')
  assert.equal(coverRequests.at(-1)?.version, 8, 'successful saves schedule a version-bound cover')
  assert.deepEqual(sentGraph(2).graph, liveGraph, 'retry reads the current persisted store')
  assert.equal(
    sentGraph(2).thumbnailUrl,
    null,
    'a saved graph clears its previous cover atomically',
  )
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

  let acknowledgementRequests = 0
  respond = async () =>
    ++acknowledgementRequests === 1
      ? Response.json({ error: 'version_conflict' }, { status: 409 })
      : Response.json({ version: 9, nodeCount: 2, graph: liveGraph })
  await render().props.onSave(liveGraph)
  assert.equal(
    coverRequests.at(-1)?.version,
    9,
    'an identical acknowledged save also refreshes the cover',
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
  click('导出本机版本')
  assert.equal(exports, 1)
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
  assert.equal(statuses.at(-1), 'error')

  hooks = []
  liveGraph = structuredClone(initialScene)
  render().props.onDirty()
  liveGraph.nodes[prop.id] = { ...prop, position: [4, 0, 4] }
  const dirtyGraph = structuredClone(liveGraph)
  const remoteGraph = structuredClone(initialScene)
  remoteGraph.nodes[prop.id] = { ...prop, position: [-4, 0, -4] }
  sources.at(-1)!.scene(8, remoteGraph)
  assert.ok(proposalInvalidations > 0, 'foreign changes invalidate rehearsal previews')
  await assert.rejects(checkProposal(), /版本冲突/, 'a conflicted scene cannot adopt a proposal')
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
  await render().props.onLoad()
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
  assert.deepEqual(
    coverRequests.at(-1),
    {
      version: 13,
      signature: sceneGraphSignature(liveGraph),
    },
    'clean remote updates also refresh the cover from the loaded graph',
  )
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
    render().navigation?.sceneName,
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
  assert.equal(render().navigation?.sceneName, '排演')
  hooks = []
  liveGraph = structuredClone(initialScene)
  await render().props.onLoad()
  render().props.onDirty()
  sources.at(-1)!.scene(99, dirtyGraph)
  const beforeCancelled = requests.length
  await click('使用服务器版本')
  assert.equal(requests.length, beforeCancelled, 'opening the in-page confirmation writes nothing')
  assert.ok(render().nodes.some((node) => node.props?.children === '确认保留副本并使用服务器版本'))
  await click('取消')
  assert.equal(requests.length, beforeCancelled, 'cancelled server recovery writes nothing')
  assert.equal(serverAccepts.length, 0)
  assert.deepEqual(liveGraph, initialScene, 'cancelling retains the local stage')
  assert.ok(!render().nodes.some((node) => node.props?.children === '确认保留副本并使用服务器版本'))
  respond = async () => new Response(null, { status: 500 })
  await click('使用服务器版本')
  assert.equal(requests.length, beforeCancelled, 'a second opening still requires an explicit confirm')
  await click('确认保留副本并使用服务器版本')
  assert.equal(serverAccepts.length, 0, 'failed local backup cannot clear the journal')
  assert.equal(reloads, 0)
  assert.deepEqual(liveGraph, initialScene)
  let recoveryCall = 0
  respond = async () => ++recoveryCall === 1
    ? Response.json({ id: 'kept-local' }, { status: 201 })
    : Response.json({ graph: dirtyGraph, version: 99 })
  const beforeRecovery = requests.length
  await click('使用服务器版本')
  assert.equal(requests.length, beforeRecovery, 'no backup request is sent until explicit confirmation')
  await click('确认保留副本并使用服务器版本')
  assert.equal(requests[beforeRecovery]?.url, '/api/scenes')
  assert.equal(requests[beforeRecovery]?.init.method, 'POST')
  assert.deepEqual(sentGraph(beforeRecovery).graph, initialScene, 'the local snapshot is saved as an independent scene first')
  assert.equal(serverAccepts.length, 1)
  assert.equal(serverAccepts[0]?.version, 99)
  assert.deepEqual(serverAccepts[0]?.graph.nodes, dirtyGraph.nodes)
  assert.equal(reloads, 1, 'explicit server choice reloads only after the backup and journal replacement succeed')
  respond = async () => Response.json({ id: 'my-local-version' }, { status: 201 })
  await click('保留本机为新剧目')
  assert.equal(navigations.at(-1), '/scene/my-local-version')
  assert.equal(serverAccepts.length, 1, 'keeping the local copy does not alter the source journal')
  for (const source of sources) source.close()
}
