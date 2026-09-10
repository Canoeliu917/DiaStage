import { expect, test } from 'bun:test'
import { archivedArchitectureDefinitions } from '../archived-architecture'
import { ceilingDefinition } from '../ceiling/definition'
import { roofSegmentDefinition } from '../roof-segment/definition'
import { roofDefinition } from './definition'

test('archived roof and ceiling schemas have no runtime, tools, panels or AI definitions', () => {
  for (const definition of [
    roofDefinition,
    roofSegmentDefinition,
    ceilingDefinition,
    ...archivedArchitectureDefinitions,
  ]) {
    if (['roof', 'roof-segment', 'ceiling'].includes(definition.kind))
      expect(
        definition.schema.safeParse({
          polygon: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        }).success,
      ).toBe(true)
    for (const field of [
      'renderer',
      'geometry',
      'system',
      'tool',
      'handles',
      'parametrics',
      'presentation',
      'mcp',
      'affordanceTools',
      'floorplan',
    ] as const)
      expect(definition[field]).toBeUndefined()
    expect(definition.capabilities).toEqual({})
  }
})
