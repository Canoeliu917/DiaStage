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
import { DiaConversation } from './conversation-controller'
import { readConversation } from './conversation-storage'
import { dialogueTestRequest, dialogueTestResponse } from './dialogue.test-helpers'

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

async function stage() {
  const network = spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    expect(url).toBe('/api/dia/dialogue')
    return dialogueTestResponse(dialogueTestRequest(init))
  })
  const graph = createManualStageGraph({
    type: 'proscenium',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: 4,
  })
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
  const dia = new DiaConversation(sceneId, () => null, undefined, false)
  cleanups.push(() => dia.dispose())
  await dia.load()
  clearSceneHistory()
  return { dia, sceneId, network }
}

for (const [input, assets] of [
  ['请在舞台中前区生成一组桌椅', ['SCN-TABLE-090', 'SCN-CHAIR-045', 'SCN-CHAIR-045']],
  ['在舞台右后靠墙位置生成沙发', ['SCN-SOFA-175']],
] as const) {
  test(`DIA submit preserves region creation through preview, adopt and undo: ${input}`, async () => {
    const { dia, sceneId, network } = await stage()
    const before = useScene.getState().nodes
    await dia.send(input)
    const proposal = dia.buildProposal()!
    expect(proposal.plan.items.map((item) => item.libraryAssetId)).toEqual([...assets])
    expect(proposal.plan.questions).toEqual([])
    expect(proposal.plan.assumptions.some(({ id }) => id === 'region-assets')).toBe(true)
    expect(useScene.getState().nodes).toBe(before)
    if (assets.length === 3) {
      expect(proposal.plan.items[0]!.transform.position.x).toBeCloseTo(0)
      expect(proposal.plan.items.every((item) => item.transform.position.z < 3)).toBe(true)
    } else {
      expect(proposal.plan.items[0]!.transform.position.x).toBeLessThan(0)
      expect(proposal.plan.items[0]!.transform.position.z).toBeGreaterThan(4.5)
    }
    await dia.adopt()
    expect(useScene.getState().nodes).toBe(before)
    await dia.preview()
    expect(dia.store.getState().thread!.status).toBe('waiting-human')
    expect(useStagePlanPreview.getState().plan!.items).toHaveLength(assets.length)
    expect(useScene.getState().nodes).toBe(before)
    await dia.adopt()
    expect(dia.store.getState().thread!.status).toBe('applied')
    const placed = currentStageContext().objects.sort(
      (a, b) => a.transform.position.x - b.transform.position.x,
    )
    const planned = [...proposal.plan.items].sort(
      (a, b) => a.transform.position.x - b.transform.position.x,
    )
    expect(placed).toHaveLength(assets.length)
    for (const [index, item] of placed.entries()) {
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(item.transform.position[axis]).toBeCloseTo(planned[index]!.transform.position[axis])
      }
      const yawDifference =
        item.transform.rotationDegrees.y - planned[index]!.transform.rotationDegrees.y
      expect(Math.cos((yawDifference * Math.PI) / 180)).toBeCloseTo(1, 8)
    }
    expect((await readConversation(sceneId))!.builds.at(-1)!.status).toBe('applied')
    const created = Object.values(useScene.getState().nodes).filter((node) => node.type === 'item')
    expect(created.map((node) => node.asset.id).sort()).toEqual([...assets].sort())
    expect(created.every((node) => node.scale.every((value) => value === 1))).toBe(true)
    expect(network).toHaveBeenCalledTimes(1)
    useScene.temporal.getState().undo()
    expect(currentStageContext().objects).toHaveLength(0)
  })
}

test('model clarification keeps the existing preview after a second dialogue request', async () => {
  const { dia, network } = await stage()
  const before = useScene.getState().nodes
  await dia.send('请在舞台中前区生成一组桌椅')
  await dia.preview()
  const proposal = dia.buildProposal()!
  const preview = useStagePlanPreview.getState().plan
  await dia.send('在舞台右后区生成两组桌椅')
  expect(dia.buildProposal()!.id).toBe(proposal.id)
  expect(useStagePlanPreview.getState().plan).toBe(preview)
  expect(dia.store.getState().thread!.status).toBe('waiting-human')
  expect(dia.store.getState().thread!.messages.at(-1)!.content).toContain('请明确')
  expect(useScene.getState().nodes).toBe(before)
  expect(network).toHaveBeenCalledTimes(2)
})

for (const input of ['不要在舞台中前区生成一组桌椅', '在舞台右后生成沙发或者放一张桌子']) {
  test(`DIA does not turn a negation or alternative into new scenery: ${input}`, async () => {
    const { dia } = await stage()
    const before = useScene.getState().nodes
    await dia.send(input)
    expect(dia.buildProposal()).toBeUndefined()
    await dia.preview()
    await dia.adopt()
    expect(useScene.getState().nodes).toBe(before)
    expect(currentStageContext().objects).toHaveLength(0)
  })
}
