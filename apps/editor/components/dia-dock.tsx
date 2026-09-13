'use client'

import { LockKeyhole, LockKeyholeOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import './workspace-layout.css'

const MIN_WIDTH = 300
const MAX_WIDTH = 640

export function DiaDock({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const [layout, setLayout] = useState({ width: 370, open: true, locked: false })
  const [hydrated, setHydrated] = useState(false)
  const drag = useRef<{
    startX: number
    width: number
    pointerId: number
    target: HTMLDivElement
  } | null>(null)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('diastage:dia-dock') ?? 'null')
      if (stored && typeof stored === 'object')
        setLayout({
          width:
            typeof stored.width === 'number' && Number.isFinite(stored.width)
              ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, stored.width))
              : 370,
          open: stored.open !== false,
          locked: stored.locked === true,
        })
    } catch {}
    setHydrated(true)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem('diastage:dia-dock', JSON.stringify(layout))
    } catch {}
  }, [layout, hydrated])

  const finish = useCallback((cancel: boolean) => {
    const active = drag.current
    if (!active) return
    drag.current = null
    if (cancel) setLayout((previous) => ({ ...previous, width: active.width }))
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId)
  }, [])
  useEffect(() => {
    if (hidden || !layout.open || layout.locked) finish(true)
  }, [hidden, layout.open, layout.locked, finish])
  useEffect(
    () => () => {
      const active = drag.current
      drag.current = null
      if (active?.target.hasPointerCapture(active.pointerId))
        active.target.releasePointerCapture(active.pointerId)
    },
    [],
  )

  function resize(width: number) {
    setLayout((previous) => ({
      ...previous,
      width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth / 2, width)),
    }))
  }

  return (
    <>
      {!hidden && !layout.open && (
        <button
          type="button"
          className="dia-restore-tab"
          aria-label="展开 Dia 对话框"
          onClick={() => setLayout((previous) => ({ ...previous, open: true }))}
        >
          <PanelRightOpen size={16} /> Dia
        </button>
      )}
      <aside
        className="dia-dock dia-resizable-dock"
        hidden={hidden || !layout.open}
        aria-label="Dia 对话工作区"
        data-locked={layout.locked}
        style={{ '--dia-dock-width': `${layout.width}px` } as CSSProperties}
      >
        <div className="dia-dock-controls">
          <button
            type="button"
            aria-label={`${layout.locked ? '解锁' : '锁定'} Dia 布局`}
            aria-pressed={layout.locked}
            title={layout.locked ? '解锁后可调整宽度或收起' : '锁定宽度和显示，对话仍可操作'}
            onClick={() => setLayout((previous) => ({ ...previous, locked: !previous.locked }))}
          >
            {layout.locked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}
          </button>
          <button
            type="button"
            aria-label="收起 Dia 对话框"
            title="收起到右上角"
            disabled={layout.locked}
            onClick={() => {
              if (!layout.locked) setLayout((previous) => ({ ...previous, open: false }))
            }}
          >
            <PanelRightClose size={17} />
          </button>
        </div>
        <div
          className="dia-dock-resizer"
          role="separator"
          aria-label="调整 Dia 宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={Math.round(layout.width)}
          aria-disabled={layout.locked}
          tabIndex={layout.locked ? -1 : 0}
          onPointerDown={(event) => {
            if (layout.locked || event.button !== 0 || drag.current) return
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.focus()
            drag.current = {
              startX: event.clientX,
              width: layout.width,
              pointerId: event.pointerId,
              target: event.currentTarget,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const active = drag.current
            if (!active || active.pointerId !== event.pointerId) return
            event.preventDefault()
            resize(active.width + active.startX - event.clientX)
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId === event.pointerId) finish(false)
          }}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => finish(true)}
          onKeyDown={(event) => {
            if (layout.locked) return
            if (event.key === 'Escape') {
              event.preventDefault()
              finish(true)
              return
            }
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            event.stopPropagation()
            resize(
              event.key === 'Home'
                ? MIN_WIDTH
                : event.key === 'End'
                  ? MAX_WIDTH
                  : layout.width + (event.key === 'ArrowLeft' ? 20 : -20),
            )
          }}
        >
          <span />
        </div>
        {children}
      </aside>
    </>
  )
}
