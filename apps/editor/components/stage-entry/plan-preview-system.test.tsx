import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.BUILD_GHOST_RUNTIME_TEST) {
  test('Build Ghost follows layer visibility and venue-only proposals remain read-only', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, BUILD_GHOST_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
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
  const store = { plan }
  const scene = { rootNodeIds: ['site-test'], nodes: {}, updates: 0 }
  const editor = { isPreviewMode: false, isFirstPersonMode: false, isCaptureMode: false }
  const layers = { showGhost: true }
  const frame = { origin: [3, 2, 7] as [number, number, number], depthMeters: 6 }
  const hook =
    <T,>(value: T) =>
    (select: (value: T) => unknown) =>
      select(value)
  mock.module('@pascal-app/core', () => ({ useScene: hook(scene) }))
  mock.module('@pascal-app/editor', () => ({ useEditor: hook(editor) }))
  mock.module('@react-three/drei', () => ({ Html: () => null }))
  mock.module('../../lib/stage/context', () => ({ stageFrame: () => frame }))
  mock.module('../../lib/stage/plan-preview', () => ({ useStagePlanPreview: hook(store) }))
  mock.module('../../lib/stage/scenery', () => ({
    SCENERY_ROUND_SEGMENTS: 24,
    sceneryProxyParts: () => [{ shape: 'box', size: [1, 0.75, 1], position: [0, 0.375, 0] }],
  }))
  mock.module('../theatre/simulation-panel', () => ({ useSimulationSelection: hook(layers) }))
  const { StagePlanPreviewSystem } = await import('./plan-preview-system')
  type Element = { type: unknown; props: Record<string, unknown> }
  const all = (element: unknown): Element[] => {
    if (Array.isArray(element)) return element.flatMap(all)
    if (!element || typeof element !== 'object' || !('props' in element)) return []
    const entry = element as Element
    return [entry, ...all(entry.props.children)]
  }
  const before = JSON.stringify({ scene, plan })
  const elements = all(StagePlanPreviewSystem({ enabled: true }))
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
  assert.equal(StagePlanPreviewSystem({ enabled: true }), null)
  layers.showGhost = true
  assert.equal(StagePlanPreviewSystem({ enabled: false }), null)
  for (const mode of ['isPreviewMode', 'isFirstPersonMode', 'isCaptureMode'] as const) {
    editor[mode] = true
    assert.equal(StagePlanPreviewSystem({ enabled: true }), null)
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
  const withItem = all(StagePlanPreviewSystem({ enabled: true }))
  assert.equal(withItem.filter((entry) => entry.type === 'mesh').length, 6)
  assert(withItem.some((entry) => JSON.stringify(entry.props.position) === '[2,2,8]'))
  assert.equal(scene.updates, 0)
}
