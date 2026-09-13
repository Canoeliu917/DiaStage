import type { AnyNode } from '../schema/types'

type Nodes = Readonly<Record<string, AnyNode | undefined>>
const cache = new WeakMap<
  Nodes,
  { inherited: Map<string, AnyNode>; related: Map<string, AnyNode> }
>()

export function getNodeLock(
  nodes: Nodes,
  id: string,
  includeDescendants = false,
): AnyNode | undefined {
  let locks = cache.get(nodes)
  if (!locks) {
    const inherited = new Map<string, AnyNode>(),
      related = new Map<string, AnyNode>()
    const children = new Map<string, string[]>()
    for (const node of Object.values(nodes)) {
      if (!node?.parentId) continue
      const ids = children.get(node.parentId) ?? []
      ids.push(node.id)
      children.set(node.parentId, ids)
    }
    for (const locked of Object.values(nodes)) {
      if (locked?.metadata?.stageLocked !== true) continue
      const visit = [locked.id as string],
        seen = new Set<string>()
      while (visit.length) {
        const child = visit.pop()!
        if (seen.has(child)) continue
        seen.add(child)
        inherited.set(child, locked)
        related.set(child, locked)
        visit.push(...(children.get(child) ?? []))
      }
      let ancestor = locked.parentId ? nodes[locked.parentId] : undefined
      while (ancestor && !seen.has(ancestor.id)) {
        seen.add(ancestor.id)
        related.set(ancestor.id, locked)
        ancestor = ancestor.parentId ? nodes[ancestor.parentId] : undefined
      }
    }
    locks = { inherited, related }
    cache.set(nodes, locks)
  }
  return (includeDescendants ? locks.related : locks.inherited).get(id)
}
