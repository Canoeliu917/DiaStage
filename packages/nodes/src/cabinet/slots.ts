import type { SlotDeclaration } from '@pascal-app/core'

export type CabinetSlotId =
  | 'front'
  | 'carcass'
  | 'countertop'
  | 'plinth'
  | 'hardware'
  | 'glass'
  | 'appliance'
  | 'applianceInterior'

const FRONT_DEFAULT = 'library:preset-softwhite'
const CARCASS_DEFAULT = 'library:preset-softwhite'
const COUNTERTOP_DEFAULT = 'library:wood-finewood27'
const PLINTH_DEFAULT = 'library:preset-softwhite'
const HARDWARE_DEFAULT = 'library:metal-chrome'
const GLASS_DEFAULT = 'library:preset-glass'
const APPLIANCE_DEFAULT = 'library:metal-steel'
const APPLIANCE_INTERIOR_DEFAULT = 'library:preset-charcoal'

export function cabinetSlots(): SlotDeclaration[] {
  return [
    { slotId: 'front', label: '前侧', default: FRONT_DEFAULT },
    { slotId: 'carcass', label: '柜体', default: CARCASS_DEFAULT },
    { slotId: 'countertop', label: '台面', default: COUNTERTOP_DEFAULT },
    { slotId: 'plinth', label: '踢脚板', default: PLINTH_DEFAULT },
    { slotId: 'hardware', label: '五金件', default: HARDWARE_DEFAULT },
    { slotId: 'glass', label: '玻璃', default: GLASS_DEFAULT },
    { slotId: 'appliance', label: '电器', default: APPLIANCE_DEFAULT },
    {
      slotId: 'applianceInterior',
      label: '电器内部',
      default: APPLIANCE_INTERIOR_DEFAULT,
    },
  ]
}
