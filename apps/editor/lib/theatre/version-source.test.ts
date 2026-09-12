import 'fake-indexeddb/auto'
import { afterEach, expect, test } from 'bun:test'
import {
  BlockNode,
  clearSceneHistory,
  SceneMaterial,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { useCameraStudio } from '../../components/camera-studio/store'
import {
  restoreRehearsalVersion,
  saveRehearsalVersion,
} from '../../components/theatre/versions-panel'
import { bindRehearsalScene, clearProposalGhost } from '../rehearsal-intelligence/authority'
import { buildDiaContext } from '../rehearsal-intelligence/context'
import { sceneFactsVersion } from '../rehearsal-intelligence/conversation'
import { DiaConversation } from '../rehearsal-intelligence/conversation-controller'
import type { InteractionEnvelope } from '../rehearsal-intelligence/interaction-envelope'
import { createSyntheticDemoScene } from '../rehearsal-intelligence/synthetic-demo'
import { SceneJournal } from '../scene-journal'
import { sceneContentVersion } from '../scene-signature'
import { createTheatreSceneGraph } from './new-production'
import {
  listRehearsalVersions,
  REHEARSAL_VERSIONS_KEY,
  RehearsalVersionSchema,
} from './rehearsal-versions'
import { moveSimulationPerformer, readStageDocument } from './simulation-store'
import {
  makeVersionSource,
  readVersionSource,
  VERSION_SOURCE_KEY,
  VersionSourceLinkSchema,
} from './version-source'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
  clearProposalGhost()
  useScene.getState().unloadScene()
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  clearSceneHistory()
})
function stage() {
  const graph = createTheatreSceneGraph('版本来源合成测试')
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  clearSceneHistory()
  return { sceneId: crypto.randomUUID(), siteId: graph.rootNodeIds[0]! }
}
function facts(sceneId: string) {
  return sceneFactsVersion(
    buildDiaContext(sceneId, readStageDocument()!, useScene.getState().nodes, {
      intention: '测试正式场景来源',
      script: '',
      directorIntention: '',
      selectedPerformerId: null,
    }),
  )
}
function reference(
  sceneId: string,
  capability: InteractionEnvelope['capability'],
): InteractionEnvelope {
  return {
    schemaVersion: 1,
    interactionId: crypto.randomUUID(),
    sceneId,
    capability,
    sceneVersion: facts(sceneId),
    status: 'applied',
    createdAt: new Date().toISOString(),
  }
}

test('manual versions ignore stale legacy decision IDs and preserve old version records without inventing source', () => {
  const { sceneId, siteId } = stage()
  const site = useScene.getState().nodes[siteId]!
  useScene.getState().updateNode(siteId, {
    metadata: {
      ...site.metadata,
      diastageRehearsalDecision: { interactionId: 'unproven-old-id' },
    },
  })
  saveRehearsalVersion('手动版本', '', sceneId)
  expect(listRehearsalVersions()[0]).toMatchObject({ source: 'manual' })
  expect(listRehearsalVersions()[0]!.interactionId).toBeUndefined()
  const legacy = structuredClone(listRehearsalVersions()[0]!)
  delete legacy.source
  legacy.interactionId = 'actual-legacy-reference'
  const before = JSON.stringify(legacy)
  expect(RehearsalVersionSchema.parse(legacy).source).toBeUndefined()
  expect(RehearsalVersionSchema.parse(legacy).interactionId).toBe('actual-legacy-reference')
  expect(JSON.stringify(legacy)).toBe(before)
})

