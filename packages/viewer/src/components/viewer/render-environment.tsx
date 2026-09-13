'use client'

import { createContext, useContext } from 'react'

// Host-controlled presentation policy, never part of a persisted scene.
export const NeutralRenderEnvironment = createContext(false)
export const useNeutralRenderEnvironment = () => useContext(NeutralRenderEnvironment)
export const StableRenderMode = createContext(false)
export const useStableRenderMode = () => useContext(StableRenderMode)
export function stableRenderBudget(coarse: boolean) {
  return { fps: coarse ? 24 : 30, dpr: coarse ? 1 : 1.25 }
}
