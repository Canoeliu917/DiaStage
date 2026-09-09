'use client'

import { getSceneTheme, useViewer } from '@pascal-app/viewer'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import useEditor from '../../store/use-editor'
import { useSidebarStore } from '../ui/primitives/sidebar'
import { MobileTabBar } from '../ui/sidebar/mobile-tab-bar'
import type { SidebarTab } from '../ui/sidebar/tab-bar'
import { BottomSheet, type BottomSheetHandle } from './bottom-sheet'

const MIN_SNAP = 0
const MAX_SNAP = 1
const DEFAULT_SNAP = 0.5
// Viewer extends this many pixels behind the sheet's rounded top corners
// so the curve reveals viewer content underneath.
const SHEET_OVERLAP_PX = 16
// Sheet never collapses below the drag handle so the user can always grab it.
const SHEET_HANDLE_PX = 24

// Match the viewer's scene background colors (packages/viewer/src/components/viewer/index.tsx)
const VIEWER_BG_DARK = '#1f2433'
const VIEWER_BG_LIGHT = '#ffffff'

// Fixed set of intermediate snap heights (handle + middleH are added on top).
// Per-tab `mobileDefaultSnap` decides the OPENING height; this list bounds
// what the user can drag to.
const SNAP_RATIOS = [0.5, 0.66] as const

function getDefaultSnap(tab: SidebarTab | undefined): number {
  const s = tab?.mobileDefaultSnap
  if (typeof s !== 'number') return DEFAULT_SNAP
  return Math.max(MIN_SNAP, Math.min(MAX_SNAP, s))
}

export interface EditorLayoutMobileProps {
  navbarSlot?: ReactNode
  sidebarTabs?: SidebarTab[]
  renderTabContent: (tabId: string) => ReactNode
  sidebarOverlay?: ReactNode
  viewerToolbarLeft?: ReactNode
  viewerToolbarRight?: ReactNode
  viewerContent: ReactNode
  overlays?: ReactNode
}

