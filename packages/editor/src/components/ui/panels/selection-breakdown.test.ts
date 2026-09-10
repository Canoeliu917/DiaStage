import { describe, expect, test } from 'bun:test'
import { formatSelectionBreakdown } from './selection-breakdown'

describe('formatSelectionBreakdown', () => {
  test('counts per type in first-appearance order with Chinese labels', () => {
    expect(formatSelectionBreakdown(['slab', 'stair', 'fence', 'fence'])).toBe(
      '1 个舞台地面 · 1 个台阶 · 2 个栏杆',
    )
  })

  test('humanizes hyphenated kinds', () => {
    expect(formatSelectionBreakdown(['roof-segment', 'roof-segment', 'wall'])).toBe(
      '2 个兼容物件 · 1 个景片',
    )
  })

  test('skips missing nodes', () => {
    expect(formatSelectionBreakdown(['wall', undefined, null])).toBe('1 个景片')
  })

  test('empty selection formats to an empty string', () => {
    expect(formatSelectionBreakdown([])).toBe('')
  })
})
