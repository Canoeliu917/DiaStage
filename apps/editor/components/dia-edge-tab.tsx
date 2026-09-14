'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clampDiaTabY, DIA_EDGE_SIZE, DIA_TABLET_QUERY, type UiRect } from '../lib/dia-touch-layout'

export function useDiaTouchViewport() {
  const [viewport, setViewport] = useState<UiRect | null>(null)
  useEffect(() => {
    const media = matchMedia(DIA_TABLET_QUERY)
    const safe = document.createElement('div')
    safe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))'
    document.body.append(safe)
    const update = () => {
      if (!media.matches) {
        setViewport(null)
        return
      }
      const style = getComputedStyle(safe)
      const vv = window.visualViewport
      setViewport({
        left: (vv?.offsetLeft ?? 0) + Number.parseFloat(style.paddingLeft),
        top: (vv?.offsetTop ?? 0) + Number.parseFloat(style.paddingTop),
        width:
          (vv?.width ?? innerWidth) -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight),
        height:
          (vv?.height ?? innerHeight) -
          Number.parseFloat(style.paddingTop) -
          Number.parseFloat(style.paddingBottom),
      })
    }
    update()
    media.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      safe.remove()
      media.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [])
  return viewport
}

function viewControls() {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[aria-label="三维"], [aria-label="平面"], [aria-label="分屏"], [aria-label="视口布局"]',
    ),
  ]
}

export function DiaEdgeTab({
  viewport,
  savedY,
  onSave,
  onExpand,
}: {
  viewport: UiRect
  savedY: number | null
  onSave: (y: number) => void
  onExpand: () => void
}) {
  const [exclusions, setExclusions] = useState<UiRect[]>(() =>
    viewControls().map((control) => control.getBoundingClientRect()),
  )
  const [draftY, setDraftY] = useState<number | null>(null)
  const drag = useRef<{ pointerId: number; startY: number; top: number; moved: boolean } | null>(
    null,
  )
  const suppressClick = useRef(false)
  const target = useRef<HTMLButtonElement>(null)
  const preferred = draftY ?? savedY ?? viewport.top + viewport.height / 3
  const y = clampDiaTabY(preferred, viewport, exclusions)
  const clamp = (value: number) =>
    clampDiaTabY(
      value,
      viewport,
      viewControls().map((control) => control.getBoundingClientRect()),
    )
  useLayoutEffect(() => {
    const update = () =>
      setExclusions(
        viewControls()
          .map((control) => control.getBoundingClientRect())
          .filter(
            (rect) => rect.top < viewport.top + viewport.height && rect.bottom > viewport.top,
          ),
      )
    update()
    const observer = new ResizeObserver(update)
    for (const control of viewControls()) observer.observe(control)
    const stage = document.querySelector('.dia-stage-layout')
    if (stage) observer.observe(stage)
    return () => observer.disconnect()
  }, [viewport])
  useEffect(
    () => () => {
      const button = target.current
      const id = drag.current?.pointerId
      if (button && id !== undefined && button.hasPointerCapture(id))
        button.releasePointerCapture(id)
    },
    [],
  )
  return (
    <button
      ref={target}
      type="button"
      className="dia-restore-tab dia-edge-tab"
      aria-label="展开 Dia 对话框"
      style={{
        left: viewport.left + viewport.width - DIA_EDGE_SIZE,
        top: y ?? viewport.top,
        visibility: y === null ? 'hidden' : undefined,
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.button !== 0 || drag.current || y === null) return
        event.preventDefault()
        suppressClick.current = false
        drag.current = { pointerId: event.pointerId, startY: event.clientY, top: y, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        event.preventDefault()
        if (Math.abs(event.clientY - active.startY) > 4) active.moved = true
        if (active.moved) setDraftY(clamp(active.top + event.clientY - active.startY))
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        drag.current = null
        suppressClick.current = active.moved
        const next = clamp(active.top + event.clientY - active.startY)
        if (active.moved && next !== null) onSave(next)
        setDraftY(null)
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={(event) => {
        event.stopPropagation()
        if (drag.current?.pointerId !== event.pointerId) return
        drag.current = null
        suppressClick.current = true
        setDraftY(null)
      }}
      onLostPointerCapture={() => {
        drag.current = null
        setDraftY(null)
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (!suppressClick.current || event.detail === 0) onExpand()
        suppressClick.current = false
      }}
    >
      Dia
    </button>
  )
}
