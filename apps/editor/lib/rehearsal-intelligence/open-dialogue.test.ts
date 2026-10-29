import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import {
  cameraPoseStore,
  publishCameraPose,
} from '../../../../packages/editor/src/store/camera-pose-store'
import { SceneJournal } from '../scene-journal'
import { useStagePlanPreview } from '../stage/plan-preview'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { bindRehearsalScene } from './authority'
import { DiaConversation } from './conversation-controller'
import { dialogueTestRequest, dialogueTestResponse } from './dialogue.test-helpers'
import { emptyGrounding } from './open-language'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('Qwen dialogue explains limits and theory without Scene writes, actions or history entries', async () => {
  const originalFetch = globalThis.fetch
  const graph = createTheatreSceneGraph(),
    sceneId = crypto.randomUUID()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
  const dia = new DiaConversation(sceneId, () => null, undefined, false)
  let calls = 0,
    commits = 0
  const stop = subscribeSceneCommits(() => {
    commits++
  })
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    expect(url).toBe('/api/dia/dialogue')
    calls++
    const request = dialogueTestRequest(init)
    expect(request.openContext.objects).toEqual([])
    expect(request.openContext.proposal).toBeNull()
    expect(
      request.openContext.app.capabilities.find(({ id }) => id === 'object-transform')?.authority,
    ).toBe('manual_only')
    return dialogueTestResponse(request, {
      grounding: { ...emptyGrounding(request.rawUtterance), requiresClarification: true },
      reply: '可以交流并解释舞台限制；修改先预演，再由你采用。',
      provider: 'aliyun',
      model: 'mock-not-live',
    })
  }) as typeof fetch
  try {
    await dia.load()
    clearSceneHistory()
    const before = useScene.getState().nodes
    for (const phrase of ['你好，你能帮我做什么？', '解释一下规定情境是什么意思']) {
      await dia.send(phrase)
      expect(dia.store.getState().thread!.messages.at(-1)!.content).toContain('可以交流')
      expect(dia.buildProposal()).toBeUndefined()
    }
    expect(calls).toBe(2)
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

test('provider failures explain service recovery and retain the existing proposal without Scene writes', async () => {
  const originalFetch = globalThis.fetch
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalPose = cameraPoseStore.getState().pose
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  publishCameraPose({ position: [0, 4, 10], target: [0, 1, 0], projection: 'perspective' })
  const graph = createTheatreSceneGraph()
  const sceneId = crypto.randomUUID()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
  const dia = new DiaConversation(sceneId, () => null, undefined, false)
  let commits = 0,
    requests = 0
  const stop = subscribeSceneCommits(() => commits++)
  let respond: () => Promise<Response> = async () => {
    throw new TypeError('offline')
  }
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    requests++
    expect(url).toBe('/api/dia/dialogue')
    const request = dialogueTestRequest(init)
    if (['建立宽8米深6米的舞台', '切换到俯视图'].includes(request.rawUtterance))
      return dialogueTestResponse(request)
    return respond()
  }) as typeof fetch
  const failure = (status: number, code: string, message: string) => async () =>
    Response.json(
      { requestId: crypto.randomUUID(), error: { code, message, retryable: status !== 503 } },
      { status },
    )
  try {
    await dia.load()
    clearSceneHistory()
    const before = useScene.getState().nodes
    await dia.send('建立宽8米深6米的舞台')
    const proposal = dia.buildProposal()!
    expect(proposal).toBeDefined()
    await dia.previewBuild(proposal.plan)
    const previewed = dia.buildProposal()
    const ghost = useStagePlanPreview.getState().plan
    expect(previewed?.status).toBe('previewed')
    expect(ghost).not.toBeNull()
    await dia.send('切换到俯视图')
    expect(dia.store.getState().notice).toContain('当前预览保留')
    expect(dia.buildProposal()).toBe(previewed)
    expect(useStagePlanPreview.getState().plan).toBe(ghost)
    for (const [response, expected, clarification] of [
      [
        failure(503, 'INTERNAL_ERROR', 'Dia 语义服务尚未配置，请联系网站管理员。'),
        '尚未配置',
        false,
      ],
      [failure(500, 'INTERNAL_ERROR', '舞台输入服务暂时不可用，请稍后重试。'), '稍后重试', false],
      [failure(429, 'RATE_LIMITED', '操作过于频繁，请稍候再试。'), '稍候再试', false],
      [
        async () => {
          throw new TypeError('offline')
        },
        '千问对话请求未完成',
        false,
      ],
      [async () => new Response('upstream unavailable', { status: 502 }), '模型请求未完成', false],
      [async () => Response.json({ provider: 'openai' }), '不匹配', false],
      [failure(422, 'PLAN_INVALID', '请明确台位。'), '请明确台位', true],
    ] as const) {
      respond = response
      await dia.send('你好，你能帮我做什么？')
      const message = dia.store.getState().thread!.messages.at(-1)!.content
      expect(message).toContain(expected)
      expect(message.includes('需要澄清')).toBe(clarification)
      expect(dia.store.getState().draft).toBe('你好，你能帮我做什么？')
      expect(dia.buildProposal()).toBe(previewed)
      expect(useStagePlanPreview.getState().plan).toBe(ghost)
      expect(dia.store.getState().thread!.status).toBe('waiting-human')
      expect(commits).toBe(0)
      expect(useScene.getState().nodes).toBe(before)
      expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    }
    respond = failure(503, 'INTERNAL_ERROR', 'Dia 语义服务尚未配置，请联系网站管理员。')
    await dia.send('你好，你能帮我做什么？')
    expect(dia.store.getState().notice).toContain('服务请求未完成')
    const beforeRetry = requests
    await dia.send()
    expect(requests).toBe(beforeRetry + 1)
    expect(dia.store.getState().draft).toBe('你好，你能帮我做什么？')
    await dia.send('切换到俯视图')
    expect(dia.store.getState().thread!.messages.at(-1)!.content).toBe(
      '已调整观察视角，舞台物品保持原位。',
    )
    expect(dia.store.getState().notice).not.toContain('服务请求未完成')
    expect(dia.buildProposal()).toBe(previewed)
    expect(useStagePlanPreview.getState().plan).toBe(ghost)
    expect(dia.store.getState().thread!.status).toBe('waiting-human')
    expect(commits).toBe(0)
    expect(useScene.getState().nodes).toBe(before)
  } finally {
    globalThis.fetch = originalFetch
    cameraPoseStore.setState({ pose: originalPose })
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    stop()
    dia.dispose()
    unbind()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
