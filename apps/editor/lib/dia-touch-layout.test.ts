import { expect, test } from 'bun:test'
import { clampDiaTabY, DIA_EDGE_SIZE, DIA_TABLET_QUERY } from './dia-touch-layout'

test('tablet-only touch geometry keeps Desktop and phone outside the breakpoint', () => {
  expect(DIA_TABLET_QUERY).toBe(
    '(min-width: 600px) and (max-width: 1399px) and (any-pointer: coarse)',
  )
  expect(DIA_EDGE_SIZE).toBe(48)
})
for (const [width, height] of [
  [1180, 820],
  [820, 1180],
  [1024, 400],
]) {
  test(`edge tab clamps actual controls, safe area and keyboard viewport at ${width}x${height}`, () => {
    const viewport = { left: 8, top: 28, width: width! - 16, height: height! - 48 }
    const control = { left: width! - 200, top: 30, width: 192, height: 42 }
    expect(clampDiaTabY(30, viewport, [control])).toBe(82)
    expect(clampDiaTabY(300, viewport, [control])).toBe(
      Math.min(300, viewport.top + viewport.height - 48),
    )
    expect(clampDiaTabY(3000, viewport, [control])).toBe(viewport.top + viewport.height - 48)
    expect(clampDiaTabY(-100, viewport, [control])).toBe(82)
    expect(clampDiaTabY(30, viewport, [{ ...control, left: 20 }])).toBe(30)
  })
}
test('multiple exclusion zones choose closest legal edge, not an arbitrary fixed y', () => {
  const viewport = { left: 0, top: 0, width: 1000, height: 600 }
  const controls = [
    { left: 940, top: 50, width: 60, height: 40 },
    { left: 940, top: 240, width: 60, height: 40 },
  ]
  expect(clampDiaTabY(230, viewport, controls)).toBe(182)
  expect(clampDiaTabY(270, viewport, controls)).toBe(290)
  expect(clampDiaTabY(0, viewport, [{ left: 940, top: 0, width: 60, height: 600 }])).toBeNull()
})
