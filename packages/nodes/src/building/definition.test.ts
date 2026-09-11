import { describe, expect, test } from 'bun:test'
import { buildingDefinition } from './definition'

describe('buildingDefinition', () => {
  test('accepts performance-level children', () => {
    expect(buildingDefinition.kind).toBe('building')
    expect(buildingDefinition.schemaVersion).toBe(3)
    expect(
      buildingDefinition.schema.safeParse({
        id: 'building_default',
        type: 'building',
        ...buildingDefinition.defaults(),
        children: ['level_main'],
      }).success,
    ).toBe(true)
  })
})
