import {
  type RemountObject,
  type StageFrame,
  type Vec3,
  type VenueAnchor,
  VenueAnchorSchema,
} from './schema'

export const GEOMETRY_EPSILON = 1e-8
type Matrix3 = [Vec3, Vec3, Vec3]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const multiply = (v: Vec3, n: number): Vec3 => [v[0] * n, v[1] * n, v[2] * n]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(...v)
  if (length < GEOMETRY_EPSILON) throw new Error('标定点重合或共线，无法建立舞台坐标。')
  return multiply(v, 1 / length)
}

export function createStageFrame(anchors: readonly VenueAnchor[]): StageFrame {
  if (anchors.length !== 3) throw new Error('需要原点、舞台右侧、舞台后方三个标定点。')
  const points = anchors.map((anchor) => VenueAnchorSchema.parse(anchor).position)
  const origin = points[0]!
  const stageRight = normalize(subtract(points[1]!, origin))
  const back = subtract(points[2]!, origin)
  const upstage = normalize(subtract(back, multiply(stageRight, dot(back, stageRight))))
  const up = normalize(cross(stageRight, upstage))
  if (up[1] <= 0) throw new Error('标定方向朝下，请检查右侧与后方标定点的顺序。')
  if (Math.hypot(up[0], up[1] - 1, up[2]) > 1e-6) {
    throw new Error('第一阶段仅支持水平舞台，三个标定点必须位于同一水平面。')
  }
  return { origin, stageRight, upstage, up }
}

export function transformDirection(direction: Vec3, source: StageFrame, target: StageFrame): Vec3 {
  return add(
    add(
      multiply(target.stageRight, dot(direction, source.stageRight)),
      multiply(target.up, dot(direction, source.up)),
    ),
    multiply(target.upstage, dot(direction, source.upstage)),
  )
}

export function transformPoint(point: Vec3, source: StageFrame, target: StageFrame): Vec3 {
  return add(target.origin, transformDirection(subtract(point, source.origin), source, target))
}

export function toFrameCoordinates(point: Vec3, frame: StageFrame): Vec3 {
  const direction = subtract(point, frame.origin)
  return [dot(direction, frame.stageRight), dot(direction, frame.up), dot(direction, frame.upstage)]
}

export function fromFrameCoordinates(point: Vec3, frame: StageFrame): Vec3 {
  return add(
    frame.origin,
    add(
      add(multiply(frame.stageRight, point[0]), multiply(frame.up, point[1])),
      multiply(frame.upstage, point[2]),
    ),
  )
}

function rotationMatrix([x, y, z]: Vec3): Matrix3 {
  const a = Math.cos(x),
    b = Math.sin(x),
    c = Math.cos(y),
    d = Math.sin(y)
  const e = Math.cos(z),
    f = Math.sin(z)
  return [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c],
  ]
}

function transpose(m: Matrix3): Matrix3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ]
}

function applyMatrix(m: Matrix3, p: Vec3): Vec3 {
  return [dot(m[0], p), dot(m[1], p), dot(m[2], p)]
}

function matrixEuler(m: Matrix3): Vec3 {
  const y = Math.asin(Math.min(1, Math.max(-1, m[0][2])))
  return Math.abs(m[0][2]) < 1 - Number.EPSILON * 4
    ? [Math.atan2(-m[1][2], m[2][2]), y, Math.atan2(-m[0][1], m[0][0])]
    : [Math.atan2(m[2][1], m[1][1]), y, 0]
}

export function rotatePoint(point: Vec3, rotation: Vec3): Vec3 {
  return applyMatrix(rotationMatrix(rotation), point)
}

export function inverseRotatePoint(point: Vec3, rotation: Vec3): Vec3 {
  return applyMatrix(transpose(rotationMatrix(rotation)), point)
}

export function composeRotations(parent: Vec3, child: Vec3): Vec3 {
  const columns = transpose(rotationMatrix(child))
  return matrixEuler(transpose(columns.map((column) => rotatePoint(column, parent)) as Matrix3))
}

