import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import { bindRehearsalScene } from '@/lib/rehearsal-intelligence/authority'
import { DiaConversation } from '@/lib/rehearsal-intelligence/conversation-controller'
import { SceneJournal } from '@/lib/scene-journal'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import { createTheatreSceneGraph } from '@/lib/theatre/new-production'
import { acceptDiaRemoteCommand, diaRemoteSnapshot } from './dia-remote-bridge'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

test('paired Build projects the actual confirmed preview, enforces proposal identity and cancels without formal writes', async () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  const sceneId = crypto.randomUUID()
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
  const controller = new DiaConversation(sceneId, () => null)
  const original = useScene.getState().nodes
  try {
    await controller.load()
    expect(diaRemoteSnapshot(controller).stage.performers).toEqual([])
    await controller.send('给我一张圆桌')
    const proposal = controller.buildProposal()!
    expect(proposal).toBeDefined()
    const before = diaRemoteSnapshot(controller)
    expect(before.interactionId).toBe(proposal.id)
    expect(before.selectedProposalId).toBe(proposal.id)
    expect(before.proposals[0]!.changes[0]).toContain('圆桌')
    expect(before.ghost).toBeNull()
    const command = {
      type: 'select' as const,
      requestId: crypto.randomUUID(),
      sequence: 1,
      sceneVersion: before.sceneVersion,
      interactionId: proposal.id,
      proposalId: proposal.id,
      createdAt: new Date().toISOString(),
    }
    acceptDiaRemoteCommand(controller, command)
    expect(() => acceptDiaRemoteCommand(controller, { ...command, proposalId: 'old' })).toThrow()
    await controller.preview()
    const snapshot = diaRemoteSnapshot(controller)
    expect(snapshot.state).toBe('waiting-human')
    expect(snapshot.ghost?.scenery).toHaveLength(1)
    const table = snapshot.ghost!.scenery![0]!
    expect(table.min[0]).toBeLessThan(table.max[0])
    expect(snapshot.ghost?.performers).toEqual([])
    expect(useScene.getState().nodes).toBe(original)
    useStagePlanPreview.setState({ plan: null })
    expect(diaRemoteSnapshot(controller).ghost).toBeNull()
    acceptDiaRemoteCommand(controller, {
      type: 'cancel',
      requestId: crypto.randomUUID(),
      sequence: 2,
      sceneVersion: before.sceneVersion,
      createdAt: command.createdAt,
    })
    expect(diaRemoteSnapshot(controller).ghost).toBeNull()
    expect(useScene.getState().nodes).toBe(original)
  } finally {
    controller.dispose()
    unbind()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
