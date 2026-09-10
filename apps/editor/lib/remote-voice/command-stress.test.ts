import { expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import { compileStagePlan, parseStageText } from '@pascal-app/core/stage'
import {
  commandMeta,
  connectStageCommandExecutor,
  executeStageCommands,
} from '../stage/command-executor'
import { currentStageContext } from '../stage/context'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { RemoteVoiceSessionStore } from './session-store'

test('2000 ordered phone commands: duplicate, reordered, lost ACK and reconnect; no unconfirmed writes', () => {
  globalThis.requestAnimationFrame ??= () => 0
  globalThis.cancelAnimationFrame ??= () => {}
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  const disconnect = connectStageCommandExecutor()
  let now = Date.now()
  const sessions = new RemoteVoiceSessionStore(() => now)
  const owner = sessions.create('synthetic', 'scene')
  const phone = sessions.join(owner.pairingCode)
  const added = executeStageCommands([
    {
      type: 'AddScenery',
      meta: commandMeta(),
      nodeId: 'test-chair',
      name: '椅子',
      kind: 'chair',
      libraryAssetId: null,
      dimensionsMeters: { width: 0.5, height: 0.9, depth: 0.5 },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(added.ok).toBe(true)
  let actualWrites = 0
  try {
    for (let sequence = 1; sequence <= 2000; sequence++) {
      const before = useScene.getState().nodes
      const requestId = crypto.randomUUID()
      const text = `把椅子向${sequence % 2 ? '台右' : '台左'}移1厘米`
      const received = sessions.sendCommand(owner.id, phone.remoteToken, text, requestId, sequence)
      expect(sessions.sendCommand(owner.id, phone.remoteToken, text, requestId, sequence)).toEqual(
        received,
      )
      expect(() =>
        sessions.sendCommand(owner.id, phone.remoteToken, text, crypto.randomUUID(), sequence + 2),
      ).toThrow()
      sessions.acknowledgeCommand(owner.id, owner.ownerToken, sequence, 'processing')
      const context = currentStageContext()
      const plan = parseStageText(text, context, [], 'voice')
      expect(plan).not.toBeNull()
      const compiled = compileStagePlan(plan!, context, {
        transactionId: `remote:${owner.id}:${sequence}`,
        issuedAt: new Date(now).toISOString(),
      })
      expect(compiled.ok).toBe(true)
      sessions.acknowledgeCommand(owner.id, owner.ownerToken, sequence, 'waiting-confirmation')
      expect(useScene.getState().nodes).toBe(before)
      if (!compiled.ok) throw new Error('Invalid synthetic plan')
      // Explicit confirmation is the only point at which the real scene executor is invoked.
      const result = executeStageCommands(compiled.commands)
      expect(result.ok).toBe(true)
      actualWrites++
      const applied = useScene.getState().nodes
      expect(executeStageCommands(compiled.commands).alreadyApplied).toBe(true)
      expect(useScene.getState().nodes).toBe(applied)
      if (sequence % 50 === 0) {
        now += 91_000
        expect(sessions.ownerStatus(owner.id, owner.ownerToken).paired).toBe(false)
        // Stay inside the explicit ten-minute session; no revocation on background/reconnect.
        now -= 91_000
        sessions.remoteStatus(owner.id, phone.remoteToken)
      }
      sessions.acknowledgeCommand(owner.id, owner.ownerToken, sequence, 'applied')
      sessions.acknowledgeCommand(owner.id, owner.ownerToken, sequence, 'applied')
      expect(
        sessions.sendCommand(owner.id, phone.remoteToken, text, requestId, sequence).sequence,
      ).toBe(sequence)
      expect(sessions.remoteStatus(owner.id, phone.remoteToken).lastAcknowledgedDisposition).toBe(
        'applied',
      )
      expect(useScene.getState().nodes).toBe(applied)
    }
    expect(actualWrites).toBe(2000)
    const final = useScene.getState().nodes
    const staleMeta = { ...commandMeta('voice'), transactionId: `remote:${owner.id}:1` }
    expect(
      executeStageCommands([
        {
          type: 'MoveObject',
          meta: staleMeta,
          nodeId: added.nodeIds[0],
          position: { x: 99, y: 0, z: 0 },
        },
      ]).alreadyApplied,
    ).toBe(true)
    expect(useScene.getState().nodes).toBe(final)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).not.toBe(final)
    useScene.temporal.getState().redo()
    expect(useScene.getState().nodes).toBe(final)
  } finally {
    disconnect()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
}, 30_000)
