import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  BlockNode,
  clearSceneHistory,
  type SceneCommit,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { createStageFrame, rotatePoint, transformPoint, type Vec3 } from '@pascal-app/core/remount'
import { useCameraStudio } from '../../components/camera-studio/store'
import { saveRehearsalVersion } from '../../components/theatre/versions-panel'
import {
  applyRemount,
  captureProductionLayout,
  initializeRemount,
  prepareVersionRemount,
  previewRemount,
  reloadRemount,
  remountSourceIssues,
  undoLastRemount,
  updateRemountInput,
  useRemountDraft,
} from '../remount-scene'
import { createTheatreSceneGraph } from './new-production'
import {
  getRehearsalVersion,
  listRehearsalVersions,
  openVersionPreview,
  rehearsalVersionHashes,
  useVersionPreview,
} from './rehearsal-versions'
import { editStageDocument, readStageDocument } from './simulation-store'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const SCENE = 'version-remount-synthetic'
let blockId: BlockNode['id']
let stop = () => {}
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