test('new version sources require proven applied interaction identity; invalid data is not silently relabeled', () => {
  const { sceneId, siteId } = stage()
  const envelope = reference(sceneId, 'build')
  expect(() =>
    makeVersionSource({
      source: 'dia-build',
      sceneId,
      resultSceneVersion: facts(sceneId),
      envelope: { ...envelope, status: 'previewed' },
    }),
  ).toThrow()
  expect(() =>
    makeVersionSource({
      source: 'dia-rehearse',
      sceneId,
      resultSceneVersion: facts(sceneId),
      envelope,
    }),
  ).toThrow()
  expect(() =>
    makeVersionSource({
      source: 'dia-build',
      sceneId: 'foreign',
      resultSceneVersion: facts(sceneId),
      envelope,
    }),
  ).toThrow()
  const site = useScene.getState().nodes[siteId]!
  useScene.getState().updateNode(siteId, {
    metadata: {
      ...site.metadata,
      [VERSION_SOURCE_KEY]: { schemaVersion: 99, source: 'dia-build' },
    },
  })
  const before = useScene.getState().nodes
  expect(() => saveRehearsalVersion('不能伪造', '', sceneId)).toThrow()
  expect(useScene.getState().nodes).toBe(before)
})

test('Build and mapping receipts link exact versions; later scenery edits and cross-scene copies become manual', () => {
  for (const capability of ['build', 'remount'] as const) {
    const { sceneId, siteId } = stage()
    const envelope = reference(sceneId, capability)
    const source = makeVersionSource({
      source: `dia-${capability}`,
      sceneId,
      resultSceneVersion: facts(sceneId),
      envelope,
    })
    const site = useScene.getState().nodes[siteId]!
    useScene
      .getState()
      .updateNode(siteId, { metadata: { ...site.metadata, [VERSION_SOURCE_KEY]: source } })
    saveRehearsalVersion('正式采用后保留', '', sceneId)
    expect(listRehearsalVersions()[0]).toMatchObject({
      source: `dia-${capability}`,
      interactionId: envelope.interactionId,
      envelope,
    })
    saveRehearsalVersion('另一项目中的副本', '', 'different-scene')
    expect(listRehearsalVersions()[1]).toMatchObject({ source: 'manual' })
    const level = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')!
    useScene
      .getState()
      .createNode(BlockNode.parse({ parentId: level.id, name: '后来手动添加的布景' }))
    saveRehearsalVersion('手动整理后', '', sceneId)
    expect(listRehearsalVersions()[2]).toMatchObject({ source: 'manual' })
    expect(listRehearsalVersions()[2]!.interactionId).toBeUndefined()
    expect(useScene.getState().nodes[siteId]!.metadata[VERSION_SOURCE_KEY]).toEqual(source)
  }
})

test('restoration creates its own source link instead of inheriting the original Dia identity; one Undo preserves the prior version list', () => {
  const { sceneId, siteId } = stage()
  const envelope = reference(sceneId, 'build')
  const source = makeVersionSource({
    source: 'dia-build',
    sceneId,
    resultSceneVersion: facts(sceneId),
    envelope,
  })
  const site = useScene.getState().nodes[siteId]!
  useScene
    .getState()
    .updateNode(siteId, { metadata: { ...site.metadata, [VERSION_SOURCE_KEY]: source } })
  saveRehearsalVersion('原版', '', sceneId)
  const original = listRehearsalVersions()[0]!
  clearSceneHistory()
  restoreRehearsalVersion(original.id, sceneId)
  expect(listRehearsalVersions()[0]).toEqual(original)
  expect(listRehearsalVersions()[1]).toMatchObject({
    source: 'restore',
    sourceVersion: original.id,
    restoredFrom: original.id,
  })
  expect(listRehearsalVersions()[1]!.interactionId).toBeUndefined()
  expect(listRehearsalVersions()[1]!.envelope).toBeUndefined()
  expect(
    VersionSourceLinkSchema.parse(useScene.getState().nodes[siteId]!.metadata[VERSION_SOURCE_KEY]),
  ).toMatchObject({ source: 'restore', sourceVersion: original.id })
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(listRehearsalVersions()).toEqual([original])
  expect(useScene.getState().nodes[siteId]!.metadata[VERSION_SOURCE_KEY]).toEqual(source)
  useScene.temporal.getState().redo()
  saveRehearsalVersion('继续保留恢复结果', '', sceneId)
  expect(listRehearsalVersions().at(-1)).toMatchObject({
    source: 'restore',
    sourceVersion: original.id,
  })
})

