export const SLOT_MATERIAL_PREFIX = 'slot_'

// The shipped stage library uses authored labels instead of the upload slot_ convention.
const STAGE_MATERIAL_SLOTS = new Map([
  ['Matte off-white / 雾白景片', 'body'],
  ['Matte light grey / 浅灰框架', 'frame'],
  ['Matte beige / 米灰构件', 'component'],
  ['Matte cream / 米白台面', 'top'],
  ['Matte warm grey / 暖灰软包', 'upholstery'],
  ['Matte graphite / 石墨五金', 'metal'],
  ['Matte charcoal / 炭黑把手', 'handle'],
  ['Matte grey-white / 灰白台块', 'platform'],
  ['Neutral opening placeholder / 中性窗占位', 'opening'],
  ['Matte neutral floor / 中灰舞台', 'floor'],
])

export function isSlotMaterialName(name: string): boolean {
  return STAGE_MATERIAL_SLOTS.has(name) || name.toLowerCase().startsWith(SLOT_MATERIAL_PREFIX)
}

/**
 * Derive the stable slot id from a glTF material name:
 * strip the `slot_` prefix (case-insensitive), drop Blender numeric dedupe
 * suffixes like `.001`, lowercase the remainder. Returns null when the name
 * is not a slot material. Used by BOTH the upload scan (later) and the
 * renderer so DB metadata and runtime meshes can never drift.
 */
export function deriveSlotId(materialName: string): string | null {
  const stageSlot = STAGE_MATERIAL_SLOTS.get(materialName)
  if (stageSlot) return stageSlot
  if (!isSlotMaterialName(materialName)) return null
  let rest = materialName.slice(SLOT_MATERIAL_PREFIX.length)
  rest = rest.replace(/\.\d+$/, '')
  return rest.toLowerCase()
}

/** slot id -> display label: underscores to spaces, sentence case. e.g. 'bed_frame' -> 'Bed frame'. */
export function slotLabelFromId(slotId: string): string {
  const spaced = slotId.replace(/_/g, ' ').trim()
  if (!spaced) return spaced
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
