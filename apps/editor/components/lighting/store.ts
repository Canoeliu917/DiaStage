'use client'

import { create } from 'zustand'
import {
  createStageLight,
  type LightingProject,
  MAX_STAGE_LIGHTS,
  type StageLight,
  validateLightingProject,
} from './model'

export type LightingDraft = Pick<StageLight, 'id' | 'position' | 'target'>
export type LightingState = {
  project: LightingProject
  selectedLightId: string | null
  showHelpers: boolean
  editTarget: 'position' | 'target'
  draft: LightingDraft | null
  loadedSceneId: string | null
  persistenceBlocked: boolean
  notice: string
  past: LightingProject[]
  future: LightingProject[]
  setProject: (input: unknown) => void
  selectLight: (id: string | null) => void
  addLight: () => string | null
  updateLight: (id: string, patch: Partial<StageLight>) => void
  removeLight: (id: string) => void
  setShowHelpers: (visible: boolean) => void
  setEditTarget: (target: LightingState['editTarget']) => void
  setDraft: (draft: LightingDraft | null) => void
  undo: () => void
  redo: () => void
  setNotice: (notice: string) => void
}

export const useLighting = create<LightingState>((set, get) => ({
  project: { version: 1, lights: [] },
  selectedLightId: null,
  showHelpers: true,
  editTarget: 'position',
  draft: null,
  loadedSceneId: null,
  persistenceBlocked: false,
  notice: '',
  past: [],
  future: [],
  setProject: (input) => {
    const project = validateLightingProject(input)
    set({
      project,
      selectedLightId: project.lights[0]?.id ?? null,
      draft: null,
      past: [],
      future: [],
      persistenceBlocked: false,
      notice: '',
    })
  },
  selectLight: (id) => {
    if (id !== null && !get().project.lights.some((light) => light.id === id)) return
    set({ selectedLightId: id, draft: null })
  },
  addLight: () => {
    const state = get()
    if (state.project.lights.length >= MAX_STAGE_LIGHTS) {
      set({ notice: `最多可添加 ${MAX_STAGE_LIGHTS} 盏聚光灯` })
      return null
    }
    const light = createStageLight(crypto.randomUUID(), state.project.lights.length)
    set({
      project: { ...state.project, lights: [...state.project.lights, light] },
      selectedLightId: light.id,
      draft: null,
      past: [...state.past, state.project].slice(-50),
      future: [],
      notice: state.persistenceBlocked ? state.notice : '',
    })
    return light.id
  },
  updateLight: (id, patch) => {
    const state = get()
    if (!state.project.lights.some((light) => light.id === id)) return
    const project = validateLightingProject({
      ...state.project,
      lights: state.project.lights.map((light) =>
        light.id === id ? { ...light, ...patch, id } : light,
      ),
    })
    if (JSON.stringify(project) === JSON.stringify(state.project)) {
      set({ draft: null })
      return
    }
    set({
      project,
      draft: null,
      past: [...state.past, state.project].slice(-50),
      future: [],
      notice: state.persistenceBlocked ? state.notice : '',
    })
  },
  removeLight: (id) => {
    const state = get()
    if (!state.project.lights.some((light) => light.id === id)) return
    const project = {
      ...state.project,
      lights: state.project.lights.filter((light) => light.id !== id),
    }
    set({
      project,
      selectedLightId:
        state.selectedLightId === id ? (project.lights[0]?.id ?? null) : state.selectedLightId,
      draft: null,
      past: [...state.past, state.project].slice(-50),
      future: [],
      notice: state.persistenceBlocked ? state.notice : '',
    })
  },
  setShowHelpers: (showHelpers) => set({ showHelpers, draft: null }),
  setEditTarget: (editTarget) => set({ editTarget, draft: null }),
  setDraft: (draft) => {
    if (!draft) {
      set({ draft: null })
      return
    }
    const light = get().project.lights.find((light) => light.id === draft.id)
    if (!light) return
    const validated = validateLightingProject({
      version: 1,
      lights: [{ ...light, position: draft.position, target: draft.target }],
    }).lights[0]!
    set({ draft: { id: validated.id, position: validated.position, target: validated.target } })
  },
  undo: () => {
    const state = get()
    const project = state.past.at(-1)
    if (!project) return
    set({
      project,
      selectedLightId:
        project.lights.find((light) => light.id === state.selectedLightId)?.id ??
        project.lights[0]?.id ??
        null,
      draft: null,
      past: state.past.slice(0, -1),
      future: [...state.future, state.project].slice(-50),
    })
  },
  redo: () => {
    const state = get()
    const project = state.future.at(-1)
    if (!project) return
    set({
      project,
      selectedLightId:
        project.lights.find((light) => light.id === state.selectedLightId)?.id ??
        project.lights[0]?.id ??
        null,
      draft: null,
      past: [...state.past, state.project].slice(-50),
      future: state.future.slice(0, -1),
    })
  },
  setNotice: (notice) => set({ notice }),
}))
