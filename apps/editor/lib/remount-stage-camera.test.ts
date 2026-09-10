import { afterEach, beforeEach, expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import {
  add,
  createStageFrame,
  rotatePoint,
  transformDirection,
  transformPoint,
  type Vec3,
} from '@pascal-app/core/remount'
import {
  type CameraProject,
  type Shot,
  validateCameraProject,
} from '../components/camera-studio/model'
import { connectCameraPersistence } from '../components/camera-studio/persistence'
import { useCameraStudio } from '../components/camera-studio/store'
import {
  applyRemount,
  captureProductionLayout,
  getRemountCandidates,
  initializeRemount,
  isRemountPreviewCurrent,
  previewRemount,
  RemountMetadataSchema,
  reloadRemount,
  saveRemountConfig,
  undoLastRemount,
  updateRemountInput,
  useRemountDraft,
} from './remount-scene'
import {
  commandMeta,
  connectStageCommandExecutor,
  executeStageCommands,
} from './stage/command-executor'
import { createManualStageGraph } from './stage/initial-stage'
import { readStageDocument } from './theatre/simulation-store'

const SCENE = 'remount-three-entry'
globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
let disconnect = () => {}
let disconnectCamera = () => {}

function site() {
  const state = useScene.getState()
  return state.nodes[state.rootNodeIds[0]!]!
}
function fixture(height: number | null = 6) {
  const graph = createManualStageGraph({
    type: 'proscenium',
    widthMeters: 10,
    depthMeters: 7,
    heightMeters: height,
  })
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  useRemountDraft.setState({ sceneKey: '' })
}
function addScenery() {
  const result = executeStageCommands([
    {
      type: 'AddScenery',
      meta: commandMeta(),
      nodeId: 'subject',
      name: '舞台台件',
      kind: 'neutral-block',
      libraryAssetId: null,
      dimensionsMeters: { width: 0.5, height: 0.5, depth: 0.5 },
      transform: { position: { x: 1, y: 0, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(result.ok).toBe(true)
  return result.nodeIds[0]!
}
function shot(id = 'camera-a'): Shot {
  return {
    id,
    name: id,
    duration: 10,
    keyframes: [
      { id: `${id}-0`, time: 0, position: [-2, 1.5, 2], lookAt: [-1, 0.5, 1.5], fov: 45 },
      { id: `${id}-1`, time: 10, position: [-2, 1.5, 0.5], lookAt: [-1, 0.5, 1.5], fov: 60 },
    ],
    follow: null,
    motion: null,
  }
}
function setCameras(shots: Shot[]) {
  useScene.getState().updateNode(site().id, {
    metadata: {
      ...site().metadata,
      diastageCameraStudio: validateCameraProject({ version: 1, shots }),
    },
  })
}
function cameras() {
  return validateCameraProject(site().metadata.diastageCameraStudio)
}
function setRotatedTarget() {
  const draft = useRemountDraft.getState()
  const anchors = draft.sourceVenue.anchors.map((anchor) => ({
    ...anchor,
    position: add(rotatePoint(anchor.position, [0, Math.PI / 2, 0]), [15, 0, 0]),
  })) as typeof draft.targetVenue.anchors
  updateRemountInput(SCENE, {
    targetVenue: {
      ...draft.targetVenue,
      bounds: { ...draft.sourceVenue.bounds },
      anchors,
      frame: createStageFrame(anchors),
    },
  })
}
function close(actual: Vec3, expected: Vec3) {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, 8)
  })
}
beforeEach(() => {
  fixture()
  disconnect = connectStageCommandExecutor()
})
afterEach(() => {
  disconnectCamera()
  disconnectCamera = () => {}
  disconnect()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('new source venue uses the actual stage bounds and unknown height blocks preview and apply', () => {
  fixture(null)
  const objectId = addScenery()
  initializeRemount(SCENE)
  const original = useScene.getState().nodes
  const draft = useRemountDraft.getState()
  expect(draft.sourceVenue.bounds).toEqual({ width: 10, depth: 7, height: 4 })
  expect(draft.sourceVenue.frame.origin).toEqual([0, 0, 3.5])
  close(draft.sourceVenue.frame.up, [0, 1, 0])
  expect(draft.sourceHeightMeasured).toBe(false)
  captureProductionLayout(SCENE, [objectId])
  expect(() => previewRemount(SCENE)).toThrow('净高尚未测量')
  updateRemountInput(SCENE, {
    sourceHeightMeasured: true,
    sourceVenue: { ...draft.sourceVenue, bounds: { ...draft.sourceVenue.bounds, height: 5.2 } },
  })
  setRotatedTarget()
  previewRemount(SCENE)
  expect(useScene.getState().nodes).toBe(original)
  useRemountDraft.setState({ sourceHeightMeasured: false })
  expect(() => applyRemount(SCENE)).toThrow('净高尚未测量')
  useRemountDraft.setState({ sourceHeightMeasured: true })
  clearSceneHistory()
  saveRemountConfig(SCENE)
  expect(readStageDocument()?.venue.height).toBe(5.2)
  expect(site().metadata.stageHeightMeasured).toBe(true)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes).toEqual(original)
})

test('saved calibration is preserved, while old unmeasured stage metadata stays unmeasured', () => {
  initializeRemount(SCENE)
  const config = RemountMetadataSchema.parse(useRemountDraft.getState())
  config.sourceVenue.id = 'custom-source'
  config.sourceVenue.bounds = { width: 22, depth: 13, height: 9 }
  config.sourceVenue.name = '已测量的旧排练厅'
  const { sourceHeightMeasured: _measured, ...legacy } = config
  useScene.getState().updateNode(site().id, { metadata: { ...site().metadata, remount: legacy } })
  reloadRemount(SCENE)
  expect(useRemountDraft.getState().sourceVenue).toEqual(config.sourceVenue)
  expect(useRemountDraft.getState().sourceHeightMeasured).toBe(true)
  useScene
    .getState()
    .updateNode(site().id, { metadata: { ...site().metadata, stageHeightMeasured: false } })
  reloadRemount(SCENE)
  expect(useRemountDraft.getState().sourceVenue).toEqual(config.sourceVenue)
  expect(useRemountDraft.getState().sourceHeightMeasured).toBe(false)
})

test('mixed scenery and canonical cameras transform all keys and follow vectors in one undoable commit', () => {
  const objectId = addScenery()
  const imports = [
    {
      id: 'script-example',
      source: 'script',
      file: {
        name: '舞台片段.docx',
        type: 'docx',
        sizeBytes: 128,
        pageCount: null,
        paragraphCount: 1,
      },
      importedAt: '2026-09-10T00:00:00.000Z',
      evidence: [
        {
          id: 'e1',
          page: null,
          paragraph: 1,
          excerpt: '舞台中区放一张桌子。',
          certainty: 'stated',
        },
      ],
      assumptions: [],
    },
  ]
  useScene.getState().updateNode(site().id, {
    metadata: {
      ...site().metadata,
      diastageTheatre: { ...readStageDocument(), importMetadata: imports },
    },
  })
  const fixed = shot(),
    following = shot('following')
  following.follow = {
    nodeId: objectId,
    mode: 'offset',
    offset: [2, 1.2, 0],
    lookAtOffset: [0.1, 0.3, 0.2],
  }
  setCameras([fixed, following])
  disconnectCamera = connectCameraPersistence(SCENE, { getItem: () => null, setItem: () => {} })
  initializeRemount(SCENE)
  expect(
    getRemountCandidates().filter((candidate) => candidate.nodeId.startsWith('camera:')),
  ).toHaveLength(2)
  captureProductionLayout(SCENE, [objectId, `camera:${fixed.id}`, `camera:${following.id}`])
  setRotatedTarget()
  const before = useScene.getState().nodes
  const beforeProject = cameras()
  const plan = previewRemount(SCENE)
  const draft = useRemountDraft.getState()
  const fixedSnapshot = draft.sourceSnapshots.find(
    (snapshot) => snapshot.nodeId === `camera:${fixed.id}`,
  )!
  const direction = fixed.keyframes[0]!.lookAt.map(
    (value, index) => value - fixed.keyframes[0]!.position[index]!,
  ) as Vec3
  close(
    rotatePoint([0, 0, -1], fixedSnapshot.rotation),
    direction.map((value) => value / Math.hypot(...direction)) as Vec3,
  )
  expect(plan.placements).toHaveLength(3)
  expect(plan.paths).toHaveLength(1)
  expect(plan.conflicts).toEqual([])
  expect(useScene.getState().nodes).toBe(before)
  clearSceneHistory()
  applyRemount(SCENE)
  expect(Object.keys(useScene.getState().nodes)).toEqual(Object.keys(before))
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  const after = cameras()
  expect(readStageDocument()?.importMetadata).toEqual(imports)
  for (const camera of beforeProject.shots) {
    const moved = after.shots.find((s) => s.id === camera.id)!
    camera.keyframes.forEach((keyframe, index) => {
      const frame = moved.keyframes[index]!
      close(
        frame.position,
        transformPoint(keyframe.position, draft.sourceVenue.frame, draft.targetVenue.frame),
      )
      close(
        frame.lookAt,
        transformPoint(keyframe.lookAt, draft.sourceVenue.frame, draft.targetVenue.frame),
      )
      expect([frame.id, frame.time, frame.fov]).toEqual([keyframe.id, keyframe.time, keyframe.fov])
    })
    if (camera.follow) {
      close(
        moved.follow!.offset,
        transformDirection(camera.follow.offset, draft.sourceVenue.frame, draft.targetVenue.frame),
      )
      close(
        moved.follow!.lookAtOffset,
        transformDirection(
          camera.follow.lookAtOffset,
          draft.sourceVenue.frame,
          draft.targetVenue.frame,
        ),
      )
    }
  }
  expect(useCameraStudio.getState().project).toEqual(after)
  expect(undoLastRemount(SCENE)).toBe(true)
  expect(useScene.getState().nodes).toEqual(before)
  expect(useCameraStudio.getState().project).toEqual(beforeProject)
})

test('camera source snapshots survive reload without accumulating transformations', () => {
  setCameras([shot()])
  initializeRemount(SCENE)
  captureProductionLayout(SCENE, ['camera:camera-a'])
  setRotatedTarget()
  previewRemount(SCENE)
  applyRemount(SCENE)
  const first = cameras()
  const graph = JSON.parse(JSON.stringify(useScene.getState().nodes))
  useScene.getState().setScene(graph, useScene.getState().rootNodeIds)
  clearSceneHistory()
  reloadRemount(SCENE)
  previewRemount(SCENE)
  applyRemount(SCENE)
  expect(cameras()).toEqual(first)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
})

test('motion and incomplete follow dependencies reject safely; later keyframes get boundary validation', () => {
  const objectId = addScenery()
  const moving = shot()
  moving.motion = { nodeId: objectId, keyframes: [{ time: 0, position: [0, 0, 0] }] }
  setCameras([moving])
  initializeRemount(SCENE)
  const before = useScene.getState().nodes
  expect(getRemountCandidates().find((c) => c.nodeId === 'camera:camera-a')?.reason).toContain(
    '独立物件运动轨迹',
  )
  expect(() => captureProductionLayout(SCENE, ['camera:camera-a'])).toThrow('独立物件运动轨迹')
  expect(useScene.getState().nodes).toBe(before)
  const follow = shot()
  follow.follow = { nodeId: objectId, mode: 'lookAt', offset: [0, 1, 0], lookAtOffset: [0, 0.3, 0] }
  setCameras([follow])
  expect(() => captureProductionLayout(SCENE, ['camera:camera-a'])).toThrow('同时选入')
  const outside = shot()
  outside.keyframes[1]!.position[0] = 99
  setCameras([outside])
  captureProductionLayout(SCENE, ['camera:camera-a'])
  setRotatedTarget()
  const plan = previewRemount(SCENE)
  expect(
    plan.conflicts.some((c) => c.nodeId === 'camera:camera-a' && c.type === 'out-of-bounds'),
  ).toBe(true)
  expect(() => applyRemount(SCENE)).toThrow('物理冲突')
})

test('changing canonical camera data invalidates a preview and invalid camera coordinates never apply', () => {
  setCameras([shot()])
  initializeRemount(SCENE)
  captureProductionLayout(SCENE, ['camera:camera-a'])
  setRotatedTarget()
  previewRemount(SCENE)
  const changed: CameraProject = cameras()
  changed.shots[0]!.keyframes[0]!.fov = 70
  setCameras(changed.shots)
  expect(isRemountPreviewCurrent(SCENE)).toBe(false)
  expect(() => applyRemount(SCENE)).toThrow('预览已过期')
  changed.shots[0]!.keyframes[0]!.position[0] = Number.NaN
  useScene
    .getState()
    .updateNode(site().id, { metadata: { ...site().metadata, diastageCameraStudio: changed } })
  const before = useScene.getState().nodes
  expect(
    getRemountCandidates().some(
      (candidate) => !candidate.eligible && candidate.reason?.includes('原始机位资料已保留'),
    ),
  ).toBe(true)
  expect(() => captureProductionLayout(SCENE, ['camera:camera-a'])).toThrow()
  expect(useScene.getState().nodes).toBe(before)
})

test('unloaded scene returns no candidates instead of crashing the panel', () => {
  useScene.getState().unloadScene()
  expect(getRemountCandidates()).toEqual([])
})
