'use client'

import { type SidebarTab, useEditor, useIsMobile } from '@pascal-app/editor'
import { Eye, Hammer, History, MapPin, Package, ScanLine, SlidersHorizontal } from 'lucide-react'
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

  const sidebarTabs = useMemo<(SidebarTab & { component: React.ComponentType })[]>(() => {
    const propertyEntries = [
      {
        id: 'build',
        label: '布景属性',
        icon: Hammer,
        component: () => (
          <section className="stage-manual">
            <StageProperties />
          </section>
        ),
      },
      { id: 'view', label: '视图', icon: Eye, component: () => <ViewPanel sceneId={sceneId} /> },
      { id: 'display', label: '显示', icon: SlidersHorizontal, component: DisplayPanel },
      {
        id: 'versions',
        label: '版本 / 历史',
        icon: History,
        component: () => <VersionsPanel sceneId={sceneId} />,
      },
      ...(group === 'remount'
        ? [
            {
              id: 'remount',
              label: '映射预览',
              icon: ScanLine,
              component: () => <RemountPanel sceneId={sceneId} />,
            },
          ]
        : []),
    ]
    const propertyPanel = propertyEntries.find((entry) => entry.id === panel) ?? propertyEntries[0]!
    const Properties = propertyPanel.component
    const entries = [
      {
        id: 'theatre-venue',
        label: '场地',
        component: () => <VenuePanel initialExpanded />,
        icon: MapPin,
      },
      { id: 'items', label: '资产', component: StageLibrary, icon: Package },
      {
        id: propertyPanel.id,
        label: '属性',
        component: () => (
          <section className="studio-properties-dock" aria-label="属性">
            {propertyEntries.length > 1 && (
              <nav className="studio-property-tabs" aria-label="工作区属性">
                {propertyEntries.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    aria-pressed={propertyPanel.id === entry.id}
                    onClick={() => openStudioPanel(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </nav>
            )}
            <Properties />
          </section>
        ),
        icon: SlidersHorizontal,
      },
    ]
    if (isMobile)
      entries.push({
        id: 'stage-overview',
        label: '场景',
        component: () => <StageOverviewPanel sceneId={sceneId} />,
        icon: MapPin,
      })
    return entries.map(({ icon: Icon, ...entry }) => ({
      ...entry,
      icon: <Icon className="h-5 w-5" />,
      mobileIcon: <Icon className="h-5 w-5" />,
      mobileDefaultSnap: 0.5,
      onSelect: () => {
        if (!openStudioPanel(entry.id)) return false
        setSelectedGroup(group)
        return true
      },
    }))
  }, [group, panel, sceneId, isMobile])
  return {
    group,
    sidebarTabs,
    sidebarTopSlot: <StageOverviewPanel sceneId={sceneId} />,
    onGroupChange: (input: StudioGroup) => {
      const next = migrateStudioGroup(input)
      if (openStudioPanel({ set: 'items', rehearse: 'items', remount: 'remount' }[next]))
        setSelectedGroup(next)
    },
  }
}
