'use client'

import { type SidebarTab, sidebarTabLabel } from './tab-bar'

interface MobileTabBarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabPress: (id: string) => void
}

export function MobileTabBar({ tabs, activeTab, onTabPress }: MobileTabBarProps) {
  return (
    <div
      className="diastage-mobile-tabs z-50 flex min-h-12 shrink-0 items-center gap-2 border-border/50 border-t bg-sidebar px-3 text-sidebar-foreground"
      style={{
        // Cap the safe-area inset — iOS Chrome can report its bottom UI bar
        // (50–100px) as part of the safe area which would balloon the tab bar.
        // 34px matches the iPhone home-indicator height (the typical max).
        paddingBottom: 'min(env(safe-area-inset-bottom, 0px), 34px)',
      }}
    >
      <select aria-label="工作区工具" className="min-h-11 min-w-0 flex-1 bg-sidebar text-sm" value={activeTab} onChange={(event) => onTabPress(event.target.value)}>
        {tabs.map((tab) => <option key={tab.id} value={tab.id}>{sidebarTabLabel(tab.label)}</option>)}
      </select>
      <button type="button" className="min-h-11 px-3 text-xs" onClick={() => onTabPress(activeTab)}>展开 / 收起</button>
    </div>
  )
}
