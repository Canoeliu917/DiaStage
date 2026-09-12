import 'fake-indexeddb/auto'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { useCameraStudio } from '../../components/camera-studio/store'
import { readLocalDecisionReceipt, SceneJournal } from '../scene-journal'
import { CAMERA_METADATA, currentStageContext } from '../stage/context'
import { createManualStageGraph } from '../stage/initial-stage'
import { bindRehearsalScene } from './authority'
import * as feedback from './build-feedback'
import { DiaConversation } from './conversation-controller'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const cleanups: (() => void)[] = []
afterEach(() => {
  mock.restore()
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function setup() {
  const graph = createManualStageGraph({
    type: 'proscenium',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: 4,
  })
  const cameras = { version: 1 as const, shots: [] }
  graph.nodes[graph.rootNodeIds[0]!]!.metadata[CAMERA_METADATA] = cameras
  useCameraStudio.getState().setProject(cameras)
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  const sceneId = crypto.randomUUID(),
    journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  cleanups.push(bindRehearsalScene(sceneId, () => journal.assertCurrent()))
  let queue = Promise.resolve()
  cleanups.push(
    subscribeSceneCommits(() => {
      const snapshot = useScene.getState()
      queue = queue.then(() => journal.append(snapshot))
    }),
  )
  const dia = new DiaConversation(sceneId, () => null)
  cleanups.push(() => dia.dispose())
  await dia.load()
  await dia.send('给我一张圆桌')
  await dia.preview()
  expect(dia.buildProposal()!.status).toBe('previewed')
  return { dia, sceneId, flush: () => queue }
}

test('cancelled Build rejection cannot settle a newer proposal after its record is saved', async () => {
  const { dia, sceneId } = await setup()
  const oldId = dia.buildProposal()!.id,
    nodes = useScene.getState().nodes,
    entered = deferred(),
    release = deferred(),
    save = feedback.saveBuildFeedback
  cleanups.push(release.resolve)
  spyOn(feedback, 'saveBuildFeedback').mockImplementation(async (event) => {
    if (event.kind === 'reject') {
      entered.resolve()
      await release.promise
    }
    await save(event)
  })

  const rejecting = dia.reject()
  await entered.promise
  dia.cancel()
  await dia.send('给我两把椅子')
  const nextId = dia.buildProposal()!.id
  expect(nextId).not.toBe(oldId)
  expect(dia.store.getState().thread!.status).toBe('proposal-ready')
  release.resolve()
  await rejecting

  expect(dia.buildProposal()).toMatchObject({ id: nextId, status: 'proposed' })
  expect(dia.store.getState().thread!.status).toBe('proposal-ready')
  expect(dia.store.getState().notice).not.toContain('已放下这个方向')
  expect(useScene.getState().nodes).toBe(nodes)
  expect(
    (await feedback.readBuildFeedback(sceneId)).filter((event) => event.kind === 'reject'),
  ).toHaveLength(1)
})

test('cancelled Build adoption retains its durable receipt without overwriting a newer proposal', async () => {
  const { dia, sceneId, flush } = await setup()
  const oldId = dia.buildProposal()!.id,
    entered = deferred(),
    release = deferred(),
    reconcile = feedback.reconcileBuildFeedback
  cleanups.push(release.resolve)
  spyOn(feedback, 'reconcileBuildFeedback').mockImplementation(async (...args) => {
    entered.resolve()
    await release.promise
    return reconcile(...args)
  })

  const adopting = dia.adopt()
  await entered.promise
  await flush()
  expect(await readLocalDecisionReceipt(sceneId, oldId)).toMatchObject({
    eventId: oldId,
    proposalId: oldId,
    interactionId: oldId,
  })
  expect(currentStageContext().objects).toHaveLength(1)
  const adopted = useScene.getState().nodes
  dia.cancel()
  await dia.send('给我两把椅子')
  const nextId = dia.buildProposal()!.id
  expect(nextId).not.toBe(oldId)
  expect(dia.store.getState().thread!.status).toBe('proposal-ready')
  release.resolve()
  await adopting

  expect(dia.buildProposal()).toMatchObject({ id: nextId, status: 'proposed' })
  expect(dia.store.getState().thread!.status).toBe('proposal-ready')
  expect(dia.store.getState().notice).not.toContain('搭台已保留')
  expect(useScene.getState().nodes).toBe(adopted)
  expect(currentStageContext().objects).toHaveLength(1)
  expect(
    (await feedback.readBuildFeedback(sceneId)).find((event) => event.eventId === oldId),
  ).toMatchObject({ status: 'applied' })
  expect(await readLocalDecisionReceipt(sceneId, oldId)).not.toBeNull()
})
