import type { SceneContextObject, SceneContextSummary, StagePoint } from '@pascal-app/core/stage'
import { stageFootprintGap, stageStackPosition } from '@pascal-app/core/stage'
import { type PlacementSnap, snapStagePlacement } from '@/components/stage-entry/placement-math'
import { stageVisibleFootprints } from './model-contact'

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
  if (!options.guides) return result
  const moving = stageVisibleFootprints({
    ...item,
    transform: { ...item.transform, position: result.position },
  })
  if (!moving) return result
  let nearest: { dx: number; dz: number; distance: number; name: string } | undefined
  for (const other of context.objects) {
    if (other.id === item.id || !/flat|door|window/.test(other.kind)) continue
    if (Math.abs(other.transform.position.y - point.y) > 0.1) continue
    const target = stageVisibleFootprints(other)
    if (!target) continue
    const gaps = moving.flatMap((left) => target.map((right) => stageFootprintGap(left, right)))
    if (gaps.some((gap) => gap.meters < 1e-8)) continue
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
  if (nearest) {
    result.position.x += nearest.dx
    result.position.z += nearest.dz
    result.labels.push(`贴合 ${nearest.name}`)
  }
  return result
}
