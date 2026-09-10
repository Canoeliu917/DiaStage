import { afterEach, beforeEach, expect, test } from 'bun:test'
import { clearSceneHistory, type SceneGraph, useScene } from '@pascal-app/core'
import {
  compileStagePlan,
  parseStageText,
  type SceneContextObject,
  type StageCommand,
  StagePlanSchema,
} from '@pascal-app/core/stage'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { readStageDocument } from '../theatre/simulation-store'
import { commandMeta, connectStageCommandExecutor, executeStageCommands } from './command-executor'
import { currentStageContext } from './context'
import { confirmedScriptImport, ScriptImportSchema } from './import-metadata'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

let disconnect: () => void
const typed =
  '建立一个宽8米、深6米的镜框式舞台。舞台中区放一个双人沙发，沙发台右30厘米放一块窗景片，窗景片台右紧邻一块门景片。'
const spoken = typed.replace('8米', '八米').replace('6米', '六米').replace('30厘米', '三十厘米')
const scenery = [
  {
    name: '双人沙发',
    kind: 'sofa',
    x: 0,
    dimensionsMeters: { width: 2, height: 0.85, depth: 0.9 },
  },
  {
    name: '窗景片',
    kind: 'window-flat',
    x: 1.9,
    dimensionsMeters: { width: 1.2, height: 2.1, depth: 0.15 },
  },
  {
    name: '门景片',
    kind: 'door-flat',
    x: 2.95,
    dimensionsMeters: { width: 0.9, height: 2.1, depth: 0.15 },
  },
] as const

function reset() {
  const graph = createTheatreSceneGraph('三入口集成测试')
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
}

function snapshot(): SceneGraph {
  const state = useScene.getState()
  return structuredClone({
    nodes: state.nodes,
    rootNodeIds: state.rootNodeIds,
    collections: state.collections,
    materials: state.materials,
    installedPlugins: state.installedPlugins,
  })
}

