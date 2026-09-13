import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  applyCameraEase,
  type CameraControlSettings,
  type CameraDirectorRuntime,
  type CameraPoseKey,
  focalLengthToVerticalFov,
  getCameraDirectorRuntime,
  getCameraDirectorState,
  hydrateCameraDirector,
  reduceTakeKeys,
  registerCameraDirectorRuntime,
  sampleSequence,
  stepDampedPose,
  subscribeCameraDirector,
  type TakeSample,
  updateCameraDirector,
} from './camera-director'

const start: CameraPoseKey = {
  position: [0, 2, 8],
  target: [0, 1, 0],
  focalLengthMm: 35,
  focusDistanceM: 8,
}

const end: CameraPoseKey = {
  position: [4, 3, 4],
  target: [1, 1, 0],
  focalLengthMm: 70,
  focusDistanceM: 4,
}

describe('camera director curves and rigs', () => {
  test('auto easing has UE-style soft endpoints', () => {
    expect(applyCameraEase(0, 'auto')).toBe(0)
    expect(applyCameraEase(0.5, 'auto')).toBe(0.5)
    expect(applyCameraEase(1, 'auto')).toBe(1)
    expect(applyCameraEase(0.1, 'auto')).toBeLessThan(0.1)
  })

  test('fixed rig keeps camera position while allowing target and lens keys', () => {
    const pose = sampleSequence(
      { start, end, duration: 10, easing: 'linear', source: 'sequence' },
      { type: 'fixed', orbitDegrees: 0, lockOrientationToRail: true },
      5,
    )
    expect(pose?.position).toEqual(start.position)
    expect(pose?.target).toEqual([0.5, 1, 0])
    expect(pose?.focalLengthMm).toBe(52.5)
  })

  test('unlocked rail translates while preserving its starting world orientation', () => {
    const pose = sampleSequence(
      { start, end, duration: 10, easing: 'linear', source: 'sequence' },
      { type: 'rail', orbitDegrees: 0, lockOrientationToRail: false },
      5,
    )
    expect(pose?.position).toEqual([2, 2.5, 6])
    expect(pose?.target).toEqual([2, 1.5, -2])
  })

  test('50 mm full-frame vertical field of view uses filmback height', () => {
    expect(focalLengthToVerticalFov(50, 24)).toBeCloseTo(26.99, 1)
  })
})

describe('camera lag', () => {
  const settings: CameraControlSettings = {
    enabled: true,
    positionLagSpeed: 8,
    rotationLagSpeed: 10,
    maxSpeed: 1000,
    maxDistance: 0,
    useSubstepping: true,
    maxTimeStep: 1 / 60,
  }

  test('substeps remain frame-rate independent', () => {
    const current = { ...start, position: [...start.position] as [number, number, number] }
    const oneFrame = stepDampedPose(current, end, 1 / 30, settings, 8)
    const halfFrame = stepDampedPose(current, end, 1 / 60, settings, 8)
    const twoFrames = stepDampedPose(halfFrame, end, 1 / 60, settings, 8)
    expect(oneFrame.position[0]).toBeCloseTo(twoFrames.position[0], 8)
    expect(oneFrame.target[0]).toBeCloseTo(twoFrames.target[0], 8)
  })
})

describe('take recorder Reduce Keys', () => {
  function sample(time: number, x: number, targetX = 0): TakeSample {
    return {
      time,
      position: [x, 1, 5],
      target: [targetX, 1, 0],
      focalLengthMm: 50,
      focusDistanceM: 5,
    }
  }

  test('removes redundant samples from a straight camera move', () => {
    expect(reduceTakeKeys([sample(0, 0), sample(0.5, 1), sample(1, 2)], 0.001)).toHaveLength(2)
  })

  test('keeps a meaningful deviation in position or target', () => {
    expect(reduceTakeKeys([sample(0, 0), sample(0.5, 1, 1), sample(1, 2)], 0.1)).toHaveLength(3)
  })
})

