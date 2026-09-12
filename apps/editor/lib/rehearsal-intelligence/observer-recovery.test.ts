import 'fake-indexeddb/auto'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { readLocalDecisionReceipt, SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { editStageDocument, readStageDocument } from '../theatre/simulation-store'
import {
  applyHumanDecision,
  bindRehearsalScene,
  isCommittedRehearsalDecision,
  observeRehearsalFeedback,
  previewProposal,
} from './authority'
import { buildRehearsalContext } from './context'
import { readProductEvents } from './conversation-storage'
import { readFeedbackLog, saveFeedback } from './feedback'
import { createInteraction } from './proposal-generator'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

async function setup() {
  const graph = createTheatreSceneGraph('合成反馈恢复测试')
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  editStageDocument((document) => {
    document.rehearsalSimulation.performers = [
      { id: 'a', name: '甲', color: '#888888', position: [-2, 0, 0], facing: 0, visible: true },
      { id: 'b', name: '乙', color: '#aaaaaa', position: [2, 0, 0], facing: 0, visible: true },
    ]
  })
  clearSceneHistory()
  const sceneId = crypto.randomUUID()
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  disposers.push(bindRehearsalScene(sceneId, () => journal.assertCurrent()))
  let writes = Promise.resolve()
  disposers.push(
    subscribeSceneCommits((commit) => {
      writes = writes.then(() => journal.append(commit.current))
    }),
  )
  async function adopt(movement: 'hold' | 'approach') {
    const context = buildRehearsalContext(
      sceneId,
      readStageDocument()!,
      useScene.getState().nodes,
      {
        script: '甲等待乙。',
        intention: '一次合成尝试',
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
            title: '合成反馈测试',
            intention: '合成意图',
            rationale: '一次合成尝试，不是实际模型表现。',
            suggestions: [
              {
                id: 's',
                performerId: 'a',
                intention: '合成行动',
                movement,
                targetPerformerId: movement === 'hold' ? null : 'b',
                zone: null,
                extent: 'small',
                pace: 'slow',
              },
            ],
            alternatives: [],
            evidence: [{ source: 'script', quote: '甲等待乙。' }],
            confidence: 0.5,
          },
        ],
      },
      'synthetic-recovery-fixture',
    )
    const proposal = interaction.proposals[0]!
    await previewProposal(interaction, proposal)
    return applyHumanDecision(
      interaction,
      proposal,
      'adopt',
      proposal.suggestions,
      '',
      new AbortController().signal,
    )
  }
  return { journal, adopt, flush: () => writes }
}

async function waitForFinal(sceneId: string, eventId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const log = await readFeedbackLog(sceneId)
    const original = log.events.find((event) => event.eventId === eventId)
    const manual = log.events.find((event) => event.eventId === `${eventId}:manual`)
    if (
      original?.status === 'applied' &&
      JSON.stringify(manual?.finalResult) ===
        JSON.stringify(readStageDocument()!.rehearsalSimulation)
    )
      return log.events
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('最终反馈未恢复到持久场景')
}

async function waitForProductEventCount(sceneId: string, count: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const events = await readProductEvents(sceneId)
    if (events.length >= count) return events
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('真实排演操作的产品事件未保存')
}

test('two adoptions are not Undo or manual edits; real manual changes and Undo use actual history evidence', async () => {
  const { journal, adopt, flush } = await setup()
  disposers.push(observeRehearsalFeedback(journal.id))
  const first = await adopt('approach')
  const afterA = structuredClone(readStageDocument()!.rehearsalSimulation)
  const second = await adopt('hold')
  const afterB = structuredClone(readStageDocument()!.rehearsalSimulation)
  await flush()
  await waitForFinal(journal.id, first.eventId)
  editStageDocument((document) => {
    document.rehearsalSimulation.performers[0]!.position[2] = 1
  })
  await flush()
  const manual = await waitForProductEventCount(journal.id, 1)
  expect(manual.map((event) => event.name)).toEqual(['post_adopt_manual_edit'])
  expect(manual[0]!.proposalId).toBe(second.proposalId)

  useScene.temporal.getState().undo()
  await journal.append(useScene.getState())
  expect(readStageDocument()!.rehearsalSimulation).toEqual(afterB)
  const undoManual = await waitForProductEventCount(journal.id, 2)
  expect(undoManual.filter((event) => event.name === 'post_adopt_undo')).toHaveLength(1)
  expect(undoManual.find((event) => event.name === 'post_adopt_undo')!.proposalId).toBe(
    second.proposalId,
  )

  useScene.temporal.getState().undo()
  await journal.append(useScene.getState())
  expect(readStageDocument()!.rehearsalSimulation).toEqual(afterA)
  const undoAdoption = await waitForProductEventCount(journal.id, 3)
  expect(undoAdoption.filter((event) => event.name === 'post_adopt_undo')).toHaveLength(2)
  expect(undoAdoption.filter((event) => event.name === 'post_adopt_manual_edit')).toHaveLength(1)
  await waitForFinal(journal.id, second.eventId)

  useScene.temporal.getState().redo()
  await journal.append(useScene.getState())
  await waitForFinal(journal.id, second.eventId)
  expect(readStageDocument()!.rehearsalSimulation).toEqual(afterB)
  expect(await readProductEvents(journal.id)).toHaveLength(3)
})