function canonical(objects: SceneContextObject[]) {
  const number = (n: number) => Number(n.toFixed(6))
  return objects
    .filter((object) => scenery.some((item) => item.kind === object.kind))
    .map((object) => ({
      name: object.name,
      kind: object.kind,
      position: Object.fromEntries(
        Object.entries(object.transform.position).map(([key, value]) => [key, number(value)]),
      ),
      dimensions: Object.fromEntries(
        Object.entries(object.dimensionsMeters).map(([key, value]) => [key, number(value)]),
      ),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
}

function manualCommands(): StageCommand[] {
  const meta = commandMeta('manual')
  return [
    {
      type: 'CreateStage',
      meta,
      venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: null },
    },
    ...scenery.map(
      (item, index): StageCommand => ({
        type: 'AddScenery',
        meta: { ...meta, commandId: `${meta.commandId}-${index}` },
        nodeId: `manual-${index}`,
        name: item.name,
        kind: item.kind,
        libraryAssetId: null,
        dimensionsMeters: { ...item.dimensionsMeters },
        transform: { position: { x: item.x, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      }),
    ),
  ]
}

function textCommands(text = typed, source: 'voice' | 'typed-command' = 'typed-command') {
  const context = currentStageContext()
  const proposal = parseStageText(text, context, [], source)
  expect(proposal).not.toBeNull()
  const result = compileStagePlan(proposal, context, commandMeta(source))
  expect(result.ok).toBe(true)
  return result.commands
}

beforeEach(() => {
  reset()
  disconnect = connectStageCommandExecutor()
})
afterEach(() => {
  disconnect()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('typed, transcribed Chinese and manual inputs share exact scenery semantics and one undo step', () => {
  const results: ReturnType<typeof canonical>[] = []
  for (const path of ['manual', 'typed-command', 'voice'] as const) {
    reset()
    const before = snapshot()
    const commands =
      path === 'manual' ? manualCommands() : textCommands(path === 'voice' ? spoken : typed, path)
    const result = executeStageCommands(commands)
    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.nodeIds).toHaveLength(3)
    expect(readStageDocument()?.venue.width).toBe(8)
    expect(readStageDocument()?.venue.depth).toBe(6)
    const objects = currentStageContext().objects
    results.push(canonical(objects))
    for (const expected of scenery) {
      const actual = objects.find((object) => object.kind === expected.kind)!
      expect(actual.transform.position.x).toBeCloseTo(expected.x, 6)
      expect(actual.transform.position.y).toBeCloseTo(0, 6)
      expect(actual.transform.position.z).toBeCloseTo(3, 6)
      for (const key of ['width', 'height', 'depth'] as const)
        expect(actual.dimensionsMeters[key]).toBeCloseTo(expected.dimensionsMeters[key], 6)
    }
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(snapshot()).toEqual(before)
    useScene.temporal.getState().redo()
    expect(canonical(currentStageContext().objects)).toEqual(results[results.length - 1])
  }
  expect(results[1]).toEqual(results[0])
  expect(results[2]).toEqual(results[0])
})

test('a saved JSON scene reloads into the same document and accepts subsequent voice movement', () => {
  expect(executeStageCommands(textCommands()).ok).toBe(true)
  const serialized = JSON.stringify(snapshot())
  const saved: SceneGraph = JSON.parse(serialized)
  const beforeReload = canonical(currentStageContext().objects)
  useScene.getState().unloadScene()
  useScene.getState().setScene(saved.nodes, saved.rootNodeIds, saved)
  clearSceneHistory()
  expect(canonical(currentStageContext().objects)).toEqual(beforeReload)
  const sofa = currentStageContext().objects.find((object) => object.kind === 'sofa')!
  const context = currentStageContext([sofa.id])
  const proposal = parseStageText('把它向台前移十厘米', context, [], 'voice')!
  const compiled = compileStagePlan(proposal, context, commandMeta('voice'))
  expect(compiled.ok).toBe(true)
  const beforeMove = snapshot()
  expect(executeStageCommands(compiled.commands).ok).toBe(true)
  expect(
    currentStageContext().objects.find((object) => object.id === sofa.id)?.transform.position.z,
  ).toBeCloseTo(2.9, 6)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(snapshot()).toEqual(beforeMove)
})

test('a stage changed after preview rejects the whole stale plan without overwriting manual work', () => {
  const preview = textCommands()
  const add: StageCommand = {
    type: 'AddScenery',
    meta: commandMeta(),
    nodeId: 'manual-chair',
    name: '排练椅',
    kind: 'chair',
    libraryAssetId: null,
    dimensionsMeters: { width: 0.5, height: 0.85, depth: 0.5 },
    transform: { position: { x: -3, y: 0, z: 1 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
  expect(executeStageCommands([add]).ok).toBe(true)
  const afterManual = snapshot()
  const historyCount = useScene.temporal.getState().pastStates.length
  const result = executeStageCommands(preview)
  expect(result.ok).toBe(false)
  expect(result.error).toContain('舞台在预览后发生了变化')
  expect(snapshot()).toEqual(afterManual)
  expect(useScene.temporal.getState().pastStates).toHaveLength(historyCount)
})

test('forbidden schemas, ambiguous input and a bad later command never create partial scenery', () => {
  const before = snapshot()
  const context = currentStageContext()
  const blocked = parseStageText('建立宽8米深6米的舞台，添加一盏灯', context)!
  expect(compileStagePlan(blocked, context, commandMeta()).commands).toEqual([])
  const ambiguous = parseStageText('把它向右边移半米', { ...context, selectedObjectIds: [] })!
  expect(compileStagePlan(ambiguous, context, commandMeta()).commands).toEqual([])
  const proposal = parseStageText(typed, context)!
  for (const field of ['lighting', 'scene', 'beat', 'objective', 'room', 'code']) {
    expect(StagePlanSchema.safeParse({ ...proposal, [field]: {} }).success).toBe(false)
  }
  const commands = manualCommands()
  const result = executeStageCommands([
    ...commands,
    { type: 'AddLight', meta: { ...commands[0]!.meta, commandId: 'forbidden' }, power: 100 },
  ])
  expect(result.ok).toBe(false)
  expect(snapshot()).toEqual(before)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  expect(executeStageCommands(manualCommands()).ok).toBe(true)
})

test('confirmed script evidence saves and undoes with its objects; invalid metadata writes nothing', () => {
  const context = currentStageContext()
  const plan = StagePlanSchema.parse({ ...parseStageText(typed, context), source: 'script' })
  plan.evidence = [
    {
      id: 'included',
      page: 1,
      paragraph: null,
      excerpt: '舞台中区放双人沙发。',
      certainty: 'stated',
    },
    {
      id: 'excluded',
      page: 2,
      paragraph: null,
      excerpt: '未选中的另一处空间。',
      certainty: 'stated',
    },
  ]
  plan.items[0]!.evidenceIds = ['included']
  const meta = commandMeta('script')
  const record = confirmedScriptImport(
    plan,
    { name: '测试剧本.pdf', type: 'pdf', sizeBytes: 1024, pageCount: 2, paragraphCount: null },
    meta.transactionId,
  )
  expect(record.evidence.map((item) => item.id)).toEqual(['included'])
  expect(ScriptImportSchema.safeParse({ ...record, fullText: '不保存全文' }).success).toBe(false)
  const compiled = compileStagePlan(plan, context, meta)
  const before = snapshot()
  expect(executeStageCommands(compiled.commands, { ...record, id: 'wrong-batch' }).ok).toBe(false)
  expect(snapshot()).toEqual(before)
  expect(executeStageCommands(compiled.commands, record).ok).toBe(true)
  expect(readStageDocument()?.importMetadata).toEqual([record])
  const saved = snapshot()
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(snapshot()).toEqual(before)
  useScene.temporal.getState().redo()
  expect(snapshot()).toEqual(saved)
  useScene.getState().setScene(saved.nodes, saved.rootNodeIds, saved)
  expect(readStageDocument()?.importMetadata).toEqual([record])
})