describe('camera director persistence and runtime isolation', () => {
  let previousWindow: PropertyDescriptor | undefined
  let entries: Map<string, string>
  let storage: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
  }
  const key = (sceneId: string) => `zhijiao.camera-sequence.v1:${sceneId}`
  const scene = () => `director-test-${crypto.randomUUID()}`

  beforeEach(() => {
    previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    entries = new Map([['camera-studio:v1:legacy', 'original legacy camera data']])
    storage = {
      getItem: (id) => entries.get(id) ?? null,
      setItem: (id, value) => {
        entries.set(id, value)
      },
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage },
    })
  })

  afterEach(() => {
    expect(entries.get('camera-studio:v1:legacy')).toBe('original legacy camera data')
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  test('partial valid caches merge defaults and keep scenes, listeners and saved assets separate', () => {
    const a = scene(),
      b = scene()
    entries.set(key(a), JSON.stringify({ version: 1, lens: { focalLengthMm: 85 } }))
    hydrateCameraDirector(a)
    hydrateCameraDirector(b)
    expect(getCameraDirectorState(a).lens.focalLengthMm).toBe(85)
    expect(getCameraDirectorState(b).lens.focalLengthMm).toBe(50)
    let aChanges = 0,
      bChanges = 0
    const unsubscribeA = subscribeCameraDirector(a, () => {
      aChanges++
    })
    const unsubscribeB = subscribeCameraDirector(b, () => {
      bChanges++
    })
    updateCameraDirector(a, (state) => ({ ...state, rig: { ...state.rig, type: 'orbit' } }))
    expect(aChanges).toBe(1)
    expect(bChanges).toBe(0)
    expect(getCameraDirectorState(b).rig.type).toBe('rail')
    const saved = JSON.parse(entries.get(key(a))!)
    expect(saved.rig.type).toBe('orbit')
    expect(saved.transport).toBeUndefined()
    expect(entries.has(key(b))).toBe(false)
    unsubscribeA()
    unsubscribeB()
  })

  test('damaged cache values are reported and never silently rewritten during hydration', () => {
    const invalid = [
      '{',
      'null',
      '[]',
      '{"version":2}',
      '{"version":1,"control":[]}',
      '{"version":1,"sequence":{"duration":1e309}}',
      '{"version":1,"output":{"fps":0}}',
      '{"version":1,"output":{"width":-1}}',
      '{"version":1,"take":{"sampleRate":-30}}',
      JSON.stringify({ version: 1, sequence: { start: { ...start, position: [1, 2] } } }),
      JSON.stringify({
        version: 1,
        take: {
          keys: [
            { ...start, time: 1 },
            { ...end, time: 0 },
          ],
        },
      }),
      JSON.stringify({
        version: 1,
        take: {
          keys: [
            { ...start, time: 1 },
            { ...end, time: 1 },
          ],
        },
      }),
    ]
    for (const raw of invalid) {
      const id = scene()
      entries.set(key(id), raw)
      hydrateCameraDirector(id)
      expect(getCameraDirectorState(id).transport.error).toContain('缓存')
      expect(getCameraDirectorState(id).take.sampleRate).toBe(30)
      expect(getCameraDirectorState(id).output.fps).toBe(24)
      expect(entries.get(key(id))).toBe(raw)
    }
  })

  test('invalid in-memory updates retain the valid asset and report a notice without persisting', () => {
    const id = scene()
    hydrateCameraDirector(id)
    const previous = getCameraDirectorState(id)
    updateCameraDirector(id, (state) => ({
      ...state,
      control: { ...state.control, maxTimeStep: NaN },
    }))
    expect(getCameraDirectorState(id).control).toBe(previous.control)
    expect(getCameraDirectorState(id).transport.error).toContain('参数无效')
    expect(entries.has(key(id))).toBe(false)
    updateCameraDirector(id, (state) => ({
      ...state,
      take: { ...state.take, sampleRate: -30 as 30 },
    }))
    expect(getCameraDirectorState(id).take.sampleRate).toBe(30)
    updateCameraDirector(
      id,
      (state) => ({ ...state, transport: { ...state.transport, currentTime: Infinity } }),
      { persist: false },
    )
    expect(getCameraDirectorState(id).transport.currentTime).toBe(0)
  })

  test('storage failures leave the current session usable and show an error', () => {
    storage.getItem = () => {
      throw new Error('storage disabled')
    }
    const readScene = scene()
    hydrateCameraDirector(readScene)
    expect(getCameraDirectorState(readScene).transport.error).toContain('缓存')
    storage.setItem = () => {
      throw new Error('quota exceeded')
    }
    const saveScene = scene()
    updateCameraDirector(saveScene, (state) => ({ ...state, lens: { ...state.lens, aperture: 4 } }))
    expect(getCameraDirectorState(saveScene).lens.aperture).toBe(4)
    expect(getCameraDirectorState(saveScene).transport.error).toContain('保存失败')
  })

  test('runtime registration and unmount publish ready snapshots only to their scene', () => {
    const a = scene(),
      b = scene()
    const observed: Array<CameraDirectorRuntime | null> = []
    let bChanges = 0
    const unsubscribeA = subscribeCameraDirector(a, () =>
      observed.push(getCameraDirectorRuntime(a)),
    )
    const unsubscribeB = subscribeCameraDirector(b, () => {
      bChanges++
    })
    const runtimeA = { stop: () => {} } as CameraDirectorRuntime
    const runtimeB = { stop: () => {} } as CameraDirectorRuntime
    const unmountA = registerCameraDirectorRuntime(a, runtimeA)
    const unmountReplacement = registerCameraDirectorRuntime(a, runtimeB)
    unmountA()
    expect(getCameraDirectorRuntime(a)).toBe(runtimeB)
    unmountReplacement()
    expect(getCameraDirectorRuntime(a)).toBeNull()
    expect(observed).toEqual([runtimeA, runtimeB, null])
    expect(bChanges).toBe(0)
    unsubscribeA()
    unsubscribeB()
  })
})