test('real Rehearse preview does not acquire a source; confirmed journal transaction links Version and later manual moves do not inherit it', async () => {
  const graph = createSyntheticDemoScene()
  const sceneId = crypto.randomUUID()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  cleanup.push(bindRehearsalScene(sceneId, () => journal.assertCurrent()))
  cleanup.push(
    subscribeSceneCommits(() => {
      void journal.append(useScene.getState())
    }),
  )
  const controller = new DiaConversation(sceneId, () => null)
  cleanup.push(() => controller.dispose())
  await controller.load()
  await controller.send('试试拉开距离')
  const interaction = controller.store.getState().interaction!
  expect(interaction.envelope).toMatchObject({
    interactionId: interaction.interactionId,
    capability: 'rehearse',
    status: 'proposed',
  })
  await controller.preview()
  const siteId = graph.rootNodeIds[0]!
  expect(useScene.getState().nodes[siteId]!.metadata[VERSION_SOURCE_KEY]).toBeUndefined()
  await controller.adopt()
  expect(controller.store.getState().thread?.status).toBe('applied')
  const raw = useScene.getState().nodes[siteId]!.metadata[VERSION_SOURCE_KEY]
  expect(
    readVersionSource(raw, {
      sceneId,
      resultSceneVersion: facts(sceneId),
      resultContentVersion: sceneContentVersion(useScene.getState()),
    }),
  ).toMatchObject({
    source: 'dia-rehearse',
    interactionId: interaction.interactionId,
  })
  saveRehearsalVersion('采用排演', '', sceneId)
  expect(listRehearsalVersions()[0]).toMatchObject({
    source: 'dia-rehearse',
    interactionId: interaction.interactionId,
  })
  const actor = readStageDocument()!.rehearsalSimulation.performers[0]!
  moveSimulationPerformer(actor.id, [actor.position[0] + 0.1, actor.position[1], actor.position[2]])
  saveRehearsalVersion('自行调整后', '', sceneId)
  expect(listRehearsalVersions()[1]).toMatchObject({ source: 'manual' })
  expect(useScene.getState().nodes[siteId]!.metadata[REHEARSAL_VERSIONS_KEY]).toHaveLength(2)
})

for (const change of ['material', 'symmetric-rotation'] as const)
  test(`${change} is a manual version even when sceneFactsVersion remains identical`, () => {
    const { sceneId, siteId } = stage()
    useScene.getState().addSceneMaterial(
      SceneMaterial.parse({
        id: 'mat_source',
        name: '原表面',
        material: { preset: 'white' },
      }),
    )
    const level = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')!
    const block = BlockNode.parse({
      parentId: level.id,
      name: '对称体块',
      slots: { body: 'mat_source' },
    })
    useScene.getState().createNode(block)
    const envelope = reference(sceneId, 'build')
    const source = makeVersionSource({
      source: 'dia-build',
      sceneId,
      resultSceneVersion: facts(sceneId),
      resultContentVersion: sceneContentVersion(useScene.getState()),
      envelope,
    })
    const site = useScene.getState().nodes[siteId]!
    useScene
      .getState()
      .updateNode(siteId, { metadata: { ...site.metadata, [VERSION_SOURCE_KEY]: source } })
    saveRehearsalVersion('采用原方案', '', sceneId)
    expect(listRehearsalVersions()[0]!.source).toBe('dia-build')
    expect(sceneContentVersion(useScene.getState())).toBe(source.resultContentVersion)
    if (change === 'material')
      useScene.getState().updateSceneMaterial('mat_source', { material: { preset: 'wood' } })
    else useScene.getState().updateNode(block.id, { rotation: Math.PI / 2 })
    expect(facts(sceneId)).toBe(source.resultSceneVersion)
    expect(sceneContentVersion(useScene.getState())).not.toBe(source.resultContentVersion)
    saveRehearsalVersion('手动调整表面或朝向', '', sceneId)
    expect(listRehearsalVersions()[1]!.source).toBe('manual')
    expect(listRehearsalVersions()[1]!.interactionId).toBeUndefined()
  })
