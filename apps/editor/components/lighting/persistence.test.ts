import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStageLight, validateLightingProject } from './model'
import { connectLightingPersistence } from './persistence'
import { useLighting } from './store'

function memoryStorage() {
  const values = new Map<string, string>()
  const writes: { key: string; value: string }[] = []
  return {
    values,
    writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push({ key, value })
      values.set(key, value)
    },
  }
}

const cleanups: (() => void)[] = []
beforeEach(() => {
  useLighting.setState(useLighting.getInitialState(), true)
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

describe('lighting browser persistence', () => {
  test('loads an empty scene without writing until a real edit, and excludes transient state', () => {
    const storage = memoryStorage()
    cleanups.push(connectLightingPersistence('scene-a', storage))
    expect(useLighting.getState().loadedSceneId).toBe('scene-a')
    expect(useLighting.getState().project.lights).toEqual([])
    expect(storage.writes).toEqual([])
    const id = useLighting.getState().addLight()!
    expect(storage.writes).toHaveLength(1)
    const saved = storage.values.get('lighting:v1:scene-a')!
    expect(validateLightingProject(JSON.parse(saved))).toEqual(useLighting.getState().project)
    useLighting.getState().selectLight(id)
    useLighting.getState().setShowHelpers(false)
    useLighting.getState().setEditTarget('target')
    useLighting.getState().setDraft({ id, position: [5, 4, 2], target: [0, 0, 0] })
    useLighting.getState().setNotice('临时提示')
    expect(storage.writes).toHaveLength(1)
    expect(Object.keys(JSON.parse(saved))).toEqual(['version', 'lights'])
    useLighting.getState().updateLight(id, { position: [5, 4, 2] })
    expect(storage.writes).toHaveLength(2)
    useLighting.getState().undo()
    expect(storage.values.get('lighting:v1:scene-a')).toBe(saved)
    useLighting.getState().redo()
    expect(JSON.parse(storage.values.get('lighting:v1:scene-a')!).lights[0].position).toEqual([
      5, 4, 2,
    ])
  })

  test('scene switch clears drafts/history and never writes one scene into another', () => {
    const storage = memoryStorage()
    const stopA = connectLightingPersistence('scene-a', storage)
    const lightA = useLighting.getState().addLight()!
    useLighting.getState().updateLight(lightA, { intensity: 21 })
    useLighting.getState().setDraft({ id: lightA, position: [7, 4, 2], target: [0, 0, 0] })
    const savedA = storage.values.get('lighting:v1:scene-a')
    stopA()
    expect(useLighting.getState().loadedSceneId).toBeNull()
    expect(useLighting.getState().draft).toBeNull()
    const stopB = connectLightingPersistence('scene-b', storage)
    expect(useLighting.getState().project.lights).toEqual([])
    expect(useLighting.getState().past).toEqual([])
    expect(useLighting.getState().future).toEqual([])
    const lightB = useLighting.getState().addLight()!
    expect(lightB).not.toBe(lightA)
    expect(storage.values.get('lighting:v1:scene-a')).toBe(savedA)
    stopB()
    cleanups.push(connectLightingPersistence('scene-a', storage))
    expect(useLighting.getState().project.lights[0]!.id).toBe(lightA)
    expect(useLighting.getState().project.lights[0]!.intensity).toBe(21)
    expect(useLighting.getState().past).toEqual([])
    expect(storage.writes.map((write) => write.key)).toEqual([
      'lighting:v1:scene-a',
      'lighting:v1:scene-a',
      'lighting:v1:scene-b',
    ])
  })

  test('valid saved data survives mount, cleanup and remount without automatic rewrites', () => {
    const storage = memoryStorage()
    const project = { version: 1, lights: [createStageLight('saved', 0)] }
    const raw = JSON.stringify(project, null, 2)
    storage.values.set('lighting:v1:scene-a', raw)
    const stop = connectLightingPersistence('scene-a', storage)
    expect(useLighting.getState().selectedLightId).toBe('saved')
    expect(useLighting.getState().project).toEqual(project)
    stop()
    cleanups.push(connectLightingPersistence('scene-a', storage))
    expect(storage.writes).toEqual([])
    expect(storage.values.get('lighting:v1:scene-a')).toBe(raw)
  })

  test('keeps corrupt cache untouched until an explicit validated import repairs it', () => {
    const storage = memoryStorage()
    const corrupt = '{"version":1,"lights":broken'
    storage.values.set('lighting:v1:broken', corrupt)
    cleanups.push(connectLightingPersistence('broken', storage))
    expect(useLighting.getState().persistenceBlocked).toBe(true)
    expect(useLighting.getState().notice).toContain('原始数据已保留')
    const id = useLighting.getState().addLight()!
    useLighting.getState().updateLight(id, { intensity: 20 })
    useLighting.getState().undo()
    expect(storage.writes).toEqual([])
    expect(storage.values.get('lighting:v1:broken')).toBe(corrupt)
    expect(() => useLighting.getState().setProject({ version: 2, lights: [] })).toThrow()
    expect(useLighting.getState().persistenceBlocked).toBe(true)
    expect(storage.values.get('lighting:v1:broken')).toBe(corrupt)
    const imported = { version: 1, lights: [createStageLight('repaired', 0)] }
    useLighting.getState().setProject(imported)
    expect(useLighting.getState().persistenceBlocked).toBe(false)
    expect(storage.writes).toHaveLength(1)
    expect(JSON.parse(storage.values.get('lighting:v1:broken')!)).toEqual(imported)
  })

  test('preserves valid JSON with invalid schema and reports unavailable storage', () => {
    const storage = memoryStorage()
    const raw = '{"version":9,"lights":[]}'
    storage.values.set('lighting:v1:unsupported', raw)
    const stop = connectLightingPersistence('unsupported', storage)
    expect(useLighting.getState().persistenceBlocked).toBe(true)
    expect(storage.values.get('lighting:v1:unsupported')).toBe(raw)
    expect(storage.writes).toEqual([])
    stop()
    cleanups.push(
      connectLightingPersistence('unavailable', {
        getItem: () => {
          throw new Error('storage blocked')
        },
        setItem: storage.setItem,
      }),
    )
    expect(useLighting.getState().loadedSceneId).toBe('unavailable')
    expect(useLighting.getState().persistenceBlocked).toBe(true)
    expect(useLighting.getState().notice).toContain('读取失败')
  })

  test('save failure is visible and preserves the in-memory project for export and retry', () => {
    const storage = memoryStorage()
    let quotaExceeded = true
    cleanups.push(
      connectLightingPersistence('scene-a', {
        getItem: storage.getItem,
        setItem: (key, value) => {
          if (quotaExceeded) throw new Error('quota exceeded')
          storage.setItem(key, value)
        },
      }),
    )
    const id = useLighting.getState().addLight()!
    expect(useLighting.getState().notice).toContain('未能保存')
    expect(useLighting.getState().project.lights[0]!.id).toBe(id)
    expect(storage.writes).toEqual([])
    quotaExceeded = false
    useLighting.getState().updateLight(id, { intensity: 30 })
    expect(storage.writes).toHaveLength(1)
    expect(JSON.parse(storage.values.get('lighting:v1:scene-a')!).lights[0].intensity).toBe(30)
    expect(useLighting.getState().notice).toBe('')
  })
})
