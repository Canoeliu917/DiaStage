import type { SceneContextObject, SceneContextSummary, StagePoint } from '@pascal-app/core/stage'
import {
  prepareStageCollision,
  stageFootprintGap,
  stageStackPosition,
} from '@pascal-app/core/stage'
import { type PlacementSnap, snapStagePlacement } from '@/components/stage-entry/placement-math'
import { stageModelBottom, stageVisibleFootprints } from './model-contact'

export function snapStageObject(
  point: StagePoint,
  item: SceneContextObject,
  context: SceneContextSummary,
  options: PlacementSnap,
) {
  const scenery = /flat|door|window/.test(item.kind)
  const result = snapStagePlacement(
    point,
    item.dimensionsMeters,
    item.transform.rotationDegrees.y,
    context,
    { ...options, guides: options.guides && !scenery },
    item.id,
  )
  if (!scenery) {
    const support = stageStackPosition(
      { ...item, transform: { ...item.transform, position: result.position } },
      context.objects,
    )
    if (support) {
      result.position.y = support.y
      if (support.supportId) result.labels.push('支撑面贴合')
    }
    return result
  }
  // Ordinary floor dragging grounds the transformed model; the XYZ gizmo remains independent.
  const bottom =
    stageModelBottom(item) ?? prepareStageCollision(item).bounds[1]![0] - item.transform.position.y
  result.position.y = -bottom || 0
  if (!options.guides) return result
  const moving = stageVisibleFootprints({
    ...item,
    transform: { ...item.transform, position: { ...point, y: result.position.y } },
  })
  if (!moving) return result
  let touching = false
  let nearest: { dx: number; dz: number; distance: number; name: string } | undefined
  for (const other of context.objects) {
    if (other.id === item.id || !/flat|door|window/.test(other.kind)) continue
    if (Math.abs(other.transform.position.y - result.position.y) > 0.1) continue
    const target = stageVisibleFootprints(other)
    if (!target) continue
    const gaps = moving.flatMap((left) => target.map((right) => stageFootprintGap(left, right)))
    if (gaps.some((gap) => gap.meters < 1e-8)) {
      touching = true
      continue
    }
    for (const gap of gaps) {
      // Existing overlaps stay movable; a nearby separate edge catches without a clearance gap.
      if (gap.meters < 1e-8 || gap.meters > 0.12 || (nearest && gap.meters >= nearest.distance))
        continue
      nearest = {
        dx: gap.end[0] - gap.start[0],
        dz: gap.end[1] - gap.start[1],
        distance: gap.meters,
        name: other.name,
      }
    }
  }
  if (nearest || touching) {
    // Test edges before grid quantization, and never quantize an existing contact away.
    result.position.x = point.x + (nearest?.dx ?? 0)
    result.position.z = point.z + (nearest?.dz ?? 0)
    result.labels = nearest ? [`贴合 ${nearest.name}`] : []
  }
  return result
}
