'use client'

import { type SidebarTab, useEditor, useIsMobile } from '@pascal-app/editor'
import { Layers, Package, SlidersHorizontal } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { observeRehearsalFeedback } from '@/lib/rehearsal-intelligence/authority'
import { migrateStudioGroup, migrateStudioPanel, type StudioGroup } from '@/lib/studio-workspaces'
import { StageOverviewPanel } from './stage-overview-panel'
import { openStudioPanel } from './studio-navigation'
import './studio-sidebar.css'

const VenuePanel = dynamic(() => import('./theatre/simulation-panel').then((m) => m.VenuePanel))
const VersionsPanel = dynamic(() => import('./theatre/versions-panel').then((m) => m.VersionsPanel))
const ViewPanel = dynamic(() => import('./view-panel').then((m) => m.ViewPanel))
const RemountPanel = dynamic(() => import('./remount-panel').then((m) => m.RemountPanel))
const DisplayPanel = dynamic(() => import('./viewer-toolbar').then((m) => m.StudioPicturePanel))
const StageLibrary = dynamic(() =>
  import('./stage-entry/manual-stage-panel').then((m) => m.StageLibraryPanel),
)
const StageProperties = dynamic(() =>
  import('./stage-entry/manual-stage-panel').then((m) => m.StageObjectPanel),
)

function AssetsDock() {
  return <section className="studio-assets-dock"><VenuePanel /><StageLibrary /></section>
}

function PropertiesDock() {
  return <section className="stage-manual"><StageProperties /></section>
}

export function useStudioSidebar(sceneId: string) {
  const isMobile = useIsMobile()
  useEffect(() => observeRehearsalFeedback(sceneId), [sceneId])
  const activePanel = useEditor((s) => s.activeSidebarPanel)
  const [selectedGroup, setSelectedGroup] = useState<StudioGroup>('set')
  const panel = migrateStudioPanel(activePanel)
  const group: StudioGroup = panel === 'remount' ? 'remount' : selectedGroup

  useEffect(() => {
    if (activePanel !== panel) openStudioPanel(panel)
  }, [activePanel, panel])
  useEffect(() => setSelectedGroup(group), [group])

  const sidebarTabs = useMemo<(SidebarTab & { component: React.ComponentType })[]>(() => [
    { id: 'items', label: '资产', icon: <Package className="h-5 w-5" />, component: AssetsDock },
    ...(isMobile ? [{ id: 'stage-overview', label: '场景', icon: <Layers className="h-5 w-5" />,
      component: () => <StageOverviewPanel sceneId={sceneId} /> }] : []),
    { id: 'build', label: '属性', icon: <SlidersHorizontal className="h-5 w-5" />, component: PropertiesDock },
    { id: 'theatre-venue', label: '场地', hidden: true, component: () => <VenuePanel initialExpanded /> },
    { id: 'versions', label: '版本 / 历史', hidden: true, component: () => <VersionsPanel sceneId={sceneId} /> },
    { id: 'view', label: '视图', hidden: true, component: () => <ViewPanel sceneId={sceneId} /> },
    { id: 'display', label: '显示', hidden: true, component: DisplayPanel },
    { id: 'remount', label: '映射预览', hidden: true, component: () => <RemountPanel sceneId={sceneId} /> },
  ].map((entry) => ({
    ...entry,
    mobileIcon: 'icon' in entry ? entry.icon : undefined,
    mobileDefaultSnap: 0.5,
    onSelect: () => {
      const opened = openStudioPanel(entry.id)
      if (opened && !('hidden' in entry && entry.hidden)) setSelectedGroup('set')
      return opened
    },
  })), [sceneId, isMobile])

  return {
    group,
    sidebarTabs,
    sidebarTopSlot: isMobile ? undefined : <StageOverviewPanel sceneId={sceneId} />,
    onGroupChange: (input: StudioGroup) => {
      const next = migrateStudioGroup(input)
      if (openStudioPanel({ set: 'items', rehearse: 'items', remount: 'remount' }[next]))
        setSelectedGroup(next)
    },
  }
}
