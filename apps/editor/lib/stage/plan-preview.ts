import type { StagePlan } from '@pascal-app/core/stage'
import { create } from 'zustand'
import type { SpatialCandidate } from './spatial-constraints'

export const useStagePlanPreview = create<{
  plan: StagePlan | null
  clearanceRegions: SpatialCandidate['clearanceRegions']
  folds: SpatialCandidate['folds']
  // Live layout feedback is not an authorized preview for adoption.
  draft: StagePlan | null
  inspectedId: string | null
  suspended: boolean
  restoreExisting: (() => void) | null
}>(() => ({
  plan: null,
  clearanceRegions: [],
  folds: [],
  draft: null,
  inspectedId: null,
  suspended: false,
  restoreExisting: null,
}))

useStagePlanPreview.subscribe((state) => {
  if (!state.plan && (state.clearanceRegions.length || state.folds.length))
    useStagePlanPreview.setState({ clearanceRegions: [], folds: [] })
})

export async function withoutPlanTransforms(action: () => void | Promise<void>) {
  useStagePlanPreview.setState({ suspended: true })
  useStagePlanPreview.getState().restoreExisting?.()
  try {
    await action()
  } finally {
    useStagePlanPreview.setState({ suspended: false })
  }
}
