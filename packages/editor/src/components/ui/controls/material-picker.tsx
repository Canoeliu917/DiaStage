'use client'

import {
  getCatalogMaterialById,
  getDynamicLibraryMaterials,
  getLibraryMaterialIdFromRef,
  getLibraryMaterialsVersion,
  getMaterialsForCategory,
  MATERIAL_CATEGORIES,
  type MaterialCatalogItem,
  type MaterialSource,
  type MaterialTarget,
  subscribeLibraryMaterials,
  toLibraryMaterialRef,
} from '@pascal-app/core'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { triggerSFX } from '../../../lib/sfx-bus'

export type MaterialSourceFilter = MaterialSource

export type MaterialPickerProps = {
  selectedMaterialPreset?: string
  onSelectMaterialPreset?: (materialPreset: string) => void
  disabled?: boolean
  nodeType?: MaterialTarget
  hideSideControl?: boolean
  onCreateMaterialRequest?: () => void
}

// No 'All': the browse surfaces (Items / Rooms / Build) dropped it and default
// to the Pascal library — the combined list buried the curated set.
const SOURCE_FILTERS: { id: MaterialSourceFilter; label: string }[] = [
  { id: 'pascal', label: '内置资源' },
  { id: 'mine', label: '我的' },
  { id: 'workspace', label: '工作区' },
  { id: 'community', label: '社区' },
]

function getCategoryLabel(category: (typeof MATERIAL_CATEGORIES)[number]) {
  const labels: Record<(typeof MATERIAL_CATEGORIES)[number], string> = {
    colors: '颜色',
    wood: '木材',
    stone: '石材',
    brick: '砖石',
    tile: '瓷砖',
    wallpaper: '图案纸',
    concrete: '混凝土',
    metal: '金属',
    plastic: '塑料',
    fabric: '织物',
    carpet: '地毯',
    leather: '皮革',
    roofing: '兼容表面',
    ground: '地面',
    glass: '玻璃',
    other: '其他',
  }
  return labels[category]
}

function filterBySource(items: MaterialCatalogItem[], filter: MaterialSourceFilter) {
  return items.filter((item) => item.category !== 'roofing' && (item.source ?? 'pascal') === filter)
}

