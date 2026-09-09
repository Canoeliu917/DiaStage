import type { SlotDeclaration } from '@pascal-app/core'

export type LeanToSlotId = 'flashing' | 'ledger' | 'beam' | 'framing' | 'posts' | 'footings'

export const LEAN_TO_SLOT_DEFAULTS: Partial<Record<LeanToSlotId, string>> = {
  flashing: 'library:metal-steel',
  posts: 'library:concrete-plaster',
  footings: 'library:concrete-plaster',
}

export function leanToSlots(): SlotDeclaration[] {
  return [
    { slotId: 'flashing', label: '泛水', default: LEAN_TO_SLOT_DEFAULTS.flashing },
    { slotId: 'ledger', label: '靠墙梁／高位梁', default: LEAN_TO_SLOT_DEFAULTS.ledger },
    { slotId: 'beam', label: '低位梁', default: LEAN_TO_SLOT_DEFAULTS.beam },
    { slotId: 'framing', label: '构架', default: LEAN_TO_SLOT_DEFAULTS.framing },
    { slotId: 'posts', label: '立柱', default: LEAN_TO_SLOT_DEFAULTS.posts },
    { slotId: 'footings', label: '基础墩', default: LEAN_TO_SLOT_DEFAULTS.footings },
  ]
}
