'use client'

import { Editor } from '@pascal-app/editor'
import Link from 'next/link'
import { CameraRehearsalSystem } from '@/components/camera-rehearsal-system'
import { CameraStudioDock } from '@/components/camera-studio/dock'
import { CameraStudioRuntime } from '@/components/camera-studio/runtime'
import { LightingFloorplan } from '@/components/lighting/floorplan'
import { LightingPersistence } from '@/components/lighting/persistence'
import { LightingSystem } from '@/components/lighting/system'
import { RemountPreviewSystem } from '@/components/remount-preview-system'
import { StageOverviewPanel } from '@/components/stage-overview-panel'
import { StudioNavigation } from '@/components/studio-navigation'
import { useStudioSidebar } from '@/components/studio-sidebar'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'

const PROJECT_ID = 'local-editor'

export default function Home() {
  const { group, onGroupChange, sidebarTabs } = useStudioSidebar(PROJECT_ID)
  return (
    <div className="studio-workspace" data-studio-group={group}>
      <LightingPersistence sceneId={PROJECT_ID} />
      <div className="min-h-0 flex-1">
        <Editor
          layoutVersion="v2"
          navbarSlot={
            <StudioNavigation
              sceneName="未命名场景"
              group={group}
              onGroupChange={onGroupChange}
              actions={<Link href="/scene/empty-table-camera">空桌示例</Link>}
            />
          }
          projectId={PROJECT_ID}
          viewerRuntimeSlot={
            <>
              <CameraStudioRuntime />
              <LightingSystem enabled={group === 'director'} sceneId={PROJECT_ID} />
            </>
          }
          viewerSceneSlot={<RemountPreviewSystem sceneId={PROJECT_ID} />}
          floorplanSceneSlot={
            <LightingFloorplan enabled={group === 'director'} sceneId={PROJECT_ID} />
          }
          studioSceneSlot={<CameraRehearsalSystem sceneId={PROJECT_ID} />}
          sidebarTabs={sidebarTabs}
          sidebarTopSlot={<StageOverviewPanel sceneId={PROJECT_ID} />}
          showPluginPanels={false}
          viewerToolbarLeft={<CommunityViewerToolbarLeft />}
          viewerToolbarRight={<CommunityViewerToolbarRight />}
        />
      </div>
      <CameraStudioDock sceneId={PROJECT_ID} />
    </div>
  )
}
