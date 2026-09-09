'use client'

import {
  type AnyNodeId,
  nodeRegistry,
  type RoofType,
  RoofType as RoofTypeSchema,
  useRegistryVersion,
  useScene,
} from '@pascal-app/core'
import {
  CATALOG_ITEMS,
  getFloorplanNodeExtension,
  isFloorplanToolAvailableInMode,
  MaterialPaintPanel,
  TerrainSculptPanel,
  ToolOptionsPanel,
  triggerSFX,
  useEditor,
  useFloorplanMode,
} from '@pascal-app/editor'
import { CABINET_PRESETS, useLiquidLineToolOptions } from '@pascal-app/nodes'
import { useViewer } from '@pascal-app/viewer'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { RoomsPresetPanel } from '@/components/rooms-preset-panel'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/toolbar-tooltip'
import {
  BUILD_PRESETS,
  type BuildPreset,
  buildPresetLabel,
  buildPresetSnapshot,
  buildPresetToolDefaults,
  buildPresetUsesTool,
  insertBuildNodes,
  validateBuildSnapshot,
} from '@/lib/build-presets'
import { getActiveRoofFeatureId, ROOF_TYPE_OPTIONS } from '@/lib/build-tab-state'
import { presetThumbnailUrl } from '@/lib/preset-thumbnails'
import { cn } from '@/lib/utils'

/**
 * MEP (mechanical / plumbing) tool kinds surfaced under the Build tab's "MEP"
 * group tile — its own sub-grid, like Roof's "Features".
 */
type MepToolKind =
  | 'duct-segment'
  | 'duct-fitting'
  | 'duct-terminal'
  | 'hvac-equipment'
  | 'lineset'
  | 'liquid-line'
  | 'pipe-segment'
  | 'pipe-fitting'
  | 'pipe-trap'

type BuildType = {
  /** Selection id — equals `kind` for tool types, with dedicated ids for modes and groups. */
  id: string
  label: string
  /** Raster asset tile (legacy Build sidebar artwork). */
  iconSrc: string
  /** Present for structure-tool types (absent for paint mode and the MEP group). */
  kind?: string
  /** Non-placement special mode. */
  mode?: 'material-paint' | 'terrain-sculpt'
}

type MepItem = {
  /** Selection id — equals `kind`. */
  id: string
  label: string
  iconSrc: string
  kind: MepToolKind
}

// Keep raw drawing tools available alongside the public preset catalog.
const BASE_BUILD_TYPES: BuildType[] = [
  { id: 'block', label: '体块', iconSrc: '/icons/cube.webp', kind: 'block' },
  { id: 'wall', label: '墙体', iconSrc: '/icons/wall.webp', kind: 'wall' },
  { id: 'fence', label: '围栏', iconSrc: '/icons/fence.webp', kind: 'fence' },
  { id: 'shelf', label: '搁板', iconSrc: '/icons/shelf.webp', kind: 'shelf' },
  { id: 'door', label: '门', iconSrc: '/icons/door.webp', kind: 'door' },
  { id: 'window', label: '窗户', iconSrc: '/icons/window.webp', kind: 'window' },
  { id: 'stair', label: '楼梯', iconSrc: '/icons/stairs.webp', kind: 'stair' },
  { id: 'painting', label: '材质涂刷', iconSrc: '/icons/paint.webp', mode: 'material-paint' },
]

const subscribeToClientMount = () => () => {}

// MEP sub-grid surfaced under the "MEP" tile — same icons + ordering the MEP
// tools had in the community Build sidebar.
const MEP_ITEMS: MepItem[] = [
  { id: 'duct-segment', label: '风管', iconSrc: '/icons/duct.webp', kind: 'duct-segment' },
  {
    id: 'duct-terminal',
    label: '风口',
    iconSrc: '/icons/registers.webp',
    kind: 'duct-terminal',
  },
  { id: 'hvac-equipment', label: '暖通设备', iconSrc: '/icons/HVAC.webp', kind: 'hvac-equipment' },
  { id: 'lineset', label: '冷媒管组', iconSrc: '/icons/lineset.webp', kind: 'lineset' },
  { id: 'liquid-line', label: '冷媒液管', iconSrc: '/icons/lineset.webp', kind: 'liquid-line' },
  {
    id: 'pipe-segment',
    label: '排水通气管',
    iconSrc: '/icons/dwv-pipes.webp',
    kind: 'pipe-segment',
  },
]

