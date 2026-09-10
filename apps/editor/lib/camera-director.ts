'use client'

import { useSyncExternalStore } from 'react'
import { z } from 'zod'

export type VectorTuple = [number, number, number]
export type CameraRigType = 'fixed' | 'rail' | 'orbit'
export type CameraEase = 'linear' | 'auto' | 'ease-in' | 'ease-out'
export type PlaybackSource = 'sequence' | 'take'
export type TransportStatus = 'idle' | 'playing' | 'recording' | 'exporting'
export type OutputPreset = 'vertical' | 'landscape' | 'square'

export interface CameraPoseKey {
  position: VectorTuple
  target: VectorTuple
  focalLengthMm: number
  focusDistanceM: number
}

export interface TakeSample extends CameraPoseKey {
  time: number
}

export interface CameraControlSettings {
  enabled: boolean
  positionLagSpeed: number
  rotationLagSpeed: number
  maxSpeed: number
  maxDistance: number
  useSubstepping: boolean
  maxTimeStep: number
}

export interface CameraRigSettings {
  type: CameraRigType
  orbitDegrees: number
  lockOrientationToRail: boolean
}

export interface CameraSequenceSettings {
  duration: number
  easing: CameraEase
  source: PlaybackSource
  start: CameraPoseKey | null
  end: CameraPoseKey | null
}

export interface CineCameraSettings {
  sensorWidthMm: number
  sensorHeightMm: number
  focalLengthMm: number
  aperture: number
  focusDistanceM: number
  smoothFocusChanges: boolean
  focusSmoothingSpeed: number
  focusTargetId: string | null
}

export interface TakeRecorderSettings {
  sampleRate: 24 | 30 | 60
  reduceKeys: boolean
  tolerance: number
  rawSampleCount: number
  keys: TakeSample[]
}

export interface RenderQueueSettings {
  preset: OutputPreset
  width: number
  height: number
  fps: 24 | 25 | 30 | 50 | 60
  bitrateMbps: number
  safeFrame: boolean
}

export interface CameraDirectorAsset {
  version: 1
  control: CameraControlSettings
  rig: CameraRigSettings
  sequence: CameraSequenceSettings
  lens: CineCameraSettings
  take: TakeRecorderSettings
  output: RenderQueueSettings
}

export interface CameraTransportState {
  status: TransportStatus
  currentTime: number
  message: string | null
  error: string | null
}

export interface CameraDirectorState extends CameraDirectorAsset {
  transport: CameraTransportState
}

export interface CameraDirectorRuntime {
  captureKey: (slot: 'start' | 'end') => void
  focusSelection: () => void
  play: () => void
  stop: () => void
  seek: (time: number) => void
  startRecording: () => void
  stopRecording: () => void
  exportVideo: () => Promise<void>
  exportPngSequence: () => Promise<void>
}

const OUTPUT_PRESETS: Record<OutputPreset, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
}

export const DEFAULT_CAMERA_DIRECTOR_STATE: CameraDirectorState = {
  version: 1,
  control: {
    enabled: true,
    positionLagSpeed: 4,
    rotationLagSpeed: 4,
    maxSpeed: 20,
    maxDistance: 1.5,
    useSubstepping: true,
    maxTimeStep: 1 / 60,
  },
  rig: {
    type: 'rail',
    orbitDegrees: 35,
    lockOrientationToRail: true,
  },
  sequence: {
    duration: 6,
    easing: 'auto',
    source: 'sequence',
    start: null,
    end: null,
  },
  lens: {
    sensorWidthMm: 36,
    sensorHeightMm: 20.25,
    focalLengthMm: 50,
    aperture: 2.8,
    focusDistanceM: 4,
    smoothFocusChanges: true,
    focusSmoothingSpeed: 8,
    focusTargetId: null,
  },
  take: {
    sampleRate: 30,
    reduceKeys: true,
    tolerance: 0.025,
    rawSampleCount: 0,
    keys: [],
  },
  output: {
    preset: 'landscape',
    width: 1280,
    height: 720,
    fps: 24,
    bitrateMbps: 4,
    safeFrame: false,
  },
  transport: {
    status: 'idle',
    currentTime: 0,
    message: null,
    error: null,
  },
}

