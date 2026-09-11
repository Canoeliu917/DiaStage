import { describe, expect, test } from 'bun:test'
import { LevelNode, normalizeLevelBaseElevation } from './level'

describe('LevelNode', () => {
  test('defaults baseElevation to 0', () => {
    expect(LevelNode.parse({ level: 0, name: 'Ground' }).baseElevation).toBe(0)
  })

  test('accepts a custom baseElevation', () => {
    expect(
      LevelNode.parse({
        baseElevation: 1.25,
        level: 1,
        name: 'Split level',
      }).baseElevation,
    ).toBe(1.25)
  })

  test('normalizes legacy missing and invalid baseElevation values to a finite zero', () => {
    expect(normalizeLevelBaseElevation(undefined)).toBe(0)
    expect(normalizeLevelBaseElevation(Number.NaN)).toBe(0)
    expect(Number.isNaN(normalizeLevelBaseElevation(undefined))).toBe(false)
  })

  test('accepts level child IDs minted by plugins', () => {
    const children = LevelNode.parse({
      children: ['actor_plugin-child', 'prop_plugin-child', 'mark_plugin-child'],
    }).children as string[]

    expect(children).toEqual(['actor_plugin-child', 'prop_plugin-child', 'mark_plugin-child'])
  })

  test('does not materialize height on parse — absence marks unmigrated legacy data', () => {
    expect('height' in LevelNode.parse({})).toBe(false)
    expect(LevelNode.parse({ height: 3 }).height).toBe(3)
  })
})
