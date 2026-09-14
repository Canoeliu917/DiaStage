import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import {
  compileStagePlan,
  type StageCommand,
  stageFootprintGap,
  stageObjectFootprints,
  stageObjectsTouch,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { SceneJournal } from '../scene-journal'
import { commandMeta, executeStageCommands } from '../stage/command-executor'
import { currentStageContext } from '../stage/context'
import { useStagePlanPreview } from '../stage/plan-preview'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { bindRehearsalScene } from './authority'
import { DiaConversation } from './conversation-controller'
import { groundLanguage } from './language-grounding'
import { compileStageProposalPreview } from './stage-proposal-runtime'
import { STAGE_PROPOSAL_CASES, stageProposalEvalContext } from './stage-proposal-test-fixture'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

for (const row of STAGE_PROPOSAL_CASES)
  test(`C. Runtime / Proposal Eval ${row.id}: ${row.input}`, () => {
    const context = stageProposalEvalContext(row)
    const placement = groundLanguage(row.input, context)!.placement!
    const result = compileStageProposalPreview(placement, context)
    expect(result.kind).toBe(row.expected.runtime)
    if (result.kind !== 'plan') return

    const action = placement.actions[0]
    if (action?.type === 'stack_on') {
      const item = result.plan.items[0]!
      const target = context.objects.find((object) => object.id === action.targetId)!
      expect(item.transform.position.x).toBe(target.transform.position.x)
      expect(item.transform.position.z).toBe(target.transform.position.z)
      expect(item.transform.position.y).toBeCloseTo(0.3, 8)
    }
    if (action?.type === 'connect_edge') {
      const item = result.plan.items[0]!
      const original = context.objects.find((object) => object.id === action.subjectId)!
      const target = context.objects.find((object) => object.id === action.targetId)!
      const moved = { ...original, transform: item.transform }
      const gap = Math.min(
        ...stageObjectFootprints(moved).flatMap((left) =>
          stageObjectFootprints(target).map((right) => stageFootprintGap(left, right).meters),
        ),
      )
      expect(gap).toBeLessThan(1e-6)
      expect(stageObjectsTouch(moved, target)).toBe(true)
      expect(validateStagePlan(result.plan, context).valid).toBe(true)
      const delta = Math.abs(item.transform.rotationDegrees.y - target.transform.rotationDegrees.y)
      expect(action.angleDegrees === 90 ? delta % 180 : delta % 360).toBe(action.angleDegrees)
    }
    if (placement.intent.kind === 'stage_left') {
      expect(result.plan.relations[0]?.direction).toBe('stage-left')
      expect(
        validateStagePlan(result.plan, context).plan.items[0]!.transform.position.x,
      ).toBeLessThan(0)
    }
    if (placement.intent.kind === 'audience_left') {
      expect(result.plan.relations[0]?.direction).toBe('stage-right')
      expect(
        validateStagePlan(result.plan, context).plan.items[0]!.transform.position.x,
      ).toBeGreaterThan(0)
    }
  })

test('C. runtime compiles only validated Knowledge actions', () => {
  const row = STAGE_PROPOSAL_CASES[6]!
  const context = stageProposalEvalContext(row)
  const placement = structuredClone(groundLanguage(row.input, context)!.placement!)
  placement.actions = []
  expect(compileStageProposalPreview(placement, context).kind).toBe('plan')

  placement.knowledgeProposal!.actions = []
  expect(compileStageProposalPreview(placement, context)).toMatchObject({ kind: 'no_preview' })

  const stackRow = STAGE_PROPOSAL_CASES[0]!
  const stackContext = stageProposalEvalContext(stackRow)
  const stack = structuredClone(groundLanguage(stackRow.input, stackContext)!.placement!)
  stack.actions = []
  expect(compileStageProposalPreview(stack, stackContext)).toMatchObject({ kind: 'no_preview' })
})

test('C. stack refuses an occupied requested support instead of overlapping it', () => {
  const row = STAGE_PROPOSAL_CASES[0]!
  const context = stageProposalEvalContext(row)
  const target = context.objects.find((object) => object.id === 'platform-1')!
  context.objects.push({
    ...structuredClone(target),
    id: 'platform-3',
    name: '三号台块',
    transform: {
      ...structuredClone(target.transform),
      position: { ...target.transform.position, y: 0.3 },
    },
  })
  const placement = groundLanguage(row.input, context)!.placement!
  expect(compileStageProposalPreview(placement, context)).toMatchObject({ kind: 'no_preview' })

  const nonStackable = stageProposalEvalContext(row)
  nonStackable.objects.push({
    id: 'shelf-on-platform',
    name: '台块上的架子',
    kind: 'shelf',
    dimensionsMeters: { width: 1, height: 0.3, depth: 1 },
    transform: {
      position: { x: -1.5, y: 0.3, z: 2 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
    },
  })
  expect(
    compileStageProposalPreview(groundLanguage(row.input, nonStackable)!.placement!, nonStackable),
  ).toMatchObject({ kind: 'no_preview' })
})

test('C. scenic connection rejects vertical mismatch and chooses an in-bounds free alternative', () => {
  const row = STAGE_PROPOSAL_CASES[1]!
  const elevated = stageProposalEvalContext(row)
  elevated.objects.find((object) => object.id === 'flat-a')!.transform.position.y = 3
  expect(
    compileStageProposalPreview(groundLanguage(row.input, elevated)!.placement!, elevated),
  ).toMatchObject({ kind: 'no_preview' })

  const bounded = stageProposalEvalContext(row)
  bounded.objects = bounded.objects.filter((object) => ['flat-a', 'flat-b'].includes(object.id))
  bounded.objects.find((object) => object.id === 'flat-a')!.transform.position = {
    x: 4,
    y: 0,
    z: 4,
  }
  bounded.objects.find((object) => object.id === 'flat-b')!.transform.position = {
    x: 4.8,
    y: 0,
    z: 4,
  }
  const result = compileStageProposalPreview(
    groundLanguage(row.input, bounded)!.placement!,
    bounded,
  )
  expect(result.kind).toBe('plan')
  if (result.kind !== 'plan') return
  expect(result.plan.items[0]!.transform.position.x).toBeCloseTo(2, 6)
  expect(validateStagePlan(result.plan, bounded).valid).toBe(true)
})

test('C. proposal creation, Ghost and Cancel leave Formal Scene and history untouched', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  let commits = 0
  const stop = subscribeSceneCommits(() => commits++)
  try {
    const row = STAGE_PROPOSAL_CASES[1]!
    const context = stageProposalEvalContext(row)
    const before = useScene.getState().nodes
    const placement = groundLanguage(row.input, context)!.placement!
    const result = compileStageProposalPreview(placement, context)
    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') return
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    useStagePlanPreview.setState({ plan: result.plan })
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    useStagePlanPreview.setState({ plan: null })
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(commits).toBe(0)
    for (const index of [3, 4, 5, 8, 9]) {
      const blockedRow = STAGE_PROPOSAL_CASES[index]!
      const blockedContext = stageProposalEvalContext(blockedRow)
      const blocked = groundLanguage(blockedRow.input, blockedContext)!.placement!
      expect(compileStageProposalPreview(blocked, blockedContext).kind).toBe('no_preview')
    }
    for (const unsupported of ['让灯光变红', '最高任务是什么', '帮我训练独白重音'])
      expect(groundLanguage(unsupported, context)?.placement).toBeUndefined()
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(commits).toBe(0)
  } finally {
    useStagePlanPreview.setState({ plan: null, draft: null })
    stop()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})

test('C. only Accept creates one transaction and Undo/Redo restore the proposal', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  try {
    const meta = commandMeta('typed-command')
    const add = (nodeId: string, name: string, x: number, commandId: string): StageCommand => ({
      type: 'AddScenery',
      meta: { ...meta, commandId },
      nodeId,
      name,
      kind: 'platform',
      libraryAssetId: null,
      dimensionsMeters: { width: 1, height: 0.3, depth: 1 },
      transform: { position: { x, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    })
    expect(
      executeStageCommands([
        add('platform-1', '一号台块', -1.5, `${meta.transactionId}:1`),
        add('platform-2', '二号台块', 1.5, `${meta.transactionId}:2`),
      ]).ok,
    ).toBe(true)
    clearSceneHistory()
    const context = currentStageContext([])
    const placement = groundLanguage('把二号台块叠在一号台块上。', context)!.placement!
    const preview = compileStageProposalPreview(placement, context)
    expect(preview.kind).toBe('plan')
    if (preview.kind !== 'plan') return
    const before = JSON.stringify(useScene.getState().nodes)
    useStagePlanPreview.setState({ plan: preview.plan })
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
    useStagePlanPreview.setState({ plan: null })
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)

    let commits = 0
    const stop = subscribeSceneCommits(() => commits++)
    const compiled = compileStagePlan(preview.plan, context, {
      transactionId: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
    })
    expect(compiled.ok).toBe(true)
    expect(executeStageCommands(compiled.commands).ok).toBe(true)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    expect(commits).toBe(1)
    const accepted = JSON.stringify(useScene.getState().nodes)
    expect(accepted).not.toBe(before)
    useScene.temporal.getState().undo()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
    useScene.temporal.getState().redo()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(accepted)
    stop()
  } finally {
    useStagePlanPreview.setState({ plan: null, draft: null })
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})

test('C. Dia routes Knowledge through Ghost, Cancel and one-transaction Accept', async () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const sceneId = crypto.randomUUID()
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
  let queue = Promise.resolve()
  const stopJournal = subscribeSceneCommits(() => {
    const snapshot = useScene.getState()
    queue = queue.then(() => journal.append(snapshot))
  })
  const meta = commandMeta('typed-command')
  const add = (nodeId: string, name: string, x: number, commandId: string): StageCommand => ({
    type: 'AddScenery',
    meta: { ...meta, commandId },
    nodeId,
    name,
    kind: 'platform',
    libraryAssetId: null,
    dimensionsMeters: { width: 1, height: 0.3, depth: 1 },
    transform: { position: { x, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  })
  expect(
    executeStageCommands([
      add('platform-1', '一号台块', -1.5, `${meta.transactionId}:1`),
      add('platform-2', '二号台块', 1.5, `${meta.transactionId}:2`),
    ]).ok,
  ).toBe(true)
  await queue
  clearSceneHistory()
  const dia = new DiaConversation(sceneId, () => null, undefined, false)
  let commits = 0
  const stopCounter = subscribeSceneCommits(() => commits++)
  try {
    await dia.load()
    await dia.send('把二号台块叠在一号台块上。')
    expect(dia.buildProposal()?.knowledgeProposal?.actions[0]?.type).toBe('stack_on')
    const originalPlan = structuredClone(dia.buildProposal()!.plan)
    const editedPlan = structuredClone(originalPlan)
    editedPlan.items[0]!.transform.position.x += 1
    dia.editBuild(editedPlan)
    expect(dia.buildProposal()?.plan).toEqual(originalPlan)
    await dia.previewBuild(editedPlan)
    expect(dia.buildProposal()?.status).toBe('proposed')
    expect(useStagePlanPreview.getState().plan).toBeNull()
    const before = JSON.stringify(useScene.getState().nodes)
    await dia.preview()
    expect(dia.buildProposal()?.status).toBe('previewed')
    expect(useStagePlanPreview.getState().plan).not.toBeNull()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
    expect(commits).toBe(0)
    await dia.reject()
    expect(useStagePlanPreview.getState().plan).toBeNull()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
    expect(commits).toBe(0)

    await dia.send('把二号台块叠在一号台块上。')
    await dia.preview()
    await dia.adopt()
    await queue
    expect(commits).toBe(1)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    const accepted = JSON.stringify(useScene.getState().nodes)
    expect(accepted).not.toBe(before)
    useScene.temporal.getState().undo()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
    useScene.temporal.getState().redo()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(accepted)
  } finally {
    dia.dispose()
    stopCounter()
    stopJournal()
    unbind()
    useStagePlanPreview.setState({ plan: null, draft: null })
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
