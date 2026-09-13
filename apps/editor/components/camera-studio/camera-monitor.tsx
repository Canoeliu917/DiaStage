'use client'

import { useEditor } from '@pascal-app/editor'
import { useEffect, useRef } from 'react'
import { useCameraStudio } from './store'

export const MONITOR_WIDTH = 320
export const MONITOR_HEIGHT = 180

export function CameraMonitor({ enabled, className }: { enabled: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const visible = useCameraStudio((state) => state.monitorVisible)
  const viewVisible = useEditor(
    (state) =>
      !state.isFirstPersonMode &&
      !state.isCaptureMode &&
      !state.isPreviewMode &&
      state.viewMode !== '2d' &&
      state.workspaceMode === 'edit',
  )
  const storedStatus = useCameraStudio((state) => state.monitorStatus)
  const storedMessage = useCameraStudio((state) => state.monitorMessage)
  const busy = useCameraStudio((state) => state.playing || state.previewing || state.recording)
  const status = storedStatus
  const message = storedMessage
  const name = useCameraStudio(
    (state) => state.project.shots.find((shot) => shot.id === state.selectedShotId)?.name,
  )
  useEffect(() => {
    if (!enabled || !visible || !viewVisible || busy) return
    const element = canvas.current
    useCameraStudio.getState().setMonitorCanvas(element)
    return () => {
      if (useCameraStudio.getState().monitorCanvas === element)
        useCameraStudio.getState().setMonitorCanvas(null)
    }
  }, [enabled, visible, viewVisible, busy])
  if (!enabled || !visible || !viewVisible || busy) return null
  return (
    <section
      className={className}
      aria-label="独立摄像机监看"
      style={{
        width: 'min(360px, 100%)',
        border: '1px solid #494949',
        borderRadius: 4,
        overflow: 'hidden',
        background: '#141414',
        color: '#ededed',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          padding: '7px 10px',
          fontSize: 12,
        }}
      >
        <span
          title={name}
          style={{
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name ?? '选择摄像机'}
        </span>
        <span style={{ flexShrink: 0 }}>
          {status === 'live'
            ? '实时监看 · 16:9'
            : status === 'waiting'
              ? '等待画面'
              : status === 'error' || status === 'unavailable'
                ? '监看不可用'
                : '监看已暂停'}
        </span>
        <button
          type="button"
          aria-label="关闭监看"
          onClick={() => useCameraStudio.getState().setMonitorVisible(false)}
          style={{
            background: 'transparent',
            border: 0,
            color: 'inherit',
            cursor: 'pointer',
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>
      <div style={{ position: 'relative', aspectRatio: '16 / 9' }}>
        <canvas
          ref={canvas}
          width={MONITOR_WIDTH}
          height={MONITOR_HEIGHT}
          aria-label="所选摄像机实时画面"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            opacity: status === 'live' ? 1 : 0,
          }}
        />
        {status !== 'live' && (
          <p
            role="status"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              alignContent: 'center',
              margin: 0,
              padding: 20,
              textAlign: 'center',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {message || '选择一个机位，并打开编辑器的三维视图'}
          </p>
        )}
      </div>
    </section>
  )
}
