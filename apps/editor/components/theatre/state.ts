'use client'

import {
  acquireSceneReadOnlyLease,
  getSceneHistoryPauseDepth,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useMemo } from 'react'
import { create } from 'zustand'
import { getCameraDirectorState, subscribeCameraDirector } from '@/lib/camera-director'
import { isTheatreVisibilityOverride } from '@/lib/theatre/presentation'
import { readTheatreDocument } from '@/lib/theatre/scene-adapter'
import { activeRehearsalScene } from '@/lib/theatre/schema'
import { runtimeTheatreDocument } from '@/lib/theatre/simulation'
import { readStageDocument } from '@/lib/theatre/simulation-store'
import { useCameraStudio } from '../camera-studio/store'

let releasePreview: (() => void) | null = null
export function rehearsalIsExclusive(sceneId: string | null): boolean {
  const editor = useEditor.getState()
  const camera = useCameraStudio.getState()
  return (
    editor.isCaptureMode ||
    editor.isFirstPersonMode ||
    editor.isPreviewMode ||
    editor.workspaceMode === 'studio' ||
    ['camera-studio', 'camera-rehearsal'].includes(editor.activeSidebarPanel) ||
    camera.playing ||
    camera.previewing ||
    camera.recording ||
    (sceneId !== null && getCameraDirectorState(sceneId).transport.status !== 'idle')
  )
}
export const useRehearsalPlayback = create<{
  sceneId: string | null
  available: boolean
  time: number
  loop: boolean
  playing: boolean
  previewing: boolean
  error: string
  observation: 'audience' | 'plan' | 'side' | 'director' | 'actor' | null
  configure: (sceneId: string, available: boolean) => void
  stop: () => void
  seek: (time: number) => void
  play: () => void
  pause: () => void
}>((set, get) => {
  const duration = () => {
    const state = get()
    if (!state.available || rehearsalIsExclusive(state.sceneId))
      throw new Error('请先退出机位播放、沉浸预览或专用观察模式')
    if (
      (!releasePreview && useScene.getState().readOnly) ||
      getSceneHistoryPauseDepth() > 0 ||
      useLiveTransforms.getState().transforms.size > 0 ||
      [...useLiveNodeOverrides.getState().overrides.values()].some(
        (override) => override.theatrePreview !== true && !isTheatreVisibilityOverride(override),
      )
    )
      throw new Error('请先结束当前编辑或只读操作')
    const document = readTheatreDocument()
    if (!document) throw new Error('请先建立戏剧排演')
    return activeRehearsalScene(document).duration
  }
  const fail = (error: unknown) => {
    get().stop()
    set({ error: error instanceof Error ? error.message : '无法预演，请重试' })
  }
  return {
    sceneId: null,
    available: false,
    time: 0,
    loop: false,
    playing: false,
    previewing: false,
    error: '',
    observation: null,
    configure: (sceneId, available) => {
      if (get().sceneId !== sceneId || get().available !== available) get().stop()
      set({ sceneId, available })
    },
    seek: (time) => {
      if (!Number.isFinite(time) || time < 0) return
      try {
        const limit = duration()
        releasePreview ??= acquireSceneReadOnlyLease()
        set({ time: Math.min(time, limit), previewing: true, error: '' })
      } catch (error) {
        fail(error)
      }
    },
    play: () => {
      try {
        const limit = duration()
        releasePreview ??= acquireSceneReadOnlyLease()
        set({
          time: get().time >= limit ? 0 : get().time,
          playing: true,
          previewing: true,
          error: '',
        })
      } catch (error) {
        fail(error)
      }
    },
    pause: () => set({ playing: false }),
    stop: () => {
      set({ time: 0, playing: false, previewing: false, observation: null })
      releasePreview?.()
      releasePreview = null
    },
  }
})

/** Release transient poses synchronously, before the scene becomes editable again. */
export function subscribeRehearsalProtection(sceneId: string, restore: () => void) {
  const stopPlayback = useRehearsalPlayback.subscribe((next) => {
    if (!next.previewing) restore()
  })
  const check = () => {
    if (rehearsalIsExclusive(sceneId)) useRehearsalPlayback.getState().stop()
  }
  const stopEditor = useEditor.subscribe(check)
  const stopCamera = useCameraStudio.subscribe(check)
  const stopDirector = subscribeCameraDirector(sceneId, check)
  const stopScene = useScene.subscribe((next, previous) => {
    if (next.nodes !== previous.nodes && useRehearsalPlayback.getState().previewing)
      useRehearsalPlayback.getState().stop()
  })
  return () => {
    useRehearsalPlayback.getState().stop()
    stopPlayback()
    stopEditor()
    stopCamera()
    stopDirector()
    stopScene()
  }
}

export function useTheatreDocument() {
  const nodes = useScene((s) => s.nodes)
  const roots = useScene((s) => s.rootNodeIds)
  return useMemo(() => {
    try {
      const document = readStageDocument(nodes, roots)
      return { document: document ? runtimeTheatreDocument(document) : null, error: null }
    } catch (error) {
      return { document: null, error: error instanceof Error ? error.message : '排演读取失败' }
    }
  }, [nodes, roots])
}
