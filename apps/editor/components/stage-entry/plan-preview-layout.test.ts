import { expect, test } from 'bun:test'
import { planPreviewEdges, planPreviewLabels } from './plan-preview-layout'

test('dense compact identifiers do not overlap and the selected object keeps its identifier', () => {
  const anchors = Array.from({ length: 40 }, (_, index) => ({
    id: String(index),
    point: [0, 3] as const,
  }))
  const original = JSON.stringify(anchors)
  for (const width of [330, 370]) {
    const unitsPerPixel = 8 / width
    const labels = planPreviewLabels(anchors, [-4, 0, 8, 6], unitsPerPixel, '39')
    expect(labels.has('39')).toBe(true)
    expect(labels.size).toBeLessThan(anchors.length)
    const placed = [...labels.values()]
    for (const [index, point] of placed.entries()) {
      expect(point[0]).toBeGreaterThanOrEqual(-4 + 11 * unitsPerPixel)
      expect(point[0]).toBeLessThanOrEqual(4 - 11 * unitsPerPixel)
      expect(point[1]).toBeGreaterThanOrEqual(11 * unitsPerPixel)
      expect(point[1]).toBeLessThanOrEqual(6 - 11 * unitsPerPixel)
      for (const other of placed.slice(index + 1))
        expect(
          Math.abs(point[0] - other[0]) >= 24.9 * unitsPerPixel ||
            Math.abs(point[1] - other[1]) >= 24.9 * unitsPerPixel,
        ).toBe(true)
    }
  }
  expect(JSON.stringify(anchors)).toBe(original)
})

test('coincident projected edges are drawn once without changing their coordinates', () => {
  const rectangle = [
    [0, 0],
    [2, 0],
    [2, 1],
    [0, 1],
  ] as const
  const outlines = [rectangle, [...rectangle].reverse()]
  const original = JSON.stringify(outlines)
  const path = planPreviewEdges(outlines)
  expect(path.match(/M/g)).toHaveLength(4)
  expect(path).toContain('M0 0L2 0')
  expect(path).toContain('M2 1L0 1')
  expect(JSON.stringify(outlines)).toBe(original)
})

test('an extremely narrow stage keeps identifiers in the legend instead of outside the map', () => {
  expect(planPreviewLabels([{ id: 'thin', point: [0, 3] }], [-0.05, 0, 0.1, 6], 0.03).size).toBe(0)
})
