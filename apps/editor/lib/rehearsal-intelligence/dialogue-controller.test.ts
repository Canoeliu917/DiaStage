import 'fake-indexeddb/auto'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { SceneJournal } from '../scene-journal'
import { currentStageContext } from '../stage/context'
import { createManualStageGraph } from '../stage/initial-stage'
import { useStagePlanPreview } from '../stage/plan-preview'
import { bindRehearsalScene } from './authority'
import * as buildFeedback from './build-feedback'
import { readBuildFeedback } from './build-feedback'
import { withLegacyTable } from './build-fixture'
import { DiaConversation } from './conversation-controller'
import { readConversation } from './conversation-storage'
import * as dialogueClient from './dialogue-client'
import type { DiaDialogueContext, DiaDialogueResult } from './dialogue-schema'
import { groundLanguage } from './language-grounding'
import { emptyGrounding } from './open-language'
import { OpenGroundingRequestError } from './open-language-client'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const cleanups: (() => void)[] = []
afterEach(() => {
  mock.restore()
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

function response(context: DiaDialogueContext, overrides: Partial<DiaDialogueResult> = {}) {
  return {
    requestId: crypto.randomUUID(),
    sceneVersion: context.sceneVersion,
    reply: '这是测试模型回复；正式舞台未改变。',
    provider: 'aliyun' as const,
    model: 'mock-not-live',
    plan: null,
    grounding: null,
    localView: false,
    ...overrides,
  }
}

async function setup(withTable = false) {
  let graph = createManualStageGraph({
    type: 'proscenium',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: 4,
  })
  if (withTable) graph = withLegacyTable(graph)
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const selection = useViewer.getState().selection
  useViewer.setState({ selection: { ...selection, selectedIds: [] } })
  cleanups.push(() => useViewer.setState({ selection }))
  const sceneId = crypto.randomUUID()
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  cleanups.push(bindRehearsalScene(sceneId, () => journal.assertCurrent()))
  cleanups.push(
    subscribeSceneCommits(() => {
      void journal.append(useScene.getState())
    }),
  )
  const dia = new DiaConversation(sceneId, () => null, undefined, false)
  cleanups.push(() => dia.dispose())
  await dia.load()
  clearSceneHistory()
  const request = spyOn(dialogueClient, 'requestDiaDialogue').mockImplementation(
    async (_text, context) => response(context),
  )
  return { dia, sceneId, request }
}

test('every desktop utterance reaches the model once with current geometry and prior conversation', async () => {
  const { dia, request } = await setup(true)
  const before = useScene.getState().nodes
  const phrases = ['请在舞台中前区生成一组桌椅', '切换到俯视图', '打开复台', '你好']
  for (const phrase of phrases) await dia.send(phrase)
  expect(request).toHaveBeenCalledTimes(phrases.length)
  for (const [index, call] of request.mock.calls.entries()) {
    const [text, context] = call
    expect(text).toBe(phrases[index])
    expect(context.sceneContext).toEqual(currentStageContext())
    expect(context.sceneContext.objects[0]!.transform).toBeDefined()
    expect(context.sceneContext.objects[0]!.dimensionsMeters).toBeDefined()
    expect(context.openContext.objects[0]!.id).toBe(context.sceneContext.objects[0]!.id)
    expect(
      context.history.some((message) => message.role === 'user' && message.content === text),
    ).toBe(false)
  }
  expect(request.mock.calls[1]![1].history.map((message) => message.role)).toEqual(['user', 'dia'])
  expect(
    dia.store.getState().thread!.messages.filter((message) => message.role === 'dia'),
  ).toHaveLength(4)
  expect(useScene.getState().nodes).toBe(before)
})

test('model plan and reply retain provenance and require preview plus explicit adoption', async () => {
  const { dia, sceneId, request } = await setup()
  request.mockImplementation(async (text, context) =>
    response(context, {
      reply: '已整理一桌两椅的候选，请先预览，再由你采用。',
      plan: groundLanguage(text, context.sceneContext)!.plan!,
    }),
  )
  const before = useScene.getState().nodes
  await dia.send('请在舞台中前区生成一组桌椅')
  const proposal = dia.buildProposal()!
  expect(proposal.groundingProvider).toEqual({ provider: 'aliyun', model: 'mock-not-live' })
  expect(proposal.plan.items).toHaveLength(3)
  const modelMessage = dia.store
    .getState()
    .thread!.messages.find((message) => message.role === 'dia')!
  expect(modelMessage.content).toContain('一桌两椅')
  expect(modelMessage.interactionId).toBe(proposal.id)
  expect(
    dia.store.getState().thread!.messages.filter((message) => message.role === 'dia'),
  ).toHaveLength(1)
  expect(useScene.getState().nodes).toBe(before)
  await dia.adopt()
  expect(useScene.getState().nodes).toBe(before)
  await dia.preview()
  expect(useStagePlanPreview.getState().plan).not.toBeNull()
  expect(useScene.getState().nodes).toBe(before)
  await dia.adopt()
  expect(currentStageContext().objects).toHaveLength(3)
  expect((await readConversation(sceneId))!.builds.at(-1)!.groundingProvider).toEqual(
    proposal.groundingProvider,
  )
  request.mockImplementation(async (_text, context) => response(context))
  await dia.send('刚才那一组在什么位置？')
  const next = request.mock.calls.at(-1)![1]
  expect(next.openContext.proposal).toMatchObject({ id: proposal.id, ghostCandidateId: null })
  expect(next.pendingPlan).toBeNull()
  expect(new Set(next.openContext.lastReferencedIds)).toEqual(
    new Set(currentStageContext().objects.map((object) => object.id)),
  )
  expect(next.sceneContext.objects).toHaveLength(3)
  useScene.temporal.getState().undo()
  expect(currentStageContext().objects).toHaveLength(0)
})

test('model failure retains preview, proposal and retry input without local fallback', async () => {
  const { dia, request } = await setup()
  request.mockImplementationOnce(async (text, context) =>
    response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
  )
  await dia.send('请在舞台中前区生成一组桌椅')
  await dia.preview()
  const previous = dia.buildProposal()
  const ghost = useStagePlanPreview.getState().plan
  const before = useScene.getState().nodes
  request.mockRejectedValueOnce(new OpenGroundingRequestError('模型连接失败，请重试。'))
  await dia.send('切换到俯视图')
  expect(request).toHaveBeenCalledTimes(2)
  expect(dia.buildProposal()).toBe(previous)
  expect(useStagePlanPreview.getState().plan).toBe(ghost)
  expect(dia.store.getState().draft).toBe('切换到俯视图')
  expect(dia.store.getState().thread!.messages.at(-1)).toMatchObject({ role: 'system-state' })
  expect(dia.store.getState().thread!.messages.at(-1)!.content).toContain('模型连接失败')
  expect(useScene.getState().nodes).toBe(before)
})

test('selection changes reject even a delayed reply-only response', async () => {
  const { dia, request } = await setup(true)
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  request.mockImplementationOnce(async (_text, context) => {
    entered.resolve()
    await release.promise
    return response(context, { reply: '不应显示的旧选择答复' })
  })
  const pending = dia.send('我现在选中了什么？')
  await entered.promise
  useViewer.setState({
    selection: { ...useViewer.getState().selection, selectedIds: ['legacy-test-table'] },
  })
  release.resolve()
  await pending
  const messages = dia.store.getState().thread!.messages
  expect(messages.some((message) => message.content === '不应显示的旧选择答复')).toBe(false)
  expect(messages.at(-1)!.content).toContain('已经变化')
  expect(dia.store.getState().draft).toBe('我现在选中了什么？')
})

test('changed pending plan prevents a delayed response from replacing the newer draft', async () => {
  const { dia, request } = await setup()
  request.mockImplementationOnce(async (text, context) =>
    response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
  )
  await dia.send('请在舞台中前区生成一组桌椅')
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  request.mockImplementationOnce(async (_text, context) => {
    entered.resolve()
    await release.promise
    return response(context, { reply: '不应覆盖新提案的答复', plan: context.pendingPlan })
  })
  const pending = dia.send('这组往右一些')
  await entered.promise
  const current = dia.buildProposal()!
  const newer = { ...current, plan: structuredClone(current.plan) }
  newer.plan.items[0]!.transform.position.x += 0.2
  dia.store.setState((state) => ({
    builds: state.builds.map((entry) => (entry.id === newer.id ? newer : entry)),
  }))
  release.resolve()
  await pending
  expect(dia.buildProposal()).toBe(newer)
  expect(dia.store.getState().builds).toHaveLength(1)
  expect(
    dia.store
      .getState()
      .thread!.messages.some((message) => message.content === '不应覆盖新提案的答复'),
  ).toBe(false)
})

test('history is bounded, excludes the current message, and discloses truncation', async () => {
  const { dia, request } = await setup()
  dia.store.setState((state) => ({
    thread: {
      ...state.thread!,
      messages: Array.from({ length: 12 }, (_, index) => ({
        messageId: crypto.randomUUID(),
        role: index % 2 ? 'dia' : 'user',
        content: '中'.repeat(2000),
        createdAt: new Date().toISOString(),
        sceneVersion: state.thread!.sceneVersion,
      })),
    },
  }))
  await dia.send('这次输入')
  const context = request.mock.calls[0]![1]
  expect(context.history.length).toBeLessThanOrEqual(8)
  expect(
    context.history.reduce((size, message) => size + message.content.length, 0),
  ).toBeLessThanOrEqual(8000)
  expect(context.historyTruncated).toBe(true)
  expect(context.history.some((message) => message.content === '这次输入')).toBe(false)
})

test('cancelled model request cannot publish its late reply or plan', async () => {
  const { dia, request } = await setup()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  request.mockImplementationOnce(async (text, context) => {
    entered.resolve()
    await release.promise
    return response(context, {
      reply: '过期模型结果',
      plan: groundLanguage(text, context.sceneContext)!.plan!,
    })
  })
  const pending = dia.send('请在舞台中前区生成一组桌椅')
  await entered.promise
  dia.cancel()
  release.resolve()
  await pending
  expect(dia.buildProposal()).toBeUndefined()
  expect(
    dia.store.getState().thread!.messages.some((message) => message.content === '过期模型结果'),
  ).toBe(false)
  expect(currentStageContext().objects).toHaveLength(0)
  expect(dia.store.getState().busy).toBe(false)
})

test('one long historical reply is shortened with an explicit truncation flag', async () => {
  const { dia, request } = await setup()
  dia.store.setState((state) => ({
    thread: {
      ...state.thread!,
      messages: [
        {
          messageId: crypto.randomUUID(),
          role: 'dia',
          content: '中'.repeat(3500),
          createdAt: new Date().toISOString(),
          sceneVersion: state.thread!.sceneVersion,
        },
      ],
    },
  }))
  await dia.send('继续讨论')
  const context = request.mock.calls[0]![1]
  expect(context.history).toHaveLength(1)
  expect(context.history[0]!.content).toHaveLength(2000)
  expect(context.historyTruncated).toBe(true)
})

test('model-understood cancellation paraphrase rejects only the pending proposal', async () => {
  const { dia, request } = await setup()
  request.mockImplementationOnce(async (text, context) =>
    response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
  )
  await dia.send('请在舞台中前区生成一组桌椅')
  await dia.preview()
  const before = useScene.getState().nodes
  const proposalId = dia.buildProposal()!.id
  request.mockImplementationOnce(async (text, context) =>
    response(context, {
      reply: '已取消当前候选，正式舞台保留。',
      grounding: {
        ...emptyGrounding(text),
        references: [{ kind: 'current_proposal', text: null, count: null, index: null }],
        modifiers: ['reject'],
      },
    }),
  )
  await dia.send('这个方案不要了')
  expect(dia.buildProposal()).toMatchObject({ id: proposalId, status: 'rejected' })
  expect(useStagePlanPreview.getState().plan).toBeNull()
  expect(
    dia.store
      .getState()
      .thread!.messages.some((message) => message.content === '已取消当前候选，正式舞台保留。'),
  ).toBe(true)
  expect(useScene.getState().nodes).toBe(before)
})

test('direct and model cancellation cannot reject an adopted proposal or its feedback', async () => {
  const { dia, sceneId, request } = await setup()
  request.mockImplementationOnce(async (text, context) =>
    response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
  )
  await dia.send('请在舞台中前区生成一组桌椅')
  await dia.preview()
  await dia.adopt()
  const adopted = dia.buildProposal()!
  const before = useScene.getState().nodes
  const feedback = await readBuildFeedback(sceneId)
  expect(adopted.status).toBe('applied')
  expect(adopted.envelope!.status).toBe('applied')

  await dia.reject()
  expect(dia.buildProposal()).toBe(adopted)
  expect(dia.store.getState().notice).toContain('已采用')
  expect(await readBuildFeedback(sceneId)).toEqual(feedback)

  request.mockImplementationOnce(async (text, context) =>
    response(context, {
      reply: '错误的取消成功答复',
      grounding: {
        ...emptyGrounding(text),
        references: [{ kind: 'current_proposal', text: null, count: null, index: null }],
        modifiers: ['reject'],
      },
    }),
  )
  await dia.send('这个方案不要了')
  const next = request.mock.calls.at(-1)![1]
  expect(next.openContext.proposal).toMatchObject({ id: adopted.id, ghostCandidateId: null })
  expect(next.pendingPlan).toBeNull()
  expect(dia.buildProposal()).toBe(adopted)
  expect(dia.buildProposal()!.envelope!.status).toBe('applied')
  expect(await readBuildFeedback(sceneId)).toEqual(feedback)
  expect(useScene.getState().nodes).toBe(before)
  expect(currentStageContext().objects).toHaveLength(3)
  expect(
    dia.store
      .getState()
      .thread!.messages.some((message) => message.content === '错误的取消成功答复'),
  ).toBe(false)
  expect(dia.store.getState().thread!.messages.at(-1)!.content).toContain('已采用')
})

test('a model reply rejected by the local build boundary is never published or persisted', async () => {
  const { dia, sceneId, request } = await setup()
  request.mockImplementationOnce(async (text, context) =>
    response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
  )
  await dia.send('请在舞台中前区生成一组桌椅')
  await dia.preview()
  const previous = dia.buildProposal()!
  const ghost = useStagePlanPreview.getState().plan
  const before = useScene.getState().nodes
  const invalid = structuredClone(previous.plan)
  invalid.items[0]!.kind = 'camera'
  const reply = '已整理新机位的候选，可以预览。'
  request.mockImplementationOnce(async (_text, context) =>
    response(context, { plan: invalid, reply }),
  )
  await dia.send('改成机位候选')
  expect(dia.buildProposal()).toBe(previous)
  expect(useStagePlanPreview.getState().plan).toBe(ghost)
  expect(useScene.getState().nodes).toBe(before)
  expect(dia.store.getState().thread!.messages.some((message) => message.content === reply)).toBe(
    false,
  )
  expect(
    (await readConversation(sceneId))!.thread.messages.some((message) => message.content === reply),
  ).toBe(false)
  expect(dia.store.getState().thread!.messages.at(-1)!.content).toContain('超出当前置景范围')
})

test('failed proposal feedback keeps the old preview without publishing model success', async () => {
  const { dia, sceneId, request } = await setup()
  request.mockImplementationOnce(async (text, context) =>
    response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
  )
  await dia.send('请在舞台中前区生成一组桌椅')
  await dia.preview()
  const previous = dia.buildProposal()!
  const ghost = useStagePlanPreview.getState().plan
  const before = useScene.getState().nodes
  const feedback = await readBuildFeedback(sceneId)
  const reply = '已整理调整后的候选，请预览。'
  request.mockImplementationOnce(async (_text, context) =>
    response(context, { plan: context.pendingPlan, reply }),
  )
  spyOn(buildFeedback, 'saveBuildFeedback').mockRejectedValueOnce(new Error('提案记录保存失败'))
  await dia.send('保留这组桌椅，重新整理候选')
  expect(dia.buildProposal()).toBe(previous)
  expect(useStagePlanPreview.getState().plan).toBe(ghost)
  expect(useScene.getState().nodes).toBe(before)
  expect(await readBuildFeedback(sceneId)).toEqual(feedback)
  expect(dia.store.getState().thread!.messages.some((message) => message.content === reply)).toBe(
    false,
  )
  expect(
    (await readConversation(sceneId))!.thread.messages.some((message) => message.content === reply),
  ).toBe(false)
  expect(dia.store.getState().thread!.messages.at(-1)!.content).toContain('提案记录保存失败')
})

for (const trigger of ['direct', 'model'] as const)
  test(`${trigger} cancellation feedback failure preserves the pending proposal and preview`, async () => {
    const { dia, sceneId, request } = await setup()
    request.mockImplementationOnce(async (text, context) =>
      response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
    )
    await dia.send('请在舞台中前区生成一组桌椅')
    await dia.preview()
    const previous = dia.buildProposal()!
    const ghost = useStagePlanPreview.getState().plan
    const before = useScene.getState().nodes
    const feedback = await readBuildFeedback(sceneId)
    const reply = '已取消当前候选，正式舞台保留。'
    request.mockImplementationOnce(async (text, context) =>
      response(context, {
        reply,
        grounding: {
          ...emptyGrounding(text),
          references: [{ kind: 'current_proposal', text: null, count: null, index: null }],
          modifiers: ['reject'],
        },
      }),
    )
    spyOn(buildFeedback, 'saveBuildFeedback').mockRejectedValueOnce(new Error('取消记录保存失败'))
    if (trigger === 'direct') await dia.reject()
    else await dia.send('这个方案不要了')
    expect(dia.buildProposal()).toBe(previous)
    expect(dia.buildProposal()!.status).toBe('previewed')
    expect(useStagePlanPreview.getState().plan).toBe(ghost)
    expect(useScene.getState().nodes).toBe(before)
    expect(await readBuildFeedback(sceneId)).toEqual(feedback)
    expect(dia.store.getState().thread!.messages.some((message) => message.content === reply)).toBe(
      false,
    )
    const saved = (await readConversation(sceneId))!
    expect(saved.builds.at(-1)!.status).toBe('previewed')
    expect(saved.thread.messages.some((message) => message.content === reply)).toBe(false)
  })

test('a delayed cancellation cannot clear a newer pending proposal or publish success', async () => {
  const { dia, request } = await setup()
  request.mockImplementationOnce(async (text, context) =>
    response(context, { plan: groundLanguage(text, context.sceneContext)!.plan! }),
  )
  await dia.send('请在舞台中前区生成一组桌椅')
  await dia.preview()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  spyOn(buildFeedback, 'saveBuildFeedback').mockImplementationOnce(async () => {
    entered.resolve()
    await release.promise
  })
  const reply = '旧候选取消成功。'
  request.mockImplementationOnce(async (text, context) =>
    response(context, {
      reply,
      grounding: {
        ...emptyGrounding(text),
        references: [{ kind: 'current_proposal', text: null, count: null, index: null }],
        modifiers: ['reject'],
      },
    }),
  )
  const pending = dia.send('这个方案不要了')
  await entered.promise
  const current = dia.buildProposal()!
  const newer = { ...current, plan: structuredClone(current.plan) }
  newer.plan.items[0]!.transform.position.x += 0.2
  dia.store.setState((state) => ({
    builds: state.builds.map((entry) => (entry.id === newer.id ? newer : entry)),
  }))
  useStagePlanPreview.setState({ plan: newer.plan })
  release.resolve()
  await pending
  expect(dia.buildProposal()).toBe(newer)
  expect(useStagePlanPreview.getState().plan).toBe(newer.plan)
  expect(dia.store.getState().thread!.messages.some((message) => message.content === reply)).toBe(
    false,
  )
  expect(dia.store.getState().thread!.messages.at(-1)!.content).toContain('已经变化')
})