const MODULAR_CABINET_CATALOG_ITEM = CATALOG_ITEMS.find((item) => item.id === 'cabinet')
const MODULAR_CABINET_ICON = MODULAR_CABINET_CATALOG_ITEM?.thumbnail ?? '/icons/item.webp'

/**
 * Activate a raw structure draw/cursor tool. Mirrors the editor's own
 * structure-tool activation (`setPhase`/`setStructureLayer`/`setMode`/`setTool`).
 */
function activateBuildTool(kind: string): void {
  const ed = useEditor.getState()
  const definition = nodeRegistry.get(kind)
  const extension = getFloorplanNodeExtension(definition)
  if (
    !isFloorplanToolAvailableInMode(extension?.availableModes, useFloorplanMode.getState().mode)
  ) {
    useFloorplanMode.getState().showExpertModeNotice(definition?.presentation?.label ?? kind)
    return
  }
  const preferredView = extension?.preferredView
  if (preferredView) ed.setViewMode(preferredView)
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setCatalogCategory(null)
  ed.setToolDefaults(kind, null)
  ed.setMode('build')
  ed.setTool(kind)
}

function activateModularCabinetTool(): void {
  const ed = useEditor.getState()
  useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
  if (MODULAR_CABINET_CATALOG_ITEM) ed.setSelectedItem(MODULAR_CABINET_CATALOG_ITEM)
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setCatalogCategory(null)
  ed.setToolDefaults('cabinet', null)
  ed.setMode('build')
  ed.setTool('cabinet')
}

/** Enter material-paint mode — the Build tab's "Painting" category. */
function activatePaintMode(): void {
  const ed = useEditor.getState()
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setMode('material-paint')
}

/**
 * Enter terrain-sculpt mode — the Build tab's "Terrain" category. No `setPhase`:
 * `setMode` moves to the site phase itself, since sculpting is a site-phase mode.
 */
function activateTerrainSculptMode(): void {
  useEditor.getState().setMode('terrain-sculpt')
}

type RoofFeature = {
  id: string
  label: string
  iconSrc: string
  kind?: string
}

const ROOF_FEATURE_FALLBACK_ICON = '/icons/roof.webp'

function collectRoofFeatures(): RoofFeature[] {
  const features: RoofFeature[] = []
  for (const [kind, def] of nodeRegistry.entries()) {
    if (
      def.capabilities.roofAccessory === undefined &&
      def.presentation?.paletteGroup !== 'roof-features'
    ) {
      continue
    }
    if (def.capabilities.wallOpeningPlacement) continue
    const icon = def.presentation?.icon
    features.push({
      id: kind,
      kind,
      label: def.presentation?.label ?? kind,
      iconSrc: icon?.kind === 'url' ? icon.src : ROOF_FEATURE_FALLBACK_ICON,
    })
  }
  return features
}

/**
 * Roof accessories and extensions surfaced under the Roof tile. Unlike the
 * community editor these aren't DB presets — each is a registry kind, either
 * carrying `capabilities.roofAccessory` or explicitly classified as a roof
 * extension. They are enumerated at render time because the registry is
 * populated during app bootstrap. Label + icon come from `presentation`;
 * non-url icons fall back to the roof icon.
 */
function activateRoofFeatureTool(feature: RoofFeature): void {
  const ed = useEditor.getState()
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setCatalogCategory(null)
  ed.setMode('build')
  if (feature.kind) ed.setTool(feature.kind)
}

function activateRoofType(roofType: RoofType): void {
  const editor = useEditor.getState()
  if (!(editor.mode === 'build' && editor.tool === 'roof')) activateBuildTool('roof')
  editor.setToolDefaults('roof', { ...editor.toolDefaults.roof, roofType })
}

/**
 * Category tools remain available above the public parametric preset catalog.
 */
// MEP tool kinds that, when active, mean the MEP group tile (and its sub-grid)
// is what the user is working in.
const MEP_TOOL_KINDS = new Set<string>([
  ...MEP_ITEMS.map((item) => item.kind),
  'duct-fitting',
  'pipe-fitting',
  'pipe-trap',
])