// Built-in catalog ids are reserved by core; host/user entries keep their own labels.
const BUILTIN_MATERIAL_LABELS: Record<string, string> = {
  'wood-finewood27': '精细木纹 27',
  'wood-floorplank1': '木地板 1',
  'wood-hungarianparquet10': '匈牙利拼花木地板 10',
  'wood-hungarianparquet2': '匈牙利拼花木地板 2',
  'wood-squareparquet21': '方形拼花木地板 21',
  'wood-squareparquet23': '方形拼花木地板 23',
  'wood-woodfine1': '精细木纹 1',
  'wood-woodfine11': '精细木纹 11',
  'wood-woodfine13': '精细木纹 13',
  'wood-woodfine2': '精细木纹 2',
  'wood-woodfine22': '精细木纹 22',
  'wood-woodfine24': '精细木纹 24',
  'wood-woodparquet14': '拼花木地板 14',
  'wood-woodenparquet11': '拼花木地板 11',
  'wood-woodparquet121': '拼花木地板 121',
  'wood-woodparquet56': '拼花木地板 56',
  'wood-woodparquet65': '拼花木地板 65',
  'wood-woodparquet99': '拼花木地板 99',
  'wood-woodplank19': '木板 19',
  'wood-woodplank48': '木板 48',
  'flooring-tile85a': '陶质地砖',
  'flooring-rusticbrick': '乡村砖',
  'flooring-agedbrick': '旧砖',
  'flooring-weatheredbrick': '风化砖',
  'flooring-garagedoor': '车库门板',
  'flooring-greenlabradorite': '绿色拉长石',
  'flooring-ground13': '泥土地面',
  'flooring-pooltiles': '泳池瓷砖',
  'flooring-tiles3': '棋盘格地砖',
  'flooring-tiles4': '网格地砖',
  'flooring-wallstone1': '石墙',
  'flooring-woodenceramic3': '仿木瓷砖 3',
  'flooring-ceramic53': '陶瓷马赛克',
  'flooring-terrazzo19': '水磨石',
  'flooring-tile79': '石材地砖',
  'flooring-tile86': '赤陶地砖',
  'flooring-greenquartzitea': '绿色石英岩 A',
  'flooring-darkceramic22': '深色做旧瓷砖',
  'flooring-lightceramic24': '浅色做旧瓷砖',
  'flooring-statuarettowhite': '白色雕刻大理石',
  'flooring-tile20': '马赛克地砖',
  'flooring-tile68': '花纹地砖',
  'flooring-woodenceramic2': '仿木瓷砖 2',
  'flooring-woodparquet76': '拼花木地板',
  'preset-white': '白色',
  'preset-softwhite': '柔白色',
  'preset-cream': '奶油色',
  'preset-beige': '米色',
  'preset-lightgrey': '浅灰色',
  'preset-greige': '米灰色',
  'preset-midgrey': '中灰色',
  'preset-charcoal': '炭灰色',
  'preset-nearblack': '近黑色',
  'preset-blush': '浅腮红色',
  'preset-tomato': '番茄红',
  'preset-brickred': '砖红色',
  'preset-oxblood': '深酒红色',
  'preset-peach': '蜜桃色',
  'preset-terracotta': '赤陶色',
  'preset-burntorange': '焦橙色',
  'preset-clay': '陶土色',
  'preset-paleyellow': '浅黄色',
  'preset-mustard': '芥末黄',
  'preset-ochre': '赭黄色',
  'preset-gold': '金色',
  'preset-mint': '薄荷绿',
  'preset-sage': '鼠尾草绿',
  'preset-olive': '橄榄绿',
  'preset-forest': '森林绿',
  'preset-paleteal': '浅青绿色',
  'preset-teal': '青绿色',
  'preset-deepteal': '深青绿色',
  'preset-powderblue': '粉蓝色',
  'preset-softblue': '柔蓝色',
  'preset-sky': '天蓝色',
  'preset-slateblue': '灰蓝色',
  'preset-royalblue': '宝蓝色',
  'preset-navy': '藏蓝色',
  'preset-lavender': '薰衣草紫',
  'preset-plum': '梅紫色',
  'preset-aubergine': '茄紫色',
  'preset-petal': '花瓣粉',
  'preset-rose': '玫瑰色',
  'preset-dustyrose': '灰玫瑰色',
  'preset-berry': '浆果色',
  'preset-sand': '沙色',
  'preset-tan': '浅棕色',
  'preset-taupe': '灰褐色',
  'preset-espresso': '浓咖啡色',
  'preset-metal': '金属',
  'preset-glass': '玻璃',
  'fabric-linen': '亚麻',
  'fabric-cotton': '棉布',
  'fabric-velvet': '天鹅绒',
  'fabric-wool': '羊毛',
  'fabric-suede': '麂皮',
  'fabric-boucle': '圈圈绒',
  'leather-black': '黑色皮革',
  'leather-calf': '小牛皮',
  'concrete-plaster': '涂饰灰泥',
  'concrete-polished': '抛光混凝土',
  'concrete-raw': '清水混凝土',
  'concrete-plate': '混凝土板',
  'concrete-stucco': '白色灰泥',
  'concrete-drywall': '待涂装石膏板',
  'metal-copper': '铜',
  'metal-polished': '抛光金属',
  'metal-steel': '拉丝不锈钢',
  'metal-brass': '黄铜',
  'metal-chrome': '铬',
}

/**
 * Catalog material picker: a fixed row of category tabs and a source filter row
 * over a scrollable grid of swatches. Scene-material creation lives in the
 * scene-material section (the host's `+` action); `onCreateMaterialRequest` is
 * the host's entry point for authoring a new *library* material.
 */
