'use client'

import { ItemsPanel, type SidebarTab, useEditor, useIsMobile } from '@pascal-app/editor'
import {
  Camera,
  Clapperboard,
  Hammer,
  Layers,
  Package,
  ScanLine,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { BuildTab } from './build-tab'
import { CameraRehearsalPanel } from './camera-rehearsal-panel'
import { CameraPanel } from './camera-studio/panel'
import { RemountPanel } from './remount-panel'
import { StageOverviewPanel } from './stage-overview-panel'
import { openStudioPanel, type StudioGroup } from './studio-navigation'
import { StudioPicturePanel } from './viewer-toolbar'

function EditorItemsPanel() {
  return <ItemsPanel showSourceFilter={false} showTagFilters={false} />
}

const emptyPanel = () => null
const SPACE_TABS = [
  { id: 'build', label: '建模', component: BuildTab, icon: Hammer },
  { id: 'items', label: '物件库', component: EditorItemsPanel, icon: Package },
]

export function useStudioSidebar(sceneId: string) {
  const isMobile = useIsMobile()
  const activePanel = useEditor((state) => state.activeSidebarPanel)
  const [selectedGroup, setSelectedGroup] = useState<StudioGroup>('space')
  const group: StudioGroup =
    activePanel === 'remount'
      ? 'remount'
      : ['camera-studio', 'camera-rehearsal', 'picture'].includes(activePanel)
        ? 'director'
        : activePanel === 'build' ||
            activePanel === 'items' ||
            activePanel.startsWith('pascal:') ||
            activePanel === 'plugins'
          ? 'space'
          : selectedGroup

  const sidebarTabs = useMemo<(SidebarTab & { component: React.ComponentType })[]>(() => {
    const entries =
      group === 'space'
        ? SPACE_TABS
        : group === 'director'
          ? [
              {
                id: 'picture',
                label: '画面',
                component: () => <StudioPicturePanel sceneId={sceneId} />,
                icon: SlidersHorizontal,
              },
              { id: 'camera-studio', label: '机位', component: CameraPanel, icon: Camera },
              {
                id: 'camera-rehearsal',
                label: '编排',
                component: () => <CameraRehearsalPanel sceneId={sceneId} />,
                icon: Clapperboard,
              },
            ]
          : [
              {
                id: 'remount',
                label: '场地映射',
                component: () => <RemountPanel sceneId={sceneId} />,
                icon: ScanLine,
              },
            ]
    const tabs = [
      ...entries,
      { id: 'settings', label: '设置', component: emptyPanel, icon: Settings },
    ]
    if (isMobile)
      tabs.splice(group === 'remount' ? 1 : 0, 0, {
        id: 'stage-overview',
        label: '舞台',
        component: () => <StageOverviewPanel sceneId={sceneId} />,
        icon: Layers,
      })
    return tabs.map(({ icon: Icon, ...entry }) => ({
      ...entry,
      icon: <Icon className="h-6 w-6" />,
      mobileIcon: <Icon className="h-5 w-5" />,
      mobileDefaultSnap: 0.5,
      onSelect: () => {
        if (!openStudioPanel(entry.id)) return false
        setSelectedGroup(group)
        return true
      },
    }))
  }, [group, sceneId, isMobile])

  const onGroupChange = (next: StudioGroup) => {
    const panel = { space: 'build', director: 'camera-studio', remount: 'remount' }[next]
    if (openStudioPanel(panel)) setSelectedGroup(next)
  }
  return { group, onGroupChange, sidebarTabs }
}
