'use client'

import { Icon as IconifyIcon } from '@iconify/react'
import { type AnyNodeId, getNodeLock, useScene } from '@pascal-app/core'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  useCameraHintFocus,
  useEditor,
  useFloorplanAnnotationVisibility,
  useFloorplanMode,
  useInteractionScope,
  useSidebarStore,
  type ViewMode,
} from '@pascal-app/editor'
import { type EdgeMode, useViewer } from '@pascal-app/viewer'
import {
  Box,
  Check,
  ChevronsRight,
  Columns2,
  Eye,
  EyeOff,
  Footprints,
  Grid2X2,
  Hand,
  Layers3,
  Magnet,
  Maximize2,
  MousePointer2,
  PenLine,
  RotateCw,
  Ruler,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Tag,
} from 'lucide-react'
import Image from 'next/image'
import { type ReactNode, useCallback, useEffect } from 'react'
import { currentStageContext } from '@/lib/stage/context'
import { cn } from '@/lib/utils'
import {
  cancelStagePlacement,
  startStagePlacement,
  useStagePlacement,
} from './stage-entry/manual-stage-panel'
import {
  StageGridToolbar,
  StagePlanNavigationRuntime,
  StageRotationRuntime,
  useStageRotation,
} from './stage-entry/stage-viewport-controls'
import { openStudioPanel } from './studio-navigation'
import { Tooltip, TooltipContent, TooltipTrigger } from './toolbar-tooltip'

const TOOLBAR_CONTAINER =
  'inline-flex min-h-9 shrink-0 items-stretch overflow-hidden rounded-lg border border-border bg-background'

const TOOLBAR_BTN =
  'flex w-8 items-center justify-center text-muted-foreground/80 transition-colors hover:bg-white/8 hover:text-foreground/90'

function ToolbarTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

const VIEW_MODES: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    id: '3d',
    label: '三维',
    icon: (
      <Image
        alt=""
        className="h-3.5 w-3.5 object-contain"
        height={14}
        src="/icons/building.webp"
        width={14}
      />
    ),
  },
  {
    id: '2d',
    label: '平面',
    icon: (
      <Image
        alt=""
        className="h-3.5 w-3.5 object-contain"
        height={14}
        src="/icons/blueprint.webp"
        width={14}
      />
    ),
  },
  {
    id: 'split',
    label: '分屏',
    icon: <Columns2 className="h-3 w-3" />,
  },
]

const wallModeLabels: Record<string, string> = {
  up: '完整',
  cutaway: '剖切',
  down: '低位',
  translucent: '半透明',
}

const SHADING_OPTIONS = [
  { id: 'solid', name: '实体', detail: '快速实体显示，不计算环境光遮蔽', icon: Box },
  { id: 'rendered', name: '渲染', detail: '计算环境光遮蔽', icon: Sparkles },
] as const

const FLOORPLAN_ANNOTATION_OPTIONS = [
  { id: 'automaticDimensions', name: '自动尺寸标注', icon: Ruler },
  { id: 'manualDimensions', name: '手动尺寸标注', icon: Ruler },
  { id: 'measurements', name: '测量', icon: ScanLine },
  { id: 'openingMarks', name: '门窗标记', icon: Tag },
  { id: 'structuralGrids', name: '舞台基准线', icon: Grid2X2 },
  { id: 'stairAnnotations', name: '台阶标注', icon: Footprints },
] as const

const FLOORPLAN_MODE_OPTIONS = [
  {
    id: 'default',
    name: '默认',
    detail: '简洁平面图，选择物体后显示尺寸',
  },
  {
    id: 'expert',
    name: '专业',
    detail: '完整图纸与标注控制',
  },
] as const

const FLOORPLAN_WALL_DIMENSION_REFERENCE_OPTIONS = [
  { id: 'finished-faces', name: '完成面', detail: '包含全部景片厚度' },
  { id: 'centerline', name: '景片中心线', detail: '景片轴线' },
  { id: 'stud-faces', name: '内部参照面', detail: '景片内部参照' },
] as const

