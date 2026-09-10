'use client'

import { type SidebarTab, useEditor, useIsMobile } from '@pascal-app/editor'
import {
  Camera,
  Eye,
  Hammer,
  History,
  Layers,
  Mic,
  Package,
  ScanLine,
  SlidersHorizontal,
  Users,
  Video,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { migrateStudioGroup, migrateStudioPanel, type StudioGroup } from '@/lib/studio-workspaces'
import { StageOverviewPanel } from './stage-overview-panel'
import { openStudioPanel } from './studio-navigation'

const SimulationPanel = dynamic(() =>
  import('./theatre/simulation-panel').then((m) => m.SimulationPanel),
)
const VenuePanel = dynamic(() => import('./theatre/simulation-panel').then((m) => m.VenuePanel))
const VersionsPanel = dynamic(() => import('./theatre/versions-panel').then((m) => m.VersionsPanel))
const CameraPanel = dynamic(() => import('./camera-studio/panel').then((m) => m.CameraPanel))
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
const StageCommandInput = dynamic(() =>
  import('./stage-entry/command-input').then((m) => m.StageCommandInput),
)
export function useStudioSidebar(sceneId: string) {
  const mobile = useIsMobile()
  const activePanel = useEditor((s) => s.activeSidebarPanel)
  const [selectedGroup, setSelectedGroup] = useState<StudioGroup>('set')
  const panel = migrateStudioPanel(activePanel)
  const group: StudioGroup =
    panel === 'remount' || panel === 'versions'
      ? 'remount'
      : ['simulation', 'display', 'observe', 'record', 'camera-rehearsal'].includes(panel)
        ? 'rehearse'
        : ['theatre-venue', 'build', 'items', 'stage-cameras', 'stage-command'].includes(panel)
          ? 'set'
          : selectedGroup

  useEffect(() => {
    if (activePanel !== panel) openStudioPanel(panel)
  }, [activePanel, panel])

  const sidebarTabs = useMemo<(SidebarTab & { component: React.ComponentType })[]>(() => {
    const entries =
      group === 'set'
        ? [
            { id: 'theatre-venue', label: '舞台与场地', component: VenuePanel, icon: Layers },
            {
              id: 'build',
              label: '布景调整',
              component: () => (
                <section className="stage-manual">
                  <h2>布景调整</h2>
                  <p>选中舞台上的布景，调整台位、尺寸与角度。</p>
                  <StageProperties />
                </section>
              ),
              icon: Hammer,
            },
            { id: 'items', label: '舞台库', component: StageLibrary, icon: Package },
            { id: 'stage-cameras', label: '舞台镜头', component: CameraPanel, icon: Camera },
            {
              id: 'stage-command',
              label: '舞台口令',
              component: () => (
                <section className="stage-command-panel">
                  <h2>舞台口令</h2>
                  <StageCommandInput sceneId={sceneId} />
                </section>
              ),
              icon: Mic,
            },
          ]
        : group === 'rehearse'
          ? [
              { id: 'simulation', label: '模拟排演', component: SimulationPanel, icon: Users },
              { id: 'display', label: '显示', component: DisplayPanel, icon: SlidersHorizontal },
              { id: 'observe', label: '观察', component: ObservePanel, icon: Eye },
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
          : [
              { id: 'versions', label: '排演版本', component: VersionsPanel, icon: History },
              {
                id: 'remount',
                label: '场地映射',
                component: () => <RemountPanel sceneId={sceneId} />,
                icon: ScanLine,
              },
            ]
    if (mobile)
      entries.unshift({
        id: 'stage-overview',
        label: '舞台总览',
        component: () => <StageOverviewPanel sceneId={sceneId} />,
        icon: Layers,
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
  }, [group, mobile, panel, sceneId])
  return {
    group,
    sidebarTabs,
    onGroupChange: (input: StudioGroup) => {
      const next = migrateStudioGroup(input)
      if (openStudioPanel({ set: 'items', rehearse: 'simulation', remount: 'versions' }[next]))
        setSelectedGroup(next)
    },
  }
}