const finite = z.number().finite()
const positive = finite.positive()
const nonnegative = finite.nonnegative()
const vector = z.tuple([finite, finite, finite])
const poseSchema = z.object({
  position: vector,
  target: vector,
  focalLengthMm: positive,
  focusDistanceM: nonnegative,
})
const sampleSchema = poseSchema.extend({ time: nonnegative })
const assetSections = {
  control: z.object({
    enabled: z.boolean(),
    positionLagSpeed: nonnegative,
    rotationLagSpeed: nonnegative,
    maxSpeed: nonnegative,
    maxDistance: nonnegative,
    useSubstepping: z.boolean(),
    maxTimeStep: positive,
  }),
  rig: z.object({
    type: z.enum(['fixed', 'rail', 'orbit']),
    orbitDegrees: finite,
    lockOrientationToRail: z.boolean(),
  }),
  sequence: z.object({
    duration: positive.max(Number.MAX_SAFE_INTEGER / 60 - 1),
    easing: z.enum(['linear', 'auto', 'ease-in', 'ease-out']),
    source: z.enum(['sequence', 'take']),
    start: poseSchema.nullable(),
    end: poseSchema.nullable(),
  }),
  lens: z.object({
    sensorWidthMm: positive,
    sensorHeightMm: positive,
    focalLengthMm: positive,
    aperture: positive,
    focusDistanceM: nonnegative,
    smoothFocusChanges: z.boolean(),
    focusSmoothingSpeed: nonnegative,
    focusTargetId: z.string().min(1).nullable(),
  }),
  take: z.object({
    sampleRate: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    reduceKeys: z.boolean(),
    tolerance: nonnegative,
    rawSampleCount: nonnegative.int().safe(),
    keys: z
      .array(sampleSchema)
      .refine(
        (keys) =>
          keys.every(
            (key, i) =>
              key.time <= Number.MAX_SAFE_INTEGER / 60 - 1 &&
              (i === 0 || key.time > keys[i - 1]!.time),
          ),
        '镜头试拍关键帧时间必须递增且不能重复',
      ),
  }),
  output: z.object({
    preset: z.enum(['vertical', 'landscape', 'square']),
    width: positive.int().max(4096).multipleOf(2),
    height: positive.int().max(4096).multipleOf(2),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
    bitrateMbps: positive.max(100),
    safeFrame: z.boolean(),
  }),
}
const assetSchema = z.object({ version: z.literal(1), ...assetSections })
const storedAssetSchema = z.object({
  version: z.literal(1),
  control: assetSections.control.partial().optional(),
  rig: assetSections.rig.partial().optional(),
  sequence: assetSections.sequence.partial().optional(),
  lens: assetSections.lens.partial().optional(),
  take: assetSections.take.partial().optional(),
  output: assetSections.output.partial().optional(),
})
const transportSchema = z.object({
  status: z.enum(['idle', 'playing', 'recording', 'exporting']),
  currentTime: nonnegative,
  message: z.string().nullable(),
  error: z.string().nullable(),
})

interface DirectorStore {
  state: CameraDirectorState
  serverState: CameraDirectorState
  listeners: Set<() => void>
  hydrated: boolean
}

const directorStores = new Map<string, DirectorStore>()
const runtimes = new Map<string, CameraDirectorRuntime>()

function cloneDefaultState(): CameraDirectorState {
  return {
    ...DEFAULT_CAMERA_DIRECTOR_STATE,
    control: { ...DEFAULT_CAMERA_DIRECTOR_STATE.control },
    rig: { ...DEFAULT_CAMERA_DIRECTOR_STATE.rig },
    sequence: { ...DEFAULT_CAMERA_DIRECTOR_STATE.sequence },
    lens: { ...DEFAULT_CAMERA_DIRECTOR_STATE.lens },
    take: { ...DEFAULT_CAMERA_DIRECTOR_STATE.take, keys: [] },
    output: { ...DEFAULT_CAMERA_DIRECTOR_STATE.output },
    transport: { ...DEFAULT_CAMERA_DIRECTOR_STATE.transport },
  }
}

