import 'fake-indexeddb/auto'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import {
  editStageDocument,
  moveSimulationPerformer,
  readStageDocument,
} from '../theatre/simulation-store'
import {
  applyHumanDecision,
  clearProposalGhost,
  makeFeedback,
  observeRehearsalFeedback,
  previewProposal,
  useProposalGhost,
} from './authority'
import { buildRehearsalContext } from './context'
import { ACTIVE_DIMENSIONS } from './dimensions'
import { evalContext, evaluateResults } from './eval'
import { EVAL_CASES } from './eval-cases'
import { readFeedbackLog, saveFeedback, saveInteraction, saveTrainingConsent } from './feedback'
import { compileProposal } from './proposal-compiler'
import { createInteraction } from './proposal-generator'
import { validateContext, validateProposal } from './proposal-validator'
import { type RehearsalContext, type RehearsalProposal, SuggestionSchema } from './schema'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('100 distinct eval candidates stay unreviewed; missing model results cannot pass beta quality gates', () => {
  expect(EVAL_CASES).toHaveLength(100)
  expect(new Set(EVAL_CASES.map((c) => c.caseId)).size).toBe(100)
  expect(new Set(EVAL_CASES.map((c) => c.intention)).size).toBe(100)
  for (const item of EVAL_CASES) {
    expect(item.humanReviewed).toBe(false)
    expect(() => validateContext(evalContext(item.caseId))).not.toThrow()
  }
  expect(evaluateResults([])).toMatchObject({
    evaluated: 0,
    structuralPassed: 0,
    humanReviewed: 0,
    semanticPassed: 0,
  })
})

test('moving a performer translates its existing route once and is undone in one step', () => {
  setup()
  editStageDocument((d) => {
    d.rehearsalSimulation.paths = [
      {
        id: 'path',
        performerId: 'a',
        points: [
          [-2, 0, 0],
          [-1, 0, 0],
        ],
        durationSeconds: 3,
        visible: true,
      },
    ]
  })
  const before = useScene.getState().nodes
  clearSceneHistory()
  moveSimulationPerformer('a', [-2, 0, 1])
  expect(readStageDocument()!.rehearsalSimulation.paths[0]!.points).toEqual([
    [-2, 0, 1],
    [-1, 0, 1],
  ])
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes).toEqual(before)
  expect(() => moveSimulationPerformer('a', [NaN, 0, 0])).toThrow()
  expect(useScene.getState().nodes).toEqual(before)
})
afterEach(() => {
  clearProposalGhost()
  useScene.getState().setReadOnly(false)
  useScene.getState().unloadScene()
  clearSceneHistory()
})

function setup() {
  const graph = createTheatreSceneGraph('排演伙伴测试')
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  editStageDocument((d) => {
    d.rehearsalSimulation.performers = [
      { id: 'a', name: '甲', color: '#888888', position: [-2, 0, 0], facing: 0, visible: true },
      { id: 'b', name: '乙', color: '#aaaaaa', position: [2, 0, 0], facing: 0, visible: true },
    ]
  })
  const context = buildRehearsalContext(
    crypto.randomUUID(),
    readStageDocument()!,
    useScene.getState().nodes,
    {
      script: '甲希望乙留下。',
      intention: '甲尝试靠近，乙留在原地。',
      directorIntention: '',
      selectedPerformerId: 'a',
    },
  )
  const interaction = createInteraction(
    context,
    {
      dramaticState: [],
      proposals: [
        {
          title: '试着靠近',
          intention: '尝试缩短距离',
          rationale: '可以试试以距离变化邀请乙留下，不保证乙接受。',
          suggestions: [
            {
              id: 's1',
              performerId: 'a',
              intention: '甲尝试靠近乙',
              movement: 'approach',
              targetPerformerId: 'b',
              zone: null,
              extent: 'small',
              pace: 'slow',
            },
            {
              id: 's2',
              performerId: 'b',
              intention: '乙暂不回应',
              movement: 'hold',
              targetPerformerId: null,
              zone: null,
              extent: 'small',
              pace: 'slow',
            },
          ],
          alternatives: ['下一轮也可以试试甲保持位置'],
          evidence: [{ source: 'script', quote: '甲希望乙留下。' }],
          confidence: 0.5,
        },
      ],
    },
    'test-fixture-not-real-model',
  )
  clearSceneHistory()
  return { context, interaction, proposal: interaction.proposals[0]! }
}

