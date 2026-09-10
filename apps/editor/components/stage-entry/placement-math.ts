import type { SceneContextSummary, StageDimensions, StagePoint } from '@pascal-app/core/stage'

export type PlacementSnap = { grid: 0 | 0.1 | 0.25 | 0.5; guides: boolean }

export function footprintHalfSize(dimensions: StageDimensions, yawDegrees: number) {
  const angle = (yawDegrees * Math.PI) / 180
  return {
    x:
      (Math.abs(Math.cos(angle)) * dimensions.width +
        Math.abs(Math.sin(angle)) * dimensions.depth) /
      2,
    z:
      (Math.abs(Math.sin(angle)) * dimensions.width +
        Math.abs(Math.cos(angle)) * dimensions.depth) /
      2,
  }
}

export function snapStagePlacement(
  point: StagePoint,
  dimensions: StageDimensions,
  yawDegrees: number,
  context: SceneContextSummary,
  options: PlacementSnap,
  ignoreId?: string,
): { position: StagePoint; labels: string[] } {
  if (![point.x, point.y, point.z, yawDegrees].every(Number.isFinite))
    throw new Error('落位坐标必须是有效数值。')
  const position = { ...point }
  const labels: string[] = []
  if (options.grid) {
    position.x = Math.round(point.x / options.grid) * options.grid
    position.z = Math.round(point.z / options.grid) * options.grid
    labels.push(`${options.grid} 米网格`)
  }
  if (!options.guides || !context.venue) return { position, labels }
  const half = footprintHalfSize(dimensions, yawDegrees)
  const { widthMeters: width, depthMeters: depth } = context.venue
  const targets: Record<'x' | 'z', { value: number; label: string }[]> = {
    x: [
      { value: 0, label: '中心线' },
      { value: -width / 2 + half.x, label: '台左边界' },
      { value: width / 2 - half.x, label: '台右边界' },
    ],
    z: [
      { value: half.z, label: '台口基准线' },
      { value: depth - half.z, label: '台后边界' },
    ],
  }
  for (const other of context.objects) {
    if (other.id === ignoreId || ['performer-marker', 'camera'].includes(other.kind)) continue
    const otherHalf = footprintHalfSize(other.dimensionsMeters, other.transform.rotationDegrees.y)
    for (const axis of ['x', 'z'] as const) {
      const center = other.transform.position[axis]
      targets[axis].push(
        { value: center, label: `对齐 ${other.name}` },
        { value: center - otherHalf[axis] - half[axis], label: `紧邻 ${other.name}` },
        { value: center + otherHalf[axis] + half[axis], label: `紧邻 ${other.name}` },
      )
    }
  }
  for (const axis of ['x', 'z'] as const) {
    const nearest = targets[axis]
      .filter((target) => Math.abs(target.value - point[axis]) <= 0.12)
      .sort((a, b) => Math.abs(a.value - point[axis]) - Math.abs(b.value - point[axis]))[0]
    if (nearest) {
      position[axis] = nearest.value
      labels.push(nearest.label)
    }
  }
  return { position, labels: [...new Set(labels)] }
}
