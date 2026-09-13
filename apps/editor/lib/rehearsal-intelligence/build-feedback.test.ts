import 'fake-indexeddb/auto'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { useCameraStudio } from '../../components/camera-studio/store'
import { saveRehearsalVersion } from '../../components/theatre/versions-panel'
import { readLocalDecisionReceipt, SceneJournal } from '../scene-journal'
import { CAMERA_METADATA, currentStageContext, stageSite } from '../stage/context'
import { createManualStageGraph } from '../stage/initial-stage'
import { useStagePlanPreview } from '../stage/plan-preview'
import { listRehearsalVersions } from '../theatre/rehearsal-versions'
import { bindRehearsalScene } from './authority'
import {
  observeBuildFeedback,
  readBuildFeedback,
  reconcileBuildFeedback,
  saveBuildFeedback,
} from './build-feedback'
import { withLegacyTable } from './build-fixture'
import { DiaConversation } from './conversation-controller'
import * as storage from './conversation-storage'
import { DiaBuildProposalSchema } from './dia-backbone'
import { readFeedbackLog } from './feedback'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const cleanups: (() => void)[] = []
afterEach(async () => {
  mock.restore()
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

async function setup() {
  const graph = withLegacyTable(
    createManualStageGraph({
      type: 'proscenium',
      widthMeters: 8,
      depthMeters: 6,
      heightMeters: 4,
    }),
  )
  const cameras = { version: 1 as const, shots: [] }
  graph.nodes[graph.rootNodeIds[0]!]!.metadata[CAMERA_METADATA] = cameras
  useCameraStudio.getState().setProject(cameras)
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
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
  const open = async () => {
    const dia = new DiaConversation(sceneId, () => null)
    cleanups.push(() => dia.dispose())
    await dia.load()
    return dia
  }
  const dia = await open()
  clearSceneHistory()
  await dia.send('圆桌往台左移动30厘米')
  await dia.preview()
  expect(dia.buildProposal()!.status).toBe('previewed')
  return { sceneId, dia, journal, open, flush: () => queue }
}

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 3000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Durable feedback did not reach expected state')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('prepared → formal transaction → feedback failure → reload proves adoption without reapplying', async () => {
  const { dia, sceneId, open, flush } = await setup()
  const id = dia.buildProposal()!.id
  const actual = IDBObjectStore.prototype.put
  const failure = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (this.name === 'build-events' && value.kind === 'adopt' && value.status === 'applied')
      throw new DOMException('Injected feedback quota failure', 'QuotaExceededError')
    return actual.call(this, value, key)
  })
  await dia.adopt()
  await flush()
  expect(currentStageContext().objects).toHaveLength(1)
  expect((await readBuildFeedback(sceneId)).find((e) => e.eventId === id)!.status).toBe('prepared')
  expect(await readLocalDecisionReceipt(sceneId, id)).toMatchObject({
    eventId: id,
    interactionId: id,
    proposalId: id,
  })
  failure.mockRestore()
  dia.dispose()
  const nodes = useScene.getState().nodes
  const recovered = await open()
  expect(recovered.buildProposal()!.status).toBe('applied')
  expect((await readBuildFeedback(sceneId)).find((e) => e.eventId === id)!.status).toBe('applied')
  await recovered.adopt()
  expect(useScene.getState().nodes).toBe(nodes)
  expect(currentStageContext().objects).toHaveLength(1)
})

test('prepared without formal transaction stays uncommitted across reload', async () => {
  const { dia, sceneId, open } = await setup()
  const id = dia.buildProposal()!.id,
    nodes = useScene.getState().nodes
  const actual = storage.saveConversation
  const interrupt = spyOn(storage, 'saveConversation').mockImplementation(async (record) => {
    const revision = await actual(record)
    if (record.builds.some((p) => p.id === id && p.status === 'prepared'))
      useStagePlanPreview.setState({ plan: null })
    return revision
  })
  await dia.adopt()
  interrupt.mockRestore()
  expect(useScene.getState().nodes).toBe(nodes)
  expect(await readLocalDecisionReceipt(sceneId, id)).toBeNull()
  dia.dispose()
  const reopened = await open()
  expect(reopened.buildProposal()!.status).toBe('prepared')
  expect((await readBuildFeedback(sceneId)).find((e) => e.eventId === id)!.status).toBe('prepared')
  expect(useScene.getState().nodes).toBe(nodes)
})

