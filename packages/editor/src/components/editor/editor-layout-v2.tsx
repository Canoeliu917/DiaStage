'use client'

import { EyeOff, LockKeyhole, LockKeyholeOpen, PanelTopOpen } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../hooks/use-mobile'
import useEditor from '../../store/use-editor'

import { useSidebarStore } from '../ui/primitives/sidebar'
import { IconRail, type SidebarTab } from '../ui/sidebar/tab-bar'
import { EditorLayoutMobile } from './editor-layout-mobile'

const SIDEBAR_MIN_WIDTH = 300
const SIDEBAR_MAX_WIDTH = 800
const SIDEBAR_COLLAPSE_THRESHOLD = 220
// Matches the rail in <IconRail>; the resize math is relative to it.
const RAIL_WIDTH = 96
const SPLIT_HANDLE_HEIGHT = 8
const SPLIT_MIN = 0.15
const SPLIT_MAX = 0.85

// ── Left column: resizable panel with tab bar ────────────────────────────────

function LeftColumn({
  tabs,
  renderTabContent,
  sidebarOverlay,
  sidebarTopSlot,
}: {
  tabs: SidebarTab[]
  renderTabContent: (tabId: string) => ReactNode
  sidebarOverlay?: ReactNode
  sidebarTopSlot?: ReactNode
}) {
  const width = useSidebarStore((s) => s.width)
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const setIsCollapsed = useSidebarStore((s) => s.setIsCollapsed)
  const setWidth = useSidebarStore((s) => s.setWidth)
  const isDragging = useSidebarStore((s) => s.isDragging)
  const setIsDragging = useSidebarStore((s) => s.setIsDragging)
  const activePanel = useEditor((s) => s.activeSidebarPanel)
  const setActivePanel = useEditor((s) => s.setActiveSidebarPanel)
  const hasSlot = sidebarTopSlot != null

  const isResizing = useRef<{ startX: number; startWidth: number } | null>(null)
  const [layout, setLayout] = useState({
    topRatio: 0.5,
    toolsHidden: false,
    overviewHidden: false,
    toolsLocked: false,
    overviewLocked: false,
  })
  const [hydrated, setHydrated] = useState(false)
  const { topRatio, toolsHidden, overviewHidden, toolsLocked, overviewLocked } = layout
  const widthLocked = toolsLocked || (hasSlot && overviewLocked)
  useEffect(() => {
    if (widthLocked && isCollapsed) setIsCollapsed(false)
  }, [widthLocked, isCollapsed, setIsCollapsed])
  const splitVisible = !toolsHidden && !overviewHidden
  const setTopRatio = useCallback((next: number | ((ratio: number) => number)) => {
    setLayout((previous) => ({
      ...previous,
      topRatio: typeof next === 'function' ? next(previous.topRatio) : next,
    }))
  }, [])
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('diastage:sidebar-panes') ?? 'null')
      if (stored && typeof stored === 'object')
        setLayout({
          topRatio:
            typeof stored.topRatio === 'number' && Number.isFinite(stored.topRatio)
              ? Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, stored.topRatio))
              : 0.5,
          toolsHidden: stored.toolsHidden === true,
          overviewHidden: stored.overviewHidden === true,
          toolsLocked: stored.toolsLocked === true,
          overviewLocked: stored.overviewLocked === true,
        })
    } catch {}
    setHydrated(true)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem('diastage:sidebar-panes', JSON.stringify(layout))
    } catch {}
  }, [layout, hydrated])
  const splitContainer = useRef<HTMLDivElement>(null)
  const splitDrag = useRef<{
    pointerId: number
    startY: number
    startRatio: number
    height: number
    target: HTMLDivElement
  } | null>(null)
  const showTop = hasSlot && !isCollapsed

  const finishSplitDrag = useCallback(
    (cancel: boolean) => {
      const drag = splitDrag.current
      if (!drag) return
      splitDrag.current = null
      if (cancel) setTopRatio(drag.startRatio)
      if (drag.target.hasPointerCapture(drag.pointerId)) {
        drag.target.releasePointerCapture(drag.pointerId)
      }
    },
    [setTopRatio],
  )

  useEffect(() => {
    if (!showTop || !splitVisible || widthLocked) finishSplitDrag(true)
  }, [showTop, splitVisible, widthLocked, finishSplitDrag])

  useEffect(() => {
    return () => {
      const drag = splitDrag.current
      splitDrag.current = null
      if (drag?.target.hasPointerCapture(drag.pointerId)) {
        drag.target.releasePointerCapture(drag.pointerId)
      }
    }
  }, [])

  // Ensure active panel is a valid tab
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activePanel)) {
      setActivePanel(tabs[0]!.id)
    }
  }, [tabs, activePanel, setActivePanel])

  // Leaving the items tab while furnishing should drop back to select mode
  useEffect(() => {
    if (activePanel === 'items') return
    const { phase, mode, setMode } = useEditor.getState()
    if (phase === 'furnish' && mode === 'build') {
      setMode('select')
    }
  }, [activePanel])

  // Closing (collapsing) the sidebar disarms any build tool back to select
  useEffect(() => {
    if (!isCollapsed) return
    const { mode, setMode } = useEditor.getState()
    if (mode === 'build') {
      setMode('select')
    }
  }, [isCollapsed])

  const handleResizerDown = useCallback(
    (e: React.PointerEvent) => {
      if (widthLocked || e.button !== 0) return
      e.preventDefault()
      isResizing.current = { startX: e.clientX, startWidth: width }
      setIsDragging(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [setIsDragging, widthLocked, width],
  )

  // Rail click: reopen a collapsed panel, collapse when re-clicking the open
  // tab, otherwise switch tabs. Reopening clamps below-min persisted widths
  // up to the minimum so the panel always returns to a usable size.
  const handleRailClick = useCallback(
    (id: string) => {
      if (id !== activePanel && tabs.find((t) => t.id === id)?.onSelect?.() === false) return
      // noPanel tabs drive the stage, not the panel — leave collapse state alone.
      if (tabs.find((t) => t.id === id)?.noPanel) {
        setActivePanel(id)
        return
      }
      if (isCollapsed) {
        setIsCollapsed(false)
        if (width < SIDEBAR_MIN_WIDTH) setWidth(SIDEBAR_MIN_WIDTH)
        setActivePanel(id)
        return
      }
      if (id === activePanel) {
        if (hasSlot || widthLocked) return
        setIsCollapsed(true)
        return
      }
      setActivePanel(id)
    },
    [
      tabs,
      isCollapsed,
      width,
      activePanel,
      hasSlot,
      widthLocked,
      setIsCollapsed,
      setWidth,
      setActivePanel,
    ],
  )

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = isResizing.current
      if (!drag || widthLocked) return
      const newWidth = drag.startWidth + e.clientX - drag.startX
      if (!hasSlot && newWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
        setIsCollapsed(true)
      } else {
        setIsCollapsed(false)
        setWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(newWidth, SIDEBAR_MAX_WIDTH)))
      }
    }
    const handlePointerUp = () => {
      isResizing.current = null
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      if (isResizing.current) handlePointerUp()
    }
  }, [setWidth, setIsCollapsed, setIsDragging, widthLocked, hasSlot])

  const tools = (
    <div
      className={`${showTop ? 'editor-sidebar-bottom ' : 'editor-sidebar-single '}relative z-10 flex h-full min-h-0 flex-shrink-0 bg-sidebar text-sidebar-foreground`}
    >
      <IconRail
        activeTab={activePanel}
        collapsed={isCollapsed}
        onIconClick={handleRailClick}
        tabs={tabs}
      />
      {!isCollapsed && !tabs.find((t) => t.id === activePanel)?.noPanel && (
        <div
          className="editor-sidebar-tool-panel relative flex h-full min-h-0 flex-col"
          style={{
            width: showTop ? undefined : width,
            flex: showTop ? 1 : undefined,
            minWidth: 0,
            transition: isDragging ? 'none' : 'width 150ms ease',
          }}
        >
          {!hasSlot && paneControls('tools', '左侧栏')}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderTabContent(activePanel)}
            {sidebarOverlay && <div className="absolute inset-0 z-50">{sidebarOverlay}</div>}
          </div>

          {/* Resize handle + hit area */}
          {!showTop && (
            <div
              role="separator"
              aria-label="调整左侧栏宽度"
              aria-orientation="vertical"
              aria-disabled={widthLocked}
              aria-valuemin={SIDEBAR_MIN_WIDTH}
              aria-valuemax={SIDEBAR_MAX_WIDTH}
              aria-valuenow={Math.round(width)}
              tabIndex={widthLocked ? -1 : 0}
              className="absolute inset-y-0 -right-3 z-[100] flex w-6 cursor-col-resize items-center justify-center"
              style={{ cursor: widthLocked ? 'default' : undefined }}
              onPointerDown={handleResizerDown}
              onKeyDown={(event) => {
                if (widthLocked || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                  return
                event.preventDefault()
                event.stopPropagation()
                setWidth(
                  event.key === 'Home'
                    ? SIDEBAR_MIN_WIDTH
                    : event.key === 'End'
                      ? SIDEBAR_MAX_WIDTH
                      : Math.max(
                          SIDEBAR_MIN_WIDTH,
                          Math.min(
                            SIDEBAR_MAX_WIDTH,
                            width + (event.key === 'ArrowLeft' ? -20 : 20),
                          ),
                        ),
                )
              }}
            >
              <div className="h-8 w-1 rounded-full bg-neutral-500" />
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (!showTop) return tools

  function paneControls(pane: 'tools' | 'overview', title: string) {
    const hidden = !hasSlot ? isCollapsed : pane === 'tools' ? toolsHidden : overviewHidden
    const locked = pane === 'tools' ? toolsLocked : overviewLocked
    return (
      <header className="editor-pane-controls editor-dock-controls flex h-9 shrink-0 items-center justify-between gap-2 border-border/50 border-b px-2 text-xs">
        <span>{title}</span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`${locked ? '解锁' : '锁定'}${title}布局`}
            aria-pressed={locked}
            title={locked ? '解锁后可调整大小或隐藏' : '锁定大小和显示，内容仍可操作'}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
            onClick={() => setLayout((previous) => ({ ...previous, [`${pane}Locked`]: !locked }))}
          >
            {locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}
          </button>
          <button
            type="button"
            aria-label={`${hidden ? '展开' : '隐藏'}${title}`}
            disabled={locked}
            aria-expanded={!hidden}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent disabled:opacity-35"
            onClick={() => {
              if (locked) return
              if (!hasSlot) setIsCollapsed(true)
              else setLayout((previous) => ({ ...previous, [`${pane}Hidden`]: !hidden }))
            }}
          >
            {hidden ? <PanelTopOpen size={15} /> : <EyeOff size={15} />}
          </button>
        </div>
      </header>
    )
  }

  return (
    <div
      className="editor-sidebar-split relative z-10 grid h-full min-h-0 flex-shrink-0 bg-sidebar text-sidebar-foreground"
      ref={splitContainer}
      style={{
        width: toolsHidden && overviewHidden ? 160 : RAIL_WIDTH + width,
        transition: isDragging ? 'none' : 'width 150ms ease',
        gridTemplateRows: `${toolsHidden ? '36px' : `minmax(0, ${overviewHidden ? 1 : topRatio}fr)`} ${splitVisible ? SPLIT_HANDLE_HEIGHT : 0}px ${overviewHidden ? '36px' : `minmax(0, ${toolsHidden ? 1 : 1 - topRatio}fr)`}`,
        alignContent: toolsHidden && overviewHidden ? 'start' : undefined,
      }}
    >
      <section
        className="flex min-h-0 min-w-0 flex-col"
        data-layout-pane="tools"
        data-hidden={toolsHidden}
        data-locked={toolsLocked}
      >
        {paneControls('tools', '工具区')}
        <div className="min-h-0 flex-1" hidden={toolsHidden}>
          {tools}
        </div>
      </section>
      <div
        aria-label="调整舞台总览与工具区高度"
        aria-orientation="horizontal"
        aria-valuemax={SPLIT_MAX * 100}
        aria-valuemin={SPLIT_MIN * 100}
        aria-valuenow={Math.round(topRatio * 100)}
        aria-disabled={widthLocked}
        hidden={!splitVisible}
        className="relative z-20 flex touch-none cursor-row-resize select-none items-center justify-center border-y border-border/50 bg-sidebar hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
        onKeyDown={(event) => {
          if (widthLocked) return
          if (event.key === 'Escape') {
            if (!splitDrag.current) return
            event.preventDefault()
            event.stopPropagation()
            finishSplitDrag(true)
            return
          }
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          event.stopPropagation()
          finishSplitDrag(false)
          setTopRatio((ratio) => {
            if (event.key === 'Home') return SPLIT_MIN
            if (event.key === 'End') return SPLIT_MAX
            return Math.max(
              SPLIT_MIN,
              Math.min(SPLIT_MAX, ratio + (event.key === 'ArrowUp' ? -0.05 : 0.05)),
            )
          })
        }}
        onLostPointerCapture={() => finishSplitDrag(true)}
        onPointerCancel={(event) => {
          if (splitDrag.current?.pointerId === event.pointerId) finishSplitDrag(true)
        }}
        onPointerDown={(event) => {
          if (widthLocked || event.button !== 0 || splitDrag.current) return
          const height =
            (splitContainer.current?.getBoundingClientRect().height ?? 0) - SPLIT_HANDLE_HEIGHT
          if (height <= 0) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.focus()
          splitDrag.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startRatio: topRatio,
            height,
            target: event.currentTarget,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = splitDrag.current
          if (!drag || drag.pointerId !== event.pointerId) return
          event.preventDefault()
          setTopRatio(
            Math.max(
              SPLIT_MIN,
              Math.min(SPLIT_MAX, drag.startRatio + (event.clientY - drag.startY) / drag.height),
            ),
          )
        }}
        onPointerUp={(event) => {
          if (splitDrag.current?.pointerId === event.pointerId) finishSplitDrag(false)
        }}
        role="separator"
        tabIndex={widthLocked || !splitVisible ? -1 : 0}
        style={{
          display: splitVisible ? undefined : 'none',
          cursor: widthLocked ? 'default' : undefined,
        }}
      >
        <span aria-hidden="true" className="h-0.5 w-8 bg-neutral-500" />
      </div>
      <section
        className="flex min-h-0 min-w-0 flex-col"
        data-layout-pane="overview"
        data-hidden={overviewHidden}
        data-locked={overviewLocked}
      >
        {paneControls('overview', '舞台总览')}
        <div className="min-h-0 flex-1 overflow-hidden" hidden={overviewHidden}>
          {sidebarTopSlot}
        </div>
      </section>
      <div
        aria-label="调整左侧栏宽度"
        aria-orientation="vertical"
        aria-disabled={widthLocked}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={Math.round(width)}
        role="separator"
        tabIndex={widthLocked || (toolsHidden && overviewHidden) ? -1 : 0}
        className="absolute inset-y-0 -right-2 z-[100] flex w-4 touch-none items-center justify-center"
        style={{
          cursor: widthLocked ? 'default' : 'col-resize',
          display: toolsHidden && overviewHidden ? 'none' : undefined,
        }}
        onPointerDown={handleResizerDown}
        onKeyDown={(event) => {
          if (widthLocked || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          event.stopPropagation()
          setWidth(
            event.key === 'Home'
              ? SIDEBAR_MIN_WIDTH
              : event.key === 'End'
                ? SIDEBAR_MAX_WIDTH
                : Math.max(
                    SIDEBAR_MIN_WIDTH,
                    Math.min(SIDEBAR_MAX_WIDTH, width + (event.key === 'ArrowLeft' ? -20 : 20)),
                  ),
          )
        }}
      >
        <span aria-hidden="true" className="h-8 w-1 rounded-full bg-neutral-500" />
      </div>
    </div>
  )
}

// ── Right column: viewer area with toolbar ───────────────────────────────────

function RightColumn({
  toolbarLeft,
  toolbarRight,
  children,
  overlays,
  stageOverlay,
}: {
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode
  children: ReactNode
  overlays?: ReactNode
  stageOverlay?: ReactNode
}) {
  return (
    <div
      className="diastage-viewer-column relative flex min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        borderTopLeftRadius: 16,
        clipPath: 'inset(0 0 0 0 round 16px 0 0 0)',
        boxShadow: '-4px -2px 16px rgba(0, 0, 0, 0.08), -1px 0 4px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Viewer toolbar */}
      {(toolbarLeft || toolbarRight) && (
        <div className="diastage-viewer-toolbar relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-border/50 border-b bg-sidebar px-3 py-2">
          <div className="pointer-events-auto flex items-center gap-2">{toolbarLeft}</div>
          <div className="pointer-events-auto flex items-center gap-2">{toolbarRight}</div>
        </div>
      )}
      {/* Canvas area. `isolate` matters: drei's `<Html>` computes a z-index
          from camera distance and defaults to a range topping out at
          16,777,271, and without a stacking context here those values compete
          directly with the viewer toolbar (z-20), the stage overlay (z-10) and
          the overlay band (z-30) — so an in-scene tool badge painted over all
          three. Isolating pins every in-scene HTML layer inside the canvas,
          where it belongs, and leaves their order relative to each other
          untouched. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="relative isolate h-full overflow-hidden">{children}</div>
        {/* Stage overlay — replaces the canvas visually (e.g. studio gallery)
          while keeping it mounted. Sits below the viewer toolbar (z-20) so
          the stage switch stays reachable. */}
        {stageOverlay && <div className="absolute inset-0 z-10">{stageOverlay}</div>}
        {/* Overlays scoped to the viewer column. `data-viewer-bounds` marks the
          draggable region the floating inspector clamps itself to. */}
        {overlays && (
          <div
            className="pointer-events-none absolute inset-0 z-30"
            data-viewer-bounds
            style={{ transform: 'translateZ(0)' }}
          >
            {overlays}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main v2 layout ───────────────────────────────────────────────────────────

export interface EditorLayoutV2Props {
  navbarSlot?: ReactNode
  sidebarTopSlot?: ReactNode
  sidebarTabs?: SidebarTab[]
  renderTabContent: (tabId: string) => ReactNode
  sidebarOverlay?: ReactNode
  viewerToolbarLeft?: ReactNode
  viewerToolbarRight?: ReactNode
  viewerContent: ReactNode
  overlays?: ReactNode
  stageOverlay?: ReactNode
}

export function EditorLayoutV2({
  navbarSlot,
  sidebarTopSlot,
  sidebarTabs = [],
  renderTabContent,
  sidebarOverlay,
  viewerToolbarLeft,
  viewerToolbarRight,
  viewerContent,
  overlays,
  stageOverlay,
}: EditorLayoutV2Props) {
  const isCaptureMode = useEditor((s) => s.isCaptureMode)
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <EditorLayoutMobile
        navbarSlot={navbarSlot}
        overlays={overlays}
        renderTabContent={renderTabContent}
        sidebarOverlay={sidebarOverlay}
        sidebarTabs={sidebarTabs.filter((t) => !t.noPanel)}
        viewerContent={viewerContent}
        viewerToolbarLeft={viewerToolbarLeft}
        viewerToolbarRight={viewerToolbarRight}
      />
    )
  }

  return (
    <div className="dark flex h-full w-full flex-col bg-sidebar text-foreground">
      {/* Top navbar */}
      {navbarSlot}

      {/* Main content: left column + right column */}
      <div className="flex min-h-0 flex-1">
        {!isCaptureMode && sidebarTabs.length > 0 && (
          <LeftColumn
            renderTabContent={renderTabContent}
            sidebarOverlay={sidebarOverlay}
            sidebarTopSlot={sidebarTopSlot}
            tabs={sidebarTabs}
          />
        )}
        <RightColumn
          overlays={overlays}
          stageOverlay={stageOverlay}
          toolbarLeft={isCaptureMode ? undefined : viewerToolbarLeft}
          toolbarRight={isCaptureMode ? undefined : viewerToolbarRight}
        >
          {viewerContent}
        </RightColumn>
      </div>
    </div>
  )
}
