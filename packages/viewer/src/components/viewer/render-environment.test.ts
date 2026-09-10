import { expect, test } from 'bun:test'
import { stableRenderBudget } from './render-environment'

test('stable rendering only limits frame and pixel budgets', () => {
  expect(stableRenderBudget(false)).toEqual({ fps: 30, dpr: 1.25 })
  expect(stableRenderBudget(true)).toEqual({ fps: 24, dpr: 1 })
})
