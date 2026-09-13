import { expect, test } from 'bun:test'
import { type AnyNodeDefinition, registerNode } from '@pascal-app/core'
import { z } from 'zod'
import { getRegistryAffordanceTool, preloadRegistryAffordanceTool } from './affordance-dispatch'

test('a warmed move tool mounts directly without a first-drag Suspense delay', async () => {
  let loads = 0
  const Tool = () => null
  registerNode({
    kind: 'warm-move-test',
    schemaVersion: 1,
    schema: z.object({ type: z.literal('warm-move-test') }),
    category: 'structure',
    defaults: () => ({}),
    capabilities: {},
    renderer: { kind: 'parametric', module: async () => ({ default: Tool }) },
    affordanceTools: {
      move: async () => {
        loads++
        return { default: Tool }
      },
    },
  } as AnyNodeDefinition)
  await Promise.all([
    preloadRegistryAffordanceTool('warm-move-test', 'move'),
    preloadRegistryAffordanceTool('warm-move-test', 'move'),
  ])
  expect(loads).toBe(1)
  expect(getRegistryAffordanceTool('warm-move-test', 'move')).toBe(Tool)
})
