'use client'

import { type SidebarTab, useEditor, useIsMobile } from '@pascal-app/editor'
import {
  Camera,
  Eye,
  Hammer,
  History,
  MapPin,
  Package,
  ScanLine,
  SlidersHorizontal,
  Users,
  Video,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { BETA_EXPERT_MEDIA_ENABLED } from '@/lib/beta-capabilities'
import { observeRehearsalFeedback } from '@/lib/rehearsal-intelligence/authority'
import { migrateStudioGroup, migrateStudioPanel, type StudioGroup } from '@/lib/studio-workspaces'
import { StageOverviewPanel } from './stage-overview-panel'
import { openStudioPanel } from './studio-navigation'
import './studio-sidebar.css'

const SimulationPanel = dynamic(() =>
  import('./theatre/simulation-panel').then((m) => m.SimulationPanel),
)
const VenuePanel = dynamic(() => import('./theatre/simulation-panel').then((m) => m.VenuePanel))
const VersionsPanel = dynamic(() => import('./theatre/versions-panel').then((m) => m.VersionsPanel))
const CameraPanel = dynamic(() =>
  BETA_EXPERT_MEDIA_ENABLED
    ? import('./camera-studio/panel').then((m) => m.CameraPanel)
    : import('./camera-studio/observation-panel').then((m) => m.CameraObservationPanel),
)
const RecordPanel = dynamic(() => import('./theatre/observe-panel').then((m) => m.RecordPanel))
const ObservePanel = dynamic(() => import('./theatre/observe-panel').then((m) => m.ObservePanel))
const CameraRehearsalPanel = dynamic(() =>
  import('./camera-rehearsal-panel').then((m) => m.CameraRehearsalPanel),
)
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
  const migratedPanel = migrateStudioPanel(activePanel)
  const panel =
    !BETA_EXPERT_MEDIA_ENABLED && ['record', 'camera-rehearsal'].includes(migratedPanel)
      ? 'observe'
      : migratedPanel
  const group: StudioGroup =
    panel === 'remount' || panel === 'versions'
      ? 'remount'
      : [
            'simulation',
            'display',
            'observe',
            'record',
            'camera-rehearsal',
            'stage-cameras',
          ].includes(panel)
        ? 'rehearse'
        : selectedGroup

  useEffect(() => {
    if (activePanel !== panel) openStudioPanel(panel)
  }, [activePanel, panel])
  useEffect(() => setSelectedGroup(group), [group])

  const sidebarTabs = useMemo<(SidebarTab & { component: React.ComponentType })[]>(() => {
    const propertyEntries =
      group === 'set'
        ? [
            {
              id: 'build',
              label: '布景调整',
              component: () => (
                <section className="stage-manual">
                  <h2>布景属性</h2>
                  <p>选中布景后调整位置、角度与折叠。</p>
                  <StageProperties />
                </section>
              ),
              icon: Hammer,
            },
          ]
        : group === 'rehearse'
          ? [
              {
                id: 'simulation',
                label: '模拟排演',
                component: () => <SimulationPanel sceneId={sceneId} />,
                icon: Users,
              },
              { id: 'display', label: '显示', component: DisplayPanel, icon: SlidersHorizontal },
              { id: 'observe', label: '观察', component: ObservePanel, icon: Eye },
              { id: 'stage-cameras', label: '舞台机位', component: CameraPanel, icon: Camera },
              ...(BETA_EXPERT_MEDIA_ENABLED
                ? [
                    {
                      id: panel === 'camera-rehearsal' ? 'camera-rehearsal' : 'record',
                      label: '记录',
                      component:
                        panel === 'camera-rehearsal'
                          ? () => <CameraRehearsalPanel sceneId={sceneId} />
                          : RecordPanel,
                      icon: Video,
                    },
                  ]
                : []),
            ]
          : [
              {
                id: 'versions',
                label: '排演版本',
                component: () => <VersionsPanel sceneId={sceneId} />,
                icon: History,
              },
              {
                id: 'remount',
                label: '场地映射',
                component: () => <RemountPanel sceneId={sceneId} />,
                icon: ScanLine,
              },
            ]
    if (group !== 'set')
      propertyEntries.push({
        id: 'build',
        label: '布景属性',
        component: () => (
          <section className="stage-manual">
            <StageProperties />
          </section>
        ),
        icon: Hammer,
      })
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
      if (openStudioPanel({ set: 'items', rehearse: 'simulation', remount: 'versions' }[next]))
        setSelectedGroup(next)
    },
  }
}