function BuildPresetPanel({ kind }: { kind: string | null }) {
  const [source, setSource] = useState<'library' | 'community'>('library')
  const [search, setSearch] = useState('')
  const [allKinds, setAllKinds] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const readOnly = useScene((state) => state.readOnly)
  const materials = useScene((state) => state.materials)
  const presets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return BUILD_PRESETS.filter((preset) => {
      if (!BASE_BUILD_TYPES.some((type) => type.kind === preset.rootKind)) return false
      const matchesKind =
        allKinds ||
        preset.rootKind === kind ||
        ((kind === 'cabinet' || kind === 'kitchen') && preset.rootKind === 'cabinet-module') ||
        (kind === 'kitchen' && preset.rootKind === 'cabinet') ||
        (kind === 'roof' &&
          nodeRegistry.get(preset.rootKind)?.capabilities.roofAccessory !== undefined)
      return (
        matchesKind &&
        preset.source === source &&
        (!query || `${buildPresetLabel(preset)} ${preset.name}`.toLocaleLowerCase().includes(query))
      )
    })
  }, [allKinds, kind, search, source])
  const issues = useMemo(
    () =>
      new Map(
        presets.map((preset) => {
          try {
            validateBuildSnapshot(buildPresetSnapshot(preset), materials)
            return [preset.id, null] as const
          } catch (error) {
            return [preset.id, error instanceof Error ? error.message : '预设暂不可用。'] as const
          }
        }),
      ),
    [presets, materials],
  )

  if (!kind || kind === 'mep' || kind === 'rooms') return null

  const activatePreset = (preset: BuildPreset) => {
    try {
      if (readOnly) throw new Error('当前场景为只读。')
      validateBuildSnapshot(buildPresetSnapshot(preset))
      if (buildPresetUsesTool(preset)) {
        useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
        if (preset.rootKind === 'cabinet') activateModularCabinetTool()
        else activateBuildTool(preset.rootKind)
        useEditor.getState().setToolDefaults(preset.rootKind, buildPresetToolDefaults(preset))
        setNotice(`已选「${buildPresetLabel(preset)}」。在视口绘制或放置，Esc 取消。`)
      } else {
        const levelId = useViewer.getState().selection.levelId
        if (!levelId) throw new Error('请先选择要插入的楼层。')
        // Finish the old drawing tool's cleanup before the new batch enters history.
        flushSync(() => {
          useEditor.getState().setMode('select')
          useEditor.getState().setTool(null)
        })
        const ids = insertBuildNodes(buildPresetSnapshot(preset), levelId as AnyNodeId)
        useViewer.getState().setSelection({ selectedIds: ids })
        setNotice(`已插入并选中「${buildPresetLabel(preset)}」，可移动调整；撤销可移除本次插入。`)
      }
      triggerSFX('sfx:menu-click')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '预设载入失败。')
    }
  }

  return (
    <section
      className="flex min-h-32 max-h-[45%] shrink-0 flex-col gap-2 border-border/50 border-t pt-3"
      aria-label="建模预设"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-xs">建模预设 · {presets.length}</span>
        <label className="flex items-center gap-1 text-muted-foreground text-xs">
          <input
            checked={allKinds}
            onChange={(event) => setAllKinds(event.target.checked)}
            type="checkbox"
          />
          全部类别
        </label>
      </div>
      <div className="flex gap-2">
        <select
          aria-label="预设来源"
          className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={source}
          onChange={(event) =>
            setSource(event.target.value === 'community' ? 'community' : 'library')
          }
        >
          <option value="library">官方库</option>
          <option value="community">社区</option>
        </select>
        <input
          aria-label="搜索建模预设"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          placeholder="搜索预设"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        绘制预设沿用原生工具；「插入并选择」保留快照坐标，可再移动调整。
      </p>
      <div className="min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              className="overflow-hidden rounded-lg border border-border/60 bg-muted/30 text-left transition-colors hover:bg-muted disabled:opacity-50"
              disabled={readOnly || Boolean(issues.get(preset.id))}
              key={preset.id}
              onClick={() => activatePreset(preset)}
              type="button"
            >
              <Image
                alt=""
                className="aspect-[3/2] w-full object-contain"
                height={100}
                loading="lazy"
                src={presetThumbnailUrl(preset.id, preset.thumbnailUrl)}
                unoptimized
                width={150}
              />
              <span className="block break-words px-2 pt-1 text-xs leading-4">
                {buildPresetLabel(preset)}
              </span>
              <span className="block break-words px-2 py-1.5 text-[10px] text-muted-foreground">
                {issues.get(preset.id) ??
                  (buildPresetUsesTool(preset) ? '选择后绘制 / 放置' : '插入并选择')}
              </span>
            </button>
          ))}
        </div>
        {presets.length === 0 && (
          <p className="py-4 text-center text-muted-foreground text-xs">此来源下没有匹配的预设。</p>
        )}
      </div>
      {notice && (
        <p aria-live="polite" className="text-xs leading-relaxed">
          {notice}
        </p>
      )}
    </section>
  )
}

