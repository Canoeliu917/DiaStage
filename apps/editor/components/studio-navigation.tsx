'use client'

import { useEditor, useIsMobile, useSidebarStore } from '@pascal-app/editor'
import { Hammer, Layers, ScanLine } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { migrateStudioPanel, type StudioGroup } from '@/lib/studio-workspaces'
import { useCameraStudio } from './camera-studio/store'
import { StudioWordmark } from './studio-wordmark'
import { useRehearsalPlayback } from './theatre/state'

export type { StudioGroup } from '@/lib/studio-workspaces'

export function openStudioPanel(panel: string): boolean {
  panel = migrateStudioPanel(panel)
  const editor = useEditor.getState()
  if (editor.isFirstPersonMode || editor.isCaptureMode) return false
  useCameraStudio.getState().stop()
  useRehearsalPlayback.getState().stop()
  editor.setPreviewMode(false)
  if (panel !== 'build' && panel !== 'items') editor.setMode('select')
  editor.setWorkspaceMode('edit')
  editor.setActiveSidebarPanel(panel)
  useSidebarStore.getState().setIsCollapsed(false)
  return true
}

export function StudioNavigation({
  sceneName,
  actions,
  group,
  onGroupChange,
}: {
  sceneName: string
  actions?: ReactNode
  group: StudioGroup
  onGroupChange: (group: StudioGroup) => void
}) {
  const exclusive = useEditor((s) => s.isFirstPersonMode || s.isCaptureMode)
  const mobile = useIsMobile()
  const menu = (
    <>
      {actions}
      <Link href="/scenes">
        <Layers size={16} />
        剧目库
      </Link>
    </>
  )

  return (
    <header className="studio-navigation">
      <div className="studio-identity">
        <Image
          className="studio-brand-mark"
          src="/diastage-mark.svg"
          alt="咫台"
          width={36}
          height={36}
        />
        <div>
          <StudioWordmark />
          <span className="studio-slogan">Stage Build &amp; Remount Preview</span>
        </div>
      </div>
      <nav className="studio-workspaces" aria-label="工作区">
        {[
          { id: 'set' as const, label: '置景', icon: Hammer },
          { id: 'remount' as const, label: '复台', icon: ScanLine },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={group === id}
            disabled={exclusive}
            onClick={() => {
              onGroupChange(id)
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className="studio-navigation-actions">
        <span className="studio-project-name" title={sceneName}>
          {sceneName}
        </span>
        {exclusive && (
          <button
            type="button"
            onClick={() => {
              useEditor.getState().setFirstPersonMode(false)
              useEditor.getState().setCaptureMode(false)
            }}
          >
            退出取景
          </button>
        )}
        {mobile ? (
          <details className="studio-mobile-menu">
            <summary>更多</summary>
            <div>
              <p>舞台置景与复台预览</p>
              <button type="button" onClick={() => useEditor.getState().setViewMode('3d')}>
                三维舞台
              </button>
              <button type="button" onClick={() => useEditor.getState().setViewMode('2d')}>
                平面图
              </button>
              {menu}
            </div>
          </details>
        ) : (
          menu
        )}
      </div>
    </header>
  )
}
