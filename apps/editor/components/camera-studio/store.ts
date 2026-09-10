'use client'

import { create } from 'zustand'
import {
  type CameraKeyframe,
  type CameraPose,
  type CameraProject,
  type Shot,
  validateCameraProject,
} from './model'

type RuntimeBridge = {
  canvas: HTMLCanvasElement | null
  runtimeReady: boolean
  capture: ((time: number) => CameraKeyframe | null) | null
}
type CameraStudioState = {
  project: CameraProject
  selectedShotId: string | null
  selectedKeyframeId: string | null
  showStageCameras: boolean
  stageTransformMode: 'translate' | 'rotate'
  stageReady: boolean
  floorplanReady: boolean
  stageFocus: (() => void) | null
  setStageFocus: (focus: (() => void) | null) => void
  focusStageCamera: () => void
  monitorVisible: boolean
  monitorCanvas: HTMLCanvasElement | null
  monitorStatus: 'off' | 'waiting' | 'live' | 'paused' | 'unavailable' | 'error'
  monitorMessage: string
  recording: boolean
  stageDraft: { shotId: string; frameId: string; pose: CameraPose } | null
  setStageDraft: (draft: CameraStudioState['stageDraft']) => void
  cameraUndo: CameraProject[]
  cameraRedo: CameraProject[]
  selectKeyframe: (id: string) => void
  setShowStageCameras: (visible: boolean) => void
  setStageTransformMode: (mode: 'translate' | 'rotate') => void
  setStageReady: (ready: boolean) => void
  setFloorplanReady: (ready: boolean) => void
  setMonitorVisible: (visible: boolean) => void
  setMonitorCanvas: (canvas: HTMLCanvasElement | null) => void
  setMonitorStatus: (status: CameraStudioState['monitorStatus'], message?: string) => void
  setRecording: (recording: boolean) => void
  undoCameraEdit: () => void
  redoCameraEdit: () => void
  time: number
  playing: boolean
  previewing: boolean
  notice: string
  canvas: HTMLCanvasElement | null
  runtimeReady: boolean
  capture: RuntimeBridge['capture']
  pendingObservation: number | null
  observeWhenReady: (time: number) => void
  setProject: (project: CameraProject) => void
  selectShot: (id: string) => void
  addShot: (shot: Shot) => void
  updateShot: (id: string, patch: Partial<Shot>) => void
  removeShot: (id: string) => void
  play: () => void
  pause: () => void
  seek: (time: number) => void
  stop: () => void
  captureCamera: (time?: number) => CameraKeyframe | null
  setRuntime: (bridge: RuntimeBridge) => void
  setNotice: (notice: string) => void
}