export function MaterialPicker({
  selectedMaterialPreset,
  onSelectMaterialPreset,
  disabled = false,
  onCreateMaterialRequest,
}: MaterialPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<(typeof MATERIAL_CATEGORIES)[number]>(
    MATERIAL_CATEGORIES[0],
  )
  const [sourceFilter, setSourceFilter] = useState<MaterialSourceFilter>('pascal')
  // Version counter so host registrations/unregistrations re-render the picker.
  const libraryVersion = useSyncExternalStore(
    subscribeLibraryMaterials,
    getLibraryMaterialsVersion,
    getLibraryMaterialsVersion,
  )
  const dynamicSources = useMemo(
    () => new Set(getDynamicLibraryMaterials().map((item) => item.source)),
    [libraryVersion],
  )
  const visibleSourceFilters = SOURCE_FILTERS.filter(
    (filter) => filter.id === 'pascal' || dynamicSources.has(filter.id) ||
      (filter.id === 'mine' && onCreateMaterialRequest),
  )
  const availableCategories = MATERIAL_CATEGORIES.filter(
    (category) => filterBySource(getMaterialsForCategory(category), sourceFilter).length > 0,
  )
  const catalogItems = filterBySource(getMaterialsForCategory(selectedCategory), sourceFilter)

  // Keep the visible category in sync with the externally-selected catalog
  // material (a `scene:` ref matches no catalog entry, so the tab stays put).
  useEffect(() => {
    const catalogId = getLibraryMaterialIdFromRef(selectedMaterialPreset) ?? undefined
    const entry = getCatalogMaterialById(catalogId)
    if (entry?.category && entry.category !== 'roofing') {
      setSelectedCategory(entry.category)
      setSourceFilter(entry.source ?? 'pascal')
    }
  }, [selectedMaterialPreset])

  const handleCatalogSelect = (materialId: string) => {
    if (disabled) return
    onSelectMaterialPreset?.(toLibraryMaterialRef(materialId))
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-2 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {/* Fixed category tabs — outside the scroll region. */}
      <div className="flex shrink-0 flex-wrap gap-1">
        {availableCategories.map((category) => (
          <button
            className={`rounded-full px-3 py-1 font-medium text-xs transition-colors ${
              selectedCategory === category
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            key={category}
            onClick={() => {
              setSelectedCategory(category)
              // Auto-select the first material in the category so the brush is
              // immediately ready (and the swatch shows as selected).
              const first = filterBySource(getMaterialsForCategory(category), sourceFilter)[0]
              if (first) handleCatalogSelect(first.id)
            }}
            type="button"
          >
            {getCategoryLabel(category)}
          </button>
        ))}
      </div>
      {/* Fixed source filter tabs — underline style, matching the catalog
          browse surfaces (Items / Rooms / Build / Search) rather than the
          pill-button category row above. */}
      <div className="flex shrink-0 items-center gap-4 px-1">
        {visibleSourceFilters.map((filter) => (
          <button
            className={`-mb-px border-b-2 px-0.5 py-1.5 font-medium text-xs transition-colors ${
              sourceFilter === filter.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            key={filter.id}
            onClick={() => {
              triggerSFX('sfx:menu-click')
              setSourceFilter(filter.id)
              if (!filterBySource(getMaterialsForCategory(selectedCategory), filter.id).length) {
                setSelectedCategory(MATERIAL_CATEGORIES.find((category) =>
                  filterBySource(getMaterialsForCategory(category), filter.id).length > 0,
                ) ?? MATERIAL_CATEGORIES[0])
              }
            }}
            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>
      {/* The only scrolling region. */}
      <div
        className="subtle-scrollbar grid min-h-0 flex-1 auto-rows-min gap-2 overflow-y-auto pb-1"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}
      >
        {catalogItems.length === 0 && (
          <p className="col-span-full px-1 py-4 text-muted-foreground text-xs">
            此分类暂无材质，可选择其他分类或添加场景材质。
          </p>
        )}
        {onCreateMaterialRequest ? (
          <button
            className="group relative flex flex-col gap-1.5 rounded-xl p-1.5 transition-colors hover:cursor-pointer hover:bg-sidebar-accent"
            onClick={() => {
              triggerSFX('sfx:menu-click')
              onCreateMaterialRequest()
            }}
            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
            type="button"
          >
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-border/45 border-dashed">
              <Plus className="size-5 text-muted-foreground group-hover:text-foreground" />
            </div>
            <span className="truncate px-0.5 text-left font-medium text-[11px] text-muted-foreground group-hover:text-foreground">
              新建材质
            </span>
          </button>
        ) : null}
        {catalogItems.map((item) => {
          const isSelected = selectedMaterialPreset === toLibraryMaterialRef(item.id)
          const label = BUILTIN_MATERIAL_LABELS[item.id] ?? item.label
          return (
            <button
              className={`group relative flex flex-col gap-1.5 rounded-xl p-1.5 transition-colors hover:cursor-pointer hover:bg-sidebar-accent ${
                isSelected ? 'bg-sidebar-accent ring-1 ring-primary ring-inset' : ''
              }`}
              key={item.id}
              onClick={() => {
                triggerSFX('sfx:menu-click')
                handleCatalogSelect(item.id)
              }}
              onMouseEnter={() => triggerSFX('sfx:menu-hover')}
              type="button"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                {item.previewThumbnailUrl ? (
                  <img
                    alt={label}
                    className="h-full w-full object-cover"
                    src={item.previewThumbnailUrl}
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: item.previewColor ?? '#f3f4f6' }}
                  />
                )}
              </div>
              <span className="truncate px-0.5 text-left font-medium text-[11px] text-muted-foreground group-hover:text-foreground">
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
