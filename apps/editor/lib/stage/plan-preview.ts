import type { StagePlan } from '@pascal-app/core/stage'
import { create } from 'zustand'

export const useStagePlanPreview = create<{
  plan: StagePlan | null
  // Live layout feedback is not an authorized preview for adoption.
  draft: StagePlan | null
  inspectedId: string | null
  suspended: boolean
  restoreExisting: (() => void) | null
}>(() => ({ plan: null, draft: null, inspectedId: null, suspended: false, restoreExisting: null }))

export async function withoutPlanTransforms(action: () => void | Promise<void>) {
  useStagePlanPreview.setState({ suspended: true })
  useStagePlanPreview.getState().restoreExisting?.()
  try {
    await action()
  } finally {
    useStagePlanPreview.setState({ suspended: false })
  }
}
