import type { MaterialPresetPayload } from './schema/material'

export type MaterialSource = 'builtin' | 'mine' | 'workspace'

export type MaterialCatalogItem = {
  id: string
  label: string
  category: MaterialCategory
  source?: MaterialSource
  surfaces?: MaterialSurface[]
  description?: string
  previewThumbnailUrl?: string
  previewColor?: string
  preset: MaterialPresetPayload
}

export const MATERIAL_CATEGORIES = [
  'colors',
  'wood',
  'concrete',
  'metal',
  'fabric',
  'leather',
] as const
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]

export const MATERIAL_SURFACES = ['floor', 'wall', 'furniture'] as const
export type MaterialSurface = (typeof MATERIAL_SURFACES)[number]

/** Small local finish library for stage scenery and props. */
export const MATERIAL_CATALOG: MaterialCatalogItem[] = [
  {
    id: 'wood-finewood27',
    label: 'Finewood 27',
    category: 'wood',
    surfaces: ['floor', 'wall', 'furniture'],
    description: 'Fine wood finish',
    previewThumbnailUrl: '/material/wood/finewood_27/finewood_27_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/wood/finewood_27/finewood_27_basecolor_512.ktx2',
        aoMap: '/material/wood/finewood_27/finewood_27_ao_512.ktx2',
        normalMap: '/material/wood/finewood_27/finewood_27_normal_512.ktx2',
        roughnessMap: '/material/wood/finewood_27/finewood_27_roughness_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.5,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'wood-floorplank1',
    label: 'Floor Plank 1',
    category: 'wood',
    surfaces: ['floor'],
    description: 'Wood plank finish',
    previewThumbnailUrl: '/material/wood/floor_plank_1/floor_plank_1_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/wood/floor_plank_1/floor_plank_1_basecolor_512.ktx2',
        aoMap: '/material/wood/floor_plank_1/floor_plank_1_ao_512.ktx2',
        normalMap: '/material/wood/floor_plank_1/floor_plank_1_normal_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.45,
        metalness: 0,
        repeatX: 0.4,
        repeatY: 0.4,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-white',
    label: 'White',
    category: 'colors',
    description: 'Clean painted finish',
    previewColor: '#e9e9e9',
    preset: {
      maps: {},
      mapProperties: {
        color: '#e9e9e9',
        roughness: 0.9,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-softwhite',
    label: 'Soft White',
    category: 'colors',
    description: 'Warm off-white painted finish',
    previewColor: '#ebe7df',
    preset: {
      maps: {},
      mapProperties: {
        color: '#ebe7df',
        roughness: 0.9,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-beige',
    label: 'Beige',
    category: 'colors',
    description: 'Balanced beige painted finish',
    previewColor: '#d9c7ad',
    preset: {
      maps: {},
      mapProperties: {
        color: '#d9c7ad',
        roughness: 0.9,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-lightgrey',
    label: 'Light grey',
    category: 'colors',
    description: 'Cool light grey painted finish',
    previewColor: '#d8d6d1',
    preset: {
      maps: {},
      mapProperties: {
        color: '#d8d6d1',
        roughness: 0.9,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-midgrey',
    label: 'Mid grey',
    category: 'colors',
    description: 'Neutral mid grey painted finish',
    previewColor: '#8b8a86',
    preset: {
      maps: {},
      mapProperties: {
        color: '#8b8a86',
        roughness: 0.9,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-charcoal',
    label: 'Charcoal',
    category: 'colors',
    description: 'Dark charcoal painted finish',
    previewColor: '#4e5257',
    preset: {
      maps: {},
      mapProperties: {
        color: '#4e5257',
        roughness: 0.9,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-nearblack',
    label: 'Near-black',
    category: 'colors',
    description: 'Soft near-black painted finish',
    previewColor: '#232322',
    preset: {
      maps: {},
      mapProperties: {
        color: '#232322',
        roughness: 0.9,
        metalness: 0,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'preset-metal',
    label: 'Metal',
    category: 'metal',
    surfaces: ['furniture', 'wall'],
    description: 'Brushed metal finish',
    previewColor: '#c0c0c0',
    preset: {
      maps: {},
      mapProperties: {
        color: '#c7ccd2',
        roughness: 0.26,
        metalness: 0.82,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0.02,
        transparent: false,
        flipY: true,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'fabric-linen',
    label: 'Linen',
    category: 'fabric',
    surfaces: ['furniture', 'wall'],
    description: 'Natural linen weave',
    previewThumbnailUrl: '/material/fabric/linen_hikari_fabric/linen_hikari_fabric_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/fabric/linen_hikari_fabric/linen_hikari_fabric_basecolor_512.ktx2',
        normalMap: '/material/fabric/linen_hikari_fabric/linen_hikari_fabric_normal_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.85,
        metalness: 0,
        repeatX: 2,
        repeatY: 2,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'fabric-velvet',
    label: 'Velvet',
    category: 'fabric',
    surfaces: ['furniture'],
    description: 'Velvet with a soft sheen',
    previewThumbnailUrl: '/material/fabric/red_velvet/red_velvet_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/fabric/red_velvet/red_velvet_basecolor_512.ktx2',
        normalMap: '/material/fabric/red_velvet/red_velvet_normal_512.ktx2',
        roughnessMap: '/material/fabric/red_velvet/red_velvet_roughness_512.ktx2',
        aoMap: '/material/fabric/red_velvet/red_velvet_ao_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.6,
        metalness: 0,
        repeatX: 2.5,
        repeatY: 2.5,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'fabric-wool',
    label: 'Wool',
    category: 'fabric',
    surfaces: ['furniture'],
    description: 'Matte wool felt',
    previewThumbnailUrl: '/material/fabric/white_wool/white_wool_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/fabric/white_wool/white_wool_basecolor_512.ktx2',
        normalMap: '/material/fabric/white_wool/white_wool_normal_512.ktx2',
        roughnessMap: '/material/fabric/white_wool/white_wool_roughness_512.ktx2',
        aoMap: '/material/fabric/white_wool/white_wool_ao_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.9,
        metalness: 0,
        repeatX: 2.5,
        repeatY: 2.5,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'leather-black',
    label: 'Black Leather',
    category: 'leather',
    surfaces: ['furniture'],
    description: 'Smooth black leather',
    previewThumbnailUrl: '/material/leather/black_leather/black_leather_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/leather/black_leather/black_leather_basecolor_512.ktx2',
        normalMap: '/material/leather/black_leather/black_leather_normal_512.ktx2',
        roughnessMap: '/material/leather/black_leather/black_leather_roughness_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.5,
        metalness: 0,
        repeatX: 1.67,
        repeatY: 1.67,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'concrete-plaster',
    label: 'Painted Plaster',
    category: 'concrete',
    surfaces: ['wall'],
    description: 'Smooth painted plaster wall',
    previewThumbnailUrl: '/material/concrete/plaster_painted/plaster_painted_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/concrete/plaster_painted/plaster_painted_basecolor_512.ktx2',
        normalMap: '/material/concrete/plaster_painted/plaster_painted_normal_512.ktx2',
        roughnessMap: '/material/concrete/plaster_painted/plaster_painted_roughness_512.ktx2',
        aoMap: '/material/concrete/plaster_painted/plaster_painted_ao_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.85,
        metalness: 0,
        repeatX: 0.67,
        repeatY: 0.67,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'concrete-polished',
    label: 'Polished Concrete',
    category: 'concrete',
    surfaces: ['floor', 'wall'],
    description: 'Polished concrete floor',
    previewThumbnailUrl: '/material/concrete/concrete_polished/concrete_polished_thumb.webp',
    preset: {
      maps: {
        albedoMap: '/material/concrete/concrete_polished/concrete_polished_basecolor_512.ktx2',
        normalMap: '/material/concrete/concrete_polished/concrete_polished_normal_512.ktx2',
        roughnessMap: '/material/concrete/concrete_polished/concrete_polished_roughness_512.ktx2',
      },
      mapProperties: {
        color: '#ffffff',
        roughness: 0.5,
        metalness: 0,
        repeatX: 0.5,
        repeatY: 0.5,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'metal-brass',
    label: 'Brass',
    category: 'metal',
    surfaces: ['furniture', 'wall'],
    description: 'Polished brass (flat metal, no maps)',
    previewColor: '#b08d57',
    preset: {
      maps: {},
      mapProperties: {
        color: '#b08d57',
        roughness: 0.35,
        metalness: 0.9,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
  {
    id: 'metal-chrome',
    label: 'Chrome',
    category: 'metal',
    surfaces: ['furniture', 'wall'],
    description: 'Polished chrome (flat metal, no maps)',
    previewColor: '#c8ccce',
    preset: {
      maps: {},
      mapProperties: {
        color: '#c8ccce',
        roughness: 0.2,
        metalness: 0.6,
        repeatX: 1,
        repeatY: 1,
        rotation: 0,
        wrapS: 'Repeat',
        wrapT: 'Repeat',
        normalScaleX: 1,
        normalScaleY: 1,
        emissiveIntensity: 1,
        displacementScale: 0,
        transparent: false,
        flipY: false,
        bumpScale: 1,
        emissiveColor: '#000000',
        aoMapIntensity: 1,
        side: 0,
        opacity: 1,
        lightMapIntensity: 1,
      },
    },
  },
]

const STATIC_CATALOG_IDS = new Set(MATERIAL_CATALOG.map((item) => item.id))
const dynamicLibraryMaterials = new Map<string, MaterialCatalogItem>()
const dynamicLibraryListeners = new Set<() => void>()
let dynamicLibraryVersion = 0

function notifyDynamicLibraryChange(): void {
  dynamicLibraryVersion += 1
  for (const listener of dynamicLibraryListeners) listener()
}

export function registerLibraryMaterials(items: MaterialCatalogItem[]): void {
  if (items.length === 0) return
  for (const item of items) dynamicLibraryMaterials.set(item.id, item)
  notifyDynamicLibraryChange()
}

export function unregisterLibraryMaterials(ids: string[]): void {
  let changed = false
  for (const id of ids) changed = dynamicLibraryMaterials.delete(id) || changed
  if (changed) notifyDynamicLibraryChange()
}

export function getDynamicLibraryMaterials(): MaterialCatalogItem[] {
  return [...dynamicLibraryMaterials.values()]
}

export function subscribeLibraryMaterials(listener: () => void): () => void {
  dynamicLibraryListeners.add(listener)
  return () => dynamicLibraryListeners.delete(listener)
}

export function getLibraryMaterialsVersion(): number {
  return dynamicLibraryVersion
}

export function getMaterialsForCategory(category: MaterialCategory): MaterialCatalogItem[] {
  const items = MATERIAL_CATALOG.filter((item) => item.category === category)
  for (const item of dynamicLibraryMaterials.values()) {
    if (item.category === category && !STATIC_CATALOG_IDS.has(item.id)) items.push(item)
  }
  return items
}

export function getCatalogMaterialById(id?: string): MaterialCatalogItem | undefined {
  if (!id) return undefined
  return MATERIAL_CATALOG.find((item) => item.id === id) ?? dynamicLibraryMaterials.get(id)
}

export const LIBRARY_MATERIAL_REF_PREFIX = 'library:'
export const SCENE_MATERIAL_REF_PREFIX = 'scene:'

export function toLibraryMaterialRef(id: string) {
  return LIBRARY_MATERIAL_REF_PREFIX + id
}

export function toSceneMaterialRef(id: string) {
  return SCENE_MATERIAL_REF_PREFIX + id
}

export function getLibraryMaterialIdFromRef(materialRef?: string | null) {
  if (typeof materialRef !== 'string' || !materialRef.startsWith(LIBRARY_MATERIAL_REF_PREFIX))
    return null
  return materialRef.slice(LIBRARY_MATERIAL_REF_PREFIX.length)
}

export function getSceneMaterialIdFromRef(materialRef?: string | null): string | null {
  if (typeof materialRef !== 'string' || !materialRef.startsWith(SCENE_MATERIAL_REF_PREFIX))
    return null
  return materialRef.slice(SCENE_MATERIAL_REF_PREFIX.length)
}

export type MaterialRef = string
export type ParsedMaterialRef = { kind: 'library'; id: string } | { kind: 'scene'; id: string }

export function parseMaterialRef(ref?: string | null): ParsedMaterialRef | null {
  const libraryId = getLibraryMaterialIdFromRef(ref)
  if (libraryId) return { kind: 'library', id: libraryId }
  const sceneId = getSceneMaterialIdFromRef(ref)
  if (sceneId) return { kind: 'scene', id: sceneId }
  return null
}

export function getMaterialPresetByRef(materialRef?: string | null): MaterialPresetPayload | null {
  const materialId = getLibraryMaterialIdFromRef(materialRef)
  return materialId ? (getCatalogMaterialById(materialId)?.preset ?? null) : null
}
