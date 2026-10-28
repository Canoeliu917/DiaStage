import type { AssetInput } from '@pascal-app/core'
import {
  STAGE_OBJECT_REGISTRY,
  type StageCollisionGeometry,
  type StageDimensions,
  type StageItemKind,
  stageCollisionGeometry,
} from '@pascal-app/core/stage'
import { CATALOG_ITEMS } from '@pascal-app/editor/catalog'
import manifest from '../../public/stage-library/prop-menu-manifest.json'

export const STAGE_PROP_MENU = manifest

export function stagePropAssetUrl(relativePath: string): string {
  return `/stage-library/${relativePath}`
}

export type SceneryLibraryItem = { kind: StageItemKind; asset: AssetInput }

export const AVAILABLE_STAGE_SCENERY: SceneryLibraryItem[] = CATALOG_ITEMS.filter((asset) =>
  STAGE_PROP_MENU.assets.some((entry) => entry.id === asset.id),
).map((asset) => ({
  kind: STAGE_OBJECT_REGISTRY.find((entry) => entry.canonicalId === asset.id)!.kind,
  asset,
}))

export const AVAILABLE_STAGE_ASSET_IDS = AVAILABLE_STAGE_SCENERY.map(({ asset }) => asset.id)

export function stagePropCollisionGeometry(
  assetId: string | null,
  dimensions: StageDimensions,
): StageCollisionGeometry | undefined {
  const asset = CATALOG_ITEMS.find((entry) => entry.id === assetId)
  if (!asset) return undefined
  if (assetId === 'SCN-FOLD-02' || assetId === 'SCN-FOLD-03')
    return stageCollisionGeometry({
      kind: 'scenic-flat',
      libraryAssetId: assetId,
      dimensionsMeters: dimensions,
    })
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