export function BuildTab() {
  const [catalogCategory, setCatalogCategory] = useState<string | null>(null)
  const activeTool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  const roofDefaults = useEditor((s) => s.toolDefaults.roof)
  const follow = useLiquidLineToolOptions((s) => s.follow)
  const toggleFollow = useLiquidLineToolOptions((s) => s.toggleFollow)
  useRegistryVersion()
  const registryReady = useSyncExternalStore(
    subscribeToClientMount,
    () => true,
    () => false,
  )
  const buildTypes = BASE_BUILD_TYPES

  // The fitting / follow tools are armed from a segment's panel, not a grid
  // tile — keep the segment tile lit so the panel (and the way back) stays
  // visible.
  const ductContext =
    mode === 'build' && (activeTool === 'duct-segment' || activeTool === 'duct-fitting')
  const pipeContext =
    mode === 'build' &&
    (activeTool === 'pipe-segment' || activeTool === 'pipe-fitting' || activeTool === 'pipe-trap')
  const liquidLineContext = mode === 'build' && activeTool === 'liquid-line'

  const isMepItemActive = (item: MepItem) =>
    item.kind === 'duct-segment'
      ? ductContext
      : item.kind === 'pipe-segment'
        ? pipeContext
        : item.kind === 'liquid-line'
          ? liquidLineContext
          : mode === 'build' && activeTool === item.kind

  // Read at render time (not module scope): the registry is populated by the
  // app bootstrap, so enumerating earlier would race it and see no kinds.
  const roofFeatures = registryReady ? collectRoofFeatures() : []

  // Tile highlight derives from the single source of truth (the active tool /
  // mode), never a separate local selection — so keyboard shortcuts and panel
  // clicks always agree on which tile is lit.
  // The roof Features sub-grid arms roof-accessory tools (skylight, chimney,
  // …); keep the Roof tile lit (and its panel open) while any of them is the
  // active tool, the same way MEP stays lit for its sub-grid tools.
  const activeRoofFeatureId = getActiveRoofFeatureId(roofFeatures, activeTool)
  const isRoofFeatureActive = mode === 'build' && activeRoofFeatureId !== null
  const isMepActive = mode === 'build' && !!activeTool && MEP_TOOL_KINDS.has(activeTool)
  const isKitchenActive = mode === 'build' && activeTool === 'cabinet'
  const parsedRoofType = RoofTypeSchema.safeParse(roofDefaults?.roofType)
  const activeRoofType = parsedRoofType.success ? parsedRoofType.data : 'gable'

  const isTypeActive = (type: BuildType) => {
    if (type.id === 'rooms') return catalogCategory === 'rooms' && mode === 'select'
    if (type.mode) return mode === type.mode
    if (type.id === 'mep') return isMepActive
    if (type.id === 'kitchen') return isKitchenActive
    if (type.id === 'roof')
      return mode === 'build' && (activeTool === 'roof' || isRoofFeatureActive)
    return mode === 'build' && activeTool === type.kind
  }

  const handleTypeClick = useCallback((type: BuildType) => {
    setCatalogCategory(type.id)
    if (type.mode === 'material-paint') {
      activatePaintMode()
    } else if (type.mode === 'terrain-sculpt') {
      activateTerrainSculptMode()
    } else if (type.id === 'mep') {
      // MEP is a group tile: arm its first tool so a usable tool is active
      // (and we leave any prior paint mode), then reveal the MEP sub-grid.
      activateBuildTool('duct-segment')
    } else if (type.id === 'kitchen') {
      activateModularCabinetTool()
    } else if (type.id === 'rooms') {
      useEditor.getState().setMode('select')
      useEditor.getState().setTool(null)
    } else if (type.kind) {
      activateBuildTool(type.kind)
    }
  }, [])

  // On open, land on the first build tool — parity with the community Build
  // sidebar, so switching to Build immediately arms a usable tool. Skip when a
  // build tool is already active (e.g. the B shortcut armed one before this
  // panel mounted): the active tool is the source of truth, not this default.
  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    const ed = useEditor.getState()
    if (ed.mode === 'material-paint') return
    if (ed.mode === 'build' && buildTypes.some((type) => type.kind === ed.tool)) return
    const firstType = buildTypes.find((t) => t.kind)
    if (firstType) handleTypeClick(firstType)
  }, [handleTypeClick])

  return (
    <div className="build-palette flex h-full flex-col gap-3 p-3">
      <TooltipProvider delayDuration={0} disableHoverableContent>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
        >
          {buildTypes.map((type) => {
            const active = isTypeActive(type)
            return (
              <Tooltip key={type.id}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      'group relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl p-1.5 transition-all duration-200',
                      active
                        ? 'bg-primary/10 ring-1 ring-primary/50'
                        : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                    )}
                    onClick={() => {
                      triggerSFX('sfx:menu-click')
                      handleTypeClick(type)
                    }}
                    onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                    type="button"
                  >
                    <Image
                      alt={type.label}
                      className="size-10 shrink-0 object-contain transition-transform duration-200 group-hover:scale-110"
                      height={48}
                      src={type.iconSrc}
                      width={48}
                    />
                    <span className="w-full break-words text-center text-xs leading-4">
                      {type.label}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="pointer-events-none" side="top">
                  {type.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>

      {catalogCategory === 'rooms' && mode === 'select' ? (
        <RoomsPresetPanel />
      ) : mode !== 'material-paint' && mode !== 'terrain-sculpt' ? (
        <BuildPresetPanel kind={mode === 'build' && activeTool ? activeTool : catalogCategory} />
      ) : null}

      {mode === 'material-paint' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MaterialPaintPanel />
        </div>
      ) : mode === 'terrain-sculpt' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TerrainSculptPanel />
        </div>
      ) : mode === 'build' && (activeTool === 'roof' || isRoofFeatureActive) ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <div className="px-0.5 pt-1 font-medium text-muted-foreground text-xs">屋顶类型</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ROOF_TYPE_OPTIONS.map((roofType) => {
                const active = activeTool === 'roof' && activeRoofType === roofType.value
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg px-2.5 py-2 text-left font-medium text-xs transition-colors',
                      active
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/50'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    key={roofType.value}
                    onClick={() => {
                      triggerSFX('sfx:menu-click')
                      activateRoofType(roofType.value)
                    }}
                    onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                    type="button"
                  >
                    {roofType.label}
                  </button>
                )
              })}
            </div>
          </div>

          <ToolOptionsPanel
            className="border-border/50 border-t pt-3"
            kind="roof"
            onSelect={() => {
              const editor = useEditor.getState()
              if (!(editor.mode === 'build' && editor.tool === 'roof')) activateBuildTool('roof')
            }}
          />
          {activeRoofType === 'conical' && (
            <p className="border-border/50 border-t px-0.5 pt-3 text-[11px] text-muted-foreground leading-relaxed">
              选择弧形墙以匹配其半径和圆弧。
            </p>
          )}

          {roofFeatures.length > 0 ? (
            <div className="flex flex-col gap-2 border-border/50 border-t pt-3">
              <div className="px-0.5 font-medium text-muted-foreground text-xs">构件与附属结构</div>
              <TooltipProvider delayDuration={0} disableHoverableContent>
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
                >
                  {roofFeatures.map((feature) => {
                    const active = mode === 'build' && feature.id === activeRoofFeatureId
                    return (
                      <Tooltip key={feature.id}>
                        <TooltipTrigger asChild>
                          <button
                            aria-pressed={active}
                            className={cn(
                              'group relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl p-1.5 transition-all duration-200',
                              active
                                ? 'bg-primary/10 ring-1 ring-primary/50'
                                : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                            )}
                            onClick={() => {
                              triggerSFX('sfx:menu-click')
                              activateRoofFeatureTool(feature)
                            }}
                            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                            type="button"
                          >
                            <Image
                              alt={feature.label}
                              className="size-10 shrink-0 object-contain transition-transform duration-200 group-hover:scale-110"
                              height={48}
                              src={feature.iconSrc}
                              width={48}
                            />
                            <span className="w-full break-words text-center text-xs leading-4">
                              {feature.label}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="pointer-events-none" side="top">
                          {feature.label}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </TooltipProvider>
            </div>
          ) : null}
        </div>
      ) : isKitchenActive ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <div className="px-0.5 pt-1 font-medium text-muted-foreground text-xs">厨房</div>
          <TooltipProvider delayDuration={0} disableHoverableContent>
            <div
              className="grid gap-1.5 px-0.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="group relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl bg-primary/10 p-1.5 ring-1 ring-primary/50 transition-all duration-200"
                    onClick={() => {
                      triggerSFX('sfx:menu-click')
                      activateModularCabinetTool()
                    }}
                    onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                    type="button"
                  >
                    <Image
                      alt="模块化橱柜"
                      className="size-10 shrink-0 object-contain transition-transform duration-200 group-hover:scale-110"
                      height={48}
                      src={MODULAR_CABINET_ICON}
                      width={48}
                    />
                    <span className="w-full break-words text-center text-xs leading-4">
                      模块化橱柜
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="pointer-events-none" side="top">
                  模块化橱柜
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          <div className="border-border/50 border-t pt-3">
            <div className="mb-2 text-muted-foreground text-xs">橱柜模块配置</div>
            <div className="grid grid-cols-2 gap-1.5">
              {CABINET_PRESETS.map((preset) => (
                <button
                  className="rounded-lg bg-muted/40 px-2.5 py-2 text-left text-xs hover:bg-muted"
                  key={preset.id}
                  onClick={() => {
                    activateModularCabinetTool()
                    useEditor.getState().setToolDefaults('cabinet', { presetId: preset.id })
                  }}
                  type="button"
                >
                  {preset.id === 'base-door'
                    ? '门板地柜'
                    : preset.id === 'cooktop-induction'
                      ? '电磁灶'
                      : preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : isMepActive ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <div className="px-0.5 pt-1 font-medium text-muted-foreground text-xs">机电管线</div>
          <TooltipProvider delayDuration={0} disableHoverableContent>
            <div
              className="grid gap-1.5 px-0.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
            >
              {MEP_ITEMS.map((item) => {
                const active = isMepItemActive(item)
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          'group relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl p-1.5 transition-all duration-200',
                          active
                            ? 'bg-primary/10 ring-1 ring-primary/50'
                            : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                        )}
                        onClick={() => {
                          triggerSFX('sfx:menu-click')
                          activateBuildTool(item.kind)
                        }}
                        onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                        type="button"
                      >
                        <Image
                          alt={item.label}
                          className="size-10 shrink-0 object-contain transition-transform duration-200 group-hover:scale-110"
                          height={48}
                          src={item.iconSrc}
                          width={48}
                        />
                        <span className="w-full break-words text-center text-xs leading-4">
                          {item.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="pointer-events-none" side="top">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </TooltipProvider>

          {ductContext ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">风管</span>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                  activeTool === 'duct-fitting'
                    ? 'bg-primary/10 ring-1 ring-primary/50'
                    : 'bg-muted/40 hover:bg-muted',
                )}
                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  activateBuildTool(activeTool === 'duct-fitting' ? 'duct-segment' : 'duct-fitting')
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden
                  className="size-4 object-contain"
                  height={16}
                  src="/icons/duct-fitting.webp"
                  width={16}
                />
                添加管件
              </button>
            </div>
          ) : null}

          {pipeContext ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">排水通气管</span>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                  activeTool === 'pipe-fitting'
                    ? 'bg-primary/10 ring-1 ring-primary/50'
                    : 'bg-muted/40 hover:bg-muted',
                )}
                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  activateBuildTool(activeTool === 'pipe-fitting' ? 'pipe-segment' : 'pipe-fitting')
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden
                  className="size-4 object-contain"
                  height={16}
                  src="/icons/duct-fitting.webp"
                  width={16}
                />
                添加管件
              </button>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                  activeTool === 'pipe-trap'
                    ? 'bg-primary/10 ring-1 ring-primary/50'
                    : 'bg-muted/40 hover:bg-muted',
                )}
                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  activateBuildTool(activeTool === 'pipe-trap' ? 'pipe-segment' : 'pipe-trap')
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden
                  className="size-4 object-contain"
                  height={16}
                  src="/icons/dwv-pipes.webp"
                  width={16}
                />
                添加存水弯
              </button>
            </div>
          ) : null}

          {liquidLineContext ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">冷媒液管</span>
              <button
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                  follow ? 'bg-primary/10 ring-1 ring-primary/50' : 'bg-muted/40 hover:bg-muted',
                )}
                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  toggleFollow()
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                type="button"
              >
                <span>跟随冷媒管组</span>
                <span className="text-muted-foreground text-xs">{follow ? '开' : '关'}</span>
              </button>
              <span className="px-1 text-[11px] text-muted-foreground">
                {follow ? '单击冷媒管组，在其旁边布置管线。' : '沿现有冷媒管组旁边描绘管线（F）。'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
