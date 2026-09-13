import 'fake-indexeddb/auto'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import {
  clearSceneHistory,
  subscribeSceneCommits,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { useCameraStudio } from '../../components/camera-studio/store'
import { SceneJournal } from '../scene-journal'
import { CAMERA_METADATA, currentStageContext } from '../stage/context'
import { createManualStageGraph } from '../stage/initial-stage'
import { useStagePlanPreview } from '../stage/plan-preview'
import { bindRehearsalScene } from './authority'
import { withLegacyTable } from './build-fixture'
import { DiaConversation } from './conversation-controller'
import * as storage from './conversation-storage'
import { readConversation } from './conversation-storage'
import { diaIntent } from './dia-backbone'
import { LOCAL_REHEARSAL_MODEL_VERSION } from './local-rehearsal'
import { createSyntheticDemoScene } from './synthetic-demo'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const cleanups: (() => void)[] = []
afterEach(() => {
  mock.restore()
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  useLiveTransforms.getState().clearAll()
  useScene.getState().unloadScene()
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  clearSceneHistory()
})
async function stage(
  graph = createManualStageGraph({
    type: 'proscenium',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: 4,
  }),
  includeLegacyTable = true,
) {
  if (includeLegacyTable) graph = withLegacyTable(graph)
  const cameras = { version: 1 as const, shots: [] }
  graph.nodes[graph.rootNodeIds[0]!]!.metadata[CAMERA_METADATA] = cameras
  useCameraStudio.getState().setProject(cameras)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useScene.getState().setReadOnly(false)
  const sceneId = crypto.randomUUID()
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  cleanups.push(bindRehearsalScene(sceneId, () => journal.assertCurrent()))
  cleanups.push(
    subscribeSceneCommits(() => {
      void journal.append(useScene.getState())
    }),
  )
  const dia = new DiaConversation(sceneId, () => null)
  cleanups.push(() => dia.dispose())
  await dia.load()
  clearSceneHistory()
  return { dia, sceneId }
}

test('actorless Venue Build revision Ghost adopt once undo and durable lineage', async () => {
  const { dia, sceneId } = await stage()
  const before = useScene.getState().nodes
  expect(dia.currentContext().performers).toHaveLength(0)
  expect(currentStageContext().objects).toHaveLength(1)
  await dia.send('圆桌往台右移动30厘米')
  const first = dia.buildProposal()!
  expect(first.plan.items.map((p) => p.kind)).toEqual(['round-table'])
  expect(first.plan.questions).toEqual([])
  expect(useScene.getState().nodes).toBe(before)
  await dia.preview()
  expect(dia.store.getState().thread!.status).toBe('waiting-human')
  expect(useStagePlanPreview.getState().plan!.items).toHaveLength(1)
  expect(useScene.getState().nodes).toBe(before)
  await dia.send('圆桌往台左移动10厘米')
  const revision = dia.buildProposal()!
  expect(revision.parentId).toBe(first.id)
  expect(revision.plan.items).toHaveLength(1)
  expect(revision.plan.items[0]!.transform.position.x).toBeCloseTo(
    first.plan.items[0]!.transform.position.x - 0.1,
  )
  expect(useStagePlanPreview.getState().plan).toBeNull()
  await dia.adopt()
  expect(useScene.getState().nodes).toBe(before)
  await dia.preview()
  await dia.adopt()
  expect(dia.store.getState().thread!.status).toBe('applied')
  expect(currentStageContext().objects).toHaveLength(1)
  expect((await readConversation(sceneId))!.builds.at(-1)!.status).toBe('applied')
  useScene.temporal.getState().undo()
  expect(currentStageContext().objects).toHaveLength(1)
  expect(currentStageContext().objects[0]!.transform.position.x).toBeCloseTo(0)
})

test('Build restored without Ghost; edits invalidate adoption; reject and reflect stay read only', async () => {
  const { dia, sceneId } = await stage()
  const before = useScene.getState().nodes
  await dia.send('圆桌往台左移动30厘米')
  await dia.preview()
  dia.dispose()
  const reopened = new DiaConversation(sceneId, () => null)
  cleanups.push(() => reopened.dispose())
  await reopened.load()
  expect(reopened.buildProposal()!.id).toBe(dia.buildProposal()!.id)
  expect(useStagePlanPreview.getState().plan).toBeNull()
  await reopened.adopt()
  expect(useScene.getState().nodes).toBe(before)
  await reopened.preview()
  const plan = structuredClone(reopened.buildProposal()!.plan)
  plan.items[0]!.transform.position.x = 0.2
  reopened.editBuild(plan)
  await reopened.adopt()
  expect(useScene.getState().nodes).toBe(before)
  await reopened.reject()
  expect(useScene.getState().nodes).toBe(before)
  await reopened.send('为什么这一段感觉很平？')
  expect(reopened.store.getState().interaction).toBeNull()
  expect(reopened.store.getState().thread!.messages.at(-1)!.content).toContain('没有修改舞台')
  expect(useScene.getState().nodes).toBe(before)
})

test('routing keeps mixed input and historical intentions out of uncontrolled build writes', () => {
  expect(diaIntent('桌子再左一点', true)).toBe('build')
  expect(diaIntent('A站门边，B靠桌子')).toBe('rehearse')
  expect(diaIntent('请让甲站门边，乙靠桌子', false, ['甲', '乙'])).toBe('rehearse')
  expect(diaIntent('给我一张圆桌，A站门边')).toBe('mixed')
  expect(diaIntent('看一下昨天第三版')).toBe('version')
  expect(diaIntent('把昨天第三版放到今天这个小舞台')).toBe('remount')
  expect(diaIntent('为什么这一段感觉很平？')).toBe('reflect')
})

test('cancel during product event persistence cannot publish a late Build', async () => {
  const { dia } = await stage()
  const before = useScene.getState().nodes
  const reached = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const actual = storage.saveProductEvent
  spyOn(storage, 'saveProductEvent').mockImplementation(async (event) => {
    if (event.name === 'dia_message_sent') {
      reached.resolve()
      await gate.promise
    }
    return actual(event)
  })
  const pending = dia.send('圆桌往台左移动30厘米')
  await reached.promise
  dia.cancel()
  gate.resolve()
  await pending
  expect(dia.store.getState().thread!.status).toBe('idle')
  expect(dia.buildProposal()).toBeUndefined()
  expect(useScene.getState().nodes).toBe(before)
})

test('Build IDs cannot become Rehearsal revision parents or remain the mobile selection', async () => {
  const { dia } = await stage(createSyntheticDemoScene())
  const before = useScene.getState().nodes
  await dia.send('圆桌往台左移动30厘米')
  const buildId = dia.buildProposal()!.id
  await dia.send('给我两个排法')
  const { interaction, thread, activeBuildId } = dia.store.getState()
  expect(thread!.status).toBe('proposal-ready')
  expect(interaction).not.toBeNull()
  expect(activeBuildId).toBeNull()
  expect(interaction!.inputContext.conversation!.selectedProposalId).toBeNull()
  expect(thread!.selectedProposalId).not.toBe(buildId)
  expect(interaction!.proposals.some((p) => p.proposalId === thread!.selectedProposalId)).toBe(true)
  expect(useScene.getState().nodes).toBe(before)
})

for (const change of ['clear-preview', 'start-drag', 'other-window'] as const) {
  test(`Build adoption rechecks ${change} after the prepared record is saved`, async () => {
    const { dia, sceneId } = await stage()
    await dia.send('圆桌往台左移动30厘米')
    await dia.preview()
    const before = useScene.getState().nodes
    const reached = Promise.withResolvers<void>()
    const gate = Promise.withResolvers<void>()
    const actual = storage.saveConversation
    spyOn(storage, 'saveConversation').mockImplementation(async (record) => {
      if (record.builds.at(-1)?.status === 'prepared') {
        reached.resolve()
        await gate.promise
      }
      return actual(record)
    })
    const pending = dia.adopt()
    await reached.promise
    if (change === 'clear-preview') useStagePlanPreview.setState({ plan: null })
    else if (change === 'start-drag')
      useLiveTransforms.getState().set(useScene.getState().rootNodeIds[0]!, {
        position: [1, 0, 0],
        rotation: 0,
      })
    else {
      const foreign = new SceneJournal(sceneId)
      const { graph } = await foreign.recover(useScene.getState(), 1)
      const changed = structuredClone(graph)
      changed.nodes[changed.rootNodeIds[0]!]!.name = '另一个窗口的新舞台名称'
      await foreign.append(changed)
    }
    gate.resolve()
    await pending
    expect(dia.store.getState().thread!.status).toBe('failed')
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(dia.buildProposal()!.status).not.toBe('applied')
  })
}

test('a discussed direction uses the local rehearsal rules without changing the stage', async () => {
  const { dia } = await stage(createSyntheticDemoScene(), false)
  const before = useScene.getState().nodes
  await dia.send('为什么这一段感觉很平？')
  await dia.send('第二个方向试试')
  const { interaction, thread } = dia.store.getState()
  expect(thread!.status).toBe('proposal-ready')
  expect(interaction!.modelVersion).toBe(LOCAL_REHEARSAL_MODEL_VERSION)
  expect(interaction!.proposals[0]!.suggestions.every((s) => s.movement === 'withdraw')).toBe(true)
  expect(useScene.getState().nodes).toBe(before)
})
