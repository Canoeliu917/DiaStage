import type { AnyNodeDefinition, Plugin } from '@pascal-app/core'
import { blockDefinition } from './block/definition'
import { buildingDefinition } from './building'
import { constructionDimensionDefinition } from './construction-dimension'
import { doorDefinition } from './door'
import { fenceDefinition } from './fence'
import { guideDefinition } from './guide'
import { itemDefinition } from './item'
import { levelDefinition } from './level'
import { measurementDefinition } from './measurement'
import { scanDefinition } from './scan'
import { shelfDefinition } from './shelf'
import { siteDefinition } from './site'
import { slabDefinition } from './slab'
import { spawnDefinition } from './spawn'
import { stairDefinition } from './stair'
import { stairSegmentDefinition } from './stair-segment'
import { wallDefinition } from './wall'
import { windowDefinition } from './window'
import { zoneDefinition } from './zone'

/**
 * Built-in plugin bundling every node kind shipped with the Pascal editor.
 *
 * Apps load this once at bootstrap (`loadPlugin(builtinPlugin)`) before
 * mounting the viewer. New built-in nodes are added by creating a folder
 * here under `src/<kind>/` and appending its `NodeDefinition` below.
 *
 * External plugins follow the exact same shape — same `Plugin` type, same
 * `loadPlugin` call path. This is intentional: the API is stress-tested
 * by built-ins before any third-party plugin lands.
 *
 * All kinds are registered unconditionally. Parity is verified by
 * comparing against deployed production rather than an in-app env-var
 * flag toggle. As of Phase 6 the legacy mount points in `viewer/` are
 * gone — every kind dispatches through the registry.
 */
export const builtinPlugin: Plugin = {
  id: 'pascal:core',
  apiVersion: 1,
  nodes: [
    // Stage E-complete (full registry path)
    shelfDefinition as unknown as AnyNodeDefinition,
    blockDefinition as unknown as AnyNodeDefinition,
    spawnDefinition as unknown as AnyNodeDefinition,
    wallDefinition as unknown as AnyNodeDefinition,
    fenceDefinition as unknown as AnyNodeDefinition,
    slabDefinition as unknown as AnyNodeDefinition,
    doorDefinition as unknown as AnyNodeDefinition,
    windowDefinition as unknown as AnyNodeDefinition,
    itemDefinition as unknown as AnyNodeDefinition,
    // Stage A — wrap-exports the legacy renderer + system. Legacy
    // panels / move tools / floorplan branches still serve these.
    stairDefinition as unknown as AnyNodeDefinition,
    stairSegmentDefinition as unknown as AnyNodeDefinition,
    zoneDefinition as unknown as AnyNodeDefinition,
    siteDefinition as unknown as AnyNodeDefinition,
    buildingDefinition as unknown as AnyNodeDefinition,
    levelDefinition as unknown as AnyNodeDefinition,
    guideDefinition as unknown as AnyNodeDefinition,
    scanDefinition as unknown as AnyNodeDefinition,
    measurementDefinition as unknown as AnyNodeDefinition,
    constructionDimensionDefinition as unknown as AnyNodeDefinition,
  ],
}

export {
  applyBlockCommand,
  type BlockCommand,
  type BlockCommandResult,
  type BlockSelection,
  blockFaceCentroid,
  blockFaceNormal,
} from './block/commands'
export { blockDefinition } from './block/definition'
export { buildingDefinition } from './building'
export { constructionDimensionDefinition } from './construction-dimension'
export { doorDefinition } from './door'
export { fenceDefinition } from './fence'
export { guideDefinition } from './guide'
export { itemDefinition } from './item'
export {
  applyItemFoldControls,
  computeItemFoldBounds,
  type ItemFoldBounds,
} from './item/fold-controls'
export { limitItemFoldControls } from './item/fold-limits'
export { levelDefinition } from './level'
export { measurementDefinition } from './measurement'
export { scanDefinition } from './scan'
export { shelfDefinition } from './shelf'
export { siteDefinition } from './site'
export { slabDefinition } from './slab'
export { spawnDefinition } from './spawn'
export { stairDefinition } from './stair'
export { stairSegmentDefinition } from './stair-segment'
export { wallDefinition } from './wall'
export { windowDefinition } from './window'
export { zoneDefinition } from './zone'
