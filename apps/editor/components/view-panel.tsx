'use client'

import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useState } from 'react'
import type { ViewCommand } from '@/lib/rehearsal-intelligence/view-commands'
import { runViewCommand } from '@/lib/rehearsal-intelligence/view-runtime'

export function ViewPanel({ sceneId }: { sceneId: string }) {
  const [notice, setNotice] = useState('')
  const commands: [string, ViewCommand][] = [
    ['聚焦选中', { type: 'FRAME_SELECTION' }],
    ['俯视', { type: 'SET_VIEW', view: 'top' }],
    ['正面', { type: 'SET_VIEW', view: 'front' }],
    ['侧面', { type: 'SET_VIEW', view: 'stage-left' }],
    ['重置视图', { type: 'RESET_VIEW' }],
  ]
  return (
    <section className="theatre-panel" aria-label="视图">
      <h2>视图 / View</h2>
      <div className="th-buttons">
        <button
          type="button"
          onClick={() => {
            useEditor.getState().setViewMode('3d')
            useViewer.getState().setCameraMode('perspective')
          }}
        >
          透视
        </button>
        {commands.map(([label, command]) => (
          <button
            type="button"
            key={label}
            onClick={() => setNotice(runViewCommand(sceneId, command))}
          >
            {label}
          </button>
        ))}
      </div>
      <p>中键环绕；Shift / Alt＋中键平移；滚轮缩放。WASD 移动视角，Q 下降，E 上升。</p>
      <p>在 Dia 中说“保存当前视角为全景”或“召回视角全景”，保留与恢复本机视图。</p>
      <p role="status">{notice}</p>
    </section>
  )
}
