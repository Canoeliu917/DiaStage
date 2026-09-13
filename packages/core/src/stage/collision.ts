import { add, cross, dot, rotatePoint, subtract } from '../remount/geometry'
import type { Vec3 } from '../remount/schema'
import { SCENERY_ROUND_SEGMENTS, sceneryProxyParts } from './scenery-parts'
import type { SceneContextObject, StageCollisionGeometry } from './schema'

type CollisionObject = Pick<
  SceneContextObject,
  'kind' | 'dimensionsMeters' | 'transform' | 'collisionGeometry'
> & { libraryAssetId?: string | null; stepCount?: number | null }
const epsilon = 1e-7

export function stageCollisionGeometry(
  item: Omit<CollisionObject, 'transform'>,
): StageCollisionGeometry {
  if (item.collisionGeometry) {
    const extents = bounds(item.collisionGeometry.flatMap((part) => part.vertices))
    const dimensions = [
      item.dimensionsMeters.width,
      item.dimensionsMeters.height,
      item.dimensionsMeters.depth,
    ]
    const scale = extents.map(([min, max], axis) =>
      max - min > epsilon ? dimensions[axis]! / (max - min) : 1,
    )
    if (scale.every((value) => Math.abs(value - 1) < epsilon)) return item.collisionGeometry
    return item.collisionGeometry.map((part) => ({
      ...part,
      vertices: part.vertices.map(
        (point) => point.map((value, axis) => value * scale[axis]!) as Vec3,
      ),
    }))
  }
  const kind = item.libraryAssetId ? 'neutral-block' : item.kind
  return sceneryProxyParts(kind, item.dimensionsMeters, item.stepCount ?? undefined).map((part) => {
    const count = part.shape === 'cylinder' ? SCENERY_ROUND_SEGMENTS : 4
    const ring: Vec3[] = Array.from({ length: count }, (_, i) =>
      part.shape === 'cylinder'
        ? [Math.cos((i * Math.PI * 2) / count) / 2, 0, Math.sin((i * Math.PI * 2) / count) / 2]
        : ([
            [-0.5, 0, -0.5],
            [0.5, 0, -0.5],
            [0.5, 0, 0.5],
            [-0.5, 0, 0.5],
          ][i] as Vec3),
    )
    return {
      vertices: [-0.5, 0.5].flatMap((y) =>
        ring.map(
          ([x, , z]): Vec3 => [
            part.position[0] + x * part.size[0],
            part.position[1] + y * part.size[1],
            part.position[2] + z * part.size[2],
          ],
        ),
      ),
      faces: [
        Array.from({ length: count }, (_, i) => i),
        Array.from({ length: count }, (_, i) => count + i),
        ...Array.from({ length: count }, (_, i) => [
          i,
          (i + 1) % count,
          ((i + 1) % count) + count,
          i + count,
        ]),
      ],
    }
  })
}

function directions(vectors: Vec3[]): Vec3[] {
  const unique = new Map<string, Vec3>()
  for (const vector of vectors) {
    const length = Math.hypot(...vector)
    if (length < epsilon) continue
    const sign = vector.find((value) => Math.abs(value) > epsilon)! < 0 ? -1 : 1
    const unit = vector.map((value) => (sign * value) / length) as Vec3
    unique.set(unit.map((value) => Math.round(value * 1e7)).join(','), unit)
  }
  return [...unique.values()]
}

function bounds(vertices: Vec3[]) {
  return [0, 1, 2].map(
    (axis) =>
      [
        Math.min(...vertices.map((point) => point[axis]!)),
        Math.max(...vertices.map((point) => point[axis]!)),
      ] as [number, number],
  )
}

export function prepareStageCollision(item: CollisionObject) {
  const p = item.transform.position,
    r = item.transform.rotationDegrees
  const rotation: Vec3 = [r.x, r.y, r.z].map((angle) => (angle * Math.PI) / 180) as Vec3
  const parts = stageCollisionGeometry(item).map((part) => {
    const vertices = part.vertices.map((point) =>
      add([p.x, p.y, p.z], rotatePoint(point, rotation)),
    )
    return {
      vertices,
      bounds: bounds(vertices),
      axes: directions(
        part.faces.map(([a, b, c]) =>
          cross(subtract(vertices[b!]!, vertices[a!]!), subtract(vertices[c!]!, vertices[a!]!)),
        ),
      ),
      edges: directions(
        part.faces.flatMap((face) =>
          face.map((index, i) =>
            subtract(vertices[face[(i + 1) % face.length]!]!, vertices[index]!),
          ),
        ),
      ),
    }
  })
  return { parts, bounds: bounds(parts.flatMap((part) => part.vertices)) }
}

type PreparedCollision = ReturnType<typeof prepareStageCollision>
const boundsTouch = (a: number[][], b: number[][]) =>
  a.every(([min, max], axis) => max! >= b[axis]![0]! - epsilon && min! <= b[axis]![1]! + epsilon)

export function stageCollisionsTouch(a: PreparedCollision, b: PreparedCollision): boolean {
  if (!boundsTouch(a.bounds, b.bounds)) return false
  return a.parts.some((left) =>
    b.parts.some((right) => {
      if (!boundsTouch(left.bounds, right.bounds)) return false
      const axes = [
        ...left.axes,
        ...right.axes,
        ...directions(left.edges.flatMap((edge) => right.edges.map((other) => cross(edge, other)))),
      ]
      return axes.every((axis) => {
        const l = left.vertices.map((vertex) => dot(vertex, axis))
        const r = right.vertices.map((vertex) => dot(vertex, axis))
        return (
          Math.max(...l) >= Math.min(...r) - epsilon && Math.max(...r) >= Math.min(...l) - epsilon
        )
      })
    }),
  )
}

export function stageObjectsTouch(a: CollisionObject, b: CollisionObject): boolean {
  if (
    ['camera', 'performer-marker'].includes(a.kind) ||
    ['camera', 'performer-marker'].includes(b.kind)
  )
    return false
  return stageCollisionsTouch(prepareStageCollision(a), prepareStageCollision(b))
}
