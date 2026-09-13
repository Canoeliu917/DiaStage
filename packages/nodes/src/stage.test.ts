import { expect, test } from 'bun:test'
import type { AnyNodeDefinition } from '@pascal-app/core'
import { builtinPlugin } from './index'
import { stagePlugin } from './stage'

const stage = new Map((stagePlugin.nodes as AnyNodeDefinition[]).map((def) => [def.kind, def]))

test('the stage entry retains every historical schema and version', () => {
  for (const old of builtinPlugin.nodes as AnyNodeDefinition[]) {
    const current = stage.get(old.kind)!
    expect(current.schema).toBe(old.schema)
    expect(current.schemaVersion).toBe(old.schemaVersion)
  }
})

test('saved opening pose, host and material slots survive without authoring contributions', () => {
  for (const kind of ['door', 'window', 'fence']) {
    const current = stage.get(kind)!
    const old = (builtinPlugin.nodes as AnyNodeDefinition[]).find((def) => def.kind === kind)!
    const fixture = {
      ...old.defaults(),
      id: `${kind}_historical`,
      type: kind,
      metadata: { retained: 'historical version' },
      ...(kind !== 'fence'
        ? {
            parentId: 'wall_historical',
            wallId: 'wall_historical',
            operationState: 0.6,
            position: [1.2, 0.1, 0],
            rotation: [0, Math.PI, 0],
            materialPreset: 'library:wood',
          }
        : {}),
    }
    expect(current.schema.parse(fixture)).toEqual(old.schema.parse(fixture))
    expect(current.floorplan).toBe(old.floorplan)
    expect(current.system).toBeDefined()
    expect(current.capabilities.slots).toBeDefined()
    expect(current.tool).toBeUndefined()
    expect(current.affordanceTools).toBeUndefined()
    expect(current.parametrics).toBeUndefined()
    expect(current.keyboardActions).toBeUndefined()
    expect(current.capabilities.paint).toBeUndefined()
  }
})
