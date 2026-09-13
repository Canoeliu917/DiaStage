import { afterEach, expect, test } from 'bun:test'
import { createTheatreDocument } from '../../lib/theatre/schema'
import { assertPerformerLocks, migrateStageDocument } from '../../lib/theatre/simulation'
import { cameraObservationShot } from './beta-observation'
import { newShot } from './presets'
import { useCameraStudio } from './store'

afterEach(() => {
  useCameraStudio.getState().setProject({ version: 1, shots: [] })
  useCameraStudio.getState().setRuntime({ runtimeReady: false, canvas: null, capture: null })
})

test('fixed camera refuses drag, properties and deletion, still allows observation and explicit unlock', () => {
  const shot = { ...newShot(), stageLocked: true }
  const state = useCameraStudio.getState()
  state.setProject({ version: 1, shots: [shot] })
  const before = useCameraStudio.getState().project
  state.setStageDraft({
    shotId: shot.id,
    frameId: shot.keyframes[0]!.id,
    pose: { ...shot.keyframes[0]!, position: [8, 2, 3] },
  })
  expect(useCameraStudio.getState().stageDraft).toBeNull()
  state.updateShot(shot.id, { name: 'changed' })
  state.removeShot(shot.id)
  expect(useCameraStudio.getState().project).toBe(before)
  state.setRuntime({ runtimeReady: true, canvas: null, capture: null })
  state.seek(4)
  expect(useCameraStudio.getState().previewing).toBe(true)
  expect(useCameraStudio.getState().project).toBe(before)
  state.stop()
  state.updateShot(shot.id, { stageLocked: false })
  state.updateShot(shot.id, { name: 'unlocked' })
  expect(useCameraStudio.getState().project.shots[0]!.name).toBe('unlocked')
})

test('Beta adapter preserves every legacy keyframe in storage and exposes one fixed view', () => {
  const shot = newShot()
  shot.motion = {
    nodeId: 'subject',
    keyframes: [
      { time: 0, position: [0, 0, 0] },
      { time: 8, position: [2, 0, 0] },
    ],
  }
  const serialized = JSON.stringify(shot)
  const view = cameraObservationShot(shot)
  expect(view.keyframes).toHaveLength(1)
  expect(view.motion).toBeNull()
  expect(view.follow).toBeNull()
  expect(JSON.stringify(shot)).toBe(serialized)
})

test('fixed performer rejects movement, route edits, deletion and simultaneous unlock-and-move', () => {
  const before = migrateStageDocument(createTheatreDocument('fixed performer'))
  before.rehearsalSimulation.performers = [
    {
      id: 'actor',
      name: 'A',
      color: '#ffffff',
      position: [0, 0, 0],
      facing: 0,
      visible: true,
      stageLocked: true,
    },
  ]
  for (const mutate of [
    (next: typeof before) => {
      next.rehearsalSimulation.performers[0]!.position[0] = 1
    },
    (next: typeof before) => {
      next.rehearsalSimulation.performers = []
    },
    (next: typeof before) => {
      next.rehearsalSimulation.paths.push({
        id: 'path',
        performerId: 'actor',
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        durationSeconds: 5,
        visible: true,
      })
    },
    (next: typeof before) => {
      const actor = next.rehearsalSimulation.performers[0]!
      actor.stageLocked = false
      actor.facing = 1
    },
  ]) {
    const next = structuredClone(before)
    mutate(next)
    expect(() => assertPerformerLocks(before, next)).toThrow('已固定')
  }
  const unlocked = structuredClone(before)
  unlocked.rehearsalSimulation.performers[0]!.stageLocked = false
  expect(() => assertPerformerLocks(before, unlocked)).not.toThrow()
  const moved = structuredClone(unlocked)
  moved.rehearsalSimulation.performers[0]!.position[0] = 1
  expect(() => assertPerformerLocks(unlocked, moved)).not.toThrow()
})
