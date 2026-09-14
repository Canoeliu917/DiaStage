import { expect, test } from 'bun:test'
import { advanceFoldAngle, type FoldAngleDrag, foldPointerRadians } from './fold-drag'

const radians = (angle: number) => (angle * Math.PI) / 180

test('fold pointer steps are 15 degrees and continue through the atan2 seam up to 270', () => {
  let drag: FoldAngleDrag = { startAngle: 90, pointerRadians: radians(170), turnRadians: 0 }
  let result = advanceFoldAngle(drag, radians(-176))
  expect(result.angle).toBe(75)
  result = advanceFoldAngle(result.drag, radians(-161))
  expect(result.angle).toBe(60)
  drag = { startAngle: 90, pointerRadians: 0, turnRadians: 0 }
  for (const angle of [-60, -120, -179, 179, 150]) {
    result = advanceFoldAngle(drag, radians(angle))
    drag = result.drag
  }
  expect(result.angle).toBe(300)
  expect(
    advanceFoldAngle({ startAngle: 15, pointerRadians: 0, turnRadians: 0 }, radians(60)).angle,
  ).toBe(-45)
})

test('projected fold plane removes nonuniform scale and tilt without changing pointer direction', () => {
  const pivot: [number, number] = [3, 5]
  const x: [number, number] = [2, 1]
  const z: [number, number] = [-0.3, 0.8]
  for (const degrees of [-179, -45, 0, 90, 170]) {
    const angle = radians(degrees)
    const lx = Math.cos(angle),
      lz = -Math.sin(angle)
    const actual = foldPointerRadians(
      [pivot[0] + x[0] * lx + z[0] * lz, pivot[1] + x[1] * lx + z[1] * lz],
      pivot,
      x,
      z,
    )
    expect(actual).toBeCloseTo(angle, 10)
  }
  expect(foldPointerRadians(pivot, pivot, x, z)).toBeNull()
  expect(foldPointerRadians([1, 1], [0, 0], [1, 1], [2, 2])).toBeNull()
})

test('Shift retains the unsnapped angle', () => {
  const drag = { startAngle: 90, pointerRadians: 0, turnRadians: 0 }
  expect(advanceFoldAngle(drag, radians(7), true).angle).toBeCloseTo(83, 10)
  expect(advanceFoldAngle(drag, radians(7)).angle).toBeCloseTo(90, 10)
})
