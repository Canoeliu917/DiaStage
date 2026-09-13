import type { ItemNode } from '@pascal-app/core'
import type { WallMode } from '@pascal-app/viewer'
import type { Material, Matrix4, Plane } from 'three'

export function isSceneryPanelAsset(asset: ItemNode['asset']): boolean {
  return /^SCN-(FLAT|FOLD|DOOR|WIN)-/.test(asset.id)
}

/** Display-only copies: authored catalog materials and saved item slots stay intact. */
export function createTranslucentItemMaterials() {
  const copies = new Map<Material, Material>()
  return {
    resolve(original: Material): Material {
      let copy = copies.get(original)
      if (!copy) {
        copy = original.clone()
        copy.transparent = true
        copy.opacity = Math.min(original.opacity, 0.24)
        copy.depthWrite = false
        copies.set(original, copy)
      }
      return copy
    },
    dispose() {
      for (const copy of copies.values()) copy.dispose()
      copies.clear()
    },
  }
}

/** Plane uses the item's unscaled local bounds, then follows its complete world transform. */
export function updateItemSectionPlane(
  plane: Plane,
  asset: ItemNode['asset'],
  mode: WallMode,
  matrixWorld: Matrix4,
) {
  const height = asset.dimensions[1]
  const bottom = (asset.boundsCenter?.[1] ?? height / 2) - height / 2
  const visibleHeight = mode === 'down' ? Math.min(0.3, height) : height / 2
  plane.setComponents(0, -1, 0, bottom + visibleHeight).applyMatrix4(matrixWorld)
}