test('strict proposal contains intentions, not AI coordinates; context rejects invalid references/numbers/dimensions', () => {
  const { context, proposal } = setup()
  expect(
    SuggestionSchema.safeParse({ ...proposal.suggestions[0], position: [1, 2, 3] }).success,
  ).toBe(false)
  expect(() => validateContext({ ...context, selectedPerformerId: 'missing' })).toThrow()
  expect(() => validateContext({ ...context, durationSeconds: Number.NaN })).toThrow()
  expect(() =>
    validateContext({ ...context, activeDimensions: Array(8).fill('character') }),
  ).toThrow()
  expect(() =>
    validateProposal(context, {
      ...proposal,
      evidence: [{ source: 'script', quote: '他们是夫妻' }],
    }),
  ).toThrow('未提供')
  expect(() => validateProposal(context, { ...proposal, title: '唯一正确答案' })).toThrow('导演')
  expect(proposal.activeDimensions).toEqual([...ACTIVE_DIMENSIONS])
})

test('compiler is deterministic, leaves input unchanged, uses meters and actor stage-left +X', () => {
  const { context, proposal } = setup(),
    before = JSON.stringify(context)
  const result = compileProposal(context, proposal)
  expect(result).toEqual(compileProposal(context, proposal))
  expect(result.paths[0]!.points).toEqual([
    [-2, 0, 0],
    [-1.4, 0, 0],
  ])
  expect(result.paths[0]!.durationSeconds).toBeCloseTo(3)
  expect(JSON.stringify(context)).toBe(before)
  const left: RehearsalProposal = {
    ...proposal,
    suggestions: [
      {
        ...proposal.suggestions[0]!,
        movement: 'toward-zone',
        targetPerformerId: null,
        zone: 'stage-left',
      },
    ],
  }
  expect(compileProposal(context, left).paths[0]!.points[1]![0]).toBeGreaterThan(-2)
  expect(() =>
    compileProposal({ ...context, venue: { ...context.venue, width: 2 } }, proposal),
  ).toThrow('边界')
})

test('compiler rejects crossing scenery and colliding people without shrinking or moving obstacles', () => {
  const { context, proposal } = setup()
  const obstacle = {
    id: 'flat',
    name: '景片',
    min: [-1.8, 0, -1],
    max: [-1.7, 2, 1],
  } satisfies RehearsalContext['obstacles'][number]
  expect(() => compileProposal({ ...context, obstacles: [obstacle] }, proposal)).toThrow('景片')
  const close = structuredClone(context)
  close.performers[1]!.position = [-1.7, 0, 0]
  expect(() =>
    compileProposal(close, { ...proposal, suggestions: [proposal.suggestions[1]!] }),
  ).toThrow('距离不足')
})

test('preview/reject write no official nodes; missing preview, changed preview and stale context reject adoption', async () => {
  const { interaction, proposal } = setup(),
    before = useScene.getState().nodes
  const signal = new AbortController().signal
  await expect(
    applyHumanDecision(interaction, proposal, 'adopt', proposal.suggestions, '', signal),
  ).rejects.toThrow('先预览')
  await previewProposal(interaction, proposal)
  expect(useScene.getState().nodes).toBe(before)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  await saveFeedback(makeFeedback(interaction, proposal, 'reject'))
  expect(useScene.getState().nodes).toBe(before)
  const changed = [{ ...proposal.suggestions[0]!, extent: 'medium' as const }]
  await expect(
    applyHumanDecision(interaction, proposal, 'edit', changed, '', signal),
  ).rejects.toThrow('调整后的')
  editStageDocument((d) => {
    d.rehearsalSimulation.performers[0]!.position[0] = -2.2
  })
  await expect(previewProposal(interaction, proposal)).rejects.toThrow('变化')
})

