'use client'

import { createContext, useContext } from 'react'

// Host-controlled presentation policy, never part of a persisted scene.
export const NeutralRenderEnvironment = createContext(false)
export const useNeutralRenderEnvironment = () => useContext(NeutralRenderEnvironment)
