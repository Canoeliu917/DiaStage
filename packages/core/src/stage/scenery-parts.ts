import { type StageDimensions, StageDimensionsSchema, type StageItemKind } from './schema'

type Vec3 = [number, number, number]
type Box = [width: number, height: number, depth: number, x: number, y: number, z: number]
export type SceneryProxyPart = { shape: 'box' | 'cylinder'; size: Vec3; position: Vec3 }
export const SCENERY_ROUND_SEGMENTS = 24

function proxyBoxes(kind: StageItemKind, stepCount: number): Box[] {
  switch (kind) {
    case 'door-flat':
      return [
        [0.12, 1, 1, -0.44, 0, 0],
        [0.12, 1, 1, 0.44, 0, 0],
        [0.76, 0.14, 1, 0, 0.86, 0],
      ]
    case 'window-flat':
      return [
        [0.12, 1, 1, -0.44, 0, 0],
        [0.12, 1, 1, 0.44, 0, 0],
        [0.76, 0.15, 1, 0, 0.85, 0],
        [0.76, 0.32, 1, 0, 0, 0],
        [0.04, 0.53, 0.5, 0, 0.32, 0],
      ]
    case 'rail-or-divider':
      return [
        [0.08, 1, 1, -0.46, 0, 0],
        [0.08, 1, 1, 0.46, 0, 0],
        [0.84, 0.08, 1, 0, 0.92, 0],
        [0.84, 0.06, 0.6, 0, 0.5, 0],
      ]
    case 'screen':
      return [
        [0.32, 1, 0.4, -0.34, 0, 0.3],
        [0.36, 1, 0.4, 0, 0, -0.3],
        [0.32, 1, 0.4, 0.34, 0, 0.3],
      ]
    case 'curtain':
      return Array.from({ length: 10 }, (_, i) => [
        0.1,
        1,
        0.5,
        -0.45 + i * 0.1,
        0,
        i % 2 ? 0.25 : -0.25,
      ])
    case 'table':
      return [[1, 0.1, 1, 0, 0.9, 0], ...legs(0.9)]
    case 'stairs':
      return Array.from({ length: stepCount }, (_, i) => [
        1,
        (i + 1) / stepCount,
        1 / stepCount,
        0,
        0,
        (i + 0.5) / stepCount - 0.5,
      ])
    case 'chair':
      return [[1, 0.1, 1, 0, 0.4, 0], [1, 0.5, 0.14, 0, 0.5, 0.43], ...legs(0.4)]
    case 'sofa':
      return [
        [1, 0.45, 1, 0, 0, 0],
        [1, 0.55, 0.2, 0, 0.45, 0.4],
        [0.12, 0.25, 0.8, -0.44, 0.45, -0.1],
        [0.12, 0.25, 0.8, 0.44, 0.45, -0.1],
      ]
    case 'counter':
      return [
        [1, 0.1, 1, 0, 0.9, 0],
        [0.1, 0.9, 0.9, -0.4, 0, 0],
        [0.1, 0.9, 0.9, 0.4, 0, 0],
        [0.7, 0.9, 0.08, 0, 0, -0.41],
      ]
    case 'shelf':
      return [
        [0.08, 1, 1, -0.46, 0, 0],
        [0.08, 1, 1, 0.46, 0, 0],
        [0.84, 1, 0.06, 0, 0, 0.47],
        ...Array.from({ length: 4 }, (_, i): Box => [0.84, 0.05, 0.94, 0, (i * 0.95) / 3, -0.03]),
      ]
    case 'bed':
      return [[1, 0.45, 0.92, 0, 0.15, -0.04], [1, 1, 0.08, 0, 0, 0.46], ...legs(0.15)]
    default:
      return [[1, 1, 1, 0, 0, 0]]
  }
}

export function sceneryProxyParts(
  kind: StageItemKind,
  dimensions: StageDimensions,
  stepCount = 3,
): SceneryProxyPart[] {
  const { width, height, depth } = StageDimensionsSchema.parse(dimensions)
  if (!Number.isInteger(stepCount) || stepCount < 1 || stepCount > 200)
    throw new Error('台阶级数必须为 1 至 200 的整数。')
  const boxes: Box[] =
    kind === 'round-table'
      ? [
          [1, 0.1, 1, 0, 0.9, 0],
          [0.12, 0.82, 0.12, 0, 0.08, 0],
          [0.5, 0.08, 0.5, 0, 0, 0],
        ]
      : proxyBoxes(kind, stepCount)
  return boxes.map(([w, h, d, x, y, z]) => ({
    shape: kind === 'round-table' ? 'cylinder' : 'box',
    size: [w * width, h * height, d * depth],
    position: [x * width, (y + h / 2) * height, z * depth],
  }))
}

function legs(height: number): Box[] {
  return [-0.455, 0.455].flatMap((x) =>
    [-0.455, 0.455].map((z): Box => [0.09, height, 0.09, x, 0, z]),
  )
}