function getStore(sceneId: string): DirectorStore {
  let store = directorStores.get(sceneId)
  if (!store) {
    const state = cloneDefaultState()
    store = { state, serverState: state, listeners: new Set(), hydrated: false }
    directorStores.set(sceneId, store)
  }
  return store
}

function storageKey(sceneId: string): string {
  return `zhijiao.camera-sequence.v1:${sceneId}`
}

function mergeStoredAsset(value: unknown): CameraDirectorState {
  const defaults = cloneDefaultState()
  const saved = storedAssetSchema.parse(value)

  return {
    ...defaults,
    control: { ...defaults.control, ...saved.control },
    rig: { ...defaults.rig, ...saved.rig },
    sequence: { ...defaults.sequence, ...saved.sequence },
    lens: { ...defaults.lens, ...saved.lens },
    take: {
      ...defaults.take,
      ...saved.take,
      keys: saved.take?.keys ?? [],
    },
    output: { ...defaults.output, ...saved.output },
  }
}

function persistedAsset(state: CameraDirectorState): CameraDirectorAsset {
  return {
    version: 1,
    control: state.control,
    rig: state.rig,
    sequence: state.sequence,
    lens: state.lens,
    take: state.take,
    output: state.output,
  }
}

function emit(store: DirectorStore): void {
  for (const listener of store.listeners) listener()
}

export function hydrateCameraDirector(sceneId: string): void {
  const store = getStore(sceneId)
  if (store.hydrated || typeof window === 'undefined') return
  store.hydrated = true
  try {
    const raw = window.localStorage.getItem(storageKey(sceneId))
    if (raw !== null) store.state = mergeStoredAsset(JSON.parse(raw))
  } catch {
    store.state = {
      ...store.state,
      transport: {
        ...store.state.transport,
        error: '镜头缓存无法读取或数据无效；原缓存未修改，请检查备份。',
      },
    }
  }
  emit(store)
}

export function getCameraDirectorState(sceneId: string): CameraDirectorState {
  return getStore(sceneId).state
}

export function updateCameraDirector(
  sceneId: string,
  updater: (state: CameraDirectorState) => CameraDirectorState,
  options: { persist?: boolean } = {},
): void {
  const store = getStore(sceneId)
  const next = updater(store.state)
  if (next === store.state) return
  const assetChanged =
    (Object.keys(assetSections) as Array<keyof typeof assetSections>).some(
      (key) => next[key] !== store.state[key],
    ) || next.version !== store.state.version
  if (
    !transportSchema.safeParse(next.transport).success ||
    (assetChanged && !assetSchema.safeParse(persistedAsset(next)).success)
  ) {
    store.state = {
      ...store.state,
      transport: {
        ...store.state.transport,
        error: '镜头参数无效：请检查有限数值、帧率与关键帧时间；更改未保存。',
      },
    }
    emit(store)
    return
  }
  store.state = next
  if (options.persist !== false && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey(sceneId), JSON.stringify(persistedAsset(next)))
    } catch {
      store.state = {
        ...next,
        transport: {
          ...next.transport,
          error: '镜头工程保存失败；当前更改仅保留在本次会话，请备份。',
        },
      }
    }
  }
  emit(store)
}

export function subscribeCameraDirector(sceneId: string, listener: () => void): () => void {
  const store = getStore(sceneId)
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}

export function useCameraDirectorState(sceneId: string): CameraDirectorState {
  const store = getStore(sceneId)
  return useSyncExternalStore(
    (listener) => subscribeCameraDirector(sceneId, listener),
    () => store.state,
    () => store.serverState,
  )
}

export function registerCameraDirectorRuntime(
  sceneId: string,
  runtime: CameraDirectorRuntime,
): () => void {
  runtimes.set(sceneId, runtime)
  emit(getStore(sceneId))
  return () => {
    if (runtimes.get(sceneId) !== runtime) return
    runtimes.delete(sceneId)
    emit(getStore(sceneId))
  }
}

export function getCameraDirectorRuntime(sceneId: string): CameraDirectorRuntime | null {
  return runtimes.get(sceneId) ?? null
}

export function useCameraDirectorRuntime(sceneId: string): CameraDirectorRuntime | null {
  return useSyncExternalStore(
    (listener) => subscribeCameraDirector(sceneId, listener),
    () => getCameraDirectorRuntime(sceneId),
    () => null,
  )
}