function ViewModeControl() {
  const viewMode = useEditor((state) => state.viewMode)
  const setViewMode = useEditor((state) => state.setViewMode)

  return (
    <div className={TOOLBAR_CONTAINER}>
      {VIEW_MODES.map((mode) => {
        const isActive = viewMode === mode.id
        return (
          <ToolbarTooltip key={mode.id} label={mode.label}>
            <button
              aria-label={mode.label}
              aria-pressed={isActive}
              className={cn(
                'flex items-center justify-center gap-1.5 px-2.5 font-medium text-xs transition-colors',
                isActive
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:bg-white/8 hover:text-muted-foreground',
              )}
              onClick={() => setViewMode(mode.id)}
              type="button"
            >
              {mode.icon}
              <span>{mode.label}</span>
            </button>
          </ToolbarTooltip>
        )
      })}
    </div>
  )
}

function openPropSettings(selector: string) {
  if (!openStudioPanel('build')) return
  const focus = () => {
    const section = document.querySelector<HTMLElement>(selector)
    if (!section) return false
    if (section instanceof HTMLDetailsElement) section.open = true
    section.scrollIntoView({ block: 'nearest' })
    ;(section.querySelector<HTMLElement>('input, select, button') ?? section).focus()
    return true
  }
  if (focus()) return
  const observer = new MutationObserver(() => {
    if (focus()) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setTimeout(() => observer.disconnect(), 2000)
}

function StageTransformToolbar() {
  const selected = useViewer((state) => state.selection.selectedIds)
  const node = useScene((state) =>
    selected.length === 1 ? state.nodes[selected[0] as AnyNodeId] : undefined,
  )
  const locked = useScene(
    (state) => !node || state.readOnly || !!getNodeLock(state.nodes, node.id, true),
  )
  const exclusive = useEditor(
    (state) => state.isPreviewMode || state.isFirstPersonMode || state.isCaptureMode,
  )
  const draft = useStagePlacement((state) => state.draft)
  const rotating = useStageRotation((state) => state.armed)
  const editable = !exclusive && !locked && !!node && ['item', 'block', 'stair'].includes(node.type)
  const select = useCallback(() => {
    cancelStagePlacement()
    useStageRotation.setState({ armed: false })
    useEditor.getState().armToolMode({ mode: 'select' })
    useEditor.getState().setFloorplanSelectionTool('click')
  }, [])
  const move = useCallback(() => {
    if (!editable || !node) return
    useStageRotation.setState({ armed: false })
    const object = currentStageContext().objects.find((item) => item.id === node.id)
    if (!object) return
    startStagePlacement(
      {
        id: object.id,
        name: object.name,
        kind: object.kind,
        dimensionsMeters: object.dimensionsMeters,
        libraryAssetId: node.type === 'item' ? node.asset.id : null,
      },
      object,
    )
  }, [editable, node])
  useEffect(() => {
    const previous = useCameraHintFocus.getState().actions
    useCameraHintFocus.getState().focus([])
    return () => useCameraHintFocus.getState().focus(previous)
  }, [])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        exclusive
      )
        return
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target.closest('input, textarea, select, [role="dialog"]'))
      )
        return
      if (document.querySelector('[role="dialog"][data-state="open"], [aria-modal="true"]')) return
      if (
        useViewer.getState().inputDragging ||
        useViewer.getState().cameraDragging ||
        useInteractionScope.getState().scope.kind !== 'idle'
      )
        return
      const key = event.key.toLowerCase()
      if (!['v', 'g', 't', 'r'].includes(key)) return
      if (key !== 'v' && (!editable || draft)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (key === 'v') select()
      else if (key === 'g') move()
      else if (key === 't') useStageRotation.setState({ armed: !useStageRotation.getState().armed })
      else openPropSettings('[data-stage-dimensions]')
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [editable, exclusive, draft, select, move])
  return (
    <div
      className={cn(TOOLBAR_CONTAINER, 'stage-transform-toolbar')}
      role="toolbar"
      aria-label="道具操作"
    >
      <button
        type="button"
        className={cn(TOOLBAR_BTN, 'w-auto gap-1 px-2 text-xs')}
        disabled={exclusive}
        onClick={select}
        title="V · 选择道具；Esc 取消当前操作"
        aria-label="选择"
        aria-keyshortcuts="V"
      >
        <MousePointer2 size={14} />
        选择 <kbd>V</kbd>
      </button>
      <button
        type="button"
        className={cn(TOOLBAR_BTN, 'w-auto gap-1 px-2 text-xs')}
        disabled={!editable || !!draft}
        onClick={move}
        title="G · 移动所选道具，点击落位；Esc 取消"
        aria-label="移动"
        aria-keyshortcuts="G"
      >
        <Hand size={14} />
        移动 <kbd>G</kbd>
      </button>
      <button
        type="button"
        className={cn(TOOLBAR_BTN, 'w-auto gap-1 px-2 text-xs')}
        disabled={!editable || !!draft}
        onClick={() => useStageRotation.setState({ armed: !rotating })}
        aria-pressed={rotating}
        title="T · 旋转：按住右键左右拖动，15°一格，松开确定；Esc取消"
        aria-label="旋转"
        aria-keyshortcuts="T"
      >
        <RotateCw size={14} />
        旋转 <kbd>T</kbd>
      </button>
      <button
        type="button"
        className={cn(TOOLBAR_BTN, 'w-auto gap-1 px-2 text-xs')}
        disabled={!editable || !!draft}
        onClick={() => openPropSettings('[data-stage-dimensions]')}
        title="R · 打开缩放设置"
        aria-label="缩放"
        aria-keyshortcuts="R"
      >
        <Maximize2 size={14} />
        缩放 <kbd>R</kbd>
      </button>
      <StageGridToolbar />
      <StageRotationRuntime />
      <StagePlanNavigationRuntime />
    </div>
  )
}

