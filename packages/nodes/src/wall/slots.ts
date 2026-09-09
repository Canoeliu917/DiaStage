import { type SlotDeclaration, WALL_SURFACE_SLOT_DEFAULTS } from '@pascal-app/core'

/**
 * A wall exposes two paintable faces — interior + exterior. Painting writes
 * `node.slots[interior|exterior]` via `wallPaint` like every other kind; this
 * declaration surfaces the slot list + declared defaults for the picker and
 * keeps walls on the same `{ slotId, label, default }` contract. The defaults
 * come from core so the viewer's material resolver renders the identical value.
 */
export function wallSlots(): SlotDeclaration[] {
  return [
    { slotId: 'interior', label: '内侧', default: WALL_SURFACE_SLOT_DEFAULTS.interior },
    { slotId: 'exterior', label: '外侧', default: WALL_SURFACE_SLOT_DEFAULTS.exterior },
    {
      slotId: 'lowerInterior',
      label: '下部装饰带（内侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.lowerInterior,
    },
    {
      slotId: 'middleInterior',
      label: '中部装饰带（内侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.middleInterior,
    },
    {
      slotId: 'upperInterior',
      label: '上部装饰带（内侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.upperInterior,
    },
    {
      slotId: 'topInterior',
      label: '顶部装饰带（内侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.topInterior,
    },
    {
      slotId: 'lowerExterior',
      label: '下部装饰带（外侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.lowerExterior,
    },
    {
      slotId: 'middleExterior',
      label: '中部装饰带（外侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.middleExterior,
    },
    {
      slotId: 'upperExterior',
      label: '上部装饰带（外侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.upperExterior,
    },
    {
      slotId: 'topExterior',
      label: '顶部装饰带（外侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.topExterior,
    },
    {
      slotId: 'skirtingInterior',
      label: '踢脚线（内侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.skirtingInterior,
    },
    {
      slotId: 'skirtingExterior',
      label: '踢脚线（外侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.skirtingExterior,
    },
    {
      slotId: 'crownInterior',
      label: '顶角线（内侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.crownInterior,
    },
    {
      slotId: 'crownExterior',
      label: '顶角线（外侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.crownExterior,
    },
    {
      slotId: 'chairRailInterior',
      label: '护墙线（内侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.chairRailInterior,
    },
    {
      slotId: 'chairRailExterior',
      label: '护墙线（外侧）',
      default: WALL_SURFACE_SLOT_DEFAULTS.chairRailExterior,
    },
  ]
}
