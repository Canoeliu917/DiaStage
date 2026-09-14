import { create } from 'zustand'

// Session-only acknowledgement: never changes collision validation or Scene data.
export const useStageContactFeedback = create(() => ({
  message: '',
  kind: 'none' as 'none' | 'contact' | 'penetration',
  signature: '',
  acknowledged: '',
  contactKey: '',
}))
