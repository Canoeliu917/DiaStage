import { afterEach, expect, test } from 'bun:test'
import { clearSceneHistory, ItemNode, useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { connectCameraPersistence } from '../../components/camera-studio/persistence'
import { newShot } from '../../components/camera-studio/presets'
import { useCameraStudio } from '../../components/camera-studio/store'
import {
  connectVersionViewSync,
  restoreRehearsalVersion,
  saveRehearsalVersion,
} from '../../components/theatre/versions-panel'
import { archiveLegacyLighting } from '../legacy-lighting'
import { migrateStudioGroup, migrateStudioPanel } from '../studio-workspaces'
import { sampleRehearsal } from './blocking'
import { createTheatreSceneGraph } from './new-production'
import { createTheatreDocument } from './schema'
import {
  migrateStageDocument,
  runtimeTheatreDocument,
  StageSceneDocumentSchema,
} from './simulation'
import { editStageDocument, readStageDocument } from './simulation-store'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
test('observation waits for the lazy runtime and stale requests do not cross projects', () => {
  const camera = useCameraStudio.getState()
  camera.setProject({ version: 1, shots: [newShot()] })
  camera.setRuntime({ runtimeReady: false })
  camera.observeWhenReady(1)
  expect(useCameraStudio.getState().pendingObservation).toBe(1)
  camera.setRuntime({ runtimeReady: true })
  expect(useCameraStudio.getState().previewing).toBe(true)
  expect(useCameraStudio.getState().time).toBe(1)
  camera.stop()
  camera.setRuntime({ runtimeReady: false })
  camera.observeWhenReady(1)
  camera.setProject({ version: 1, shots: [newShot()] })
  expect(useCameraStudio.getState().pendingObservation).toBeNull()
})
afterEach(() => {
  useScene.getState().setReadOnly(false)
  useScene.getState().unloadScene()
  clearSceneHistory()
})
test('workspace and panel IDs migrate without reviving cancelled entries', () => {
  expect(migrateStudioGroup('space')).toBe('set')
  expect(migrateStudioGroup('director')).toBe('rehearse')
  expect(migrateStudioGroup('remount')).toBe('remount')
  expect(migrateStudioPanel('theatre-scenes')).toBe('simulation')
  expect(migrateStudioPanel('theatre-props')).toBe('items')
  expect(migrateStudioPanel('camera-studio')).toBe('stage-cameras')
})
test('legacy theatre fields are preserved raw while active simulation contains only spatial facts', () => {
  const old = createTheatreDocument('旧剧目')
  old.scenes[0]!.actions = [{ unrecognized: '旧版导演笔记' }] as never
  const before = JSON.stringify(old)
  const migrated = migrateStageDocument(old)
  expect(migrated.legacy?.theatre).toEqual(old)
  expect(migrated.rehearsalSimulation).toEqual({
    version: 1,
    performers: [],
    paths: [],
    durationSeconds: 20,
  })
  expect('scenes' in migrated).toBe(false)
  expect(JSON.stringify(old)).toBe(before)
  expect(migrateStageDocument(migrated)).toEqual(migrated)
})
test('lighting subtrees and browser cache are archived without losing unknown payloads or mutating the source', () => {
  const graph = createTheatreSceneGraph()
  const site = graph.nodes[graph.rootNodeIds[0]!]!
  const light = ItemNode.parse({
    parentId: site.id,
    asset: {
      id: 'table-lamp',
      name: '台灯',
      category: 'lighting',
      src: '/lamp.glb',
      thumbnail: '',
    },
  })
  graph.nodes[light.id] = light
  if ('children' in site) site.children.push(light.id)
  const raw = {
    ...graph,
    nodes: {
      ...graph.nodes,
      'plugin:child': {
        id: 'plugin:child',
        type: 'plugin:child',
        parentId: light.id,
        extension: [1, 2, 3],
      },
    },
    collections: {
      collection_lamps: { id: 'collection_lamps', name: '保留分组', nodeIds: [light.id] },
    },
  }
  const before = JSON.stringify(raw)
  const migrated = archiveLegacyLighting(raw, '{"version":1,"lights":[{"custom":123}]}')
  expect(migrated.nodes[light.id]).toBeUndefined()
  expect(migrated.nodes['plugin:child']).toBeUndefined()
  const metadata = (migrated.nodes[site.id] as typeof site).metadata
  expect(metadata.legacy).toMatchObject({
    lightingNodes: { [light.id]: light, 'plugin:child': raw.nodes['plugin:child'] },
    lightingStorage: '{"version":1,"lights":[{"custom":123}]}',
    lightingCollections: raw.collections,
  })
  expect(JSON.stringify(raw)).toBe(before)
  expect(archiveLegacyLighting(migrated)).toEqual(migrated)
})
test('new simulation validates finite numbers and reuses deterministic route sampling', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  editStageDocument((d) => {
    d.rehearsalSimulation.performers.push({
      id: 'p',
      name: '甲',
      color: '#888888',
      position: [0, 0, 0],
      facing: 0,
      visible: true,
    })
    d.rehearsalSimulation.paths.push({
      id: 'path',
      performerId: 'p',
      points: [
        [0, 0, 0],
        [6, 0, 0],
      ],
      durationSeconds: 6,
      visible: true,
    })
  })
  const doc = readStageDocument()!
  const scene = runtimeTheatreDocument(doc).scenes[0]!
  expect(sampleRehearsal(scene, 3).roles[0]!.position).toEqual([3, 0, 0])
  expect(sampleRehearsal(scene, 6).roles[0]!.position).toEqual([6, 0, 0])
  expect(() =>
    editStageDocument((d) => {
      d.rehearsalSimulation.performers[0]!.position[0] = NaN
    }),
  ).toThrow()
  expect(readStageDocument()).toEqual(doc)
  expect(
    StageSceneDocumentSchema.safeParse({
      ...doc,
      rehearsalSimulation: { ...doc.rehearsalSimulation, durationSeconds: Infinity },
    }).success,
  ).toBe(false)
})
test('version restore and one undo recover scenery, simulation, camera and display without recording legacy data', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useCameraStudio.getState().setProject({ version: 1, shots: [newShot()] })
  useViewer.getState().setShowGrid(true)
  saveRehearsalVersion('首版', '首次合成排演')
  const rootId = graph.rootNodeIds[0]!
  const versions = useScene.getState().nodes[rootId]!.metadata.diastageRehearsalVersions as {
    id: string
    stageGraph: unknown
  }[]
  expect(JSON.stringify(versions)).not.toMatch(/lighting|objective|obstacle|diastageTheatre/)
  editStageDocument((d) => {
    d.venue.width = 12
  })
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  useViewer.getState().setShowGrid(false)
  const stopSync = connectVersionViewSync()
  clearSceneHistory()
  try {
    restoreRehearsalVersion(versions[0]!.id)
    const restoredVersions = useScene.getState().nodes[rootId]!.metadata
      .diastageRehearsalVersions as { id: string; restoredFrom?: string; note: string }[]
    expect(restoredVersions).toHaveLength(2)
    expect(restoredVersions[1]!.restoredFrom).toBe(versions[0]!.id)
    expect(restoredVersions[0]!.note).toBe('首次合成排演')
    expect(readStageDocument()!.venue.width).toBe(8)
    expect(useCameraStudio.getState().project.shots).toHaveLength(1)
    expect(useViewer.getState().showGrid).toBe(true)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(readStageDocument()!.venue.width).toBe(12)
    expect(useCameraStudio.getState().project.shots).toHaveLength(0)
    expect(useViewer.getState().showGrid).toBe(false)
    expect(useEditor.getState().viewMode).toBe('3d')
    expect(useScene.getState().nodes[rootId]!.metadata.diastageRehearsalVersions).toHaveLength(1)
  } finally {
    stopSync()
  }
})
test('damaged version recovery does not mutate current scene, undo or stored versions', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  saveRehearsalVersion('合成损坏测试')
  const rootId = graph.rootNodeIds[0]!
  const root = useScene.getState().nodes[rootId]!
  const versions = structuredClone(root.metadata.diastageRehearsalVersions) as {
    id: string
    stageGraph: { rootNodeIds: string[] }
  }[]
  versions[0]!.stageGraph.rootNodeIds = ['site_missing']
  useScene
    .getState()
    .updateNode(rootId, { metadata: { ...root.metadata, diastageRehearsalVersions: versions } })
  const before = useScene.getState().nodes,
    history = useScene.temporal.getState().pastStates
  expect(() => restoreRehearsalVersion(versions[0]!.id)).toThrow()
  expect(useScene.getState().nodes).toBe(before)
  expect(useScene.temporal.getState().pastStates).toBe(history)
})
test('camera persistence loads in SET and never overwrites unreadable legacy caches', () => {
  const data = new Map([
    ['camera-studio:v1:a', JSON.stringify({ version: 1, shots: [newShot()] })],
    ['camera-studio:v1:b', 'corrupt-old-data'],
  ])
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
  let stop = connectCameraPersistence('a', storage)
  expect(useCameraStudio.getState().project.shots).toHaveLength(1)
  useCameraStudio.getState().addShot(newShot())
  expect(JSON.parse(data.get('camera-studio:v1:a')!).shots).toHaveLength(2)
  stop()
  stop = connectCameraPersistence('b', storage)
  useCameraStudio.getState().addShot(newShot())
  expect(data.get('camera-studio:v1:b')).toBe('corrupt-old-data')
  stop()
})
