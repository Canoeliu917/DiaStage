import { getEffectiveStairSurfaceMaterial, type StairNode } from '@pascal-app/core'
import type * as THREE from 'three'
import {
  type ColorPreset,
  createMaterial,
  createMaterialFromPresetRef,
  createSurfaceRoleMaterial,
  DEFAULT_STAIR_MATERIAL,
  type RenderShading,
} from '../../lib/materials'

export type StairBodyMaterials = [THREE.Material, THREE.Material]

const stairBodyMaterialCache = new Map<string, StairBodyMaterials>()

function getSurfaceMaterialSignature(
  spec: ReturnType<typeof getEffectiveStairSurfaceMaterial>,
): string {
  return JSON.stringify({
    material: spec.material ?? null,
    materialPreset: spec.materialPreset ?? null,
  })
}

function createResolvedMaterial(
  material: StairNode['material'] | undefined,
  materialPreset: string | undefined,
  shading: RenderShading,
  textures: boolean,
  colorPreset: ColorPreset,
): THREE.Material {
  if (!textures) {
    return createSurfaceRoleMaterial('joinery', colorPreset)
  }

  if (materialPreset) {
    return createMaterialFromPresetRef(materialPreset, shading) ?? DEFAULT_STAIR_MATERIAL(shading)
  }

  if (material) {
    return createMaterial(material, shading)
  }

  return DEFAULT_STAIR_MATERIAL(shading)
}

export function getStairBodyMaterials(
  stair: StairNode,
  shading: RenderShading = 'rendered',
  textures = true,
  colorPreset: ColorPreset = 'clay',
): StairBodyMaterials {
  const tread = getEffectiveStairSurfaceMaterial(stair, 'tread')
  const side = getEffectiveStairSurfaceMaterial(stair, 'side')
  const cacheKey = JSON.stringify({
    shading,
    textures,
    colorPreset,
    tread: getSurfaceMaterialSignature(tread),
    side: getSurfaceMaterialSignature(side),
  })

  const cached = stairBodyMaterialCache.get(cacheKey)
  if (cached) return cached

  const materials: StairBodyMaterials = [
    createResolvedMaterial(tread.material, tread.materialPreset, shading, textures, colorPreset),
    createResolvedMaterial(side.material, side.materialPreset, shading, textures, colorPreset),
  ]

  stairBodyMaterialCache.set(cacheKey, materials)
  return materials
}