for (const refresh of [false, true])
  test(`two adoptions, Undo B and Redo B keep B final feedback current (refresh=${refresh})`, async () => {
    const { journal, adopt, flush } = await setup()
    let stop = observeRehearsalFeedback(journal.id)
    disposers.push(() => stop())
    await adopt('approach')
    const afterA = readStageDocument()!.rehearsalSimulation
    const second = await adopt('hold')
    await flush()
    const afterB = readStageDocument()!.rehearsalSimulation
    if (refresh) stop()
    useScene.temporal.getState().undo()
    const undone = useScene.getState()
    await journal.append(undone)
    expect(readStageDocument()!.rehearsalSimulation).toEqual(afterA)
    if (refresh) {
      await journal.acknowledge(undone, 2)
      await new SceneJournal(journal.id).recover(undone, 2)
      stop = observeRehearsalFeedback(journal.id)
    }
    const events = await waitForFinal(journal.id, second.eventId)
    expect(events.find((event) => event.eventId === second.eventId)?.finalResult).toEqual(afterB)
    useScene.temporal.getState().redo()
    await journal.append(useScene.getState())
    expect(readStageDocument()!.rehearsalSimulation).toEqual(afterB)
    const redone = await waitForFinal(journal.id, second.eventId)
    expect(redone.filter((event) => event.decision === 'adopt')).toHaveLength(2)
    expect(redone.filter((event) => event.eventId === `${second.eventId}:manual`)).toHaveLength(1)
  })

test('failed applied feedback, Undo, acknowledgement and refresh recover from durable proof', async () => {
  const { journal, adopt, flush } = await setup()
  const originalPut = IDBObjectStore.prototype.put
  const put = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (
      this.name === 'events' &&
      value &&
      typeof value === 'object' &&
      'status' in value &&
      value.status === 'applied'
    )
      throw new DOMException('synthetic applied failure', 'QuotaExceededError')
    return originalPut.call(this, value, key)
  })
  try {
    await expect(adopt('approach')).rejects.toThrow('synthetic applied failure')
  } finally {
    put.mockRestore()
  }
  await flush()
  const adoption = (await readFeedbackLog(journal.id)).events.find(
    (event) => event.decision === 'adopt',
  )!
  expect(adoption.status).toBe('prepared')
  const applied = readStageDocument()!.rehearsalSimulation
  useScene.temporal.getState().undo()
  const undone = useScene.getState()
  await journal.append(undone)
  await journal.acknowledge(undone, 2)
  await new SceneJournal(journal.id).recover(undone, 2)
  expect(await readLocalDecisionReceipt(journal.id, adoption.eventId)).toMatchObject({
    eventId: adoption.eventId,
    proposalId: adoption.proposalId,
    interactionId: adoption.interactionId,
  })
  disposers.push(observeRehearsalFeedback(journal.id))
  const events = await waitForFinal(journal.id, adoption.eventId)
  expect(await readProductEvents(journal.id)).toHaveLength(0)
  expect(await isCommittedRehearsalDecision(journal.id, adoption)).toBe(true)
  expect(await isCommittedRehearsalDecision('other-scene', adoption)).toBe(false)
  expect(useScene.getState().nodes).toBe(undone.nodes)
  expect(events.find((event) => event.eventId === adoption.eventId)?.finalResult).toEqual(applied)
  useScene.temporal.getState().redo()
  await journal.append(useScene.getState())
  const redone = await waitForFinal(journal.id, adoption.eventId)
  expect(redone.filter((event) => event.decision === 'adopt')).toHaveLength(1)
  expect(readStageDocument()!.rehearsalSimulation).toEqual(applied)
})

test('a receipt with mismatched interaction identity cannot promote prepared feedback', async () => {
  const { journal, adopt, flush } = await setup()
  const adoption = await adopt('approach')
  await flush()
  await saveFeedback({
    ...adoption,
    interactionId: 'different-interaction',
    ...(adoption.envelope
      ? { envelope: { ...adoption.envelope, interactionId: 'different-interaction' } }
      : {}),
    status: 'prepared',
  })
  disposers.push(observeRehearsalFeedback(journal.id))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const events = (await readFeedbackLog(journal.id)).events
  expect(events.find((event) => event.eventId === adoption.eventId)?.status).toBe('prepared')
  expect(events.some((event) => event.eventId === `${adoption.eventId}:manual`)).toBe(false)
})
