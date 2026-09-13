import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import type { BlockNode } from './block'
import type { ConstructionDimensionNode } from './construction-dimension'
import type { FenceNode } from './fence'
import type { GuideNode } from './guide'
import type { ItemNode } from './item'
import type { MeasurementNode } from './measurement'
import type { ScanNode } from './scan'
import type { ShelfNode } from './shelf'
import type { SlabNode } from './slab'
import type { SpawnNode } from './spawn'
import type { StairNode } from './stair'
import type { WallNode } from './wall'
import type { ZoneNode } from './zone'

type CoreLevelChildId =
  | WallNode['id']
  | FenceNode['id']
  | ConstructionDimensionNode['id']
  | BlockNode['id']
  | ItemNode['id']
  | ZoneNode['id']
  | SlabNode['id']
  | StairNode['id']
  | ScanNode['id']
  | GuideNode['id']
  | MeasurementNode['id']
  | SpawnNode['id']
  | ShelfNode['id']

const LevelChildId = z.string().transform((id) => id as CoreLevelChildId)

export const DEFAULT_LEVEL_BASE_ELEVATION = 0

export function normalizeLevelBaseElevation(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_LEVEL_BASE_ELEVATION
}

export const LevelNode = BaseNode.extend({
  id: objectId('level'),
  type: nodeType('level'),
  // The node registry owns child-kind validity. Persisted level relationships
  // must also admit IDs minted by plugins that core cannot enumerate.
  children: z.array(LevelChildId).default([]),
  // Specific props
  level: z.number().default(0),
  baseElevation: z
    .number()
    .default(DEFAULT_LEVEL_BASE_ELEVATION)
    .describe("Additive Y offset in meters applied above this level's computed stack position."),
  /**
   * Stored storey height in meters (floor-to-floor). No zod default on
   * purpose: absence marks unmigrated legacy data and gates the load-time
   * migration; a schema default would materialize silently through .parse().
   */
  height: z.number().optional(),
}).describe(
  dedent`
  Level node - used to represent a level in the building
  - children: array of stage scenery nodes
  - level: level number
  - baseElevation: additive Y offset in meters above the computed stack position
  - height: storey height in meters (floor-to-floor); absent only on unmigrated legacy data
  `,
)

export type LevelNode = z.infer<typeof LevelNode>
