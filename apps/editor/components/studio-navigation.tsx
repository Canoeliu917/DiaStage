'use client'

import { useEditor, useSidebarStore } from '@pascal-app/editor'
import { Clapperboard, Hammer, Layers, ScanLine } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useCameraStudio } from './camera-studio/store'
import { StudioWordmark } from './studio-wordmark'

export type StudioGroup = 'space' | 'director' | 'remount'

export function openStudioPanel(panel: string): boolean {
  const editor = useEditor.getState()
  if (editor.isFirstPersonMode || editor.isCaptureMode) return false
  useCameraStudio.getState().stop()
  editor.setPreviewMode(false)
  if (['stage-overview', 'camera-studio', 'camera-rehearsal', 'picture', 'remount'].includes(panel))
    editor.setMode('select')
  editor.setWorkspaceMode(panel === 'camera-rehearsal' ? 'studio' : 'edit')
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
          <span className="studio-slogan">AI Dramaturgy &amp; Spatial Previs</span>
        </div>
      </div>
      <nav className="studio-workspaces" aria-label="工作区">
        {[
          { id: 'space' as const, label: '搭台', icon: Hammer },
          { id: 'director' as const, label: '看台', icon: Clapperboard },
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
        {actions}
        <Link href="/scenes">
          <Layers size={16} />
          场景库
        </Link>
      </div>
    </header>
  )
}
