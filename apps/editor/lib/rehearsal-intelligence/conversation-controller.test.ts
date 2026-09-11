import 'fake-indexeddb/auto'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { SceneJournal } from '../scene-journal'
import { moveSimulationPerformer, readStageDocument } from '../theatre/simulation-store'
import {
  bindRehearsalScene,
  clearProposalGhost,
  observeRehearsalFeedback,
  useProposalGhost,
} from './authority'
import { DiaConversation } from './conversation-controller'
import * as productStorage from './conversation-storage'
import { readConversation, readProductEvents, saveConversation } from './conversation-storage'
import * as feedbackStorage from './feedback'
import { openRehearsalLog, readFeedbackLog, saveFeedback, saveInteraction } from './feedback'
import { createSyntheticDemoScene } from './synthetic-demo'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const disposers: (() => void)[] = []
afterEach(() => {
  mock.restore()
  for (const fn of disposers.splice(0).reverse()) fn()
  clearProposalGhost()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

async function setup() {
  const graph = createSyntheticDemoScene(),
    sceneId = crypto.randomUUID()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  disposers.push(bindRehearsalScene(sceneId, () => journal.assertCurrent()))
  disposers.push(
    subscribeSceneCommits(() => {
      void journal.append(useScene.getState())
    }),
  )
  disposers.push(observeRehearsalFeedback(sceneId))
  const controller = new DiaConversation(sceneId, () => null)
  disposers.push(() => controller.dispose())
  await controller.load()
  expect(controller.store.getState().ready).toBe(true)
  clearSceneHistory()
  return { controller, sceneId, journal }
}

test('duplicate Send creates one durable user message and interaction; no automatic scene writes or training', async () => {
  const { controller, sceneId } = await setup(),
    before = useScene.getState().nodes
  await Promise.all([
    controller.send('他们太近了，试试克制一点'),
    controller.send('他们太近了，试试克制一点'),
  ])
  const saved = await readConversation(sceneId),
    log = await readFeedbackLog(sceneId)
  expect(saved!.thread.messages.filter((m) => m.role === 'user')).toHaveLength(1)
  expect(log.interactions).toHaveLength(1)
  expect(log.interactions[0]!.inputContext.conversation!.recentMessages).toHaveLength(1)
  expect(saved!.thread).toMatchObject({
    privateProjectData: true,
    trainingAuthorized: false,
    trainingEligible: false,
  })
  expect(useScene.getState().nodes).toBe(before)
  const events = await readProductEvents(sceneId)
  expect(events.map((e) => e.name)).toContain('dia_message_sent')
  expect(JSON.stringify(events)).not.toContain('他们太近了')
  expect(events.every((e) => !e.trainingAuthorized && !e.trainingEligible)).toBe(true)
})

test('Preview Adopt manual move Now revision of second proposal Preview Reject retains complete lineage', async () => {
  const { controller, sceneId } = await setup()
  await controller.send('他们现在太近了，我想让关系更克制')
  const first = controller.store.getState().interaction!,
    before = useScene.getState().nodes
  await controller.preview()
  expect(controller.store.getState().thread!.status).toBe('waiting-human')
  expect(useScene.getState().nodes).toBe(before)
  await controller.adopt()
  expect(controller.store.getState().thread!.status).toBe('applied')
  const a = readStageDocument()!.rehearsalSimulation.performers.find((p) => p.name === 'A')!
  moveSimulationPerformer(a.id, [-1.5, 0, 0])
  expect(controller.store.getState().thread!.status).toBe('stale')
  await controller.send('现在呢？')
  const second = controller.store.getState().interaction!
  expect(second.inputContext.performers.find((p) => p.id === a.id)!.position).toEqual([-1.5, 0, 0])
  expect(second.inputContext.sceneVersion).not.toBe(first.inputContext.sceneVersion)
  expect(second.proposals).toHaveLength(2)
  const originalSecond = structuredClone(second.proposals[1]!)
  await controller.send('第二个可以，但A不要动')
  const revision = controller.proposal()!
  expect(revision.revision!.parentProposalId).toBe(originalSecond.proposalId)
  expect(revision.revision!.parentInteractionId).toBe(second.interactionId)
  expect(revision.suggestions.find((s) => s.performerId === a.id)!.movement).toBe('hold')
  expect(second.proposals[1]).toEqual(originalSecond)
  const unchanged = useScene.getState().nodes
  await controller.preview()
  await controller.reject()
  expect(controller.store.getState().thread!.status).toBe('rejected')
  expect(useScene.getState().nodes).toBe(unchanged)
  const log = await readFeedbackLog(sceneId)
  expect(log.interactions).toHaveLength(3)
  expect(log.events.filter((e) => e.decision === 'adopt')).toHaveLength(1)
  expect(log.events.find((e) => e.decision === 'reject')!.previewedProposal!.revision).toEqual(
    revision.revision,
  )
})

test('Cancel and stage changes during generation cannot reveal a late proposal', async () => {
  const { controller, sceneId } = await setup()
  const pending = controller.send('试试更紧张一点')
  expect(controller.store.getState().thread!.messages.at(-1)!.role).toBe('user')
  controller.cancel()
  await pending
  expect(controller.store.getState().interaction).toBeNull()
  expect(controller.store.getState().busy).toBe(false)
  expect((await readFeedbackLog(sceneId)).interactions).toHaveLength(0)
  const again = controller.send('再试试')
  const a = readStageDocument()!.rehearsalSimulation.performers[0]!
  moveSimulationPerformer(a.id, [-1.5, 0, 0])
  await again
  expect(controller.store.getState().thread!.status).toBe('stale')
  expect(controller.store.getState().notice).toContain('舞台已经变化')
  expect(controller.store.getState().interaction).toBeNull()
})

test('reopen restores exact thread and selected proposal but never silently reinstalls a Ghost', async () => {
  const { controller, sceneId } = await setup()
  await controller.send('给我两个排法')
  const proposal = controller.store.getState().interaction!.proposals[1]!
  controller.choose(proposal.proposalId)
  await controller.preview()
  const threadId = controller.store.getState().thread!.threadId
  controller.dispose()
  const reopened = new DiaConversation(sceneId, () => null)
  disposers.push(() => reopened.dispose())
  await reopened.load()
  expect(reopened.store.getState().thread).toMatchObject({
    threadId,
    selectedProposalId: proposal.proposalId,
    status: 'proposal-ready',
  })
  expect(reopened.store.getState().suggestions).toEqual(proposal.suggestions)
  expect(useProposalGhost.getState().proposalId).toBeNull()
  expect(reopened.store.getState().notice).toContain('重新在舞台上试试')
})

test('scene switch cancels generation and storage refuses cross-tab overwrites', async () => {
  const { controller, sceneId } = await setup()
  const original = await readConversation(sceneId)
  await saveConversation(original!)
  await expect(saveConversation(original!)).rejects.toThrow('另一窗口')
  const pending = controller.send('待处理的想法')
  controller.dispose()
  await pending
  const other = await setup()
  expect(other.controller.store.getState().thread!.sceneId).not.toBe(sceneId)
  expect(other.controller.store.getState().thread!.messages).toHaveLength(0)
})

test('Ghost failure disables the live decision and partial changes need a new preview', async () => {
  const { controller } = await setup()
  await controller.send('给我两个排法')
  await controller.preview()
  clearProposalGhost()
  expect(controller.store.getState().thread!.status).toBe('failed')
  const before = useScene.getState().nodes
  await controller.adopt()
  expect(useScene.getState().nodes).toBe(before)
  await controller.preview()
  controller.edit(controller.store.getState().suggestions.slice(0, 1), false)
  expect(useProposalGhost.getState().proposalId).toBeNull()
  await controller.adopt()
  expect(useScene.getState().nodes).toBe(before)
  await controller.preview()
  await controller.adopt()
  expect(controller.store.getState().thread!.status).toBe('applied')
})

test('cancel during preview or rejection persistence cannot overwrite a newer request', async () => {
  const { controller } = await setup()
  await controller.send('给我两个排法')
  const saving = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  spyOn(productStorage, 'saveProductEvent').mockImplementationOnce(async () => {
    started.resolve()
    await saving.promise
  })
  const preview = controller.preview()
  await started.promise
  controller.cancel()
  saving.resolve()
  await preview
  expect(controller.store.getState().thread!.status).toBe('idle')
  expect(useProposalGhost.getState().proposalId).toBeNull()

  const rejecting = Promise.withResolvers<void>()
  const rejected = Promise.withResolvers<void>()
  spyOn(feedbackStorage, 'saveFeedback').mockImplementationOnce(async () => {
    rejected.resolve()
    await rejecting.promise
  })
  const reject = controller.reject()
  await rejected.promise
  controller.cancel()
  await controller.send('试试横向的关系')
  const current = controller.store.getState().thread!
  rejecting.resolve()
  await reject
  expect(controller.store.getState().thread).toEqual(current)
  expect(current.status).toBe('proposal-ready')
})

test('legacy feedback without a Thread restores a completed decision, ignoring failed or uncommitted attempts', async () => {
  const { controller, sceneId } = await setup()
  await controller.send('给我两个排法')
  await controller.reject()
  controller.dispose()
  const log = await readFeedbackLog(sceneId)
  const old = structuredClone(log.interactions[0]!)
  old.promptVersion = 'rehearsal-partner-0.1'
  delete old.sceneVersion
  delete old.inputContext.sceneVersion
  delete old.inputContext.conversation
  for (const proposal of old.proposals) {
    proposal.promptVersion = 'rehearsal-partner-0.1'
    delete proposal.sceneVersion
  }
  await saveInteraction(old)
  const rejected = log.events.find((event) => event.decision === 'reject')!
  for (const status of ['failed', 'prepared'] as const)
    await saveFeedback({
      ...rejected,
      eventId: crypto.randomUUID(),
      createdAt: new Date(Date.now() + 1000).toISOString(),
      decision: 'adopt',
      status,
    })
  const db = await openRehearsalLog()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('threads', 'readwrite')
    tx.objectStore('threads').delete(sceneId)
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
  db.close()
  const reopened = new DiaConversation(sceneId, () => null)
  disposers.push(() => reopened.dispose())
  await reopened.load()
  await reopened.send('现在呢？')
  expect(reopened.store.getState().thread!.status).toBe('proposal-ready')
  const previous = reopened.store.getState().interaction!.inputContext.conversation!.recentDecision!
  expect(previous.decision).toBe('reject')
  expect(previous.proposalId).toBe(rejected.proposalId)
  expect(previous.sceneVersion.length).toBeGreaterThan(0)
})
