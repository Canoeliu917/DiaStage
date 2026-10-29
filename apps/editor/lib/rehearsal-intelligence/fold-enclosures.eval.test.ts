import 'fake-indexeddb/auto'
import { beforeAll, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { compileStagePlan, parseStageText, type SceneContextSummary } from '@pascal-app/core/stage'
import { applyItemFoldControls } from '@pascal-app/nodes/item-fold'
import { Box3, DoubleSide, type Group, type Mesh, Raycaster, Vector3 } from 'three'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { SceneJournal } from '../scene-journal'
import { groundStageAssets } from '../stage/ground-assets'
import { createManualStageGraph } from '../stage/initial-stage'
import { useStagePlanPreview } from '../stage/plan-preview'
import { bindRehearsalScene } from './authority'
import { DiaConversation } from './conversation-controller'
import { groundLanguage } from './language-grounding'

const context: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}
const transaction = { transactionId: 'fold-enclosure-eval', issuedAt: '2026-10-27T00:00:00Z' }
const cases = readFileSync(
  new URL('../../../../DiaMotif/evals/fold-enclosures.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map(
    (line) =>
      JSON.parse(line) as {
        id: string
        input: string
        asset?: string
        count?: number
        question?: string
      },
  )

for (const item of cases)
  test(`fold enclosure language: ${item.id}`, () => {
    const before = structuredClone(context)
    const plan = parseStageText(item.input, context)
    expect(plan).not.toBeNull()
    if (item.question) {
      expect(plan!.questions.map((question) => question.id)).toContain(item.question)
      expect(plan!.items).toEqual([])
      expect(compileStagePlan(plan, context, transaction).commands).toEqual([])
    } else {
      expect(plan!.questions).toEqual([])
      expect(plan!.items.map((proposal) => proposal.libraryAssetId)).toEqual(
        Array(item.count).fill(item.asset),
      )
      const grounded = groundLanguage(item.input, context)!
      expect(grounded.capability).toBe('build')
      expect(grounded.intent).toBe('ADD_SCENERY')
    }
    expect(context).toEqual(before)
  })

test('templates state quantity, native right-angle pose, outer size and audience opening without scaling', () => {
  for (const [input, width] of [
    ['用二连搭个房间', 1.88],
    ['用三联搭个房间', 0.98],
  ] as const) {
    const plan = groundStageAssets(parseStageText(input, context)!)
    expect(plan.questions).toEqual([])
    const assumptions = plan.assumptions.map((item) => item.message).join('；')
    for (const value of ['90', String(width), '0.94', '观众', '中区'])
      expect(assumptions).toContain(value)
    const compiled = compileStagePlan(plan, context, transaction)
    expect(compiled.ok).toBe(true)
    expect(compiled.commands.every((command) => command.type === 'AddScenery')).toBe(true)
    expect(compiled.commands).toHaveLength(plan.items.length)
  }
})

test('folding existing scenery remains a placement operation rather than new room creation', () => {
  const grounded = groundLanguage('三联景片折成U形', context)!
  expect(grounded.capability).toBe('placement')
  expect(grounded.intent).toBe('fold_hinge')
  expect(grounded.plan).toBeUndefined()
})

test('controller creates a local proposal or asks a fold clarification without calling a provider or writing the scene', async () => {
  globalThis.requestAnimationFrame ??= () => 0
  globalThis.cancelAnimationFrame ??= () => {}
  const graph = createManualStageGraph(context.venue!)
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const sceneId = crypto.randomUUID()
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
  const dia = new DiaConversation(sceneId, () => null, undefined, false)
  const originalFetch = globalThis.fetch
  let requests = 0,
    commits = 0
  globalThis.fetch = (async () => {
    requests++
    throw new Error('provider must not be called')
  }) as unknown as typeof fetch
  const stop = subscribeSceneCommits(() => commits++)
  try {
    await dia.load()
    clearSceneHistory()
    const before = useScene.getState().nodes
    for (const input of ['用一组二连搭三面围合空间', '用二连搭个房间，宽3米深2米']) {
      const expected = groundLanguage(input, context)!
      expect(expected.capability).toBe('clarify')
      await dia.send(input)
      expect(dia.store.getState().thread!.messages.at(-1)!.content).toBe(expected.clarification!)
      expect(dia.buildProposal()).toBeUndefined()
      expect(dia.store.getState().thread!.status).toBe('idle')
    }
    await dia.send('请用二连给我生成一个3面包围式空间')
    expect(dia.buildProposal()?.status).toBe('proposed')
    expect(dia.buildProposal()?.plan.items).toHaveLength(2)
    await dia.adopt()
    expect(dia.buildProposal()?.status).toBe('proposed')
    await dia.preview()
    const previewed = dia.buildProposal()
    const preview = useStagePlanPreview.getState().plan
    expect(previewed?.status).toBe('previewed')
    expect(preview).not.toBeNull()
    await dia.send('用二连搭个房间，宽3米深2米')
    expect(dia.buildProposal()).toBe(previewed)
    expect(useStagePlanPreview.getState().plan).toBe(preview)
    expect(dia.store.getState().thread!.status).toBe('waiting-human')
    expect(requests).toBe(0)
    expect(commits).toBe(0)
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  } finally {
    globalThis.fetch = originalFetch
    stop()
    dia.dispose()
    unbind()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})

test('missing venue, insufficient room and wall penetration clarify instead of forcing the template', () => {
  for (const [scene, question] of [
    [{ ...context, venue: null }, 'fold-enclosure-venue'],
    [{ ...context, venue: { ...context.venue!, widthMeters: 1 } }, 'fold-enclosure-space'],
    [
      {
        ...context,
        objects: [
          {
            id: 'obstacle',
            name: '箱子',
            kind: 'neutral-block',
            dimensionsMeters: { width: 0.4, depth: 0.4, height: 0.4 },
            transform: { position: { x: 0.92, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
          },
        ],
      },
      'fold-enclosure-space',
    ],
  ] as const) {
    const plan = parseStageText('用二连搭个房间', scene as SceneContextSummary)!
    expect(plan.questions.map((item) => item.id)).toContain(question)
    expect(plan.items).toEqual([])
    expect(compileStagePlan(plan, scene as SceneContextSummary, transaction).commands).toEqual([])
  }
  expect(parseStageText('用二连搭个房间，宽1.88米深0.94米', context)!.questions).toEqual([])
})

test('furniture may remain inside the hollow enclosure and room words never add a roof', () => {
  const scene: SceneContextSummary = {
    ...context,
    objects: [
      {
        id: 'inside',
        name: '方墩',
        kind: 'neutral-block',
        dimensionsMeters: { width: 0.2, depth: 0.2, height: 0.45 },
        transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      },
    ],
  }
  for (const input of ['用二连搭个房间', '用三联搭个长方体空间', '用二帘组合搭一个房屋']) {
    const plan = groundStageAssets(parseStageText(input, scene)!)
    expect(plan.questions).toEqual([])
    expect(compileStagePlan(plan, scene, transaction).ok).toBe(true)
    expect(plan.items.every((item) => item.kind === 'scenic-flat')).toBe(true)
  }
  for (const input of [
    '用三联搭个房间，加屋顶',
    '用二连搭个房间，再加门景片',
    '给我装修一个房间',
  ]) {
    const plan = parseStageText(input, context)!
    expect(plan.questions.length).toBeGreaterThan(0)
    expect(plan.items).toEqual([])
    expect(compileStagePlan(plan, context, transaction).commands).toEqual([])
  }
})

const models = new Map<string, Group>()
beforeAll(async () => {
  for (const id of ['SCN-FOLD-02', 'SCN-FOLD-03']) {
    const bytes = readFileSync(
      new URL(`../../public/stage-library/models/${id}.glb`, import.meta.url),
    )
    models.set(
      id,
      (
        await new ItemGLTFLoader().parseAsync(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          '',
        )
      ).scene,
    )
  }
})

for (const [input, width] of [
  ['用二连搭个房间', 1.88],
  ['用三联搭个房间', 0.98],
] as const)
  test(`native GLB template has three real sides, no front wall and a surface-only junction: ${input}`, () => {
    const plan = parseStageText(input, context)!
    expect(plan.questions).toEqual([])
    const roots = plan.items.map((item) => {
      const root = models.get(item.libraryAssetId!)!.clone(true)
      applyItemFoldControls(root)
      root.position.set(
        item.transform.position.x,
        item.transform.position.y,
        item.transform.position.z,
      )
      root.rotation.y = (item.transform.rotationDegrees.y * Math.PI) / 180
      root.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh) {
          const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
            (material) => {
              const copy = material.clone()
              copy.side = DoubleSide
              return copy
            },
          )
          mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!
        }
      })
      root.updateWorldMatrix(true, true)
      return root
    })
    const boxes = roots.map((root) => new Box3().setFromObject(root, true))
    const bounds = boxes.reduce((result, box) => result.union(box), new Box3())
    expect(bounds.getSize(new Vector3()).x).toBeCloseTo(width, 6)
    expect(bounds.getSize(new Vector3()).z).toBeCloseTo(0.94, 6)
    expect(bounds.getSize(new Vector3()).y).toBeCloseTo(2.4, 6)
    expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0, 6)
    expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(3, 6)
    const origin = new Vector3(0.1, 1.2, 3)
    for (const direction of [new Vector3(-1, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)])
      expect(new Raycaster(origin, direction).intersectObjects(roots, true).length).toBeGreaterThan(
        0,
      )
    expect(new Raycaster(origin, new Vector3(0, 0, -1)).intersectObjects(roots, true)).toEqual([])
    if (boxes.length === 2) {
      expect(boxes[1]!.min.x - boxes[0]!.max.x).toBeCloseTo(0, 6)
      const overlap = boxes[0]!.clone().intersect(boxes[1]!).getSize(new Vector3())
      expect(overlap.x).toBeLessThan(1e-6)
    }
    for (const root of roots)
      root.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh)
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            material.dispose()
      })
  })
