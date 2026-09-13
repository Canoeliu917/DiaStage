import { expect, test } from 'bun:test'
import { blockDefinition } from '../block/definition'
import { buildingDefinition } from '../building/definition'
import { levelDefinition } from '../level/definition'
import { slabDefinition } from '../slab/definition'
import { siteDefinition } from './definition'

test('theatre graph containers retain renderer entry points after architectural cleanup', async () => {
  for (const definition of [siteDefinition, buildingDefinition, levelDefinition]) {
    const renderer = definition.renderer
    expect(renderer?.kind).toBe('parametric')
    if (renderer?.kind !== 'parametric') throw new Error(`${definition.kind} hides its subtree`)
    expect(typeof (await renderer.module()).default).toBe('function')
  }
  expect(typeof blockDefinition.geometry).toBe('function')
  expect(slabDefinition.renderer || slabDefinition.geometry).toBeTruthy()
})
