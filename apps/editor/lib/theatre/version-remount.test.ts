import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  BlockNode,
  clearSceneHistory,
  type SceneCommit,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { createStageFrame, rotatePoint, transformPoint, type Vec3 } from '@pascal-app/core/remount'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { useCameraStudio } from '../../components/camera-studio/store'
import { saveRehearsalVersion } from '../../components/theatre/versions-panel'
import { buildDiaContext } from '../rehearsal-intelligence/context'
import { InteractionEnvelopeSchema } from '../rehearsal-intelligence/interaction-envelope'
import {
  applyRemount,
  captureProductionLayout,
  initializeRemount,
  prepareVersionRemount,
  previewRemount,
  reloadRemount,
  remountSourceIssues,
  saveRemountConfig,
  undoLastRemount,
  updateRemountInput,
  useRemountDraft,
} from '../remount-scene'
import { readLocalDecisionReceipt, SceneJournal } from '../scene-journal'
import { sceneContentVersion } from '../scene-signature'
import { createTheatreSceneGraph } from './new-production'
import {
  getRehearsalVersion,
  listRehearsalVersions,
  openVersionPreview,
  rehearsalVersionHashes,
  useVersionPreview,
} from './rehearsal-versions'
import { parseSnapshot } from './scene-adapter'
import { StageSnapshotSchema } from './schema'
import { editStageDocument, readStageDocument } from './simulation-store'
import { readVersionSource, VERSION_SOURCE_KEY } from './version-source'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const SCENE = 'version-remount-synthetic'
let blockId: BlockNode['id']
let stop = () => {}
const currentGraph = () => {
  const { nodes, rootNodeIds, materials, collections, installedPlugins } = useScene.getState()
  return { nodes, rootNodeIds, materials, collections, installedPlugins }
}
const currentSceneVersion = () =>
  buildDiaContext(SCENE, readStageDocument()!, useScene.getState().nodes, {
    intention: '读取当前场景事实',
    script: '',
    directorIntention: '',
    selectedPerformerId: null,
  }).sceneVersion!
