import { type Point2D, polygonsOverlap } from '../lib/polygon-relations'
import { prepareStageCollision } from './collision'
import type { SceneContextObject, SceneContextSummary, StagePlan } from './schema'

export function stageLayoutObjects(context: SceneContextSummary, plan: StagePlan | null) {
  const replaced = new Set(plan?.items.map((item) => item.existingNodeId))
  const depthShift =
    plan?.venue && context.venue ? (plan.venue.depthMeters - context.venue.depthMeters) / 2 : 0
  return [
    ...context.objects
      .filter((item) => !replaced.has(item.id))
      .map((item) => ({
        ...item,
        transform: {
          ...item.transform,
          position: { ...item.transform.position, z: item.transform.position.z + depthShift },
        },
      })),
    ...(plan?.items.map((item) => ({
      ...item,
      id: item.existingNodeId ?? item.proposalId,
      name: item.displayName,
    })) ?? []),
  ]
}

type FootprintObject = Pick<SceneContextObject, 'dimensionsMeters' | 'transform'> &
  Partial<Pick<SceneContextObject, 'kind' | 'collisionGeometry'>> & { stepCount?: number | null }

export function stageObjectFootprints(item: FootprintObject): Point2D[][] {
  return prepareStageCollision({ ...item, kind: item.kind ?? 'neutral-block' }).parts.map((part) =>
    footprintHull(part.vertices.map((point): Point2D => [point[0], point[2]])),
  )
}

export function stageObjectFootprint(item: FootprintObject): Point2D[] {
  return footprintHull(stageObjectFootprints(item).flat())
}

export function footprintHull(vertices: Point2D[]): Point2D[] {
  const points = vertices
    // Rotation noise must not separate coincident corners in the hull's sort order.
    .map((point): Point2D => [Math.round(point[0] * 1e9) / 1e9, Math.round(point[1] * 1e9) / 1e9])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (a: Point2D, b: Point2D, c: Point2D) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const half = (ordered: Point2D[]) => {
    const hull: Point2D[] = []
    for (const point of ordered) {
      while (hull.length > 1 && cross(hull.at(-2)!, hull.at(-1)!, point) <= 1e-10) hull.pop()
      hull.push(point)
    }
    return hull.slice(0, -1)
  }
  return [...half(points), ...half([...points].reverse())]
}

export function stageFootprintGap(left: Point2D[], right: Point2D[]) {
  let start = left[0]!,
    end = right[0]!,
    meters = Infinity
  for (const [points, edges, reverse] of [
    [left, right, false],
    [right, left, true],
  ] as const) {
    for (const point of points) {
      for (let index = 0; index < edges.length; index++) {
        const a = edges[index]!,
          b = edges[(index + 1) % edges.length]!
        const dx = b[0] - a[0],
          dz = b[1] - a[1]
        const lengthSquared = dx * dx + dz * dz
        const t =
          lengthSquared < 1e-12
            ? 0
            : Math.max(
                0,
                Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared),
              )
        const closest: Point2D = [a[0] + t * dx, a[1] + t * dz]
        const distance = Math.hypot(point[0] - closest[0], point[1] - closest[1])
        if (distance < meters) {
          start = reverse ? closest : point
          end = reverse ? point : closest
          meters = distance
        }
      }
    }
  }
  if (polygonsOverlap(left, right)) {
    start = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    end = start
    meters = 0
  }
  return { start, end, meters }
}
