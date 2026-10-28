'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localAccountStorageKey } from '@/lib/auth/local-account'
import { openStudioPanel } from '../studio-navigation'
import './stage-first-visit.css'

export function StageFirstVisit({ ready, readOnly }: { ready: boolean; readOnly: boolean }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ready) return
    try {
      setVisible(
        localStorage.getItem(localAccountStorageKey('diastage:set-first-visit')) !== 'closed',
      )
    } catch {
      setVisible(true)
    }
  }, [ready])
  if (!visible) return null
  return (
    <nav className="stage-first-visit" aria-label="置景三步">
      <ol>
        <li>
          <button
            type="button"
            disabled={!ready || readOnly}
            onClick={() => openStudioPanel('items')}
          >
            <span>1</span>放景
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={!ready || readOnly}
            onClick={() => openStudioPanel('build')}
          >
            <span>2</span>调整
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={!ready || readOnly}
            onClick={() => window.dispatchEvent(new CustomEvent('scene:retry-save'))}
          >
            <span>3</span>保存
          </button>
        </li>
      </ol>
      <button
        type="button"
        aria-label="关闭置景引导"
        onClick={() => {
          setVisible(false)
          try {
            localStorage.setItem(localAccountStorageKey('diastage:set-first-visit'), 'closed')
          } catch {
            // The guide can still be dismissed for this visit when storage is unavailable.
          }
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </nav>
  )
}

export function StageTaskCards({
  onPlace,
  onDescribe,
  onImport,
  disabled = false,
}: {
  onPlace: () => void
  onDescribe: () => void
  onImport: () => void
  disabled?: boolean
}) {
  return (
    <div className="stage-task-cards" role="group" aria-label="开始置景">
      <button type="button" disabled={disabled} onClick={onPlace}>
        <strong>放一件道具</strong>
        <span>打开道具库，在舞台上落位。</span>
      </button>
      <button type="button" disabled={disabled} onClick={onDescribe}>
        <strong>描述一套布景</strong>
        <span>描述一张圆桌、两把椅子的摆放。</span>
      </button>
      <button type="button" disabled={disabled} onClick={onImport}>
        <strong>导入照片或剧本</strong>
        <span>选取文件，确认后再采用布景。</span>
      </button>
    </div>
  )
}