beforeEach(() => {
  const graph = createTheatreSceneGraph('历史排演合成验收')
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const block = BlockNode.parse({ name: '圆桌尺寸代理', parentId: level.id, position: [1, 0, 0] })
  blockId = block.id
  graph.nodes[block.id] = block
  if (level.type === 'level') level.children.push(block.id)
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  editStageDocument((document) => {
    document.rehearsalSimulation.performers = [
      { id: 'p-a', name: '甲', position: [-1, 0, 0], facing: 0.3, visible: true, color: '#888888' },
    ]
    document.rehearsalSimulation.paths = [
      {
        id: 'path-a',
        performerId: 'p-a',
        points: [
          [-1, 0, 0],
          [-1, 0, -1],
        ],
        durationSeconds: 5,
        visible: true,
      },
    ]
  })
  clearSceneHistory()
  useRemountDraft.setState({ sceneKey: '' })
})
afterEach(() => {
  stop()
  stop = () => {}
  useScene.getState().setReadOnly(false)
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('version list and historical preview remain read-only, with snapshot provenance independent from conversation', () => {
  saveRehearsalVersion('V1 搭台与排演', '合成测试')
  const version = listRehearsalVersions()[0]!
  const before = useScene.getState().nodes
  const history = useScene.temporal.getState().pastStates
  const commits: SceneCommit[] = []
  stop = subscribeSceneCommits((commit) => commits.push(commit))
  useScene.getState().setReadOnly(true)
  expect(openVersionPreview(version.id)).toEqual(getRehearsalVersion(version.id))
  expect(useVersionPreview.getState().selectedId).toBe(version.id)
  expect(version).toMatchObject(rehearsalVersionHashes(version))
  expect(version.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(useScene.getState().nodes).toBe(before)
  expect(useScene.temporal.getState().pastStates).toBe(history)
  expect(commits).toHaveLength(0)
  expect(() => openVersionPreview('missing')).toThrow('不存在')
})

test('historical source reads saved venue, scenery and routes; Ghost writes zero and Apply plus one Undo move everything together', () => {
  saveRehearsalVersion('V1 原场地')
  const version = listRehearsalVersions()[0]!
  editStageDocument((document) => {
    document.venue.width = 7
    document.venue.origin = [12, 0, 0]
  })
  const before = useScene.getState().nodes
  const beforeDocument = readStageDocument()!
  clearSceneHistory()
  const commits: SceneCommit[] = []
  stop = subscribeSceneCommits((commit) => commits.push(commit))
  prepareVersionRemount(SCENE, version.id)
  expect(useRemountDraft.getState().sourceVenue.bounds.width).toBe(8)
  expect(useRemountDraft.getState().targetVenue.bounds.width).toBe(7)
  const plan = previewRemount(SCENE)
  expect(plan.placements).toHaveLength(2)
  expect(plan.paths).toHaveLength(1)
  expect(plan.scale).toBe(1)
  expect(remountSourceIssues()).toEqual([])
  expect(useScene.getState().nodes).toBe(before)
  expect(commits).toHaveLength(0)
  expect(plan.placements.find((placement) => placement.nodeId === blockId)?.targetPosition).toEqual(
    [13, 0, 0],
  )
  expect(plan.paths[0]?.targetPoints).toEqual([
    [11, 0, 0],
    [11, 0, -1],
  ])
  applyRemount(SCENE)
  expect(commits).toHaveLength(1)
  expect(readStageDocument()?.venue).toEqual(beforeDocument.venue)
  expect(readStageDocument()?.rehearsalSimulation.performers[0]?.position).toEqual([11, 0, 0])
  expect(readStageDocument()?.rehearsalSimulation.paths[0]?.durationSeconds).toBe(5)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  expect(undoLastRemount(SCENE)).toBe(true)
  expect(useScene.getState().nodes).toEqual(before)
})

test('a deleted historical object still previews but cannot be silently recreated or dropped on Apply', () => {
  saveRehearsalVersion('V1 保存布景')
  const version = listRehearsalVersions()[0]!
  useScene.getState().deleteNode(blockId)
  clearSceneHistory()
  const before = useScene.getState().nodes
  prepareVersionRemount(SCENE, version.id)
  const plan = previewRemount(SCENE)
  expect(plan.placements.some((placement) => placement.nodeId === blockId)).toBe(true)
  expect(remountSourceIssues().length).toBeGreaterThan(0)
  expect(() => applyRemount(SCENE)).toThrow()
  expect(useScene.getState().nodes).toBe(before)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
})

test('current rehearsal maps rotation and route points deterministically and retains the captured source across reload', () => {
  initializeRemount(SCENE)
  captureProductionLayout(SCENE, [blockId])
  const draft = useRemountDraft.getState()
  const before = readStageDocument()!.rehearsalSimulation
  const anchors = draft.sourceVenue.anchors.map((anchor) => {
    const point = rotatePoint(anchor.position, [0, Math.PI / 2, 0])
    return { ...anchor, position: [point[0] + 15, point[1], point[2]] as Vec3 }
  }) as typeof draft.targetVenue.anchors
  updateRemountInput(SCENE, {
    targetVenue: {
      ...draft.targetVenue,
      bounds: draft.sourceVenue.bounds,
      anchors,
      frame: createStageFrame(anchors),
    },
  })
  const next = useRemountDraft.getState()
  previewRemount(SCENE)
  applyRemount(SCENE)
  const mapped = readStageDocument()!.rehearsalSimulation
  expect(mapped.performers[0]!.facing).toBeCloseTo(0.3 + Math.PI / 2)
  expect(mapped.paths[0]!.points[1]).toEqual(
    transformPoint(before.paths[0]!.points[1]!, next.sourceVenue.frame, next.targetVenue.frame),
  )
  expect(mapped.durationSeconds).toBe(before.durationSeconds)
  reloadRemount(SCENE)
  previewRemount(SCENE)
  applyRemount(SCENE)
  expect(readStageDocument()?.rehearsalSimulation).toEqual(mapped)
})

test('new performers or routes cannot be lost when a previously captured layout is applied', () => {
  initializeRemount(SCENE)
  captureProductionLayout(SCENE, [blockId])
  editStageDocument((document) => {
    document.rehearsalSimulation.performers.push({
      id: 'new-person',
      name: '乙',
      position: [2, 0, 0],
      facing: 0,
      visible: true,
      color: '#aaaaaa',
    })
  })
  const before = useScene.getState().nodes
  expect(() => previewRemount(SCENE)).toThrow('人物名单或路线结构已变化')
  expect(useScene.getState().nodes).toBe(before)
  expect(readStageDocument()?.rehearsalSimulation.performers).toHaveLength(2)
})

test('smaller target detects route and performer boundaries without scaling the original rehearsal', () => {
  saveRehearsalVersion('V1 人物与路线')
  const version = listRehearsalVersions()[0]!
  editStageDocument((document) => {
    document.venue.width = 1
  })
  prepareVersionRemount(SCENE, version.id)
  const before = useScene.getState().nodes
  const plan = previewRemount(SCENE)
  expect(plan.scale).toBe(1)
  expect(
    plan.conflicts.some(
      (conflict) => conflict.nodeId === 'path-a' && conflict.type === 'out-of-bounds',
    ),
  ).toBe(true)
  expect(
    plan.conflicts.some(
      (conflict) => conflict.nodeId === 'performer:p-a' && conflict.type === 'out-of-bounds',
    ),
  ).toBe(true)
  expect(() => applyRemount(SCENE)).toThrow('物理冲突')
  expect(useScene.getState().nodes).toBe(before)
})

test('mapping is explicitly partial: target identity, bounds and rotation do not replace the formal venue or floor', () => {
  saveRehearsalVersion('映射前的正式场地')
  const version = listRehearsalVersions()[0]!
  const before = useScene.getState().nodes
  const formalVenue = structuredClone(readStageDocument()!.venue)
  const floors = Object.values(before).filter((node) => node.metadata.theatreKind === 'stage-floor')
  expect(floors.length).toBeGreaterThan(0)
  prepareVersionRemount(SCENE, version.id)
  const draft = useRemountDraft.getState()
  const anchors = draft.sourceVenue.anchors.map((anchor) => {
    const point = rotatePoint(anchor.position, [0, Math.PI / 2, 0])
    return { ...anchor, position: [point[0] + 15, point[1], point[2]] as Vec3 }
  }) as typeof draft.targetVenue.anchors
  const targetVenue = {
    ...draft.targetVenue,
    id: 'closure-target-reference',
    name: '仅用于映射的目标参考',
    bounds: { width: 10, depth: 9, height: 5 },
    anchors,
    frame: createStageFrame(anchors),
  }
  updateRemountInput(SCENE, { targetVenue })
  clearSceneHistory()
  const commits: SceneCommit[] = []
  stop = subscribeSceneCommits((commit) => commits.push(commit))
  const plan = previewRemount(SCENE)
  expect(plan.conflicts.filter((conflict) => conflict.severity === 'error')).toEqual([])
  expect(useScene.getState().nodes).toBe(before)
  expect(commits).toHaveLength(0)
  applyRemount(SCENE)
  const applied = useScene.getState().nodes
  expect(commits).toHaveLength(1)
  expect(readStageDocument()!.venue).toEqual(formalVenue)
  for (const floor of floors) expect(applied[floor.id]).toEqual(floor)
  const site = Object.values(applied).find((node) => node.type === 'site')!
  expect(site.metadata.remount).toMatchObject({ targetVenue, sourceVersion: { id: version.id } })
  expect(listRehearsalVersions()).toEqual([version])
  expect(applied[blockId]).not.toEqual(before[blockId])
  expect(undoLastRemount(SCENE)).toBe(true)
  expect(useScene.getState().nodes).toEqual(before)
  useScene.temporal.getState().redo()
  expect(useScene.getState().nodes).toEqual(applied)
  const serialized = parseSnapshot(
    StageSnapshotSchema.parse(JSON.parse(JSON.stringify(currentGraph()))),
  )
  useScene.getState().unloadScene()
  useScene.getState().setScene(serialized.nodes, serialized.rootNodeIds, serialized)
  useRemountDraft.setState({ sceneKey: '' })
  const reopened = useScene.getState().nodes
  initializeRemount(SCENE)
  expect(readStageDocument()!.venue).toEqual(formalVenue)
  for (const floor of floors) expect(reopened[floor.id]).toEqual(floor)
  expect(useRemountDraft.getState().targetVenue).toEqual(targetVenue)
  expect(useRemountDraft.getState().lastPlan).not.toBeNull()
  expect(useRemountDraft.getState().plan).toBeNull()
  expect(useScene.getState().nodes).toBe(reopened)
})

test('saved mapping preparation reopens without applying positions or changing the formal venue', () => {
  initializeRemount(SCENE)
  captureProductionLayout(SCENE, [blockId])
  previewRemount(SCENE)
  const formalVenue = structuredClone(readStageDocument()!.venue)
  const beforeBlock = useScene.getState().nodes[blockId]
  saveRemountConfig(SCENE)
  const saved = useScene.getState().nodes
  reloadRemount(SCENE)
  expect(useRemountDraft.getState().lastPlan).toBeNull()
  expect(useRemountDraft.getState().plan).toBeNull()
  expect(useScene.getState().nodes).toBe(saved)
  expect(useScene.getState().nodes[blockId]).toEqual(beforeBlock)
  expect(readStageDocument()!.venue).toEqual(formalVenue)
})

test('manual mapping records manual Version provenance and does not invent a Dia receipt', () => {
  initializeRemount(SCENE)
  captureProductionLayout(SCENE, [blockId])
  previewRemount(SCENE)
  applyRemount(SCENE)
  const site = Object.values(useScene.getState().nodes).find((node) => node.type === 'site')!
  expect(site.metadata.diastageRemountDecision).toBeUndefined()
  expect(useRemountDraft.getState().envelope).toBeUndefined()
  expect(
    readVersionSource(site.metadata[VERSION_SOURCE_KEY], {
      sceneId: SCENE,
      resultSceneVersion: currentSceneVersion(),
      resultContentVersion: sceneContentVersion(currentGraph()),
    }),
  ).toMatchObject({ source: 'manual', sceneId: SCENE })
})

test('Dia mapping writes an applied receipt only with the formal batch; journal recovery, duplicate callbacks, Undo and Redo retain the truth', async () => {
  const previousDb = globalThis.indexedDB
  const previousRange = globalThis.IDBKeyRange
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  try {
    saveRehearsalVersion('Dia 选取的映射来源')
    const version = listRehearsalVersions()[0]!
    const before = currentGraph()
    const beforeVenue = structuredClone(readStageDocument()!.venue)
    const envelope = InteractionEnvelopeSchema.parse({
      schemaVersion: 1,
      interactionId: crypto.randomUUID(),
      sceneId: SCENE,
      capability: 'remount',
      sceneVersion: currentSceneVersion(),
      status: 'proposed',
      createdAt: new Date().toISOString(),
    })
    const journal = new SceneJournal(SCENE)
    await journal.recover(before, 1)
    prepareVersionRemount(SCENE, version.id, envelope)
    const draft = useRemountDraft.getState()
    const anchors = draft.targetVenue.anchors.map((anchor) => ({
      ...anchor,
      position: [anchor.position[0] + 10, anchor.position[1], anchor.position[2]] as Vec3,
    })) as typeof draft.targetVenue.anchors
    updateRemountInput(SCENE, {
      targetVenue: { ...draft.targetVenue, anchors, frame: createStageFrame(anchors) },
    })
    previewRemount(SCENE)
    expect(useScene.getState().nodes).toBe(before.nodes)
    saveRemountConfig(SCENE)
    await journal.append(currentGraph())
    expect(await readLocalDecisionReceipt(SCENE, envelope.interactionId)).toBeNull()
    expect(useRemountDraft.getState().envelope?.status).toBe('previewed')
    const prepared = await new SceneJournal(SCENE).recover(before, 1)
    expect(prepared.graph.nodes[blockId]).toEqual(before.nodes[blockId])
    expect(prepared.pending).toBe(true)
    reloadRemount(SCENE)
    expect(useRemountDraft.getState().plan).toBeNull()
    expect(useRemountDraft.getState().lastPlan).toBeNull()
    expect(readStageDocument()!.venue).toEqual(beforeVenue)
    const beforeApply = useScene.getState().nodes
    clearSceneHistory()
    previewRemount(SCENE)
    applyRemount(SCENE)
    const applied = currentGraph()
    await journal.append(applied)
    const site = Object.values(applied.nodes).find((node) => node.type === 'site')!
    const receipt = {
      eventId: envelope.interactionId,
      proposalId: envelope.interactionId,
      interactionId: envelope.interactionId,
    }
    expect(site.metadata.diastageRemountDecision).toEqual(receipt)
    expect(await readLocalDecisionReceipt(SCENE, envelope.interactionId)).toMatchObject(receipt)
    expect(
      readVersionSource(site.metadata[VERSION_SOURCE_KEY], {
        sceneId: SCENE,
        resultSceneVersion: currentSceneVersion(),
        resultContentVersion: sceneContentVersion(currentGraph()),
      }),
    ).toMatchObject({
      source: 'dia-remount',
      interactionId: envelope.interactionId,
      sourceVersion: version.id,
      envelope: { ...envelope, status: 'applied' },
    })
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    expect(() => applyRemount(SCENE)).toThrow('预览已过期')
    expect(useScene.getState().nodes).toBe(applied.nodes)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    expect(undoLastRemount(SCENE)).toBe(true)
    expect(useScene.getState().nodes).toEqual(beforeApply)
    await journal.append(currentGraph())
    expect(await readLocalDecisionReceipt(SCENE, envelope.interactionId)).toMatchObject(receipt)
    useScene.temporal.getState().redo()
    expect(useScene.getState().nodes).toEqual(applied.nodes)
    await journal.append(currentGraph())
    const recovered = await new SceneJournal(SCENE).recover(before, 1)
    expect(recovered.graph.nodes).toEqual(applied.nodes)
    reloadRemount(SCENE)
    expect(useRemountDraft.getState().envelope?.status).toBe('applied')
    expect(useRemountDraft.getState().plan).toBeNull()
    expect(useScene.getState().nodes).toEqual(applied.nodes)
    expect(readStageDocument()!.venue).toEqual(beforeVenue)
    expect(() => applyRemount(SCENE)).toThrow('预览已过期')
  } finally {
    globalThis.indexedDB = previousDb
    globalThis.IDBKeyRange = previousRange
  }
})

test('foreign or stale Dia mapping references are rejected without rewriting existing scene data', () => {
  saveRehearsalVersion('映射来源')
  const version = listRehearsalVersions()[0]!
  const before = useScene.getState().nodes
  const envelope = InteractionEnvelopeSchema.parse({
    schemaVersion: 1,
    interactionId: crypto.randomUUID(),
    sceneId: SCENE,
    capability: 'remount',
    sceneVersion: currentSceneVersion(),
    status: 'proposed',
    createdAt: new Date().toISOString(),
  })
  for (const patch of [
    { sceneId: 'another-scene' },
    { sceneVersion: 'outdated' },
    { capability: 'build' as const },
    { status: 'applied' as const },
  ])
    expect(() => prepareVersionRemount(SCENE, version.id, { ...envelope, ...patch })).toThrow(
      '交互引用',
    )
  expect(useScene.getState().nodes).toBe(before)
})
