import {
  type SceneContextObject,
  type SceneContextSummary,
  stageFootprintGap,
  footprintHull,
} from '@pascal-app/core/stage'
import { stageVisibleFootprints } from './model-contact'
import { snapStageObject } from './placement-snap'

type Point = [number, number]

const dot = (left: Point, right: Point) => left[0] * right[0] + left[1] * right[1]
const axis = (degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180
  return [Math.cos(radians), -Math.sin(radians)]
}
const translate = (polygons: Point[][], dx: number, dz: number) =>
  polygons.map((polygon) => polygon.map(([x, z]): Point => [x + dx, z + dz]))

function interiorsOverlap(left: Point[], right: Point[], tolerance = 1e-7) {
  for (const polygon of [left, right])
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index]!
      const end = polygon[(index + 1) % polygon.length]!
      const normal: Point = [end[1] - start[1], start[0] - end[0]]
      const a = left.map((point) => dot(point, normal))
      const b = right.map((point) => dot(point, normal))
      const overlap =
        Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b))
      if (overlap <= tolerance) return false
    }
  return true
}

/** Enumerates deterministic edge-snap alternatives without writing Scene. */
export function scenicConnectionTransforms(
  moving: SceneContextObject,
  target: SceneContextObject,
  angleDegrees: 0 | 90,
) {
  if (!/flat|door|window/.test(moving.kind) || !/flat|door|window/.test(target.kind)) return []
  if (Math.abs(moving.transform.position.y - target.transform.position.y) > 0.1) return []
  const targetAxis = axis(target.transform.rotationDegrees.y)
  const targetNormal: Point = [-targetAxis[1], targetAxis[0]]
  const rotations =
    angleDegrees === 0
      ? [target.transform.rotationDegrees.y]
      : [target.transform.rotationDegrees.y + 90, target.transform.rotationDegrees.y - 90]
  const candidates: Array<{ score: number; transform: SceneContextObject['transform'] }> = []
  const snapContext: SceneContextSummary = {
    documentVersion: 0,
    selectedObjectIds: [],
    venue: null,
    objects: [target],
  }

  for (const rotation of rotations) {
    const oriented = {
      ...moving,
      transform: {
        ...moving.transform,
        rotationDegrees: { ...moving.transform.rotationDegrees, y: rotation },
      },
    }
    const movingFootprints = stageVisibleFootprints(oriented)
    const targetFootprints = stageVisibleFootprints(target)
    const movingVertices = footprintHull(movingFootprints.flat())
    const targetVertices = footprintHull(targetFootprints.flat())
    for (const from of movingVertices)
      for (const to of targetVertices) {
        const dx = to[0] - from[0]
        const dz = to[1] - from[1]
        const snapped = snapStageObject(
          {
            x: oriented.transform.position.x + dx,
            y: oriented.transform.position.y,
            z: oriented.transform.position.z + dz,
          },
          oriented,
          snapContext,
          { grid: 0, guides: true },
        )
        const snappedDx = snapped.position.x - oriented.transform.position.x
        const snappedDz = snapped.position.z - oriented.transform.position.z
        const translated = translate(movingFootprints, snappedDx, snappedDz)
        if (
          translated.some((left) => targetFootprints.some((right) => interiorsOverlap(left, right)))
        )
          continue
        const gap = Math.min(
          ...translated.flatMap((left) =>
            targetFootprints.map((right) => stageFootprintGap(left, right).meters),
          ),
        )
        if (gap > 1e-6) continue
        const centerDelta: Point = [
          snapped.position.x - target.transform.position.x,
          snapped.position.z - target.transform.position.z,
        ]
        const movingAxis = axis(rotation)
        const shapeScore =
          angleDegrees === 0
            ? Math.abs(dot(centerDelta, targetNormal)) * 1000 +
              Math.abs(
                Math.abs(dot(centerDelta, targetAxis)) -
                  (moving.dimensionsMeters.width + target.dimensionsMeters.width) / 2,
              )
            : (Math.abs(
                Math.abs(dot(centerDelta, targetAxis)) - target.dimensionsMeters.width / 2,
              ) +
                Math.abs(
                  Math.abs(dot(centerDelta, movingAxis)) - moving.dimensionsMeters.width / 2,
                )) *
              1000
        const score = shapeScore + Math.hypot(snappedDx, snappedDz)
        candidates.push({
          score,
          transform: {
            ...oriented.transform,
            position: {
              ...oriented.transform.position,
              x: snapped.position.x,
              z: snapped.position.z,
            },
          },
        })
      }
  }
  const unique = new Map<string, (typeof candidates)[number]>()
  for (const candidate of candidates) {
    const key = [
      candidate.transform.position.x,
      candidate.transform.position.z,
      candidate.transform.rotationDegrees.y,
    ]
      .map((value) => value.toFixed(7))
      .join(':')
    const current = unique.get(key)
    if (!current || candidate.score < current.score) unique.set(key, candidate)
  }
  return [...unique.values()]
    .sort((left, right) => left.score - right.score)
    .map(({ transform }) => transform)
}
