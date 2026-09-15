import { type AnyNodeId, useScene } from '@pascal-app/core'
import type { SceneContextObject, SceneContextSummary, StagePoint } from '@pascal-app/core/stage'
import { canStageStack, prepareStageCollision, stageFootprintGap } from '@pascal-app/core/stage'
import { type PlacementSnap, snapStagePlacement } from '@/components/stage-entry/placement-math'
import { stageContactIds } from './contacts'
import { stageModelBottom, stageModelTop, stageVisibleFootprints } from './model-contact'

// Matching props, or any pair of scenic flats: catch a whole row/column, not an arbitrary frame edge.
export function snapMatchingStageObject(
  item: SceneContextObject,
  objects: readonly SceneContextObject[],
  elevationOnly = false,
) {
  const nodes = useScene.getState().nodes
  const source = nodes[item.id as AnyNodeId]
  if (source?.type !== 'item') return null
  const candidates: {
    position: StagePoint
    name: string
    cost: number
    key: string
    alignment: string
    target: SceneContextObject
  }[] = []
  const vertical = (object: SceneContextObject) => {
    const bounds = prepareStageCollision(object).bounds[1]!
    const bottom = stageModelBottom(object),
      top = stageModelTop(object)
    return [
      bottom === null ? bounds[0] : bottom + object.transform.position.y,
      top === null ? bounds[1] : top + object.transform.position.y,
    ] as const
  }
  const movingBounds = vertical(item)
  const points = stageVisibleFootprints(item).flat()
  if (!points.length) return null
  for (const other of objects) {
    const target = nodes[other.id as AnyNodeId]
    if (other.id === item.id || target?.type !== 'item') continue
    const scenicFlatFamily = item.kind === 'scenic-flat' && other.kind === 'scenic-flat'
    if (!scenicFlatFamily && target.asset.id !== source.asset.id) continue
    if (
      (['x', 'y', 'z'] as const).some(
        (axis) =>
          Math.abs(item.transform.rotationDegrees[axis] - other.transform.rotationDegrees[axis]) >
          1e-6,
      )
    )
      continue
    if (
      !scenicFlatFamily &&
      (['width', 'height', 'depth'] as const).some(
        (key) => Math.abs(item.dimensionsMeters[key] - other.dimensionsMeters[key]) > 1e-6,
      )
    )
      continue
    const targetPoints = stageVisibleFootprints(other).flat()
    if (!targetPoints.length) continue
    const yaw = (other.transform.rotationDegrees.y * Math.PI) / 180
    const axes = [
      [Math.cos(yaw), -Math.sin(yaw)],
      [Math.sin(yaw), Math.cos(yaw)],
    ] as const
    const extents = (vertices: number[][]) =>
      axes.map(([x, z]) => {
        const values = vertices.map((p) => p[0]! * x + p[1]! * z)
        return {
          center: (Math.min(...values) + Math.max(...values)) / 2,
          half: (Math.max(...values) - Math.min(...values)) / 2,
        }
      })
    const from = extents(points),
      to = extents(targetPoints)
    const targetBounds = vertical(other)
    const add = (offsets: number[], dy: number, key: string) => {
      const dx = axes[0][0] * offsets[0]! + axes[1][0] * offsets[1]!
      const dz = axes[0][1] * offsets[0]! + axes[1][1] * offsets[1]!
      if (Math.hypot(dx, dz) > 0.18 || Math.abs(dy) > 0.12) return
      candidates.push({
        position: {
          x: item.transform.position.x + (Math.abs(dx) < 1e-10 ? 0 : dx),
          y: item.transform.position.y + (Math.abs(dy) < 1e-10 ? 0 : dy),
          z: item.transform.position.z + (Math.abs(dz) < 1e-10 ? 0 : dz),
        },
        name: other.name,
        cost: Math.hypot(dx, dy, dz),
        key: `${other.id}:${key}`,
        alignment: scenicFlatFamily ? '景片边缘对齐' : '同款对齐',
        target: other,
      })
    }
    const centers = to.map((extent, i) => extent.center - from[i]!.center)
    if (!elevationOnly && Math.abs(movingBounds[0] - targetBounds[0]) < 0.02) {
      for (const axis of [0, 1])
        for (const sign of [-1, 1]) {
          const offsets = [...centers]
          offsets[axis]! += sign * (from[axis]!.half + to[axis]!.half)
          add(offsets, 0, `${axis}:${sign}`)
        }
    }
    // A floor-level lateral gesture must never elect the top of a nearby low platform.
    if (canStageStack(item) && movingBounds[0] > (targetBounds[0] + targetBounds[1]) / 2)
      add(centers, targetBounds[1] - movingBounds[0], 'top')
  }
  candidates.sort((a, b) => a.cost - b.cost || a.key.localeCompare(b.key))
  for (const candidate of candidates) {
    let position = candidate.position
    let placed = { ...item, transform: { ...item.transform, position } }
    if (item.kind === 'scenic-flat') {
      const gaps = stageVisibleFootprints(placed).flatMap((left) =>
        stageVisibleFootprints(candidate.target).map((right) => stageFootprintGap(left, right)),
      )
      if (!gaps.some((gap) => gap.meters < 1e-8)) {
        const nearest = gaps
          .filter((gap) => gap.meters <= 0.12)
          .sort((a, b) => a.meters - b.meters)[0]
        if (!nearest) continue
        position = {
          ...position,
          x: position.x + nearest.end[0] - nearest.start[0],
          z: position.z + nearest.end[1] - nearest.start[1],
        }
        placed = { ...item, transform: { ...item.transform, position } }
      }
    }
    if (
      !objects.some(
        (other) => other.id !== item.id && stageContactIds([placed, other], true).has(item.id),
      )
    )
      return {
        position,
        labels: [`贴合 ${candidate.name}`, candidate.alignment],
      }
  }
  return null
}