for (const decision of ['adopt', 'partial', 'edit'] as const)
  test(`${decision}: durable adoption is one undo, restores after reopening, keeps private feedback`, async () => {
    const { interaction, proposal } = setup()
    const before = useScene.getState().nodes
    const journal = new SceneJournal(interaction.sceneId)
    await journal.recover(useScene.getState(), 1)
    let writes = Promise.resolve()
    const stop = subscribeSceneCommits((commit) => {
      writes = writes.then(() => journal.append(commit.current))
    })
    const chosen =
      decision === 'adopt'
        ? proposal.suggestions
        : decision === 'partial'
          ? [proposal.suggestions[0]!]
          : [{ ...proposal.suggestions[0]!, extent: 'medium' as const }]
    try {
      await saveInteraction(interaction)
      await previewProposal(interaction, { ...proposal, suggestions: chosen })
      await applyHumanDecision(
        interaction,
        proposal,
        decision,
        chosen,
        '我想试试这个距离',
        new AbortController().signal,
      )
      await writes
      const after = useScene.getState().nodes
      expect(after).not.toBe(before)
      expect(useScene.temporal.getState().pastStates).toHaveLength(1)
      const log = await readFeedbackLog(interaction.sceneId)
      expect(log.interactions[0]!.trainingAuthorized).toBe(false)
      expect(log.events.find((e) => e.decision === decision)?.status).toBe('applied')
      expect(useProposalGhost.getState().simulation).toBeNull()
      const reopened = new SceneJournal(interaction.sceneId)
      expect(
        (await reopened.recover({ ...useScene.getState(), nodes: before }, 1)).graph.nodes,
      ).toEqual(after)

      useScene.temporal.getState().undo()
      expect(useScene.getState().nodes).toEqual(before)
      await writes
      await saveTrainingConsent(interaction.sceneId, true)
      expect((await readFeedbackLog(interaction.sceneId)).interactions[0]!.trainingAuthorized).toBe(
        false,
      )
    } finally {
      stop()
    }
  })

test('feedback quota failure and aborted preview never apply or leave a ghost', async () => {
  const { interaction, proposal } = setup()
  await previewProposal(interaction, proposal)
  const before = useScene.getState().nodes
  const put = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
    throw new DOMException('quota test', 'QuotaExceededError')
  })
  try {
    await expect(
      applyHumanDecision(
        interaction,
        proposal,
        'adopt',
        proposal.suggestions,
        '',
        new AbortController().signal,
      ),
    ).rejects.toThrow('quota test')
  } finally {
    put.mockRestore()
  }
  expect(useScene.getState().nodes).toBe(before)
  clearProposalGhost()
  const abort = new AbortController()
  abort.abort()
  await expect(previewProposal(interaction, proposal, abort.signal)).rejects.toThrow()
  expect(useProposalGhost.getState().simulation).toBeNull()
})

test('durable receipt reconciles prepared feedback and records latest manual preference separately', async () => {
  const { interaction, proposal } = setup()
  await saveInteraction(interaction)
  const journal = new SceneJournal(interaction.sceneId)
  await journal.recover(useScene.getState(), 1)
  let writes = Promise.resolve()
  const stop = subscribeSceneCommits((commit) => {
    writes = writes.then(() => journal.append(commit.current))
  })
  await previewProposal(interaction, proposal)
  const event = await applyHumanDecision(
    interaction,
    proposal,
    'adopt',
    proposal.suggestions,
    '',
    new AbortController().signal,
  )
  await saveFeedback({ ...event, status: 'prepared' })
  const observe = observeRehearsalFeedback(interaction.sceneId)
  editStageDocument((d) => {
    d.rehearsalSimulation.performers[0]!.position[2] = 1
  })
  await writes
  let events = (await readFeedbackLog(interaction.sceneId)).events
  for (let i = 0; i < 30 && !events.some((e) => e.decision === 'manual-edit'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    events = (await readFeedbackLog(interaction.sceneId)).events
  }
  expect(events.find((e) => e.eventId === event.eventId)?.status).toBe('applied')
  expect(
    events.find((e) => e.decision === 'manual-edit')?.finalResult?.performers[0]?.position[2],
  ).toBe(1)
  expect(events.find((e) => e.decision === 'manual-edit')?.originalProposal).toEqual(proposal)
  useScene.temporal.getState().undo()
  // Auto-save observes history separately from explicit scene commits.
  await journal.append(useScene.getState())
  for (let i = 0; i < 30; i++) {
    events = (await readFeedbackLog(interaction.sceneId)).events
    if (
      events.find((e) => e.decision === 'manual-edit')?.finalResult?.performers[0]?.position[2] ===
      0
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  expect(
    events.find((e) => e.decision === 'manual-edit')?.finalResult?.performers[0]?.position[2],
  ).toBe(0)
  observe()
  stop()
})
