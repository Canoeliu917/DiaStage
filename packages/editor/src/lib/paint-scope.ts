import {
  type AnyNode,
  type AnyNodeId,
  generateSceneMaterialId,
  type ItemNode,
  type MaterialSchema,
  nodeRegistry,
  type SceneMaterial,
  type SceneMaterialId,
  slotLabelFromId,
  toSceneMaterialRef,
  useScene,
} from '@pascal-app/core'

/** How far one stage-material click spreads. */
export type PaintScope = 'single' | 'object' | 'matching'

export type PaintHoverInfo = {
  scopes: PaintScope[]
  slotLabel: string
  nodeNoun: string
}

function nodeHasAsset(node: AnyNode): boolean {
  return Boolean((node as { asset?: { id?: string } }).asset?.id)
}

export function availablePaintScopes(args: { node: AnyNode; slotRoles: string[] }): PaintScope[] {
  const scopes: PaintScope[] = ['single']
  if (args.slotRoles.length > 1) scopes.push('object')
  if (nodeHasAsset(args.node)) scopes.push('matching')
  return scopes
}

export function cyclePaintScope(scope: PaintScope, scopes: PaintScope[]): PaintScope {
  const list = scopes.length > 0 ? scopes : (['single'] as PaintScope[])
  const index = list.indexOf(scope)
  return list[(index + 1) % list.length] ?? 'single'
}

export function paintScopeLabel(scope: PaintScope, info: PaintHoverInfo): string {
  if (scope === 'object') return `整个${info.nodeNoun}`
  if (scope === 'matching') return '全部匹配项'
  return info.slotLabel || '当前表面'
}

export function nodeSlotRoles(node: AnyNode, meshSlotRoles: (node: AnyNode) => string[]): string[] {
  const declared = nodeRegistry.get(node.type)?.capabilities?.slots?.(node)
  if (declared && declared.length > 0) return declared.map((slot) => slot.slotId)
  return meshSlotRoles(node)
}

export function slotDisplayLabel(node: AnyNode, role: string): string {
  const declared = nodeRegistry
    .get(node.type)
    ?.capabilities?.slots?.(node)
    ?.find((slot) => slot.slotId === role)
  return declared?.label ?? slotLabelFromId(role)
}

export function resolvePaintScopeTargets(args: {
  node: AnyNode
  role: string
  scope: PaintScope
  nodes: Record<string, AnyNode>
  slotRolesOf: (node: AnyNode) => string[]
}): Array<{ nodeId: AnyNodeId; role: string }> {
  const { node, role, scope, nodes, slotRolesOf } = args
  const single = [{ nodeId: node.id as AnyNodeId, role }]
  if (scope === 'single') return single
  if (scope === 'object') {
    const roles = slotRolesOf(node)
    return (roles.length > 0 ? roles : [role]).map((slotRole) => ({
      nodeId: node.id as AnyNodeId,
      role: slotRole,
    }))
  }
  const assetId = (node as ItemNode).asset?.id
  if (!assetId) return single
  return Object.values(nodes)
    .filter((other) => other.type === 'item' && (other as ItemNode).asset?.id === assetId)
    .map((other) => ({ nodeId: other.id as AnyNodeId, role }))
}

type SlotsNode = AnyNode & { slots?: Record<string, string> }

function materialsEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => materialsEqual(value, b[index]))
  }
  if (typeof a === 'object') {
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord)
    if (aKeys.length !== Object.keys(bRecord).length) return false
    return aKeys.every(
      (key) => Object.hasOwn(bRecord, key) && materialsEqual(aRecord[key], bRecord[key]),
    )
  }
  return false
}

/** Apply a material to a resolved set of stage-object slots in one undo step. */
export function commitPaintScopeFanout(
  targets: ReadonlyArray<{ nodeId: AnyNodeId; role: string }>,
  material: MaterialSchema | undefined,
  materialPreset: string | undefined,
): void {
  if (targets.length === 0) return
  const state = useScene.getState()

  let ref: string | undefined
  let newSceneMaterial: SceneMaterial | null = null
  if (material === undefined && materialPreset === undefined) {
    ref = undefined
  } else if (materialPreset) {
    ref = materialPreset
  } else if (material) {
    const existing = Object.values(state.materials).find((scene) =>
      materialsEqual(scene.material, material),
    )
    if (existing) ref = toSceneMaterialRef(existing.id)
    else {
      const id = generateSceneMaterialId()
      newSceneMaterial = {
        id,
        name: `材质 ${Object.keys(state.materials).length + 1}`,
        material,
      }
      ref = toSceneMaterialRef(id)
    }
  } else return

  useScene.setState((current) => {
    if (current.readOnly) return current
    const nextNodes = { ...current.nodes }
    let changed = false
    for (const { nodeId, role } of targets) {
      const node = nextNodes[nodeId] as SlotsNode | undefined
      if (!node) continue
      const nextSlots = { ...(node.slots ?? {}) }
      if (ref) nextSlots[role] = ref
      else delete nextSlots[role]
      nextNodes[nodeId] = { ...node, slots: nextSlots } as AnyNode
      changed = true
    }
    if (!changed) return current
    return {
      nodes: nextNodes,
      materials: newSceneMaterial
        ? { ...current.materials, [newSceneMaterial.id as SceneMaterialId]: newSceneMaterial }
        : current.materials,
    }
  })

  for (const { nodeId } of targets) state.markDirty(nodeId)
}
