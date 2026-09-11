'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type FenceNode,
  getCatalogMaterialById,
  getEffectiveStairSurfaceMaterial,
  getLibraryMaterialIdFromRef,
  type MaterialSchema,
  type MaterialTarget,
  nodeRegistry,
  type ShelfNode,
  type SlabNode,
  type StairNode,
  type StairSurfaceMaterialRole,
  type WallSurfaceSide,
} from '@pascal-app/core'

export type PaintableMaterialTarget =
  | Extract<MaterialTarget, 'wall' | 'stair' | 'fence' | 'slab' | 'shelf'>
  | 'item'

export type SingleSurfaceMaterialRole = 'surface'

export type ActivePaintMaterial = {
  material?: MaterialSchema
  materialPreset?: string
  sourceTarget: PaintableMaterialTarget
}

export function hasActivePaintMaterial(
  material: ActivePaintMaterial | null | undefined,
): material is ActivePaintMaterial {
  return Boolean(
    material && (material.material !== undefined || material.materialPreset !== undefined),
  )
}

function getCatalogEntryForActivePaintMaterial(material: ActivePaintMaterial | null | undefined) {
  const catalogId =
    getLibraryMaterialIdFromRef(material?.materialPreset) ?? material?.material?.id ?? undefined

  return getCatalogMaterialById(catalogId)
}

export function getActivePaintMaterialLabel(material: ActivePaintMaterial | null | undefined) {
  return getCatalogEntryForActivePaintMaterial(material)?.label ?? 'Custom'
}

/**
 * Clear every painted material on a node back to its default. Works for any
 * kind without per-type knowledge: it nulls the catch-all `material` /
 * `materialPreset` plus any role field (`*Material` / `*MaterialPreset`) that
 * the node actually carries. For a roof it also resets every child segment, so
 * a single call defaults the whole roof system. `updateNode` merges patches
 * shallowly without re-validation, so the `undefined` values land as cleared
 * fields and the renderer falls back to the theme defaults.
 */
export function buildResetSurfaceMaterialUpdates(
  node: AnyNode,
): { id: AnyNodeId; data: Partial<AnyNode> }[] {
  const clearPatch = (target: AnyNode): Partial<AnyNode> => {
    const patch: Record<string, undefined> = {}
    for (const key of Object.keys(target)) {
      if (
        key === 'material' ||
        key === 'materialPreset' ||
        key === 'slots' ||
        key.endsWith('Material') ||
        key.endsWith('MaterialPreset')
      ) {
        patch[key] = undefined
      }
    }
    return patch as Partial<AnyNode>
  }

  const updates: { id: AnyNodeId; data: Partial<AnyNode> }[] = [
    { id: node.id as AnyNodeId, data: clearPatch(node) },
  ]

  return updates
}

export function buildStairSurfaceMaterialPatch(
  node: StairNode,
  targetRole: StairSurfaceMaterialRole,
  material: MaterialSchema | undefined,
  materialPreset: string | undefined,
): Partial<StairNode> {
  const nextSurfaceMaterial = { material, materialPreset }
  const nextTread =
    targetRole === 'tread' ? nextSurfaceMaterial : getEffectiveStairSurfaceMaterial(node, 'tread')
  const nextSide =
    targetRole === 'side' ? nextSurfaceMaterial : getEffectiveStairSurfaceMaterial(node, 'side')

  return {
    treadMaterial: nextTread.material,
    treadMaterialPreset: nextTread.materialPreset,
    sideMaterial: nextSide.material,
    sideMaterialPreset: nextSide.materialPreset,
    material: undefined,
    materialPreset: undefined,
  }
}

export function buildSingleSurfaceMaterialPatch<TNode extends FenceNode | SlabNode | ShelfNode>(
  material: MaterialSchema | undefined,
  materialPreset: string | undefined,
): Partial<TNode> {
  return {
    material,
    materialPreset,
  } as Partial<TNode>
}

export function resolveActivePaintMaterialFromSelection(params: {
  nodes: Record<string, any>
  selectedId: string | null
  selectedMaterialTarget: {
    nodeId: string
    role: WallSurfaceSide | StairSurfaceMaterialRole | SingleSurfaceMaterialRole | string
  } | null
}): ActivePaintMaterial | null {
  const { nodes, selectedId, selectedMaterialTarget } = params
  if (!(selectedId && selectedMaterialTarget) || selectedMaterialTarget.nodeId !== selectedId)
    return null

  const selectedNode = nodes[selectedId]
  if (!selectedNode) return null

  // Registry-driven path. Kinds that declare paint resolution keep
  // their material logic with the node definition.
  const paintCap = nodeRegistry.get(selectedNode.type)?.capabilities?.paint
  if (paintCap?.getEffectiveMaterial) {
    const surface = paintCap.getEffectiveMaterial({
      node: selectedNode,
      role: selectedMaterialTarget.role as string,
      nodes,
    })
    if (surface) {
      const sourceTarget = (paintCap.materialTarget ?? selectedNode.type) as PaintableMaterialTarget
      return hasActivePaintMaterial({
        material: surface.material,
        materialPreset: surface.materialPreset,
        sourceTarget,
      })
        ? {
            material: surface.material,
            materialPreset: surface.materialPreset,
            sourceTarget,
          }
        : null
    }
  }

  if (
    selectedNode.type === 'stair' &&
    (selectedMaterialTarget.role === 'tread' || selectedMaterialTarget.role === 'side')
  ) {
    const surface = getEffectiveStairSurfaceMaterial(selectedNode, selectedMaterialTarget.role)
    return hasActivePaintMaterial({
      material: surface.material,
      materialPreset: surface.materialPreset,
      sourceTarget: 'stair',
    })
      ? {
          material: surface.material,
          materialPreset: surface.materialPreset,
          sourceTarget: 'stair',
        }
      : null
  }

  // Slot-backed kinds resolve via the registry-driven `getEffectiveMaterial`
  // path at the top of this function, including legacy inline-material
  // fallbacks when their capability exposes one.

  if (
    (selectedNode.type === 'fence' || selectedNode.type === 'shelf') &&
    selectedMaterialTarget.role === 'surface'
  ) {
    const target = selectedNode.type
    return hasActivePaintMaterial({
      material: selectedNode.material,
      materialPreset: selectedNode.materialPreset,
      sourceTarget: target,
    })
      ? {
          material: selectedNode.material,
          materialPreset: selectedNode.materialPreset,
          sourceTarget: target,
        }
      : null
  }

  return null
}

export function resolvePaintTargetFromSelection(params: {
  nodes: Record<string, any>
  selectedId: string | null
}): PaintableMaterialTarget | null {
  const { nodes, selectedId } = params
  if (!selectedId) return null

  const selectedNode = nodes[selectedId]
  if (!selectedNode) return null

  const registryPaintTarget = nodeRegistry.get(selectedNode.type)?.capabilities?.paint
    ?.materialTarget
  if (registryPaintTarget) return registryPaintTarget as PaintableMaterialTarget

  if (selectedNode.type === 'wall') {
    return 'wall'
  }

  if (selectedNode.type === 'stair' || selectedNode.type === 'stair-segment') {
    return 'stair'
  }

  if (selectedNode.type === 'fence') {
    return 'fence'
  }

  if (selectedNode.type === 'slab') {
    return 'slab'
  }

  if (selectedNode.type === 'shelf') {
    return 'shelf'
  }

  if (selectedNode.type === 'item') {
    return 'item'
  }

  return null
}