export function EditorLayoutMobile({
  navbarSlot,
  sidebarTabs = [],
  renderTabContent,
  sidebarOverlay,
  viewerToolbarLeft,
  viewerToolbarRight,
  viewerContent,
  overlays,
}: EditorLayoutMobileProps) {
  const isCaptureMode = useEditor((s) => s.isCaptureMode)
  const activePanel = useEditor((s) => s.activeSidebarPanel)
  const setActivePanel = useEditor((s) => s.setActiveSidebarPanel)
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const setIsCollapsed = useSidebarStore((s) => s.setIsCollapsed)
  const panelSheetHeight = useEditor((s) => s.mobilePanelSheetHeight)
  const isDark = useViewer((s) => getSceneTheme(s.sceneTheme).appearance === 'dark')
  const viewerBg = isDark ? VIEWER_BG_DARK : VIEWER_BG_LIGHT

  const middleRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<BottomSheetHandle>(null)
  const [middleH, setMiddleH] = useState(0)
  // Distance from the middle area's bottom edge to the viewport's bottom edge
  // (i.e. the tab bar height incl. safe area). Needed to translate the panel
  // sheet's viewport-relative height into middle-area coordinates.
  const [middleBottomFromViewport, setMiddleBottomFromViewport] = useState(0)
  const [committedSheetH, setCommittedSheetH] = useState(0)

  const currentTab = sidebarTabs.find((t) => t.id === activePanel)

  // The toolbar and workspace navigation share the desktop sidebar controls.
  useEffect(() => {
    if (middleH <= 0) return
    const height = sheetRef.current?.getHeight() ?? SHEET_HANDLE_PX
    if (isCollapsed && height > SHEET_HANDLE_PX) sheetRef.current?.snapTo(SHEET_HANDLE_PX)
    else if (!isCollapsed && height <= SHEET_HANDLE_PX)
      sheetRef.current?.snapTo(getDefaultSnap(currentTab) * middleH)
  }, [isCollapsed, middleH, currentTab])

  // Keep active panel valid
  useEffect(() => {
    if (sidebarTabs.length > 0 && !sidebarTabs.some((t) => t.id === activePanel)) {
      setActivePanel(sidebarTabs[0]!.id)
    }
  }, [sidebarTabs, activePanel, setActivePanel])

  // Sync editor phase / mode with the active tab:
  // - Entering Chat always drops to Select (chat is a composing context).
  // - Entering Items snaps the editor into furnish-build (matches the
  //   desktop "Furnish" action which itself opens the Items panel).
  // - Leaving Items while still furnishing exits the build mode.
  useEffect(() => {
    const { armToolMode, phase, mode, setPhase } = useEditor.getState()
    if (activePanel === 'ai' && mode === 'build') {
      armToolMode({ mode: 'select' })
      return
    }
    if (activePanel === 'items') {
      if (phase !== 'furnish') setPhase('furnish')
      if (mode !== 'build') armToolMode({ mode: 'build', tool: 'item' })
      return
    }
    if (phase === 'furnish' && mode === 'build') {
      armToolMode({ mode: 'select' })
    }
  }, [activePanel])

  // Measure middle area height + its bottom offset from viewport bottom
  useLayoutEffect(() => {
    const el = middleRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setMiddleH(rect.height)
      setMiddleBottomFromViewport(Math.max(0, window.innerHeight - rect.bottom))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Initialise sheet to current tab default once we know the middle height
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || middleH <= 0) return
    didInit.current = true
    const targetPx = isCollapsed ? SHEET_HANDLE_PX : getDefaultSnap(currentTab) * middleH
    setCommittedSheetH(targetPx)
    sheetRef.current?.snapTo(targetPx)
  }, [middleH, currentTab, isCollapsed])

  // When middle height changes (rotation / resize), keep sheet in proportion
  const prevMiddleH = useRef(0)
  useEffect(() => {
    if (middleH <= 0) return
    if (prevMiddleH.current === 0) {
      prevMiddleH.current = middleH
      return
    }
    if (prevMiddleH.current === middleH) return
    const ratio =
      committedSheetH <= SHEET_HANDLE_PX && !isCollapsed
        ? getDefaultSnap(currentTab)
        : committedSheetH / prevMiddleH.current
    const nextPx = isCollapsed
      ? SHEET_HANDLE_PX
      : Math.max(SHEET_HANDLE_PX, Math.min(middleH, ratio * middleH))
    prevMiddleH.current = middleH
    setCommittedSheetH(nextPx)
    sheetRef.current?.snapTo(nextPx)
  }, [middleH, committedSheetH, isCollapsed, currentTab])

  const handleTabPress = useCallback(
    (id: string) => {
      if (middleH <= 0) return
      const tab = sidebarTabs.find((t) => t.id === id)
      if (!tab) return
      if (id !== activePanel && tab.onSelect?.() === false) return
      const defaultPx = getDefaultSnap(tab) * middleH
      if (id !== activePanel) {
        setIsCollapsed(false)
        setActivePanel(id)
        sheetRef.current?.snapTo(defaultPx)
        return
      }
      // Same tab tapped — toggle
      const current = sheetRef.current?.getHeight() ?? committedSheetH
      const expandedThreshold = Math.max(SHEET_HANDLE_PX, defaultPx * 0.5)
      if (current > expandedThreshold) {
        setIsCollapsed(true)
        sheetRef.current?.snapTo(SHEET_HANDLE_PX)
        // Closing the sheet disarms any build tool back to select
        const { armToolMode, mode } = useEditor.getState()
        if (mode === 'build') {
          armToolMode({ mode: 'select' })
        }
      } else {
        setIsCollapsed(false)
        sheetRef.current?.snapTo(defaultPx)
      }
    },
    [sidebarTabs, activePanel, setActivePanel, middleH, committedSheetH, setIsCollapsed],
  )

  const snapPointsPx = (() => {
    if (middleH <= 0) return [SHEET_HANDLE_PX]
    const intermediate = SNAP_RATIOS.map((r) => r * middleH)
    return Array.from(new Set([SHEET_HANDLE_PX, ...intermediate, middleH])).sort((a, b) => a - b)
  })()

  // When the secondary panel sheet is open, it covers the tab bar + part of
  // the middle area; translate its viewport height into middle-area units.
  const panelPenetrationInMiddle = Math.max(0, panelSheetHeight - middleBottomFromViewport)
  // The effective "sheet height" that the viewer sits above is the larger of
  // the primary sidebar sheet and the secondary panel sheet's penetration.
  const effectiveSheetH = Math.max(committedSheetH, panelPenetrationInMiddle)

  // In capture mode the sheet and tab bar are hidden — the viewer should fill
  // the entire middle area regardless of the stored sheet height.
  // Otherwise, the viewer extends SHEET_OVERLAP_PX behind the sheet's rounded
  // corners so the curve reveals viewer content underneath.
  const baseViewerHeight = Math.max(0, middleH - effectiveSheetH)
  const viewerHeight = isCaptureMode
    ? middleH
    : baseViewerHeight === 0
      ? 0
      : Math.min(middleH, baseViewerHeight + SHEET_OVERLAP_PX)

  // While the panel sheet is open, collapse the primary sheet to its handle so
  // it doesn't peek above. Remember the previous height and restore it on close.
  const sheetHeightBeforePanel = useRef<number | null>(null)
  useEffect(() => {
    if (panelSheetHeight > 0) {
      if (sheetHeightBeforePanel.current === null && committedSheetH > SHEET_HANDLE_PX) {
        sheetHeightBeforePanel.current = committedSheetH
        sheetRef.current?.snapTo(SHEET_HANDLE_PX)
      }
    } else if (sheetHeightBeforePanel.current !== null) {
      const target = sheetHeightBeforePanel.current
      sheetHeightBeforePanel.current = null
      sheetRef.current?.snapTo(target)
    }
  }, [panelSheetHeight, committedSheetH])

  return (
    <div className="dark flex h-full w-full flex-col bg-sidebar text-foreground">
      {navbarSlot}

      <div
        className="relative flex min-h-0 flex-1"
        ref={middleRef}
        style={{ backgroundColor: viewerBg }}
      >
        {/* Viewer column: sized by committed sheet height */}
        <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: viewerHeight }}>
          <div className="diastage-viewer-column relative flex h-full w-full flex-col">
            {(viewerToolbarLeft || viewerToolbarRight) && !isCaptureMode && (
              <div className="diastage-viewer-toolbar relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-border/50 border-b bg-sidebar px-2 py-2">
                <div className="pointer-events-auto flex items-center gap-2">
                  {viewerToolbarLeft}
                </div>
                <div className="pointer-events-auto flex items-center gap-2">
                  {viewerToolbarRight}
                </div>
              </div>
            )}
            <div className="relative min-h-0 w-full flex-1 overflow-hidden">
              {viewerContent}
              {overlays && (
                <div
                  className="pointer-events-none absolute inset-0 z-30"
                  style={{ transform: 'translateZ(0)' }}
                >
                  {overlays}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom sheet: overlays the lower part of the middle area */}
        {!isCaptureMode && sidebarTabs.length > 0 && (
          <BottomSheet
            initialHeightPx={SHEET_HANDLE_PX}
            onCommit={(height) => {
              setCommittedSheetH(height)
              setIsCollapsed(height <= SHEET_HANDLE_PX)
            }}
            ref={sheetRef}
            snapPointsPx={snapPointsPx}
          >
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {renderTabContent(activePanel)}
              {sidebarOverlay && <div className="absolute inset-0 z-50">{sidebarOverlay}</div>}
            </div>
          </BottomSheet>
        )}
      </div>

      {!isCaptureMode && sidebarTabs.length > 0 && (
        <MobileTabBar activeTab={activePanel} onTabPress={handleTabPress} tabs={sidebarTabs} />
      )}
    </div>
  )
}