test('durable Build lineage tracks Undo Redo manual edits and idempotent duplicate callbacks', async () => {
  const { dia, sceneId, journal, flush } = await setup()
  const errors: string[] = []
  cleanups.push(observeBuildFeedback(sceneId, (error) => errors.push(error)))
  const id = dia.buildProposal()!.id
  await dia.adopt()
  await flush()
  await until(async () =>
    (await readBuildFeedback(sceneId)).some((e) => e.eventId === `${id}:result`),
  )
  const adopted = useScene.getState().nodes
  await dia.adopt()
  await reconcileBuildFeedback(sceneId, adopted)
  await reconcileBuildFeedback(sceneId, adopted)
  expect(useScene.getState().nodes).toBe(adopted)
  expect((await readBuildFeedback(sceneId)).filter((e) => e.kind === 'adopt')).toHaveLength(1)
  useScene.temporal.getState().undo()
  // Undo/Redo are persisted by useAutoSave's history subscription, not scene commit events.
  await journal.append(useScene.getState())
  await flush()
  await until(async () => (await readBuildFeedback(sceneId)).some((e) => e.kind === 'undo'))
  expect(currentStageContext().objects).toHaveLength(1)
  expect(currentStageContext().objects[0]!.transform.position.x).toBeCloseTo(0)
  expect(
    (await readBuildFeedback(sceneId)).find((e) => e.eventId === `${id}:result`)!.finalState,
  ).toBe('undone')
  useScene.temporal.getState().redo()
  await journal.append(useScene.getState())
  await flush()
  await until(async () => (await readBuildFeedback(sceneId)).some((e) => e.kind === 'redo'))
  expect(currentStageContext().objects).toHaveLength(1)
  const node = Object.values(useScene.getState().nodes).find((n) => n.name === '圆桌')!
  useScene.getState().updateNode(node.id, { position: [0.25, 0, 0] })
  await flush()
  await until(async () => (await readBuildFeedback(sceneId)).some((e) => e.kind === 'manual-edit'))
  const result = (await readBuildFeedback(sceneId)).find((e) => e.eventId === `${id}:result`)!
  expect(result.finalState).toBe('modified')
  expect(result.finalContext!.obstacles[0]!.min[0]).toBeCloseTo(-0.35)
  expect((await readFeedbackLog(sceneId)).buildEvents.length).toBeGreaterThan(5)
  expect(errors).toEqual([])
})

test('old Build payload stays readable; new revision and exact edit/preview history remain private', async () => {
  const { dia, sceneId } = await setup()
  const old = { ...dia.buildProposal()! }
  delete old.envelope
  delete old.sceneId
  expect(DiaBuildProposalSchema.parse(old).envelope).toBeUndefined()
  const parent = dia.buildProposal()!.id
  await dia.send('桌子往台左一点')
  expect(dia.buildProposal()!.envelope!.parentInteractionId).toBe(parent)
  const plan = structuredClone(dia.buildProposal()!.plan)
  plan.items[0]!.transform.position.x = 0.2
  dia.editBuild(plan)
  await dia.preview()
  const events = await readBuildFeedback(sceneId)
  expect(events.map((e) => e.kind)).toContain('revision')
  expect(events.map((e) => e.kind)).toContain('edit')
  const previews = events.filter(
    (e) => e.kind === 'preview' && e.interactionId === dia.buildProposal()!.id,
  )
  expect(previews.at(-1)!.proposal.previewedPlan).toEqual(plan)
  expect(
    events.every((e) => e.privateProjectData && !e.trainingAuthorized && !e.trainingEligible),
  ).toBe(true)
  expect(stageSite().metadata.diastageBuildDecision).toBeUndefined()
})

test('saved Version links a real adopted Build and duplicate reconciliation keeps one link', async () => {
  const { dia, sceneId, flush } = await setup()
  const id = dia.buildProposal()!.id
  await dia.adopt()
  await flush()
  saveRehearsalVersion('搭台正式版本', '', sceneId)
  await flush()
  const version = listRehearsalVersions().at(-1)!
  expect(version).toMatchObject({ source: 'dia-build', interactionId: id })
  await reconcileBuildFeedback(sceneId, useScene.getState().nodes)
  await reconcileBuildFeedback(sceneId, useScene.getState().nodes)
  const links = (await readBuildFeedback(sceneId)).filter((event) => event.kind === 'version-link')
  expect(links).toHaveLength(1)
  expect(links[0]).toMatchObject({ interactionId: id, versionId: version.id })
})

test('new Build rejects mismatched envelope without changing historical payload', async () => {
  const { dia, sceneId } = await setup()
  const proposal = dia.buildProposal()!
  for (const change of [
    { sceneId: 'foreign' },
    { capability: 'rehearse' },
    { interactionId: crypto.randomUUID() },
  ])
    expect(() =>
      DiaBuildProposalSchema.parse({ ...proposal, envelope: { ...proposal.envelope, ...change } }),
    ).toThrow()
  await dia.reject()
  expect(
    (await readBuildFeedback(sceneId)).find((event) => event.kind === 'reject')!.envelope.status,
  ).toBe('rejected')
})

test('material-only edits change final lineage; an older callback cannot roll back final state', async () => {
  const { dia, sceneId, flush } = await setup()
  cleanups.push(observeBuildFeedback(sceneId, () => {}))
  const id = dia.buildProposal()!.id
  await dia.adopt()
  await flush()
  await until(async () =>
    (await readBuildFeedback(sceneId)).some((event) => event.eventId === `${id}:result`),
  )
  const before = (await readBuildFeedback(sceneId)).find(
    (event) => event.eventId === `${id}:result`,
  )!
  const node = Object.values(useScene.getState().nodes).find((n) => n.name === '圆桌')!
  if (node.type !== 'block') throw new Error('Expected editable stage scenery')
  useScene
    .getState()
    .updateNode(node.id, { slots: { ...node.slots, body: 'library:preset-nearblack' } })
  await flush()
  await until(async () =>
    (await readBuildFeedback(sceneId)).some((event) => event.kind === 'manual-edit'),
  )
  const after = (await readBuildFeedback(sceneId)).find(
    (event) => event.eventId === `${id}:result`,
  )!
  expect(after.resultSceneVersion).toBe(before.resultSceneVersion)
  expect(after.resultContentVersion).not.toBe(before.resultContentVersion)
  expect(after.finalState).toBe('modified')
  await saveBuildFeedback(before)
  expect(
    (await readBuildFeedback(sceneId)).find((event) => event.eventId === `${id}:result`),
  ).toEqual(after)
  saveRehearsalVersion('自行改色', '', sceneId)
  expect(listRehearsalVersions().at(-1)!.source).toBe('manual')
})