function CollapseSidebarButton() {
  const isCollapsed = useSidebarStore((state) => state.isCollapsed)
  const setIsCollapsed = useSidebarStore((state) => state.setIsCollapsed)

  const toggle = useCallback(() => {
    setIsCollapsed(!isCollapsed)
  }, [isCollapsed, setIsCollapsed])

  if (!isCollapsed) return null

  return (
    <div className={TOOLBAR_CONTAINER}>
      <ToolbarTooltip label={isCollapsed ? '展开侧栏' : '收起侧栏'}>
        <button
          aria-label={isCollapsed ? '展开侧栏' : '收起侧栏'}
          className={TOOLBAR_BTN}
          onClick={toggle}
          type="button"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </ToolbarTooltip>
    </div>
  )
}

function WallModeToggle() {
  const wallMode = useViewer((state) => state.wallMode)
  const setWallMode = useViewer((state) => state.setWallMode)

  return (
    <label className="flex items-center gap-2 px-2.5 text-xs text-muted-foreground">
      景片
      <select
        aria-label="景片显示"
        className="min-w-0 bg-background py-2 text-xs text-foreground"
        value={wallMode}
        onChange={(event) => setWallMode(event.target.value as typeof wallMode)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {(['up', 'cutaway', 'down', 'translucent'] as const).map((mode) => (
          <option key={mode} value={mode}>
            {wallModeLabels[mode]}
          </option>
        ))}
      </select>
    </label>
  )
}

// One dropdown that gathers every "how the scene looks" control: grid, shadows,
// camera projection, units, render mode, edges and scene theme.

const EDGE_OPTIONS = [
  { id: 'off', name: '关闭', detail: '不显示边线' },
  { id: 'soft', name: '柔和', detail: '柔和显示主要轮廓' },
  { id: 'strong', name: '清晰', detail: '清晰显示不透明边线' },
] as const satisfies readonly { id: EdgeMode; name: string; detail: string }[]

const SUBMENU_CONTENT_CLASS = 'min-w-56 rounded-xl border-border/45 bg-popover/95 backdrop-blur-xl'

function DisplayMenu() {
  const viewMode = useEditor((state) => state.viewMode)
  const showGrid = useViewer((state) => state.showGrid)
  const setShowGrid = useViewer((state) => state.setShowGrid)
  const showMeasurements = useViewer((state) => state.showMeasurements)
  const setShowMeasurements = useViewer((state) => state.setShowMeasurements)
  const unit = useViewer((state) => state.unit)
  const setUnit = useViewer((state) => state.setUnit)
  const metricNotation = useViewer((state) => state.metricNotation)
  const setMetricNotation = useViewer((state) => state.setMetricNotation)
  const cameraMode = useViewer((state) => state.cameraMode)
  const setCameraMode = useViewer((state) => state.setCameraMode)
  const shading = useViewer((state) => state.shading)
  const setShading = useViewer((state) => state.setShading)
  const edges = useViewer((state) => state.edges)
  const setEdges = useViewer((state) => state.setEdges)
  const snap = useStagePlacement((state) => state.snap)
  const annotationVisibility = useFloorplanAnnotationVisibility((state) => state.visibility)
  const setAnnotationCategory = useFloorplanAnnotationVisibility((state) => state.setCategory)
  const wallDimensionReference = useFloorplanAnnotationVisibility(
    (state) => state.wallDimensionReference,
  )
  const setWallDimensionReference = useFloorplanAnnotationVisibility(
    (state) => state.setWallDimensionReference,
  )
  const floorplanMode = useFloorplanMode((state) => state.mode)
  const setFloorplanMode = useFloorplanMode((state) => state.setMode)

  const activeShading =
    SHADING_OPTIONS.find((option) => option.id === shading) ?? SHADING_OPTIONS[0]
  const activeEdges = EDGE_OPTIONS.find((option) => option.id === edges) ?? EDGE_OPTIONS[0]

  // Keep the menu open when flipping a toggle.
  const keepOpen = (event: Event, fn: () => void) => {
    event.preventDefault()
    fn()
  }

  return (
    <DropdownMenu>
      <ToolbarTooltip label="显示设置">
        <DropdownMenuTrigger asChild>
          <button
            aria-label="显示设置"
            className={cn(TOOLBAR_BTN, 'w-auto gap-1.5 px-2.5 text-foreground/90')}
            type="button"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-xs">显示</span>
          </button>
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        align="start"
        className="w-60 rounded-xl border-border/45 bg-popover/95 backdrop-blur-xl"
        side="bottom"
        sideOffset={8}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={(e) => keepOpen(e, () => setShowGrid(!showGrid))}>
          <Grid2X2 className="h-4 w-4" />
          <span>网格</span>
          {showGrid ? (
            <Eye className="ml-auto h-4 w-4 text-foreground" />
          ) : (
            <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {viewMode !== '2d' ? (
          <DropdownMenuItem
            onSelect={(e) => keepOpen(e, () => setShowMeasurements(!showMeasurements))}
          >
            <Ruler className="h-4 w-4" />
            <span>{viewMode === 'split' ? '三维测量' : '测量'}</span>
            {showMeasurements ? (
              <Eye className="ml-auto h-4 w-4 text-foreground" />
            ) : (
              <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ) : null}
        {viewMode !== '3d' ? (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Layers3 className="h-4 w-4" />
                <span>平面图模式</span>
                <span className="ml-auto text-muted-foreground text-xs">
                  {floorplanMode === 'default' ? '默认' : '专业'}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
                {FLOORPLAN_MODE_OPTIONS.map((option) => (
                  <DropdownMenuItem key={option.id} onSelect={() => setFloorplanMode(option.id)}>
                    <div className="flex flex-col">
                      <span className="text-foreground">{option.name}</span>
                      <span className="text-muted-foreground text-xs">{option.detail}</span>
                    </div>
                    {floorplanMode === option.id ? (
                      <Check className="ml-auto h-4 w-4 text-foreground" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {floorplanMode === 'expert' ? (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Layers3 className="h-4 w-4" />
                    <span>平面图标注</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
                    {FLOORPLAN_ANNOTATION_OPTIONS.map((option) => {
                      const OptionIcon = option.icon
                      const visible = annotationVisibility[option.id]
                      return (
                        <DropdownMenuItem
                          key={option.id}
                          onSelect={(e) =>
                            keepOpen(e, () => setAnnotationCategory(option.id, !visible))
                          }
                        >
                          <OptionIcon className="h-4 w-4" />
                          <span>{option.name}</span>
                          {visible ? (
                            <Eye className="ml-auto h-4 w-4 text-foreground" />
                          ) : (
                            <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Ruler className="h-4 w-4" />
                    <span>景片尺寸</span>
                    <span className="ml-auto text-muted-foreground text-xs">
                      {
                        FLOORPLAN_WALL_DIMENSION_REFERENCE_OPTIONS.find(
                          (option) => option.id === wallDimensionReference,
                        )?.name
                      }
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
                    {FLOORPLAN_WALL_DIMENSION_REFERENCE_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.id}
                        onSelect={(event) =>
                          keepOpen(event, () => setWallDimensionReference(option.id))
                        }
                      >
                        <div className="flex flex-col">
                          <span className="text-foreground">{option.name}</span>
                          <span className="text-muted-foreground text-xs">{option.detail}</span>
                        </div>
                        {wallDimensionReference === option.id ? (
                          <Check className="ml-auto h-4 w-4 text-foreground" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            ) : null}
          </>
        ) : null}
        <DropdownMenuItem
          onSelect={(e) =>
            keepOpen(e, () => {
              const guides = !snap.guides
              useStagePlacement.setState({ snap: { ...snap, guides } })
              const editor = useEditor.getState()
              editor.setMagneticSnap(guides)
              editor.setSnappingMode('item', snap.grid ? 'grid' : guides ? 'lines' : 'off')
              editor.setSnappingMode('polygon', snap.grid ? 'grid' : guides ? 'lines' : 'off')
            })
          }
        >
          <Magnet className="h-4 w-4" />
          <span>道具边缘贴合</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {snap.guides ? '开启' : '关闭'}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) =>
            keepOpen(e, () =>
              setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective'),
            )
          }
        >
          <IconifyIcon
            height={16}
            icon={cameraMode === 'perspective' ? 'icon-park-outline:perspective' : 'vaadin:grid'}
            width={16}
          />
          <span>投影方式</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {cameraMode === 'perspective' ? '透视' : '正交'}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
              {unit === 'imperial' ? 'ft' : metricNotation === 'millimeters' ? 'mm' : 'm'}
            </span>
            <span>单位</span>
            <span className="ml-auto text-muted-foreground text-xs">
              {unit === 'imperial'
                ? '英尺与英寸'
                : metricNotation === 'millimeters'
                  ? '毫米'
                  : '米'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
            <DropdownMenuItem onSelect={() => setMetricNotation('meters')}>
              <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
                m
              </span>
              <span>米</span>
              {unit === 'metric' && metricNotation === 'meters' ? (
                <Check className="ml-auto h-4 w-4 text-foreground" />
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMetricNotation('millimeters')}>
              <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
                mm
              </span>
              <span>毫米</span>
              {unit === 'metric' && metricNotation === 'millimeters' ? (
                <Check className="ml-auto h-4 w-4 text-foreground" />
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setUnit('imperial')}>
              <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
                ft
              </span>
              <span>英尺与英寸</span>
              {unit === 'imperial' ? <Check className="ml-auto h-4 w-4 text-foreground" /> : null}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <activeShading.icon className="h-4 w-4" />
            <span>着色</span>
            <span className="ml-auto text-muted-foreground text-xs">{activeShading.name}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
            {SHADING_OPTIONS.map((option) => {
              const OptionIcon = option.icon
              return (
                <DropdownMenuItem key={option.id} onSelect={() => setShading(option.id)}>
                  <OptionIcon className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="text-foreground">{option.name}</span>
                    <span className="text-muted-foreground text-xs">{option.detail}</span>
                  </div>
                  {shading === option.id ? (
                    <Check className="ml-auto h-4 w-4 text-foreground" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <PenLine className="h-4 w-4" />
            <span>边线</span>
            <span className="ml-auto text-muted-foreground text-xs">{activeEdges.name}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
            {EDGE_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.id} onSelect={() => setEdges(option.id)}>
                <div className="flex flex-col">
                  <span className="text-foreground">{option.name}</span>
                  <span className="text-muted-foreground text-xs">{option.detail}</span>
                </div>
                {edges === option.id ? <Check className="ml-auto h-4 w-4 text-foreground" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PreviewButton() {
  return (
    <ToolbarTooltip label="沉浸预览：隐藏编辑面板">
      <button
        aria-label="沉浸预览"
        className="flex items-center gap-1.5 px-2.5 font-medium text-muted-foreground/80 text-xs transition-colors hover:bg-white/8 hover:text-foreground/90"
        onClick={() => useEditor.getState().setPreviewMode(true)}
        type="button"
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span>沉浸预览</span>
      </button>
    </ToolbarTooltip>
  )
}

export function EditorViewerToolbarLeft({ settings }: { settings?: ReactNode } = {}) {
  return (
    <>
      <CollapseSidebarButton />
      <div className="stage-edit-toolbar">
        <StageTransformToolbar />
        <div className="stage-display-toolbar" role="group" aria-label="舞台显示与视图">
          <DisplayMenu />
          <WallModeToggle />
          <button type="button" onClick={() => openStudioPanel('view')}>视图 / 归位</button>
          {settings}
          <PreviewButton />
          <details className="stage-controls-help">
            <summary>操作帮助</summary>
            <div>
              <p>V 选择 · G 移动 · T 旋转 · R 尺寸设置；先选中道具，再操作。</p>
              <p>旋转时按住右键左右拖动，每格 15°，松开确定；Esc 取消。</p>
              <p>轻按 Ctrl 循环切换网格：50 → 25 → 10 → 5 cm。</p>
              <p>WASD 移动视角 · Q 下降 · E 上升 · F 聚焦所选道具。</p>
              <p>中键环绕 · Shift／Alt＋中键平移 · 滚轮推近拉远。</p>
            </div>
          </details>
        </div>
      </div>
    </>
  )
}

export function StudioPicturePanel() {
  const viewer = useViewer()
  return (
    <section className="theatre-panel" aria-label="显示">
      <h2>显示</h2>
      <ViewModeControl />
      <label>
        画面模式
        <select
          value={viewer.textures ? 'preview' : viewer.sceneTheme === 'night' ? 'blackbox' : 'white'}
          onChange={(e) => {
            viewer.setSceneTheme(e.target.value === 'blackbox' ? 'night' : 'studio')
            viewer.setTextures(e.target.value === 'preview')
            viewer.setShading(e.target.value === 'preview' ? 'rendered' : 'solid')
          }}
        >
          <option value="white">白模</option>
          <option value="blackbox">黑匣子</option>
          <option value="preview">材质预览</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={viewer.showGrid}
          onChange={(e) => viewer.setShowGrid(e.target.checked)}
        />
        网格
      </label>
      <label>
        <input
          type="checkbox"
          checked={viewer.showGuides}
          onChange={(e) => viewer.setShowGuides(e.target.checked)}
        />
        辅助线
      </label>
      <WallModeToggle />
      <DisplayMenu />
    </section>
  )
}

export function EditorViewerToolbarRight() {
  return (
    <div className="stage-view-toolbar">
      <ViewModeControl />
    </div>
  )
}
