import type { SlotDeclaration } from '@pascal-app/core'

export type WindowSlotId = 'frame' | 'glass'

// Picker swatches. Rendering falls back to the live frame/glass defaults (which
// already track shading + theme), so these are just the indicator colours.
const FRAME_DEFAULT = 'library:preset-softwhite'
const GLASS_DEFAULT = 'library:preset-glass'

/** A window exposes two paintable slots: the joinery frame and the glass. */
export function windowSlots(): SlotDeclaration[] {
  return [
    { slotId: 'frame', label: '框架', default: FRAME_DEFAULT },
    { slotId: 'glass', label: '玻璃', default: GLASS_DEFAULT },
  ]
}
