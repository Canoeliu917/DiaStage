import { cross, dot } from '../remount/geometry'
import { prepareStageCollision } from './collision'
import type { SceneContextObject } from './schema'

const stackKinds = new Set(['platform', 'neutral-block', 'sofa', 'table', 'round-table', 'chair'])
export const canStageStack = (item: Pick<SceneContextObject, 'kind'>) => stackKinds.has(item.kind)

type Part = ReturnType<typeof prepareStageCollision>['parts'][number]

// Sweep convex collision parts vertically. The upper end of their intersection
// interval is exact surface contact, including tilted faces and rotated edges.
function contactLift(left: Part, right: Part): number | null {
  let low = -Infinity,
    high = Infinity
  const axes = [
    ...left.axes,
    ...right.axes,
    ...left.edges.flatMap((a) => right.edges.map((b) => cross(a, b))),
  ]
  for (const axis of axes) {
    if (Math.hypot(...axis) < 1e-10) continue
    const l = left.vertices.map((p) => dot(p, axis))
    const r = right.vertices.map((p) => dot(p, axis))
    const start = Math.min(...r) - Math.max(...l)
    const end = Math.max(...r) - Math.min(...l)
    if (Math.abs(axis[1]) < 1e-10) {
      // Merely touching vertical sides is not a supporting surface.
      if (start >= -1e-10 || end <= 1e-10) return null
      continue
    }
    const a = start / axis[1],
      b = end / axis[1]
    low = Math.max(low, Math.min(a, b))
    high = Math.min(high, Math.max(a, b))
    if (low > high + 1e-10) return null
  }
  return Number.isFinite(high) ? high : null
}

export function stageSupportPositions(
  item: SceneContextObject,
  objects: readonly SceneContextObject[],
): { y: number; supportId: string | null }[] {
  if (!canStageStack(item)) return []
  const moving = prepareStageCollision(item)
  const y = item.transform.position.y
  const positions: { y: number; supportId: string | null }[] = [
    { y: y - moving.bounds[1]![0], supportId: null },
  ]
  for (const other of objects) {
    if (other.id === item.id || !canStageStack(other)) continue
    const support = prepareStageCollision(other)
    if (
      [0, 2].some(
        (axis) =>
          moving.bounds[axis]![1] <= support.bounds[axis]![0] ||
          moving.bounds[axis]![0] >= support.bounds[axis]![1],
      )
    )
      continue
    const lifts = moving.parts.flatMap((a) =>
      support.parts.flatMap((b) => {
        const lift = contactLift(a, b)
        return lift === null ? [] : [lift]
      }),
    )
    if (lifts.length) positions.push({ y: y + Math.max(...lifts), supportId: other.id })
  }
  return positions
}

export function stageStackPosition(
  item: SceneContextObject,
  objects: readonly SceneContextObject[],
) {
  return stageSupportPositions(item, objects).sort((a, b) => b.y - a.y)[0] ?? null
}

export function stageMagneticHeight(
  item: SceneContextObject,
  objects: readonly SceneContextObject[],
  tolerance: number,
) {
  const y = item.transform.position.y
  return (
    stageSupportPositions(item, objects)
      .filter((p) => Math.abs(p.y - y) <= tolerance)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0]?.y ?? y
  )
}