export function relativeRotation(world: Vec3, parent: Vec3): Vec3 {
  const columns = transpose(rotationMatrix(world))
  return matrixEuler(
    transpose(columns.map((column) => inverseRotatePoint(column, parent)) as Matrix3),
  )
}

export function transformRotation(rotation: Vec3, source: StageFrame, target: StageFrame): Vec3 {
  const columns = transpose(rotationMatrix(rotation))
  return matrixEuler(
    transpose(columns.map((column) => transformDirection(column, source, target)) as Matrix3),
  )
}

export function getObjectCorners(object: RemountObject): Vec3[] {
  const corners: Vec3[] = []
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const local = add(object.boundsCenter, [
          (x * object.dimensions[0]) / 2,
          (y * object.dimensions[1]) / 2,
          (z * object.dimensions[2]) / 2,
        ])
        corners.push(add(object.position, rotatePoint(local, object.rotation)))
      }
  return corners
}

export function objectSeparation(
  a: RemountObject,
  b: RemountObject,
): { intersects: boolean; distance: number } {
  const aAxes = transpose(rotationMatrix(a.rotation))
  const bAxes = transpose(rotationMatrix(b.rotation))
  const aCenter = add(a.position, rotatePoint(a.boundsCenter, a.rotation))
  const bCenter = add(b.position, rotatePoint(b.boundsCenter, b.rotation))
  const delta = subtract(aCenter, bCenter)
  const axes = [
    ...aAxes,
    ...bAxes,
    ...aAxes.flatMap((axis) => bAxes.map((other) => cross(axis, other))),
  ]
  let maximumGap = -Infinity
  for (const axis of axes) {
    if (Math.hypot(...axis) < GEOMETRY_EPSILON) continue
    const unit = normalize(axis)
    const radius = (objectAxes: Matrix3, dimensions: Vec3) =>
      objectAxes.reduce(
        (sum, direction, i) => sum + (Math.abs(dot(unit, direction)) * dimensions[i]!) / 2,
        0,
      )
    maximumGap = Math.max(
      maximumGap,
      Math.abs(dot(delta, unit)) - radius(aAxes, a.dimensions) - radius(bAxes, b.dimensions),
    )
  }
  if (maximumGap <= GEOMETRY_EPSILON)
    return { intersects: maximumGap < -GEOMETRY_EPSILON, distance: 0 }
  const aCorners = getObjectCorners(a),
    bCorners = getObjectCorners(b)
  const pointDistance = (point: Vec3, object: RemountObject): number => {
    const local = subtract(
      inverseRotatePoint(subtract(point, object.position), object.rotation),
      object.boundsCenter,
    )
    return Math.hypot(...local.map((v, i) => Math.max(0, Math.abs(v) - object.dimensions[i]! / 2)))
  }
  let distance = Math.min(
    ...aCorners.map((p) => pointDistance(p, b)),
    ...bCorners.map((p) => pointDistance(p, a)),
  )
  const edges = (corners: Vec3[]) =>
    corners.flatMap((point, i) =>
      [1, 2, 4]
        .filter((bit) => (i & bit) === 0)
        .map((bit) => [point, corners[i | bit]!] as [Vec3, Vec3]),
    )
  for (const [a0, a1] of edges(aCorners))
    for (const [b0, b1] of edges(bCorners)) {
      distance = Math.min(distance, segmentDistance(a0, a1, b0, b1))
    }
  return { intersects: false, distance }
}

function segmentDistance(p: Vec3, q: Vec3, r: Vec3, s: Vec3): number {
  const u = subtract(q, p),
    v = subtract(s, r),
    w = subtract(p, r)
  const a = dot(u, u),
    b = dot(u, v),
    c = dot(v, v),
    d = dot(u, w),
    e = dot(v, w)
  const denominator = a * c - b * b
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  let t = denominator > GEOMETRY_EPSILON * a * c ? clamp((b * e - c * d) / denominator) : 0
  let f = (b * t + e) / c
  if (f < 0) {
    f = 0
    t = clamp(-d / a)
  } else if (f > 1) {
    f = 1
    t = clamp((b - d) / a)
  }
  return Math.hypot(...subtract(add(p, multiply(u, t)), add(r, multiply(v, f))))
}
