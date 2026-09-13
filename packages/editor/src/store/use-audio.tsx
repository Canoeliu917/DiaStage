'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AudioState {
  masterVolume: number
  sfxVolume: number
  muted: boolean
  setMasterVolume: (v: number) => void
  setSfxVolume: (v: number) => void
  toggleMute: () => void
}

const useAudio = create<AudioState>()(
  persist(
    (set) => ({
      masterVolume: 70,
      sfxVolume: 50,
      muted: false,
      setMasterVolume: (v) => set({ masterVolume: v }),
      setSfxVolume: (v) => set({ sfxVolume: v }),
      toggleMute: () => set((state) => ({ muted: !state.muted })),
    }),
    {
      name: 'diastage-audio-settings',
    },
  ),
)

export default useAudio
