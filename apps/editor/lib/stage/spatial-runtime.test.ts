import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  clearSceneHistory,
  ItemNode,
  sceneRegistry,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { Group } from 'three'
import { applyItemFoldControls } from '@pascal-app/nodes/item-fold'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { bindRehearsalScene } from '../rehearsal-intelligence/authority'
import { DiaConversation } from '../rehearsal-intelligence/conversation-controller'
import { groundLanguage } from '../rehearsal-intelligence/language-grounding'
import { SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { currentStageContext } from './context'
import { useStagePlanPreview } from './plan-preview'
import { AVAILABLE_STAGE_SCENERY } from './prop-assets'
import { solveStageSpatialProposal } from './spatial-fold'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}

async function setup(assetIds: string[]) {
  const graph = createTheatreSceneGraph()
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  for (const node of Object.values(graph.nodes))
    if (node.type === 'item') {
      delete graph.nodes[node.id]
      level.children = level.children.filter((id) => id !== node.id)
    }
  const ids: string[] = []
  for (const [index, assetId] of assetIds.entries()) {
    const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)!
    const node = ItemNode.parse({
      parentId: level.id,
      asset: source.asset,
      name: assetId === 'SCN-FOLD-03' ? '三联景片' : `景片${index}`,
      position: [index === 0 ? 0 : index === 1 ? -2 : 2, 0, 0],
      metadata: { stageKind: source.kind },
      ...(assetId === 'SCN-FOLD-03'
        ? { controls: { fold_angle_1_deg: 180, fold_angle_2_deg: 180 } }
        : {}),
    })
    graph.nodes[node.id] = node
    level.children.push(node.id)
    ids.push(node.id)
    const bytes = readFileSync(
      new URL(`../../public/stage-library/models/${assetId}.glb`, import.meta.url),
    )
    const model = await new ItemGLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
    const root = new Group()
    root.userData.itemModelSettled = true
    root.add(model.scene)
    applyItemFoldControls(root, node.controls)
    sceneRegistry.nodes.set(node.id, root)
  }
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  return ids
}

for (const [name, assets, phrase] of [
  ['corner', ['SCN-FLAT-090', 'SCN-FLAT-090'], '两块景片拐90度'],
  ['multi-hinge', ['SCN-FOLD-03'], '三联景片折成U型'],
] as const)
  test(`Runtime: ${name} candidate switch, Cancel, one Accept transaction, Undo/Redo`, async () => {
    const ids = await setup([...assets])
    const sceneId = crypto.randomUUID(),
      journal = new SceneJournal(sceneId)
    await journal.recover(useScene.getState(), 1)
    const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
    let queue = Promise.resolve(),
      commits = 0
    const stop = subscribeSceneCommits(() => {
      const snapshot = useScene.getState()
      commits++
      queue = queue.then(() => journal.append(snapshot))
    })
    const dia = new DiaConversation(sceneId, () => null, undefined, false)
    try {
      await dia.load()
      const before = JSON.stringify(useScene.getState().nodes)
      await dia.send(phrase)
      expect(
        dia.buildProposal()?.spatialSolution?.candidates.length,
        dia.store.getState().notice,
      ).toBe(name === 'corner' ? 2 : 1)
      const a = dia.buildProposal()!.spatialSolution!.candidates[0]!
      const b = dia.buildProposal()!.spatialSolution!.candidates.at(-1)!
      await dia.chooseSpatialCandidate(a!.candidateId)
      expect(dia.buildProposal()!.status).toBe('previewed')
      await dia.chooseSpatialCandidate(b!.candidateId)
      expect(useStagePlanPreview.getState().plan).toEqual(b!.plan)
      expect(commits).toBe(0)
      expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
      await dia.reject()
      expect(useStagePlanPreview.getState().plan).toBeNull()
      expect(useStagePlanPreview.getState().folds).toEqual([])
      expect(useStagePlanPreview.getState().clearanceRegions).toEqual([])
      expect(commits).toBe(0)
      await dia.send(phrase)
      await dia.chooseSpatialCandidate(
        dia.buildProposal()!.spatialSolution!.candidates.at(-1)!.candidateId,
      )
      await dia.adopt()
      await queue
      expect(dia.store.getState().notice).toContain('搭台已保留')
      expect(commits).toBe(1)
      expect(useScene.temporal.getState().pastStates).toHaveLength(1)
      const accepted = JSON.stringify(useScene.getState().nodes)
      expect(accepted).not.toBe(before)
      useScene.temporal.getState().undo()
      expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
      useScene.temporal.getState().redo()
      expect(JSON.stringify(useScene.getState().nodes)).toBe(accepted)
    } finally {
      dia.dispose()
      stop()
      unbind()
      for (const id of ids) sceneRegistry.nodes.delete(id)
      useScene.getState().unloadScene()
      clearSceneHistory()
    }
  }, 120000)

test('Runtime: actual three-flat GLBs produce enclosure and aperture', async () => {
  const ids = await setup(['SCN-FLAT-090', 'SCN-FLAT-090', 'SCN-FLAT-090'])
  try {
    const snapshot = currentStageContext([])
    const proposal = groundLanguage('三块景片围一个空间，中间留一个入口', snapshot)!.placement!
      .knowledgeProposal!
    const solution = solveStageSpatialProposal(proposal, snapshot)
    expect(solution.candidates.length).toBeGreaterThan(0)
    expect(
      solution.candidates.every((candidate) => candidate.clearanceRegions[0]!.widthMeters >= 0.8),
    ).toBe(true)
  } finally {
    for (const id of ids) sceneRegistry.nodes.delete(id)
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
}, 120000)

test('Runtime: actual half-open door leaf cannot satisfy the default straight path', async () => {
  const ids = await setup(['SCN-DOOR-130'])
  try {
    const snapshot = currentStageContext([])
    const proposal = groundLanguage('门口留一条通道', snapshot)!.placement!.knowledgeProposal!
    expect(solveStageSpatialProposal(proposal, snapshot).candidates).toEqual([])
  } finally {
    for (const id of ids) sceneRegistry.nodes.delete(id)
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
