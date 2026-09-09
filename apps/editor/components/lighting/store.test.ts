import { beforeEach, describe, expect, test } from 'bun:test'
import { useScene } from '@pascal-app/core'
import { useCameraStudio } from '../camera-studio/store'
import { createStageLight, MAX_STAGE_LIGHTS } from './model'
import { useLighting } from './store'

beforeEach(() => {
  useLighting.setState(useLighting.getInitialState(), true)
})

describe('lighting edits and history', () => {
  test('starts empty and adds at most four individually undoable lights', () => {
    expect(useLighting.getState().project.lights).toEqual([])
    expect(useLighting.getState().showHelpers).toBe(true)
    expect(useLighting.getState().loadedSceneId).toBeNull()
    for (let index = 0; index < MAX_STAGE_LIGHTS; index++) {
      const id = useLighting.getState().addLight()
      expect(id).toBeString()
      expect(useLighting.getState().selectedLightId).toBe(id)
    }
    const full = useLighting.getState().project
    expect(useLighting.getState().addLight()).toBeNull()
    expect(useLighting.getState().project).toBe(full)
    expect(useLighting.getState().past).toHaveLength(4)
    expect(useLighting.getState().notice).toContain('4 盏')
    useLighting.getState().undo()
    expect(useLighting.getState().project.lights).toHaveLength(3)
    useLighting.getState().redo()
    expect(useLighting.getState().project).toBe(full)
  })

  test('many drag drafts commit once and undo/redo never touch scene or camera state', () => {
    useLighting.getState().setProject({ version: 1, lights: [createStageLight('key', 0)] })
    const original = useLighting.getState().project
    const scene = useScene.getState()
    const cameras = useCameraStudio.getState()
    let committed = 0
    const unsubscribe = useLighting.subscribe((next, previous) => {
      if (next.project !== previous.project) committed++
    })
    for (let index = 1; index <= 20; index++) {
      useLighting.getState().setDraft({ id: 'key', position: [index, 4, 2], target: [0, 1, 0] })
    }
    expect(useLighting.getState().project).toBe(original)
    expect(useLighting.getState().past).toEqual([])
    expect(committed).toBe(0)
    const draft = useLighting.getState().draft!
    useLighting.getState().updateLight(draft.id, { position: draft.position, target: draft.target })
    const edited = useLighting.getState().project
    expect(committed).toBe(1)
    expect(useLighting.getState().past).toEqual([original])
    expect(useLighting.getState().draft).toBeNull()
    useLighting.getState().undo()
    expect(useLighting.getState().project).toBe(original)
    useLighting.getState().redo()
    expect(useLighting.getState().project).toBe(edited)
    expect(useScene.getState()).toBe(scene)
    expect(useCameraStudio.getState()).toBe(cameras)
    unsubscribe()
  })

  test('cancels draft edits without changing data or adding history', () => {
    useLighting.getState().setProject({ version: 1, lights: [createStageLight('key', 0)] })
    const project = useLighting.getState().project
    const position: [number, number, number] = [5, 4, 2]
    useLighting.getState().setDraft({ id: 'key', position, target: [0, 0, 0] })
    position[0] = 99
    expect(useLighting.getState().draft?.position[0]).toBe(5)
    useLighting.getState().setDraft(null)
    expect(useLighting.getState().draft).toBeNull()
    expect(useLighting.getState().project).toBe(project)
    expect(useLighting.getState().past).toEqual([])
    useLighting.getState().setShowHelpers(false)
    useLighting.getState().setEditTarget('target')
    expect(useLighting.getState().showHelpers).toBe(false)
    expect(useLighting.getState().editTarget).toBe('target')
    expect(useLighting.getState().project).toBe(project)
  })

  test('invalid imports, patches, and drafts fail atomically', () => {
    useLighting.getState().setProject({ version: 1, lights: [createStageLight('key', 0)] })
    const original = useLighting.getState()
    expect(() => useLighting.getState().setProject({ version: 99, lights: [] })).toThrow()
    expect(() => useLighting.getState().updateLight('key', { intensity: Number.NaN })).toThrow()
    expect(() =>
      useLighting.getState().setDraft({ id: 'key', position: [0, 0, 0], target: [0, 0, 0] }),
    ).toThrow()
    expect(useLighting.getState()).toBe(original)
  })

  test('no-op and missing light edits do not add undo steps or change IDs', () => {
    useLighting.getState().setProject({ version: 1, lights: [createStageLight('key', 0)] })
    const project = useLighting.getState().project
    useLighting.getState().updateLight('missing', { intensity: 50 })
    useLighting.getState().removeLight('missing')
    useLighting.getState().selectLight('missing')
    useLighting.getState().updateLight('key', { id: 'replacement', intensity: 150 })
    expect(useLighting.getState().project).toBe(project)
    expect(useLighting.getState().selectedLightId).toBe('key')
    expect(useLighting.getState().past).toEqual([])
  })

  test('deletion restores valid selection and a new edit clears redo', () => {
    useLighting.getState().setProject({
      version: 1,
      lights: [createStageLight('key', 0), createStageLight('fill', 1)],
    })
    useLighting.getState().selectLight('fill')
    useLighting.getState().removeLight('fill')
    expect(useLighting.getState().selectedLightId).toBe('key')
    useLighting.getState().undo()
    expect(useLighting.getState().project.lights.map((light) => light.id)).toEqual(['key', 'fill'])
    expect(useLighting.getState().future).toHaveLength(1)
    useLighting.getState().updateLight('key', { intensity: 75 })
    expect(useLighting.getState().future).toEqual([])
    useLighting.getState().removeLight('key')
    useLighting.getState().removeLight('fill')
    expect(useLighting.getState().selectedLightId).toBeNull()
    useLighting.getState().undo()
    expect(useLighting.getState().selectedLightId).toBe('fill')
  })

  test('explicit project import clones data, clears old history and re-enables persistence', () => {
    useLighting.getState().addLight()
    useLighting.setState({ loadedSceneId: 'scene-a', persistenceBlocked: true })
    const light = createStageLight('imported', 0)
    useLighting.getState().setProject({ version: 1, lights: [light] })
    light.position[0] = 7
    expect(useLighting.getState().project.lights[0]!.position).toEqual([2, 4, 2])
    expect(useLighting.getState().selectedLightId).toBe('imported')
    expect(useLighting.getState().loadedSceneId).toBe('scene-a')
    expect(useLighting.getState().past).toEqual([])
    expect(useLighting.getState().future).toEqual([])
    expect(useLighting.getState().persistenceBlocked).toBe(false)
  })
})
