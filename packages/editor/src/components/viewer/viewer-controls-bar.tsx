'use client'

import { emitter } from '@pascal-app/core'
import {
  CLAY_PALETTE,
  type EdgeMode,
  getSceneTheme,
  SCENE_THEMES,
  useViewer,
} from '@pascal-app/viewer'
import {
  Box,
  Camera,
  Check,
  Contrast,
  Diamond,
  Eye,
  EyeOff,
  Footprints,
  Layers,
  Layers2,
  Palette,
  PenLine,
  SlidersHorizontal,
  Sparkles,
  Square,
  SwatchBook,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { ActionButton } from '../ui/action-menu/action-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/primitives/dropdown-menu'
import { TooltipProvider } from '../ui/primitives/tooltip'

const levelModeLabels: Record<'stacked' | 'exploded' | 'solo', string> = {
  stacked: '堆叠',
  exploded: '分解',
  solo: '独显',
}

const themeLabels: Record<string, string> = {
  studio: '摄影棚',
  paper: '纸张',
  sunset: '日落',
  overcast: '阴天',
  blueprint: '蓝图',
  mediterranean: '地中海',
  twilight: '暮光',
  night: '夜景',
  verdant: '苍翠',
}

const wallModeConfig = {
  up: {
    icon: (props: any) => (
      <img alt="完整高度" height={28} src="/icons/room.webp" width={28} {...props} />
    ),
    label: '完整高度',
  },
  cutaway: {
    icon: (props: any) => (
      <img alt="剖切" height={28} src="/icons/wallcut.webp" width={28} {...props} />
    ),
    label: '剖切',
  },
  down: {
    icon: (props: any) => (
      <img alt="低墙" height={28} src="/icons/walllow.webp" width={28} {...props} />
    ),
    label: '低墙',
  },
}

const SHADING_OPTIONS = [
  { id: 'solid', name: '实体', detail: '快速平面显示，不启用环境光遮蔽', icon: Box },
  { id: 'rendered', name: '渲染', detail: '完整环境光遮蔽', icon: Sparkles },
] as const

const EDGE_OPTIONS = [
  { id: 'off', name: '关闭', detail: '不显示边线' },
  { id: 'soft', name: '柔和', detail: '淡化显示主要折痕轮廓' },
  { id: 'strong', name: '清晰', detail: '清晰的不透明边线' },
] as const satisfies readonly { id: EdgeMode; name: string; detail: string }[]

// Keep the dropdown open when flipping an in-place toggle row.
const keepOpen = (event: Event, fn: () => void) => {
  event.preventDefault()
  fn()
}

// Scans + guides folded into one control. A baked GLB carries none of its own,
// but the GLB viewer re-adds them from scene data when the privacy flags allow,
// so the toggle shows for whichever exist.
function VisibilityMenu({
  canShowScans,
  canShowGuides,
}: {
  canShowScans: boolean
  canShowGuides: boolean
}) {
  const showScans = useViewer((s) => s.showScans)
  const showGuides = useViewer((s) => s.showGuides)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton
          className="hover:bg-white/5 hover:text-foreground"
          label="可见性"
          size="icon"
          tooltipSide="top"
          variant="ghost"
        >
          <Eye className="h-5 w-5" />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-44" side="top">
        {canShowScans && (
          <DropdownMenuItem
            onSelect={(e) => keepOpen(e, () => useViewer.getState().setShowScans(!showScans))}
          >
            <img alt="" className="h-4 w-4 object-contain" src="/icons/mesh.webp" />
            <span>扫描</span>
            {showScans ? (
              <Eye className="ml-auto h-4 w-4 text-foreground" />
            ) : (
              <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )}
        {canShowGuides && (
          <DropdownMenuItem
            onSelect={(e) => keepOpen(e, () => useViewer.getState().setShowGuides(!showGuides))}
          >
            <img alt="" className="h-4 w-4 object-contain" src="/icons/floorplan.webp" />
            <span>参考图</span>
            {showGuides ? (
              <Eye className="ml-auto h-4 w-4 text-foreground" />
            ) : (
              <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// One "Display" button gathering shadows, camera projection, colors, render
// mode, scene theme and edges.
function DisplayMenu() {
  const cameraMode = useViewer((s) => s.cameraMode)
  const shading = useViewer((s) => s.shading)
  const textures = useViewer((s) => s.textures)
  const shadows = useViewer((s) => s.shadows)
  const sceneTheme = useViewer((s) => s.sceneTheme)
  const edges = useViewer((s) => s.edges)
  const activeShading = SHADING_OPTIONS.find((o) => o.id === shading) ?? SHADING_OPTIONS[0]
  const activeTheme = getSceneTheme(sceneTheme)
  const activeEdges = EDGE_OPTIONS.find((o) => o.id === edges) ?? EDGE_OPTIONS[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton
          className="hover:bg-white/5 hover:text-foreground"
          label="显示设置"
          size="icon"
          tooltipSide="top"
          variant="ghost"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-56" side="top">
        <DropdownMenuItem
          onSelect={(e) => keepOpen(e, () => useViewer.getState().setShadows(!shadows))}
        >
          <Contrast className="h-4 w-4" />
          <span>阴影</span>
          <span className="ml-auto text-muted-foreground text-xs">{shadows ? '开启' : '关闭'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) =>
            keepOpen(e, () =>
              useViewer
                .getState()
                .setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective'),
            )
          }
        >
          <Camera className="h-4 w-4" />
          <span>摄像机</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {cameraMode === 'perspective' ? '透视' : '正交'}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => keepOpen(e, () => useViewer.getState().setTextures(!textures))}
        >
          {textures ? <Palette className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          <span>颜色</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {textures ? '彩色' : '单色'}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <activeShading.icon className="h-4 w-4" />
            <span>渲染</span>
            <span className="ml-auto text-muted-foreground text-xs">{activeShading.name}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-56">
            {SHADING_OPTIONS.map((option) => {
              const OptionIcon = option.icon
              return (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={() => useViewer.getState().setShading(option.id)}
                >
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
            <SwatchBook className="h-4 w-4" />
            <span>主题</span>
            <span className="ml-auto truncate text-muted-foreground text-xs">
              {themeLabels[activeTheme.id] ?? activeTheme.name}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48">
            {SCENE_THEMES.map((t) => {
              const swatches = (['wall', 'floor', 'glazing'] as const).map(
                (role) => t.clayTints?.[role] ?? CLAY_PALETTE[role],
              )
              return (
                <DropdownMenuItem
                  className="gap-2"
                  key={t.id}
                  onSelect={() => useViewer.getState().setSceneTheme(t.id)}
                >
                  <span
                    className="grid h-5 w-5 shrink-0 grid-cols-2 overflow-hidden rounded-sm border border-black/10"
                    style={{ backgroundColor: t.background }}
                  >
                    {swatches.map((color, index) => (
                      <span key={`${t.id}-${index}`} style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span>{themeLabels[t.id] ?? t.name}</span>
                  {sceneTheme === t.id ? <Check className="ml-auto h-4 w-4" /> : null}
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
          <DropdownMenuSubContent className="min-w-56">
            {EDGE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => useViewer.getState().setEdges(option.id)}
              >
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

export type ViewerControlsBarProps = {
  canShowScans?: boolean
  canShowGuides?: boolean
  /** A baked GLB is the active artifact: hide controls it can't honor (wall
   *  modes aren't baked into the GLB). */
  glbActive?: boolean
  /** In GLB mode, whether scans/guides were re-added from scene data — so the
   *  visibility control surfaces the matching toggle even though the artifact
   *  itself carries none. */
  glbHasScans?: boolean
  glbHasGuides?: boolean
  walkthroughActive?: boolean
  onWalkthroughToggle: () => void
  className?: string
}

export const ViewerControlsBar = ({
  canShowScans = true,
  canShowGuides = true,
  glbActive = false,
  glbHasScans = false,
  glbHasGuides = false,
  walkthroughActive = false,
  onWalkthroughToggle,
  className,
}: ViewerControlsBarProps) => {
  const levelMode = useViewer((s) => s.levelMode)
  const wallMode = useViewer((s) => s.wallMode)
  // Sessions may carry a stale mode outside the cycle (e.g. the retired
  // 'translucent'); render and cycle it as cutaway instead of crashing.
  const safeWallMode = (
    wallMode in wallModeConfig ? wallMode : 'cutaway'
  ) as keyof typeof wallModeConfig
  const WallModeIcon = wallModeConfig[safeWallMode].icon

  return (
    <div
      className={cn(
        'dark absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-foreground sm:bottom-6',
        className,
      )}
    >
      <TooltipProvider delayDuration={0}>
        <div className="corner-smooth pointer-events-auto flex h-12 max-w-[calc(100vw-1rem)] flex-row items-center justify-center gap-0.5 overflow-hidden rounded-2xl border border-border/40 bg-background/95 p-1 shadow-elevation-4 backdrop-blur-xl transition-colors duration-200 ease-out sm:h-14 sm:gap-1.5 sm:p-1.5">
          {((canShowScans && (!glbActive || glbHasScans)) ||
            (canShowGuides && (!glbActive || glbHasGuides))) && (
            <>
              <VisibilityMenu
                canShowGuides={canShowGuides && (!glbActive || glbHasGuides)}
                canShowScans={canShowScans && (!glbActive || glbHasScans)}
              />
              <div className="mx-1 h-5 w-px bg-border/40" />
            </>
          )}

          {/* Level mode */}
          <ActionButton
            className={
              levelMode === 'stacked'
                ? 'hover:bg-white/5 hover:text-amber-400'
                : 'bg-amber-500/20 text-amber-400'
            }
            label={`表演层：${levelMode === 'manual' ? '手动' : levelModeLabels[levelMode as keyof typeof levelModeLabels]}`}
            onClick={() => {
              if (levelMode === 'manual') return useViewer.getState().setLevelMode('stacked')
              const modes: ('stacked' | 'exploded' | 'solo')[] = ['stacked', 'exploded', 'solo']
              const nextIndex = (modes.indexOf(levelMode as any) + 1) % modes.length
              useViewer.getState().setLevelMode(modes[nextIndex] ?? 'stacked')
            }}
            size="icon"
            tooltipSide="top"
            variant="ghost"
          >
            {levelMode === 'solo' && <Diamond className="h-6 w-6" />}
            {levelMode === 'exploded' && <Layers2 className="h-6 w-6" />}
            {(levelMode === 'stacked' || levelMode === 'manual') && <Layers className="h-6 w-6" />}
          </ActionButton>

          {/* Wall mode — parametric only; baked GLB walls are fixed-height. */}
          {!glbActive && (
            <ActionButton
              className={
                safeWallMode === 'cutaway'
                  ? 'opacity-60 grayscale hover:bg-white/5 hover:opacity-100 hover:grayscale-0'
                  : 'bg-white/10'
              }
              label={`墙体：${wallModeConfig[safeWallMode].label}`}
              onClick={() => {
                const modes: ('cutaway' | 'up' | 'down')[] = ['cutaway', 'up', 'down']
                const nextIndex = (modes.indexOf(safeWallMode) + 1) % modes.length
                useViewer.getState().setWallMode(modes[nextIndex] ?? 'cutaway')
              }}
              size="icon"
              tooltipSide="top"
              variant="ghost"
            >
              <WallModeIcon className="h-[28px] w-[28px]" />
            </ActionButton>
          )}

          <div className="mx-1 h-5 w-px bg-border/40" />

          <DisplayMenu />

          <div className="mx-1 h-5 w-px bg-border/40" />

          {/* Walkthrough */}
          <ActionButton
            className={
              walkthroughActive
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'hover:bg-white/5 hover:text-emerald-400'
            }
            label={`漫游：${walkthroughActive ? '开启' : '关闭'}`}
            onClick={onWalkthroughToggle}
            size="icon"
            tooltipSide="top"
            variant="ghost"
          >
            <Footprints className="h-6 w-6" />
          </ActionButton>

          <div className="mx-1 h-5 w-px bg-border/40" />

          {/* Camera actions */}
          <ActionButton
            className="group hidden hover:bg-white/5 sm:inline-flex"
            label="向左环绕"
            onClick={() => emitter.emit('camera-controls:orbit-ccw')}
            size="icon"
            tooltipSide="top"
            variant="ghost"
          >
            <img
              alt="向左环绕"
              className="h-[28px] w-[28px] -scale-x-100 object-contain opacity-70 transition-opacity group-hover:opacity-100"
              src="/icons/rotate.webp"
            />
          </ActionButton>

          <ActionButton
            className="group hidden hover:bg-white/5 sm:inline-flex"
            label="向右环绕"
            onClick={() => emitter.emit('camera-controls:orbit-cw')}
            size="icon"
            tooltipSide="top"
            variant="ghost"
          >
            <img
              alt="向右环绕"
              className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
              src="/icons/rotate.webp"
            />
          </ActionButton>

          <ActionButton
            className="group hover:bg-white/5"
            label="顶视图"
            onClick={() => emitter.emit('camera-controls:top-view')}
            size="icon"
            tooltipSide="top"
            variant="ghost"
          >
            <img
              alt="顶视图"
              className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
              src="/icons/topview.webp"
            />
          </ActionButton>
        </div>
      </TooltipProvider>
    </div>
  )
}
