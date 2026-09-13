import type { AnyNode } from '@pascal-app/core'

export type PlacementFeedback = { valid: boolean; contact: boolean }
type PlacementPolicy = {
  enabled: () => boolean
  evaluate: (node: AnyNode) => PlacementFeedback | null
  snap?: (node: AnyNode, position: [number, number, number]) => [number, number, number] | null
}
let policy: PlacementPolicy | null = null

/** A host can make contact advisory while retaining its structural placement checks. */
export function installPlacementPolicy(next: PlacementPolicy) {
  policy = next
  return () => {
    if (policy === next) policy = null
  }
}

export function hasPlacementPolicy() {
  return policy?.enabled() === true
}

export function placementFeedback(node: AnyNode): PlacementFeedback | null {
  return hasPlacementPolicy() ? policy!.evaluate(node) : null
}

export function snapPlacementPosition(node: AnyNode, position: [number, number, number]) {
  return hasPlacementPolicy() ? (policy!.snap?.(node, position) ?? null) : null
}
