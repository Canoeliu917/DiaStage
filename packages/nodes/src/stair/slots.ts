import type { SlotDeclaration, StairNode } from '@pascal-app/core'

export type StairSlotId = 'treads' | 'body'

export const STAIR_TREADS_SLOT_DEFAULT = 'library:wood-woodplank48'
export const STAIR_BODY_SLOT_DEFAULT = 'library:preset-lightgrey'

export function stairSlots(node: StairNode): SlotDeclaration[] {
  return [
    { slotId: 'treads', label: '踏板', default: STAIR_TREADS_SLOT_DEFAULT },
    { slotId: 'body', label: '主体', default: STAIR_BODY_SLOT_DEFAULT },
  ]
}
