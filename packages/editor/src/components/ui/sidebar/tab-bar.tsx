'use client'

import type { ReactNode } from 'react'
import { triggerSFX } from './../../../lib/sfx-bus'
import { cn } from './../../../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../primitives/tooltip'

const sidebarLabels: Record<string, string> = { Nature: '自然环境', Streetscape: '街景', Plugins: '插件' }

export function sidebarTabLabel(label: string) {
  return sidebarLabels[label] ?? label
}

export type SidebarTab = {
  id: string
  label: string
  mobileDefaultSnap?: number
  mobileIcon?: ReactNode
  /** Desktop icon shown in the vertical rail (v2 layout). */
  icon?: ReactNode
  /** When omitted, the tab stays available in both workspaces. */
  workspaces?: readonly ('edit' | 'studio')[]
  /**
   * Rail entry that drives the stage instead of opening a sidebar panel:
   * activating it hides the panel column (preserving its collapse state) and
   * keeps the icon highlighted regardless of collapse.
   */
  noPanel?: boolean
  /** Host activation runs before selecting a tab; false cancels the switch. */
  onSelect?: () => boolean
}

interface TabBarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-border/50 border-b px-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            className={cn(
              'relative h-7 rounded-md px-3 font-medium text-sm transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            key={tab.id}
            onClick={() => {
              triggerSFX('sfx:menu-click')
              onTabChange(tab.id)
            }}
            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
            type="button"
          >
            {sidebarTabLabel(tab.label)}
          </button>
        )
      })}
    </div>
  )
}

interface IconRailProps {
  tabs: SidebarTab[]
  /** Highlighted tab. Stays highlighted while the panel is collapsed. */
  activeTab: string
  /** True when the panel beside the rail is collapsed. */
  collapsed: boolean
  /** Clicking a rail icon: switch tab, or toggle the panel (see layout). */
  onIconClick: (id: string) => void
}

/**
 * Vertical icon rail for the v2 left column. Always visible (even when the
 * panel is collapsed) so the user can reopen the panel by clicking an icon.
 * Labels stay visible below the icon, with a tooltip on the right.
 */
export function IconRail({ tabs, activeTab, collapsed, onIconClick }: IconRailProps) {
  const renderTab = (tab: SidebarTab) => {
    const showActive = activeTab === tab.id && (!collapsed || tab.noPanel === true)
    return (
      <Tooltip key={tab.id}>
        <TooltipTrigger asChild>
          <button
            aria-label={sidebarTabLabel(tab.label)}
            aria-pressed={showActive}
            data-tab-id={tab.id}
            className={cn(
              'group flex min-h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 transition-colors [&_img]:transition-[opacity,filter] [&_img]:duration-200',
              showActive
                ? 'bg-accent text-foreground shadow-sm [&_img]:opacity-100 [&_img]:grayscale-0'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground [&_img]:opacity-60 [&_img]:grayscale hover:[&_img]:opacity-100 hover:[&_img]:grayscale-0',
            )}
            onClick={() => {
              triggerSFX('sfx:menu-click')
              onIconClick(tab.id)
            }}
            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
            type="button"
          >
            <span className="flex h-7 items-center justify-center [&_img]:h-7 [&_img]:w-7">{tab.icon ?? sidebarTabLabel(tab.label).charAt(0)}</span>
            <span className="text-center font-medium text-xs leading-4">{sidebarTabLabel(tab.label)}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{sidebarTabLabel(tab.label)}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={0} disableHoverableContent>
      <div className="diastage-tool-rail flex h-full w-[72px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-border/50 border-r py-2">
        {tabs.map(renderTab)}
      </div>
    </TooltipProvider>
  )
}
