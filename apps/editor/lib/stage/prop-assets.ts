import type { AssetInput } from '@pascal-app/core'
import {
  STAGE_OBJECT_REGISTRY,
  type StageCollisionGeometry,
  type StageDimensions,
  type StageItemKind,
  stageCollisionGeometry,
} from '@pascal-app/core/stage'
import manifest from '../../public/stage-library/prop-menu-manifest.json'

export const STAGE_PROP_MENU = manifest

export function stagePropAssetUrl(relativePath: string): string {
  return `/stage-library/${relativePath}`
}

export type SceneryLibraryItem = { kind: StageItemKind; asset: AssetInput }

export const AVAILABLE_STAGE_SCENERY: SceneryLibraryItem[] = manifest.assets.map((prop) => {
  const spec = STAGE_OBJECT_REGISTRY.find((entry) => entry.canonicalId === prop.id)!
  const min = prop.bounds_m[0]!
  const max = prop.bounds_m[1]!
  return {
    kind: spec.kind,
    asset: {
      id: prop.id,
      name: prop.name,
      category: 'scenery',
      source: 'library',
      src: stagePropAssetUrl(prop.model),
      thumbnail: stagePropAssetUrl(prop.thumbnail),
      tags: [spec.kind, ...prop.tags],
      // Only the Blender-space manifest bounds need mapping; the GLB is already Y-up.
      dimensions: [max[0]! - min[0]!, max[2]! - min[2]!, max[1]! - min[1]!],
      boundsCenter: [(min[0]! + max[0]!) / 2, (min[2]! + max[2]!) / 2, -(min[1]! + max[1]!) / 2],
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  }
})

export const AVAILABLE_STAGE_ASSET_IDS = AVAILABLE_STAGE_SCENERY.map(({ asset }) => asset.id)

export function stagePropCollisionGeometry(
  assetId: string | null,
  dimensions: StageDimensions,
): StageCollisionGeometry | undefined {
  const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)?.asset
  if (!asset) return undefined
  const size = [dimensions.width, dimensions.height, dimensions.depth]
  const offset = asset.boundsCenter!.map(
    (value, axis) => (value * size[axis]!) / asset.dimensions![axis]!,
  )
  offset[1]! -= dimensions.height / 2
  return stageCollisionGeometry({ kind: 'neutral-block', dimensionsMeters: dimensions }).map(
    (part) => ({
      ...part,
      vertices: part.vertices.map(
        (point) => point.map((value, axis) => value + offset[axis]!) as [number, number, number],
      ),
    }),
  )
}