export function dimensionsForPreset(preset: OutputPreset): { width: number; height: number } {
  return OUTPUT_PRESETS[preset]
}

export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

export function applyCameraEase(value: number, easing: CameraEase): number {
  const t = clamp01(value)
  if (easing === 'linear') return t
  if (easing === 'ease-in') return t * t * t
  if (easing === 'ease-out') return 1 - (1 - t) ** 3
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpTuple(a: VectorTuple, b: VectorTuple, t: number): VectorTuple {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function tupleDistance(a: VectorTuple, b: VectorTuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function interpolatePose(a: CameraPoseKey, b: CameraPoseKey, t: number): CameraPoseKey {
  return {
    position: lerpTuple(a.position, b.position, t),
    target: lerpTuple(a.target, b.target, t),
    focalLengthMm: lerp(a.focalLengthMm, b.focalLengthMm, t),
    focusDistanceM: lerp(a.focusDistanceM, b.focusDistanceM, t),
  }
}

export function sampleSequence(
  sequence: CameraSequenceSettings,
  rig: CameraRigSettings,
  time: number,
): CameraPoseKey | null {
  const { start, end } = sequence
  if (!start || !end) return null
  const normalized = sequence.duration <= 0 ? 1 : time / sequence.duration
  const t = applyCameraEase(normalized, sequence.easing)
  const pose = interpolatePose(start, end, t)

  if (rig.type === 'fixed') {
    pose.position = [...start.position]
    return pose
  }

  if (rig.type === 'rail' && !rig.lockOrientationToRail) {
    pose.target = [
      pose.position[0] + start.target[0] - start.position[0],
      pose.position[1] + start.target[1] - start.position[1],
      pose.position[2] + start.target[2] - start.position[2],
    ]
  }

  if (rig.type === 'orbit') {
    const center = pose.target
    const startOffsetX = start.position[0] - start.target[0]
    const startOffsetY = start.position[1] - start.target[1]
    const startOffsetZ = start.position[2] - start.target[2]
    const angle = ((rig.orbitDegrees * Math.PI) / 180) * t
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    pose.position = [
      center[0] + startOffsetX * cos - startOffsetZ * sin,
      center[1] + startOffsetY,
      center[2] + startOffsetX * sin + startOffsetZ * cos,
    ]
  }

  return pose
}

export function sampleTake(keys: TakeSample[], time: number): CameraPoseKey | null {
  if (keys.length === 0) return null
  const first = keys[0]!
  if (time <= first.time || keys.length === 1) return first
  const last = keys[keys.length - 1]!
  if (time >= last.time) return last

  let low = 0
  let high = keys.length - 1
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (keys[middle]!.time <= time) low = middle
    else high = middle
  }
  const a = keys[low]!
  const b = keys[high]!
  const span = Math.max(b.time - a.time, Number.EPSILON)
  return interpolatePose(a, b, (time - a.time) / span)
}

export function sampleDirectorPose(state: CameraDirectorState, time: number): CameraPoseKey | null {
  if (state.sequence.source === 'take' && state.take.keys.length > 0) {
    return sampleTake(state.take.keys, time)
  }
  return sampleSequence(state.sequence, state.rig, time)
}

export function directorDuration(state: CameraDirectorState): number {
  if (state.sequence.source === 'take' && state.take.keys.length > 0) {
    return state.take.keys[state.take.keys.length - 1]!.time
  }
  return state.sequence.duration
}

export function focalLengthToVerticalFov(focalLengthMm: number, sensorHeightMm: number): number {
  const focal = Math.max(focalLengthMm, 0.1)
  const sensor = Math.max(sensorHeightMm, 0.1)
  return (2 * Math.atan(sensor / (2 * focal)) * 180) / Math.PI
}

function dampValue(current: number, desired: number, speed: number, delta: number): number {
  if (speed <= 0) return desired
  return lerp(current, desired, 1 - Math.exp(-speed * delta))
}

function dampTuple(
  current: VectorTuple,
  desired: VectorTuple,
  speed: number,
  delta: number,
): VectorTuple {
  return [
    dampValue(current[0], desired[0], speed, delta),
    dampValue(current[1], desired[1], speed, delta),
    dampValue(current[2], desired[2], speed, delta),
  ]
}

function clampLagDistance(
  value: VectorTuple,
  desired: VectorTuple,
  maxDistance: number,
): VectorTuple {
  if (maxDistance <= 0) return value
  const distance = tupleDistance(value, desired)
  if (distance <= maxDistance || distance <= Number.EPSILON) return value
  const scale = maxDistance / distance
  return [
    desired[0] + (value[0] - desired[0]) * scale,
    desired[1] + (value[1] - desired[1]) * scale,
    desired[2] + (value[2] - desired[2]) * scale,
  ]
}

function clampStepDistance(
  current: VectorTuple,
  value: VectorTuple,
  maxDistance: number,
): VectorTuple {
  if (maxDistance <= 0) return value
  const distance = tupleDistance(current, value)
  if (distance <= maxDistance || distance <= Number.EPSILON) return value
  const scale = maxDistance / distance
  return [
    current[0] + (value[0] - current[0]) * scale,
    current[1] + (value[1] - current[1]) * scale,
    current[2] + (value[2] - current[2]) * scale,
  ]
}

export function stepDampedPose(
  current: CameraPoseKey,
  desired: CameraPoseKey,
  delta: number,
  settings: CameraControlSettings,
  focusSpeed: number,
): CameraPoseKey {
  if (!settings.enabled || delta <= 0) return desired
  let result: CameraPoseKey = {
    position: [...current.position],
    target: [...current.target],
    focalLengthMm: current.focalLengthMm,
    focusDistanceM: current.focusDistanceM,
  }
  let remaining = Math.min(delta, 0.25)
  const maxStep = settings.useSubstepping ? Math.max(settings.maxTimeStep, 1 / 240) : remaining

  while (remaining > 0) {
    const step = Math.min(remaining, maxStep)
    const dampedPosition = dampTuple(
      result.position,
      desired.position,
      settings.positionLagSpeed,
      step,
    )
    result = {
      position: clampLagDistance(
        clampStepDistance(result.position, dampedPosition, settings.maxSpeed * step),
        desired.position,
        settings.maxDistance,
      ),
      target: dampTuple(result.target, desired.target, settings.rotationLagSpeed, step),
      focalLengthMm: dampValue(
        result.focalLengthMm,
        desired.focalLengthMm,
        settings.rotationLagSpeed,
        step,
      ),
      focusDistanceM: dampValue(result.focusDistanceM, desired.focusDistanceM, focusSpeed, step),
    }
    remaining -= step
  }
  return result
}

function sampleError(sample: TakeSample, a: TakeSample, b: TakeSample): number {
  const span = b.time - a.time
  const t = span <= Number.EPSILON ? 0 : clamp01((sample.time - a.time) / span)
  const expected = interpolatePose(a, b, t)
  return Math.max(
    tupleDistance(sample.position, expected.position),
    tupleDistance(sample.target, expected.target),
    Math.abs(sample.focalLengthMm - expected.focalLengthMm) / 50,
    Math.abs(sample.focusDistanceM - expected.focusDistanceM),
  )
}

/** UE Take Recorder's Reduce Keys analogue: time-aware Ramer–Douglas–Peucker. */
export function reduceTakeKeys(samples: TakeSample[], tolerance: number): TakeSample[] {
  if (samples.length <= 2 || tolerance <= 0) return [...samples]
  const keep = new Set<number>([0, samples.length - 1])
  const stack: Array<[number, number]> = [[0, samples.length - 1]]

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!
    const a = samples[startIndex]!
    const b = samples[endIndex]!
    let greatestError = -1
    let greatestIndex = -1
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const error = sampleError(samples[index]!, a, b)
      if (error > greatestError) {
        greatestError = error
        greatestIndex = index
      }
    }
    if (greatestIndex >= 0 && greatestError > tolerance) {
      keep.add(greatestIndex)
      stack.push([startIndex, greatestIndex], [greatestIndex, endIndex])
    }
  }

  return [...keep].sort((a, b) => a - b).map((index) => samples[index]!)
}