export function snapStageObject(
  point: StagePoint,
  item: SceneContextObject,
  context: SceneContextSummary,
  options: PlacementSnap,
) {
  const result = snapStagePlacement(
    point,
    item.dimensionsMeters,
    item.transform.rotationDegrees.y,
    context,
    { ...options, guides: false },
    item.id,
  )
  // Plane dragging preserves height; only an explicit elevation gesture elects a new support.
  const bottom =
    stageModelBottom(item) ?? prepareStageCollision(item).bounds[1]![0] - item.transform.position.y
  result.position.y = Math.max(item.transform.position.y, -bottom) || 0
  if (!options.guides) return result
  const matching = snapMatchingStageObject(
    { ...item, transform: { ...item.transform, position: { ...point, y: result.position.y } } },
    context.objects,
  )
  if (matching) return matching
  const moving = stageVisibleFootprints({
    ...item,
    transform: { ...item.transform, position: { ...point, y: result.position.y } },
  })
  if (!moving) return result
  let touching: { name: string; scenicFlat: boolean } | undefined
  let nearest:
    | { dx: number; dz: number; distance: number; name: string; scenicFlat: boolean }
    | undefined
  for (const other of context.objects) {
    if (other.id === item.id || ['camera', 'performer-marker'].includes(other.kind)) continue
    const movingBounds = prepareStageCollision({
      ...item,
      transform: { ...item.transform, position: result.position },
    }).bounds
    const targetBounds = prepareStageCollision(other).bounds
    if (movingBounds[1]![1] < targetBounds[1]![0] || targetBounds[1]![1] < movingBounds[1]![0])
      continue
    const target = stageVisibleFootprints(other)
    if (!target) continue
    const gaps = moving.flatMap((left) => target.map((right) => stageFootprintGap(left, right)))
    if (gaps.some((gap) => gap.meters < 1e-8)) {
      touching ??= {
        name: other.name,
        scenicFlat: item.kind === 'scenic-flat' && other.kind === 'scenic-flat',
      }
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
        scenicFlat: item.kind === 'scenic-flat' && other.kind === 'scenic-flat',
      }
    }
  }
  if (nearest || touching) {
    // Test edges before grid quantization, and never quantize an existing contact away.
    result.position.x = point.x + (nearest?.dx ?? 0)
    result.position.z = point.z + (nearest?.dz ?? 0)
    const contact = nearest ?? touching!
    result.labels = [`贴合 ${contact.name}`, ...(contact.scenicFlat ? ['景片边缘对齐'] : [])]
  }
  return result
}