export const useCameraStudio = create<CameraStudioState>((set, get) => ({
  project: { version: 1, shots: [] },
  selectedShotId: null,
  selectedKeyframeId: null,
  showStageCameras: true,
  stageTransformMode: 'translate',
  stageReady: false,
  floorplanReady: false,
  stageFocus: null,
  setStageFocus: (stageFocus) => set({ stageFocus }),
  focusStageCamera: () => {
    if (get().stageReady && !get().recording && !get().playing && !get().previewing)
      get().stageFocus?.()
  },
  monitorVisible: true,
  monitorCanvas: null,
  monitorStatus: 'waiting',
  monitorMessage: '等待机位与场景加载',
  recording: false,
  stageDraft: null,
  setStageDraft: (stageDraft) => set({ stageDraft }),
  cameraUndo: [],
  cameraRedo: [],
  selectKeyframe: (id) => {
    const state = get()
    if (state.recording) return
    const frame = state.project.shots
      .find((shot) => shot.id === state.selectedShotId)
      ?.keyframes.find((frame) => frame.id === id)
    if (frame) set({ selectedKeyframeId: id, time: frame.time, playing: false, previewing: false })
  },
  setShowStageCameras: (showStageCameras) => set({ showStageCameras }),
  setStageTransformMode: (stageTransformMode) => set({ stageTransformMode }),
  setStageReady: (stageReady) => set({ stageReady }),
  setFloorplanReady: (floorplanReady) => set({ floorplanReady }),
  setMonitorVisible: (monitorVisible) => set({ monitorVisible }),
  setMonitorCanvas: (monitorCanvas) => set({ monitorCanvas }),
  setMonitorStatus: (monitorStatus, monitorMessage = '') => {
    if (get().monitorStatus !== monitorStatus || get().monitorMessage !== monitorMessage)
      set({ monitorStatus, monitorMessage })
  },
  setRecording: (recording) => set({ recording }),
  undoCameraEdit: () => {
    const state = get()
    if (state.recording || state.playing || state.previewing) return
    const project = state.cameraUndo.at(-1)
    if (!project) return
    const shot = project.shots.find((shot) => shot.id === state.selectedShotId) ?? project.shots[0]
    const frame =
      shot?.keyframes.find((frame) => frame.id === state.selectedKeyframeId) ?? shot?.keyframes[0]
    set({
      project,
      selectedShotId: shot?.id ?? null,
      selectedKeyframeId: frame?.id ?? null,
      time: frame?.time ?? 0,
      cameraUndo: state.cameraUndo.slice(0, -1),
      cameraRedo: [...state.cameraRedo, state.project].slice(-50),
    })
  },
  redoCameraEdit: () => {
    const state = get()
    if (state.recording || state.playing || state.previewing) return
    const project = state.cameraRedo.at(-1)
    if (!project) return
    const shot = project.shots.find((shot) => shot.id === state.selectedShotId) ?? project.shots[0]
    const frame =
      shot?.keyframes.find((frame) => frame.id === state.selectedKeyframeId) ?? shot?.keyframes[0]
    set({
      project,
      selectedShotId: shot?.id ?? null,
      selectedKeyframeId: frame?.id ?? null,
      time: frame?.time ?? 0,
      cameraUndo: [...state.cameraUndo, state.project].slice(-50),
      cameraRedo: state.cameraRedo.slice(0, -1),
    })
  },
  time: 0,
  playing: false,
  previewing: false,
  notice: '',
  canvas: null,
  runtimeReady: false,
  pendingObservation: null,
  observeWhenReady: (time) => {
    if (!Number.isFinite(time) || !get().selectedShotId) return
    if (get().runtimeReady) get().seek(time)
    else set({ pendingObservation: time })
  },
  capture: null,
  setProject: (input) => {
    const project = validateCameraProject(input)
    set({
      project,
      selectedShotId: project.shots[0]?.id ?? null,
      selectedKeyframeId: project.shots[0]?.keyframes[0]?.id ?? null,
      cameraUndo: [],
      cameraRedo: [],
      stageDraft: null,
      pendingObservation: null,
      time: 0,
      playing: false,
      previewing: false,
      notice: '',
    })
  },
  selectShot: (id) => {
    if (get().recording) return
    const shot = get().project.shots.find((shot) => shot.id === id)
    if (!shot) return
    set({
      selectedShotId: id,
      selectedKeyframeId: shot.keyframes[0]?.id ?? null,
      time: shot.keyframes[0]?.time ?? 0,
      playing: false,
      previewing: false,
      notice: '',
    })
  },
  addShot: (shot) => {
    if (get().recording) return
    const project = validateCameraProject({
      ...get().project,
      shots: [...get().project.shots, shot],
    })
    set({
      project,
      selectedShotId: shot.id,
      selectedKeyframeId: shot.keyframes[0]?.id ?? null,
      cameraUndo: [...get().cameraUndo, get().project].slice(-50),
      cameraRedo: [],
      time: 0,
      playing: false,
      previewing: false,
      notice: '',
    })
  },
  updateShot: (id, patch) => {
    if (get().recording || !get().project.shots.some((shot) => shot.id === id)) return
    const project = validateCameraProject({
      ...get().project,
      shots: get().project.shots.map((shot) => (shot.id === id ? { ...shot, ...patch, id } : shot)),
    })
    const selected = project.shots.find((shot) => shot.id === get().selectedShotId)
    if (JSON.stringify(project) === JSON.stringify(get().project)) return
    set({
      project,
      selectedKeyframeId:
        selected?.keyframes.find((frame) => frame.id === get().selectedKeyframeId)?.id ??
        selected?.keyframes[0]?.id ??
        null,
      cameraUndo: [...get().cameraUndo, get().project].slice(-50),
      cameraRedo: [],
      time: Math.min(get().time, selected?.duration ?? 0),
      playing: false,
      previewing: false,
    })
  },
  removeShot: (id) => {
    if (get().recording) return
    const project = {
      ...get().project,
      shots: get().project.shots.filter((shot) => shot.id !== id),
    }
    set({
      project,
      selectedKeyframeId:
        get().selectedShotId === id
          ? (project.shots[0]?.keyframes[0]?.id ?? null)
          : get().selectedKeyframeId,
      cameraUndo: [...get().cameraUndo, get().project].slice(-50),
      cameraRedo: [],
      selectedShotId:
        get().selectedShotId === id ? (project.shots[0]?.id ?? null) : get().selectedShotId,
      time: 0,
      playing: false,
      previewing: false,
    })
  },
  play: () => {
    const state = get(),
      shot = state.project.shots.find((shot) => shot.id === state.selectedShotId)
    if (!shot) return
    if (!state.runtimeReady) {
      set({ notice: '请切换到 3D 透视视图，并等待场景加载完成' })
      return
    }
    set({
      playing: true,
      previewing: true,
      time: state.time >= shot.duration ? 0 : state.time,
      notice: '',
    })
  },
  pause: () => set({ playing: false }),
  seek: (time) => {
    const state = get(),
      shot = state.project.shots.find((shot) => shot.id === state.selectedShotId)
    if (!shot || !Number.isFinite(time)) return
    if (!state.runtimeReady) {
      set({ notice: '请切换到 3D 透视视图，并等待场景加载完成' })
      return
    }
    set({
      time: Math.max(0, Math.min(shot.duration, time)),
      playing: false,
      previewing: true,
      notice: '',
    })
  },
  stop: () => set({ time: 0, playing: false, previewing: false, pendingObservation: null }),
  captureCamera: (time) => get().capture?.(time ?? get().time) ?? null,
  setRuntime: (bridge) => {
    set(bridge)
    const time = get().pendingObservation
    if (bridge.runtimeReady && time !== null) {
      set({ pendingObservation: null })
      get().seek(time)
    }
  },
  setNotice: (notice) => set({ notice }),
}))
