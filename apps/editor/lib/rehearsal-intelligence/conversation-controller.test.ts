import 'fake-indexeddb/auto'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { clearSceneHistory, emitter, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { publishCameraPose } from '../../../../packages/editor/src/store/camera-pose-store'
import { SceneJournal } from '../scene-journal'
import { moveSimulationPerformer, readStageDocument } from '../theatre/simulation-store'
import {
  bindRehearsalScene,
  clearProposalGhost,
  observeRehearsalFeedback,
  useProposalGhost,
} from './authority'
import { conversationContext } from './conversation'
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

test('deleting every message role survives queued sends and reload without changing the stage', async () => {
  const { controller, sceneId } = await setup()
  await controller.send('给我两个排法')
  await controller.preview()
  await controller.adopt()
  const applied = useScene.getState().nodes
  const interaction = controller.store.getState().interaction
  const removedIds = controller.store.getState().thread!.messages.map((m) => m.messageId)
  expect(new Set(controller.store.getState().thread!.messages.map((m) => m.role))).toEqual(
    new Set(['user', 'dia', 'system-state']),
  )

  const saving = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const save = productStorage.saveConversation
  spyOn(productStorage, 'saveConversation').mockImplementationOnce(async (record) => {
    started.resolve()
    await saving.promise
    return save(record)
  })
  const pending = controller.send('帮我看看这一段')
  await started.promise
  const pendingUserId = controller.store.getState().thread!.messages.at(-1)!.messageId
  removedIds.push(pendingUserId)
  const deletions = removedIds.map((id) => controller.deleteMessage(id))
  expect(controller.store.getState().thread!.messages).toHaveLength(0)
  expect(controller.store.getState().interaction).toBe(interaction)
  expect(controller.store.getState().busy).toBe(true)
  saving.resolve()
  await Promise.all([pending, ...deletions])
  expect(useScene.getState().nodes).toBe(applied)

  await controller.send('帮我看看当前舞台')
  const saved = (await readConversation(sceneId))!
  expect(saved.thread.messages.length).toBeGreaterThan(0)
  expect(saved.thread.messages.some((m) => removedIds.includes(m.messageId))).toBe(false)
  controller.dispose()
  const reopened = new DiaConversation(sceneId, () => null)
  disposers.push(() => reopened.dispose())
  await reopened.load()
  expect(reopened.store.getState().thread!.messages).toEqual(saved.thread.messages)
  expect(useScene.getState().nodes).toBe(applied)
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

test('immediate refresh restores unsaved input without overwriting the durable thread', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
  try {
    const { controller, sceneId } = await setup()
    const before = (await readConversation(sceneId))!
    controller.patch({ draft: '最后一笔立即刷新', script: '合成选段', note: '保留原因' })
    controller.dispose()
    expect((await readConversation(sceneId))!.draft).toBe(before.draft)
    const reopened = new DiaConversation(sceneId, () => null)
    disposers.push(() => reopened.dispose())
    await reopened.load()
    expect(reopened.store.getState()).toMatchObject({
      draft: '最后一笔立即刷新',
      script: '合成选段',
      note: '保留原因',
    })
    expect(reopened.store.getState().thread!.threadId).toBe(before.thread.threadId)
    expect(values.size).toBe(0)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})

test('50, 100 and 200 maximum-sized mixed-language messages restore with bounded model history', async () => {
  const texts = [
    '中'.repeat(2000),
    'Word'.repeat(500),
    'A中🙂'.repeat(500),
    '对白\n行动\n'.repeat(285),
  ]
  for (const size of [50, 100, 200]) {
    const { controller, sceneId } = await setup()
    const saved = (await readConversation(sceneId))!
    saved.thread.messages = Array.from({ length: size }, (_, i) => ({
      messageId: crypto.randomUUID(),
      role: i % 2 ? 'dia' : 'user',
      content: texts[i % 4]!.slice(0, 2000).trim(),
      createdAt: new Date().toISOString(),
      sceneVersion: saved.thread.sceneVersion,
    }))
    await saveConversation(saved)
    controller.dispose()
    const reopened = new DiaConversation(sceneId, () => null)
    disposers.push(() => reopened.dispose())
    await reopened.load()
    const thread = reopened.store.getState().thread!
    expect(thread.messages).toEqual(saved.thread.messages)
    const context = conversationContext(thread, null, null, {
      ...thread.messages.at(-1)!,
      role: 'user',
    })
    expect(context.recentMessages.length).toBeLessThanOrEqual(8)
    expect(
      context.recentMessages.reduce((sum, m) => sum + m.content.length, 0),
    ).toBeLessThanOrEqual(6000)
  }
})

test('thread quota, feedback and product event failures cannot corrupt or disable formal scene editing', async () => {
  const { controller } = await setup()
  const before = useScene.getState().nodes
  spyOn(productStorage, 'saveConversation').mockRejectedValueOnce(
    new DOMException('本机空间不足', 'QuotaExceededError'),
  )
  await controller.send('合成失败：没有空间')
  expect(controller.store.getState().thread!.status).toBe('failed')
  expect(useScene.getState().nodes).toBe(before)
  spyOn(productStorage, 'saveProductEvent').mockRejectedValueOnce(new Error('产品事件不可用'))
  await controller.send('事件失败，仍可继续')
  expect(controller.store.getState().interaction).not.toBeNull()
  spyOn(feedbackStorage, 'saveFeedback').mockRejectedValueOnce(
    new DOMException('事务终止', 'AbortError'),
  )
  await controller.reject()
  expect(useScene.getState().nodes).toBe(before)
  const actor = readStageDocument()!.rehearsalSimulation.performers[0]!
  moveSimulationPerformer(actor.id, [-1, 0, 0])
  expect(readStageDocument()!.rehearsalSimulation.performers[0]!.position).toEqual([-1, 0, 0])
})

test('reopening after an external stage edit marks old proposals stale without rewriting the stage', async () => {
  const { controller, sceneId } = await setup()
  await controller.send('给我两个排法')
  controller.dispose()
  const actor = readStageDocument()!.rehearsalSimulation.performers[0]!
  moveSimulationPerformer(actor.id, [-1.1, 0, 0])
  const nodes = useScene.getState().nodes
  const reopened = new DiaConversation(sceneId, () => null)
  disposers.push(() => reopened.dispose())
  await reopened.load()
  expect(reopened.store.getState().thread!.status).toBe('stale')
  expect(useScene.getState().nodes).toBe(nodes)
  expect(useProposalGhost.getState().proposalId).toBeNull()
})

test('Dia View commands preserve the waiting-human proposal and never write the formal scene or journal', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  try {
    const { controller, sceneId } = await setup()
    await controller.send('给我两个排法')
    await controller.preview()
    const before = useScene.getState().nodes
    const ghost = useProposalGhost.getState()
    const proposal = controller.proposal()
    const selection = useViewer.getState().selection
    useViewer.setState({ selection: { ...selection, selectedIds: [] } })
    disposers.push(() => useViewer.setState({ selection }))
    await controller.send('聚焦选中的物品')
    expect(controller.proposal()).toBe(proposal)
    expect(useProposalGhost.getState()).toBe(ghost)
    expect(controller.store.getState().thread!.status).toBe('waiting-human')
    const pose = {
      position: [0, 4, 10] as [number, number, number],
      target: [0, 1, 0] as [number, number, number],
      projection: 'perspective' as const,
      viewWidth: 12,
    }
    publishCameraPose(pose)
    let writes = 0,
      applications = 0
    disposers.push(
      subscribeSceneCommits(() => {
        writes++
      }),
    )
    const apply = () => {
      applications++
    }
    emitter.on('camera-controls:apply-pose', apply)
    disposers.push(() => emitter.off('camera-controls:apply-pose', apply))
    await controller.send('视角往左转一点')
    await controller.send('保存当前视角为全景')
    await controller.send('召回视角全景')
    expect(applications).toBe(2)
    expect(writes).toBe(0)
    expect(useScene.getState().nodes).toBe(before)
    expect(useProposalGhost.getState()).toBe(ghost)
    expect(controller.proposal()).toBe(proposal)
    expect(controller.store.getState().thread!.status).toBe('waiting-human')
    expect(values.has(`diastage:view-state:v1:${sceneId}`)).toBe(true)
    await controller.send('转一下')
    expect(controller.store.getState().thread!.messages.at(-1)!.content).toContain('明确')
    expect(writes).toBe(0)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
