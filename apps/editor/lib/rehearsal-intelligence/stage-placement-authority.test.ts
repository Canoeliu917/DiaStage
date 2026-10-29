import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { createManualStageGraph } from '../stage/initial-stage'
import { useStagePlanPreview } from '../stage/plan-preview'
import { DiaConversation } from './conversation-controller'
import { readConversation } from './conversation-storage'
import { dialogueTestRequest, dialogueTestResponse } from './dialogue.test-helpers'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('model clarification preserves the prior proposal and cannot create or adopt a new placement', async () => {
  const graph = createManualStageGraph({
    type: 'black-box',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: 3,
  })
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useScene.getState().setReadOnly(false)
  const dia = new DiaConversation(crypto.randomUUID(), () => null, undefined, false)
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    expect(url).toBe('/api/dia/dialogue')
    requests++
    const request = dialogueTestRequest(init)
    return dialogueTestResponse(
      request,
      request.rawUtterance === '添加圆桌'
        ? {}
        : {
            plan: null,
            grounding: null,
            localView: false,
            reply: '请明确需要调整的对象和位置；尚未计算落点。',
          },
    )
  }) as typeof fetch
  let commits = 0
  const stop = subscribeSceneCommits(() => {
    commits++
  })
  try {
    await dia.load()
    await dia.send('添加圆桌')
    expect(dia.buildProposal()).toBeDefined()
    const originalProposal = dia.buildProposal()
    const before = useScene.getState().nodes
    await dia.send('中间留空')
    expect(dia.store.getState().placementProposal).toBeNull()
    expect(dia.buildProposal()).toBe(originalProposal)
    expect(useStagePlanPreview.getState().plan).toBeNull()
    await dia.adopt()
    expect(useScene.getState().nodes).toBe(before)
    expect(dia.buildProposal()?.status).toBe('proposed')
    await dia.reject()
    await dia.preview()
    await dia.adopt()
    expect(useScene.getState().nodes).toBe(before)
    expect(commits).toBe(0)
    const saved = await readConversation(dia.sceneId)
    expect(saved!.thread.messages.some((message) => message.content.includes('尚未计算落点'))).toBe(
      true,
    )
    expect(saved!.builds.every((build) => build.status !== 'applied')).toBe(true)
    await dia.send('放在上面')
    expect(dia.store.getState().placementProposal).toBeNull()
    expect(dia.buildProposal()?.status).toBe('rejected')
    expect(requests).toBe(3)
    expect(useScene.getState().nodes).toBe(before)
  } finally {
    globalThis.fetch = originalFetch
    dia.dispose()
    stop()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
