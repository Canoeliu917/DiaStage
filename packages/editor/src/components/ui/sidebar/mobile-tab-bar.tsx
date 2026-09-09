'use client'

import { cn } from './../../../lib/utils'
import { type SidebarTab, sidebarTabLabel } from './tab-bar'

interface MobileTabBarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabPress: (id: string) => void
}

export function MobileTabBar({ tabs, activeTab, onTabPress }: MobileTabBarProps) {
  return (
    <div
      className="diastage-mobile-tabs z-50 flex min-h-16 shrink-0 overflow-x-auto border-border/50 border-t bg-sidebar text-sidebar-foreground"
      style={{
        // Cap the safe-area inset — iOS Chrome can report its bottom UI bar
        // (50–100px) as part of the safe area which would balloon the tab bar.
        // 34px matches the iPhone home-indicator height (the typical max).
        paddingBottom: 'min(env(safe-area-inset-bottom, 0px), 34px)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            className={cn(
              'flex min-w-16 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-xs transition-colors',
              isActive ? 'text-foreground' : 'text-muted-foreground',
            )}
            key={tab.id}
            aria-pressed={isActive}
            onClick={() => onTabPress(tab.id)}
            type="button"
          >
            {tab.mobileIcon ? (
              <span className={cn('flex h-5 w-5 items-center justify-center')}>
                {tab.mobileIcon}
              </span>
            ) : null}
            <span className="font-medium">{sidebarTabLabel(tab.label)}</span>
          </button>
        )
      })}
    </div>
  )
}
