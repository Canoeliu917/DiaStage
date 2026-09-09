import type { SlotDeclaration } from '@pascal-app/core'
import type { ColumnNode } from './schema'

export type ColumnSlotId = 'shaft' | 'base' | 'capital' | 'frame'

export const COLUMN_SHAFT_DEFAULT = 'library:concrete-plaster'
export const COLUMN_BASE_DEFAULT = 'library:concrete-plaster'
export const COLUMN_CAPITAL_DEFAULT = 'library:concrete-plaster'
export const COLUMN_FRAME_DEFAULT = 'library:metal-steel'

export function columnSlots(node: ColumnNode): SlotDeclaration[] {
  const slots: SlotDeclaration[] = [
    { slotId: 'shaft', label: '柱身', default: COLUMN_SHAFT_DEFAULT },
  ]

  if (node.baseStyle !== 'none') {
    slots.push({ slotId: 'base', label: '底座', default: COLUMN_BASE_DEFAULT })
  }

  if (node.capitalStyle !== 'none') {
    slots.push({ slotId: 'capital', label: '柱头', default: COLUMN_CAPITAL_DEFAULT })
  }

  if (node.supportStyle !== 'vertical') {
    slots.push({ slotId: 'frame', label: '框架', default: COLUMN_FRAME_DEFAULT })
  }

  return slots
}
