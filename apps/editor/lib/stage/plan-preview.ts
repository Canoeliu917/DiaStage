import type { StagePlan } from '@pascal-app/core/stage'
import { create } from 'zustand'

export const useStagePlanPreview = create<{ plan: StagePlan | null }>(() => ({ plan: null }))
