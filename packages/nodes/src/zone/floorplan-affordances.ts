import type { ZoneNode } from '@pascal-app/core'
import {
  createPolygonAddVertexAffordance,
  createPolygonDeleteVertexAffordance,
  createPolygonMoveEdgeAffordance,
  createPolygonVertexAffordance,
} from '../shared/polygon-vertex-affordance'

/**
 * 2D affordances for zone — same four polygon-editing operations
 * slabs expose. Zones have no `holes` field, but the
 * shared factory accepts that case (holeIndex stays undefined and the
 * boundary polygon is the target).
 *
 *   - `move-vertex` — drag an existing polygon vertex.
 *   - `add-vertex` — insert a new vertex at an edge midpoint, then drag.
 *   - `move-edge` — drag an entire edge perpendicular to itself.
 *   - `delete-vertex` — remove a double-clicked vertex down to three.
 */
export const zoneMoveVertexAffordance = createPolygonVertexAffordance<ZoneNode>('zone')
export const zoneAddVertexAffordance = createPolygonAddVertexAffordance<ZoneNode>('zone')
export const zoneMoveEdgeAffordance = createPolygonMoveEdgeAffordance<ZoneNode>('zone')
export const zoneDeleteVertexAffordance = createPolygonDeleteVertexAffordance<ZoneNode>('zone')
