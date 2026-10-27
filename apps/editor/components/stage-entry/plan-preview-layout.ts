type Point = readonly [number, number]

export function planPreviewLabels(
  anchors: { id: string; point: Point }[],
  frame: readonly [number, number, number, number],
  unitsPerPixel: number,
  selectedId?: string | null,
) {
  const half = 11 * unitsPerPixel
  const spacing = 25 * unitsPerPixel
  const [left, top, width, height] = frame
  const placed: Point[] = []
  const labels = new Map<string, Point>()
  if (width < half * 2 || height < half * 2) return labels
  const order = [...anchors].sort(
    (a, b) => Number(b.id === selectedId) - Number(a.id === selectedId),
  )
  for (const { id, point } of order) {
    for (const [dx, dy] of [
      [0, 0],
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [1, -1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const x = Math.max(left + half, Math.min(left + width - half, point[0] + dx! * spacing))
      const y = Math.max(top + half, Math.min(top + height - half, point[1] + dy! * spacing))
      if (placed.some(([px, py]) => Math.abs(px - x) < spacing && Math.abs(py - y) < spacing))
        continue
      labels.set(id, [x, y])
      placed.push([x, y])
      break
    }
  }
  return labels
}

export function planPreviewEdges(outlines: readonly (readonly Point[])[]) {
  const edges = new Set<string>()
  const paths: string[] = []
  for (const outline of outlines) {
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!,
        b = outline[(i + 1) % outline.length]!
      const key = [a.join(','), b.join(',')].sort().join('|')
      if (edges.has(key) || a.every((value, axis) => value === b[axis])) continue
      edges.add(key)
      paths.push(`M${a.join(' ')}L${b.join(' ')}`)
    }
  }
  return paths.join(' ')
}
