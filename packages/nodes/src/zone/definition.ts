import { type NodeDefinition, ZoneNode as ZoneNodeSchema } from '@pascal-app/core'
import { polygonMeasurementFeatures } from '../shared/polygon-measurement'
import { buildZoneContextualDimensions } from './contextual-dimensions'
import { buildZoneFloorplan } from './floorplan'
import {
  zoneAddVertexAffordance,
  zoneDeleteVertexAffordance,
  zoneMoveEdgeAffordance,
  zoneMoveVertexAffordance,
} from './floorplan-affordances'
import { zoneFloorplanMoveTarget } from './floorplan-move'
import { zoneParametrics } from './parametrics'
import { zoneQuickMeasurement } from './quick-measurement'
import { ZoneNode } from './schema'

/**
 * Zone — Stage A. Custom-behavior escape hatch: zone uses TSL shader
 * materials + `<Html>` portals + per-frame uniform poking, so it
 * lives via `def.renderer` + `def.system` (no `def.geometry` possible
 * because zone isn't really a mesh).
 */
export const zoneDefinition: NodeDefinition<typeof ZoneNode> = {
  kind: 'zone',
  snapProfile: 'structural',
  schemaVersion: 2,
  schema: ZoneNode,
  category: 'site',
  extensions: {
    'pascal:editor/floorplan': { contextualDimensions: buildZoneContextualDimensions },
  },

  defaults: () => {
    const stub = ZoneNodeSchema.parse({ id: 'zone_default' as never, type: 'zone' })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
  },

  parametrics: zoneParametrics,
  measurement: {
    features: (node, ctx) =>
      polygonMeasurementFeatures({
        featurePrefix: 'zone',
        height: 0,
        label: '区域',
        polygon: node.polygon,
      }),
    quickMeasure: (node, ctx) => zoneQuickMeasurement(node, ctx),
  },
  // No dirty consumer rebuilds this kind — see NodeDefinition.dirtyTracking.
  dirtyTracking: false,

  renderer: {
    kind: 'parametric',
    module: () => import('./renderer'),
  },
  system: {
    module: () => import('./system'),
    priority: 4,
  },
  floorplan: buildZoneFloorplan,
  // 2D body move — centroid-pivot polygon mover (same as slab).
  // Without this, zone fell through to the overlay's generic free-translate
  // path, which committed a `position` field zone has no schema for, so the
  // polygon never actually moved on drop.
  floorplanMoveTarget: zoneFloorplanMoveTarget,
  // Polygon editor when selected. The shared factories key off
  // `node.polygon`; zones have no holes.
  floorplanAffordances: {
    'move-vertex': zoneMoveVertexAffordance,
    'add-vertex': zoneAddVertexAffordance,
    'move-edge': zoneMoveEdgeAffordance,
    'delete-vertex': zoneDeleteVertexAffordance,
  },

  presentation: {
    label: '区域',
    description: '用于标记表演区、调度区或安全区的多边形区域。',
    icon: { kind: 'url', src: '/icons/zone.webp' },
    paletteSection: 'site',
    paletteOrder: 20,
  },

  mcp: {
    description: 'A polygon-bounded stage area used for blocking and safety zones.',
  },
}
