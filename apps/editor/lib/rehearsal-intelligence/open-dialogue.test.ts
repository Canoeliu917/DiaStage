import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { bindRehearsalScene } from './authority'
import { DiaConversation } from './conversation-controller'
import { emptyGrounding } from './open-language'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('OpenAI dialogue explains limits and theory without Scene writes, actions or history entries', async () => {
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
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++
    const request = JSON.parse(String(init?.body))
    expect(JSON.stringify(request.context)).not.toContain('transform')
    return Response.json({
      grounding: { ...emptyGrounding(request.rawUtterance), requiresClarification: true },
      reply: '可以交流并解释舞台限制；修改先预演，再由你采用。',
      provider: 'openai',
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
