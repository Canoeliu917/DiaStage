import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { createManualStageGraph } from '../stage/initial-stage'
import { useStagePlanPreview } from '../stage/plan-preview'
import { DiaConversation } from './conversation-controller'
import { readConversation } from './conversation-storage'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('Dia placement drafts cannot preview/adopt or write Formal Scene, including after a legacy proposal', async () => {
  const graph = createManualStageGraph({
    type: 'black-box',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: 3,
  })
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useScene.getState().setReadOnly(false)
  const dia = new DiaConversation(crypto.randomUUID(), () => null, undefined, false)
  let commits = 0
  const stop = subscribeSceneCommits(() => {
    commits++
  })
  try {
    await dia.load()
    await dia.send('添加圆桌')
    expect(dia.buildProposal()).toBeDefined()
    const before = useScene.getState().nodes
    await dia.send('中间留空')
    expect(dia.store.getState().placementProposal).toMatchObject({
      status: 'proposal',
      requiresHumanConfirm: true,
      actions: [{ type: 'preserve_clearance', region: 'center' }],
    })
    expect(dia.buildProposal()).toBeUndefined()
    expect(useStagePlanPreview.getState().plan).toBeNull()
    await dia.preview()
    await dia.adopt()
    await dia.reject()
    expect(useScene.getState().nodes).toBe(before)
    expect(commits).toBe(0)
    const saved = await readConversation(dia.sceneId)
    expect(saved!.thread.messages.some((message) => message.content.includes('尚未计算落点'))).toBe(
      true,
    )
    expect(saved!.builds.every((build) => build.status !== 'applied')).toBe(true)
    await dia.send('放在上面')
    expect(dia.store.getState().placementProposal?.actions).toEqual([])
    expect(useScene.getState().nodes).toBe(before)
  } finally {
    dia.dispose()
    stop()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
