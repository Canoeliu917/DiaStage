import { type AnyNode, type AnyNodeDefinition, nodeRegistry, registerNode } from '@pascal-app/core'
import { preloadRegistryAffordanceTool } from '@pascal-app/editor'
import { builtinPlugin } from '@pascal-app/nodes'
import { centeredPropFloorplan } from './stage/rigid-floorplan'

// Idempotency guards: HMR can reload this module, but `registerNode`
// throws on duplicate kinds. Flags live in the module closure so they
// reset on a hard reload but survive within a session.
let builtinsLoaded = false

function isDev(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.NODE_ENV !== 'production'
}

/**
 * Synchronously register every built-in node kind. Runs as a side
 * effect at module import time so the registry is populated *before*
 * any downstream React tree renders — the previous async kick-off
 * (`void loadBuiltinNodes()`) only registered in a microtask, letting
 * the first SSR / hydration pass see an empty registry. The mismatch
 * surfaced as a hydration error at the `<html>` element and every
 * `NodeRenderer` resolving to `null` until later renders.
 *
 */
function loadBuiltinsSync(): void {
  if (builtinsLoaded) return
  builtinsLoaded = true
  for (const def of builtinPlugin.nodes ?? []) {
    // Skip kinds the registry already has. The module-closure flag
    // above resets on HMR, but the registry singleton (in @pascal-app/core)
    // persists — without this guard we'd throw on the first duplicate.
    if (nodeRegistry.has((def as AnyNodeDefinition).kind)) continue
    const definition = def as AnyNodeDefinition
    registerNode(
      ['block', 'item', 'stair'].includes(definition.kind)
        ? ({
            ...definition,
            capabilities: {
              ...definition.capabilities,
              selectable: { ...definition.capabilities.selectable, hitVolume: 'mesh' },
              movable: {
                ...(definition.capabilities.movable ?? { axes: ['x', 'z'] }),
                directDrag: true,
              },
            },
            handles: () => [],
            floorplan: (node, context) =>
              centeredPropFloorplan(
                definition.floorplan?.(node, context) ?? null,
                node as AnyNode,
                context,
              ),
            presentation: { ...definition.presentation, actionMenu: false },
            affordanceTools: Object.fromEntries(
              Object.entries(definition.affordanceTools ?? {}).filter(
                ([name]) => name !== 'selection',
              ),
            ),
          } as AnyNodeDefinition)
        : definition,
    )
    if (typeof window !== 'undefined' && ['block', 'item', 'stair'].includes(definition.kind)) {
      // A failed warm-up is retried by the existing tool loader on interaction.
      void preloadRegistryAffordanceTool(definition.kind, 'move')?.catch(() => {})
    }
  }

  if (isDev()) {
    const kinds = Array.from(nodeRegistry.entries(), ([k]) => k)
    if (typeof console !== 'undefined') {
      console.info(
        `[diastage:registry] loaded ${builtinPlugin.id} v${builtinPlugin.apiVersion} (${kinds.length} kinds: ${kinds.join(', ') || '∅'})`,
      )
    }
    // Expose the registry on globalThis for ad-hoc dev inspection. In
    // prod the registry is reachable through @pascal-app/core's
    // exports only.
    if (typeof globalThis !== 'undefined') {
      ;(globalThis as { __diaStageNodeRegistry?: typeof nodeRegistry }).__diaStageNodeRegistry =
        nodeRegistry
    }
  }
}

loadBuiltinsSync()
