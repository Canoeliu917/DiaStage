import { describe, expect, test } from 'bun:test'
import { formatSelectionBreakdown } from './selection-breakdown'

describe('formatSelectionBreakdown', () => {
  test('counts per type in first-appearance order with Chinese labels', () => {
    expect(formatSelectionBreakdown(['slab', 'stair', 'fence', 'fence'])).toBe(
      '1 个楼板 · 1 个楼梯 · 2 个围栏',
    )
  })

  test('humanizes hyphenated kinds', () => {
    expect(formatSelectionBreakdown(['roof-segment', 'roof-segment', 'wall'])).toBe(
      '2 个屋顶分段 · 1 个墙体',
    )
  })

  test('skips missing nodes', () => {
    expect(formatSelectionBreakdown(['wall', undefined, null])).toBe('1 个墙体')
  })

  test('empty selection formats to an empty string', () => {
    expect(formatSelectionBreakdown([])).toBe('')
  })
})
