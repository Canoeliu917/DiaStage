import { expect, test } from 'bun:test'
import { axisTransform } from './axis-transform'

for (const axis of [0, 1, 2] as const) {
  test(`F/G: axis ${axis} changes only its position or Euler component`, () => {
    for (const initial of [
      [1.2, 3.4, 5.6],
      [0.2, 0.6, -0.8],
    ] as [number, number, number][]) {
      const result = axisTransform(initial, axis, 0.35)
      expect(result[axis]).toBe(initial[axis] + 0.35)
      for (const other of [0, 1, 2]) if (other !== axis) expect(result[other]).toBe(initial[other]!)
      expect(result).not.toBe(initial)
    }
  })
}
test('the caller supplies the existing grid or angle step', () => {
  expect(axisTransform([0, 0, 0], 1, 0.14, 0.1)).toEqual([0, 0.1, 0])
  expect(axisTransform([0, 0, 0], 2, 0.14, Math.PI / 12)[2]).toBe(Math.PI / 12)
})
