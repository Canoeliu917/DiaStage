import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DIA_COLORS } from '@/lib/visual-system'

if (!process.env.BUILD_GHOST_RUNTIME_TEST) {
  test('Build Ghost follows visibility and moves existing props without intermediate resets', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, BUILD_GHOST_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const react = await import('react')
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: () => void }[] = []
  let cursor = 0
  let effects: (() => void)[] = []
  const memo = (create: () => unknown, deps: unknown[]) => {
    slots[cursor] ??= {}
    const slot = slots[cursor++]!
    if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps![i]))) {
      slot.value = create()
      slot.deps = deps
    }
    return slot.value
  }
  mock.module('react', () => ({
    ...react,
    useMemo: memo,
    useRef: (value: unknown) => memo(() => ({ current: value }), []),
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useLayoutEffect: (effect: () => undefined | (() => void), deps: unknown[]) => {
      slots[cursor] ??= {}
      const slot = slots[cursor++]!
      if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps![i]))) {
        slot.deps = deps
        effects.push(() => {
          slot.cleanup?.()
          slot.cleanup = effect() ?? undefined
        })
      }
    },
  }))
  const stage = await import('@pascal-app/core/stage')
  const plan = stage.StagePlanSchema.parse({
    schemaVersion: 1,
    source: 'typed-command',
    venue: { type: 'black-box', widthMeters: 10, depthMeters: 4, heightMeters: null },
    items: [],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  })
  const store = {
    plan,
    draft: null as typeof plan | null,
    suspended: false,
    restoreExisting: null as (() => void) | null,
  }
  const scene = {
    rootNodeIds: ['site-test'],
    nodes: {} as Record<string, Record<string, unknown>>,
    updates: 0,
  }
  const editor = { isPreviewMode: false, isFirstPersonMode: false, isCaptureMode: false }
  const layers = { showGhost: true }
  const frame = { origin: [3, 2, 7] as [number, number, number], depthMeters: 6 }
  const hook =
    <T,>(value: T) =>
    (select: (value: T) => unknown) =>
      select(value)
  let transforms = new Map<string, unknown>()
  const writes: Map<string, unknown>[] = []
  const live = {
    get transforms() {
      return transforms
    },
    set: (id: string, value: unknown) => transforms.set(id, value),
    get: (id: string) => transforms.get(id),
    clear: (id: string) => transforms.delete(id),
  }
  const { getNodeLock } = await import('@pascal-app/core')
  mock.module('@pascal-app/core', () => ({
    getNodeLock,
    useScene: hook(scene),
    useLiveTransforms: {
      getState: () => live,
      setState: (next: { transforms: typeof transforms }) => {
        transforms = next.transforms
        writes.push(new Map(transforms))
      },
    },
  }))
  mock.module('@pascal-app/editor', () => ({ useEditor: hook(editor) }))
  mock.module('@react-three/drei', () => ({ Html: () => null }))
  mock.module('../../lib/stage/context', () => ({
    stageFrame: () => frame,
  }))
  mock.module('../../lib/stage/contacts', () => ({
    stageContactIds: () =>
      new Set((store.draft ?? store.plan).warnings.flatMap((warning) => warning.itemIds)),
  }))
  const context = {
    objects: [{ id: 'block_existing', transform: { position: { x: 0, y: 0, z: 3 } } }],
  }
  mock.module('../../lib/stage/live-context', () => ({ useStageContext: () => context }))
  mock.module('../../lib/remount-scene', () => ({
    worldPose: () => ({ position: [0, 0, 0], rotation: [0, 0, 0] }),
  }))
  mock.module('../../lib/stage/plan-preview', () => ({
    useStagePlanPreview: Object.assign(hook(store), {
      setState: (next: Partial<typeof store>) => Object.assign(store, next),
      getState: () => store,
    }),
  }))
  mock.module('../../lib/stage/scenery', () => ({
    SCENERY_ROUND_SEGMENTS: 24,
    sceneryProxyParts: () => [{ shape: 'box', size: [1, 0.75, 1], position: [0, 0.375, 0] }],
  }))
  mock.module('../theatre/simulation-panel', () => ({ useSimulationSelection: hook(layers) }))
  const placement = { draft: null as { item: (typeof plan.items)[number] } | null }
  mock.module('./manual-stage-panel', () => ({
    useStagePlacement: hook(placement),
    placementPlan: () => ({ ...plan, items: [placement.draft!.item] }),
  }))
  const { StagePlanPreviewSystem } = await import('./plan-preview-system')
  const render = (enabled = true) => {
    cursor = 0
    const element = StagePlanPreviewSystem({ enabled })
    const pending = effects
    effects = []
    for (const effect of pending) effect()
    return element
  }
  type Element = { type: unknown; props: Record<string, unknown> }
  const all = (element: unknown): Element[] => {
    if (Array.isArray(element)) return element.flatMap(all)
    if (!element || typeof element !== 'object' || !('props' in element)) return []
    const entry = element as Element
    return [entry, ...all(entry.props.children)]
  }
  const before = JSON.stringify({ scene, plan })
  const elements = all(render())
  const outline = elements.find((entry) => entry.props.name === 'stage-plan-venue-outline')!
  assert(outline)
  assert.deepEqual(outline.props.position, [3, 2, 7])
  assert.equal(elements.filter((entry) => entry.type === 'mesh').length, 4)
  assert.deepEqual(
    elements.filter((entry) => entry.type === 'boxGeometry').map((entry) => entry.props.args),
    [
      [10, 0.015, 0.015],
      [0.015, 0.015, 4],
      [10, 0.015, 0.015],
      [0.015, 0.015, 4],
    ],
  )
  assert.equal(JSON.stringify({ scene, plan }), before)
  layers.showGhost = false
  assert.equal(render(), null)
  layers.showGhost = true
  assert.equal(render(false), null)
  for (const mode of ['isPreviewMode', 'isFirstPersonMode', 'isCaptureMode'] as const) {
    editor[mode] = true
    assert.equal(render(), null)
    editor[mode] = false
  }
  plan.items.push(
    stage.StageItemProposalSchema.parse({
      proposalId: 'table-test',
      kind: 'table',
      displayName: '舞台桌',
      libraryAssetId: null,
      existingNodeId: null,
      dimensionsMeters: { width: 1, depth: 1, height: 0.75 },
      transform: { position: { x: 1, y: 0, z: 1 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      evidenceIds: [],
      assumptionIds: [],
      certainty: 'stated',
    }),
  )
  const withItem = all(render())
  assert.equal(withItem.filter((entry) => entry.type === 'mesh').length, 6)
  assert(withItem.some((entry) => JSON.stringify(entry.props.position) === '[2,2,8]'))
  store.draft = structuredClone(plan)
  store.draft.items[0]!.transform.position.x = -2
  store.draft.warnings = [
    { code: 'collision', itemIds: ['table-test'], message: '穿插', blocking: false },
  ]
  const draftElements = all(render())
  assert(
    draftElements.some(
      (entry) =>
        entry.props.name === 'stage-plan-item:table-test' &&
        JSON.stringify(entry.props.position) === '[5,2,8]',
    ),
  )
  assert(draftElements.some((entry) => entry.props.color === DIA_COLORS.error))
  assert.equal(store.plan.items[0]!.transform.position.x, 1)
  store.draft = null
  assert(all(render()).some((entry) => entry.props.color === DIA_COLORS.blue))
  assert.equal(scene.updates, 0)
  scene.nodes = {
    block_existing: {
      id: 'block_existing',
      type: 'block',
      position: [0, 0, 0],
      rotation: 0,
      parentId: null,
    },
  }
  plan.items[0]!.existingNodeId = 'block_existing'
  assert(
    !all(render()).some((entry) => entry.props.name === 'stage-plan-item:table-test'),
    'existing props use their real model instead of an extra proxy',
  )
  assert(transforms.has('block_existing'), 'existing prop has a live transform')
  assert.deepEqual(live.get('block_existing'), { position: [-1, 0, 1], rotation: 0 })
  assert.equal(scene.updates, 0)
  writes.length = 0
  for (let x = 2; x <= 20; x++) {
    store.draft = structuredClone(plan)
    store.draft.items[0]!.transform.position.x = x
    render()
    assert.deepEqual(live.get('block_existing'), { position: [-x, 0, 1], rotation: 0 })
  }
  assert.equal(writes.length, 19, 'one live transform notification per moving frame')
  assert(
    writes.every((state) => state.has('block_existing')),
    'no frame snaps back to the saved placement',
  )
  render()
  assert.equal(writes.length, 19, 'unchanged render does not republish transforms')
  layers.showGhost = false
  render()
  assert(transforms.has('block_existing'), 'direct dragging stays live with proposal Ghost hidden')
  layers.showGhost = true
  const unlockedNodes = scene.nodes
  scene.nodes = {
    ...unlockedNodes,
    block_existing: {
      ...unlockedNodes.block_existing,
      metadata: { stageLocked: true },
    },
  }
  render()
  assert.equal(transforms.has('block_existing'), false, 'locking removes the live preview')
  scene.nodes = unlockedNodes
  render()
  assert(transforms.has('block_existing'), 'unlocking restores the live preview')
  store.restoreExisting?.()
  assert.equal(transforms.size, 0, 'commit preparation clears owned transforms synchronously')
  store.draft = structuredClone(plan)
  render()
  assert(transforms.has('block_existing'))
  store.suspended = true
  render()
  assert.equal(transforms.size, 0, 'suspending the preview clears its transient placement')
  store.suspended = false
  render()
  placement.draft = { item: structuredClone(plan.items[0]!) }
  placement.draft.item.transform.position.x = 1.25
  render()
  assert.deepEqual(
    live.get('block_existing'),
    { position: [-1.25, 0, 1], rotation: 0 },
    'main movement uses the same real prop transform as Dia',
  )
  placement.draft = null
  render()
  const otherMove = { position: [4, 0, 3], rotation: 0 }
  live.set('block_external', otherMove)
  for (const slot of slots) slot.cleanup?.()
  assert.equal(
    transforms.has('block_existing'),
    false,
    'preview teardown restores original placement',
  )
  assert.equal(
    live.get('block_external'),
    otherMove,
    'preview teardown preserves another tool movement',
  )
  assert.equal(scene.updates, 0)
}
