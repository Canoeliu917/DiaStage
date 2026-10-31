'use client'

import { useScene } from '@pascal-app/core'
import type { SaveStatus } from '@pascal-app/editor'
import { useCallback, useEffect, useState } from 'react'
import { localAccountStorageKey } from '@/lib/auth/local-account'
import { openStudioPanel } from '../studio-navigation'
import './stage-first-visit.css'

export function StageFirstVisit({
  ready,
  readOnly,
  saveStatus,
}: {
  ready: boolean
  readOnly: boolean
  saveStatus: SaveStatus
}) {
  const [visible, setVisible] = useState(false)
  const [saveRequested, setSaveRequested] = useState(false)
  const hasProp = useScene((state) =>
    Object.values(state.nodes).some((node) => node.type === 'item'),
  )
  const dismiss = useCallback(() => {
    setVisible(false)
    try {
      localStorage.setItem(localAccountStorageKey('diastage:set-first-visit'), 'closed')
    } catch {
      // The guide can still be dismissed for this visit when storage is unavailable.
    }
  }, [])
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
  useEffect(() => {
    if (!visible) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    const saved = () => setSaveRequested(true)
    window.addEventListener('keydown', escape)
    window.addEventListener('scene:retry-save', saved)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('scene:retry-save', saved)
    }
  }, [visible, dismiss])
  useEffect(() => {
    if (visible && saveRequested && hasProp && ['local-saved', 'saved'].includes(saveStatus))
      dismiss()
  }, [visible, saveRequested, hasProp, saveStatus, dismiss])
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
      <button type="button" aria-label="知道了，关闭置景引导" onClick={dismiss}>
        知道了
      </button>
    </nav>
  )
}

export function StageTaskCards({
  onPrefill,
  disabled = false,
}: {
  onPrefill: (text: string) => void
  disabled?: boolean
}) {
  return (
    <div className="stage-task-cards" role="group" aria-label="开始置景">
      <button type="button" disabled={disabled} onClick={() => onPrefill('在舞台中区放一把硬椅。')}>
        <strong>放一件道具</strong>
        <span>从一把硬椅开始，先看台位。</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPrefill('在舞台中区放一张圆桌，桌子两侧各放一把硬椅。')}
      >
        <strong>描述一套布景</strong>
        <span>描述一张圆桌、两把椅子的摆放。</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onPrefill('请根据我附上的照片或剧本，用现有道具生成排练布景，保留主要位置关系。')
        }
      >
        <strong>导入照片或剧本</strong>
        <span>用 + 添加文件，再发送生成布景。</span>
      </button>
    </div>
  )
}
