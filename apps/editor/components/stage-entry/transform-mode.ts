import { create } from 'zustand'

// Toolbar preference only. The existing interaction scope owns each gesture.
export const useStageTransform = create<{ mode: 'move' | 'rotate' | null }>(() => ({ mode: null }))
