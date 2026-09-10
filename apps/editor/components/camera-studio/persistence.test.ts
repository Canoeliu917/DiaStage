import { afterEach, expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import type { StageCommand } from '@pascal-app/core/stage'
import {
  commandMeta,
  connectStageCommandExecutor,
  executeStageCommands,
} from '../../lib/stage/command-executor'
import { createTheatreSceneGraph } from '../../lib/theatre/new-production'
import {
  connectVersionViewSync,
  restoreRehearsalVersion,
  saveRehearsalVersion,
} from '../theatre/versions-panel'
import type { CameraProject } from './model'
import { connectCameraPersistence } from './persistence'
import { newShot } from './presets'
import { useCameraStudio } from './store'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
  useScene.getState().setReadOnly(false)
  useScene.getState().unloadScene()
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  clearSceneHistory()
})
function project(name: string): CameraProject {
  return { version: 1, shots: [{ ...newShot(), name }] }
}
function load(raw?: unknown) {
  const graph = createTheatreSceneGraph()
  const site = graph.nodes[graph.rootNodeIds[0]!]!
  if (raw !== undefined) site.metadata.diastageCameraStudio = raw
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  return site.id
}
function storage(saved: string | null = null) {
  let value = saved
  const writes: string[] = []
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
      writes.push(next)
    },
    writes,
  }
}
function cameraCommand(meta = commandMeta()): StageCommand {
  return {
    type: 'AddCamera',
    meta,
    nodeId: 'camera-proposal',
    name: '新观察机位',
    transform: { position: { x: 1, y: 1.6, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    target: { x: 0, y: 1, z: 3 },
    fieldOfViewDegrees: 45,
  }
}

test('canonical project wins over stale local cache without writes or history', () => {
  const saved = project('项目机位'),
    cache = storage(JSON.stringify(project('旧缓存')))
  load(saved)
  const before = useScene.getState().nodes
  cleanups.push(connectCameraPersistence('saved', cache))
  expect(useCameraStudio.getState().project).toEqual(saved)
  expect(useScene.getState().nodes).toBe(before)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  expect(cache.writes).toHaveLength(0)
  useCameraStudio.getState().setProject(structuredClone(saved))
  expect(useScene.getState().nodes).toBe(before)
  expect(cache.writes).toHaveLength(0)
})

test('canonical cameras load even when browser storage is unavailable', () => {
  const saved = project('项目机位')
  load(saved)
  cleanups.push(
    connectCameraPersistence('saved', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    }),
  )
  expect(useCameraStudio.getState().project).toEqual(saved)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
})

test('malformed canonical data is retained on load and later scene updates without uncaught errors', () => {
  const malformed = { version: 7, shots: [{ unknown: '保留原始机位' }] }
  const id = load(malformed),
    cache = storage(JSON.stringify(project('缓存')))
  cleanups.push(connectCameraPersistence('malformed', cache))
  expect(useCameraStudio.getState().project.shots).toHaveLength(0)
  expect(useCameraStudio.getState().notice).toContain('原始数据已保留')
  useCameraStudio.getState().addShot(newShot())
  expect(useScene.getState().nodes[id]!.metadata.diastageCameraStudio).toEqual(malformed)
  expect(useCameraStudio.getState().project.shots).toHaveLength(0)
  expect(cache.writes).toHaveLength(0)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  const saved = project('恢复项目机位')
  useScene.getState().updateNode(id, {
    metadata: { ...useScene.getState().nodes[id]!.metadata, diastageCameraStudio: saved },
  })
  expect(useCameraStudio.getState().project).toEqual(saved)
  expect(() =>
    useScene.getState().updateNode(id, {
      metadata: { ...useScene.getState().nodes[id]!.metadata, diastageCameraStudio: malformed },
    }),
  ).not.toThrow()
  expect(useCameraStudio.getState().project.shots).toHaveLength(0)
  expect(useScene.getState().nodes[id]!.metadata.diastageCameraStudio).toEqual(malformed)
})

test('AddCamera plus scenery is one transaction and one undo/redo preserves preexisting cameras', () => {
  const saved = project('原有机位'),
    id = load(saved),
    cache = storage()
  cleanups.push(connectCameraPersistence('mixed', cache), connectStageCommandExecutor())
  const before = JSON.stringify(useScene.getState().nodes),
    meta = commandMeta()
  const result = executeStageCommands([
    cameraCommand(meta),
    {
      type: 'AddScenery',
      meta: { ...meta, commandId: 'scenery' },
      nodeId: 'chair',
      name: '椅子',
      kind: 'chair',
      libraryAssetId: null,
      dimensionsMeters: { width: 0.5, height: 0.9, depth: 0.5 },
      transform: { position: { x: -1, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(result.error).toBeUndefined()
  expect(result.ok).toBe(true)
  expect(useCameraStudio.getState().project.shots).toHaveLength(2)
  expect(useCameraStudio.getState().project.shots[0]).toEqual(saved.shots[0])
  const after = JSON.stringify(useScene.getState().nodes)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  expect(cache.writes).toHaveLength(0)
  useScene.temporal.getState().undo()
  expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
  expect(useCameraStudio.getState().project).toEqual(saved)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  expect(useScene.temporal.getState().futureStates).toHaveLength(1)
  useScene.temporal.getState().redo()
  expect(JSON.stringify(useScene.getState().nodes)).toBe(after)
  expect(useCameraStudio.getState().project).toEqual(
    useScene.getState().nodes[id]!.metadata.diastageCameraStudio,
  )
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  expect(useScene.temporal.getState().futureStates).toHaveLength(0)
})

test('undoing the first camera restores an absent canonical field without resurrecting it', () => {
  load()
  const cache = storage()
  cleanups.push(connectCameraPersistence('blank', cache), connectStageCommandExecutor())
  const before = JSON.stringify(useScene.getState().nodes)
  expect(executeStageCommands([cameraCommand()]).ok).toBe(true)
  expect(useCameraStudio.getState().project.shots).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
  expect(useCameraStudio.getState().project.shots).toHaveLength(0)
  expect(cache.writes).toHaveLength(0)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  useScene.temporal.getState().redo()
  expect(useCameraStudio.getState().project.shots).toHaveLength(1)
})

test('legacy cache edits retain the original undo baseline and respect read-only scenes', () => {
  const saved = project('旧缓存机位'),
    id = load(),
    cache = storage(JSON.stringify(saved))
  cleanups.push(connectCameraPersistence('legacy', cache))
  useCameraStudio.getState().addShot(newShot())
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  expect(cache.writes).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes[id]!.metadata.diastageCameraStudio).toBeUndefined()
  expect(useCameraStudio.getState().project).toEqual(saved)
  expect(useScene.temporal.getState().futureStates).toHaveLength(1)
  const before = useScene.getState().nodes
  useScene.getState().setReadOnly(true)
  useCameraStudio.getState().addShot(newShot())
  expect(useScene.getState().nodes).toBe(before)
  expect(useCameraStudio.getState().project).toEqual(saved)
  expect(cache.writes).toHaveLength(1)
})

test('rehearsal version view synchronization restores cameras in one scene undo/redo', () => {
  const original = project('版本机位'),
    id = load(original)
  cleanups.push(connectCameraPersistence('versions', storage()), connectVersionViewSync())
  saveRehearsalVersion('机位版本')
  const versions = useScene.getState().nodes[id]!.metadata.diastageRehearsalVersions as {
    id: string
  }[]
  const edited = project('编辑后机位')
  useCameraStudio.getState().setProject(edited)
  clearSceneHistory()
  const before = structuredClone(useScene.getState().nodes)
  restoreRehearsalVersion(versions[0]!.id)
  expect(useCameraStudio.getState().project).toEqual(original)
  expect(useScene.getState().nodes[id]!.metadata.diastageCameraStudio).toEqual(original)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useCameraStudio.getState().project).toEqual(edited)
  expect(useScene.getState().nodes[id]!.metadata.diastageCameraStudio).toEqual(edited)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  expect(useScene.temporal.getState().futureStates).toHaveLength(1)
  const restored = structuredClone(useScene.getState().nodes)
  delete restored[id]!.metadata.diastageRestoredView
  expect(restored).toEqual(before)
  useScene.temporal.getState().redo()
  expect(useCameraStudio.getState().project).toEqual(original)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
})
