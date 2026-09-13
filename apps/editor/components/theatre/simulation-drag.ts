'use client'

import { useScene } from '@pascal-app/core'
import { useInteractionScope } from '@pascal-app/editor'
import { useEffect, useRef } from 'react'
import type { Vec3 } from '@/lib/theatre/schema'
import { moveSimulationPerformer, readStageDocument } from '@/lib/theatre/simulation-store'
import { useSimulationSelection } from './simulation-panel'

/** Characters are document data, not scene nodes; keep their draft outside the scene graph. */
export function useSimulationDrag(enabled: boolean) {
  const cancel = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!enabled) cancel.current?.()
    return () => cancel.current?.()
  }, [enabled])
  return (
    event: PointerEvent,
    id: string,
    project: (x: number, y: number) => Vec3 | null,
    release: () => void = () => {},
  ) => {
    if (
      !enabled ||
      !event.isPrimary ||
      event.button !== 0 ||
      useScene.getState().readOnly ||
      useInteractionScope.getState().scope.kind !== 'idle'
    ) {
      release()
      return
    }
    const document = readStageDocument(),
      nodes = useScene.getState().nodes
    const performer = document?.rehearsalSimulation.performers.find((p) => p.id === id)
    const start = project(event.clientX, event.clientY)
    if (!document || !performer || performer.stageLocked || !start) {
      release()
      return
    }
    event.preventDefault()
    cancel.current?.()
    const target = event.target instanceof Element ? event.target : null
    target?.setPointerCapture(event.pointerId)
    const owner = `rehearsal:${id}`,
      abort = new AbortController()
    let moved = false
    const finish = () => {
      abort.abort()
      stop()
      if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
      release()
      useSimulationSelection.setState({ drag: null })
      useInteractionScope.getState().endIf((s) => s.kind === 'handle-drag' && s.nodeId === owner)
      cancel.current = null
    }
    const stop = useScene.subscribe((next) => {
      if (next.nodes !== nodes || next.readOnly) finish()
    })
    cancel.current = finish
    useSimulationSelection.setState({ selectedId: id })
    useInteractionScope
      .getState()
      .begin({ kind: 'handle-drag', nodeId: owner, handle: 'rehearsal-person' })
    const options = { signal: abort.signal }
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId !== event.pointerId) return
        if (Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 6 && !moved) return
        const point = project(e.clientX, e.clientY)
        if (!point) return
        const position: Vec3 = [
          performer.position[0] + point[0] - start[0],
          performer.position[1],
          performer.position[2] + point[2] - start[2],
        ]
        const v = document.venue
        if (
          !position.every(Number.isFinite) ||
          Math.abs(position[0] - v.origin[0]) + 0.25 > v.width / 2 ||
          Math.abs(position[2] - v.origin[2]) + 0.25 > v.depth / 2
        )
          return
        moved = true
        useSimulationSelection.setState({ drag: { id, position } })
      },
      options,
    )
    window.addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerId !== event.pointerId) return
        const draft = useSimulationSelection.getState().drag
        finish()
        if (moved && draft && useScene.getState().nodes === nodes) {
          try {
            moveSimulationPerformer(id, draft.position)
          } catch (error) {
            useSimulationSelection.setState({
              error: error instanceof Error ? error.message : '移动未完成，原站位保留',
            })
          }
        }
      },
      options,
    )
    window.addEventListener('pointercancel', finish, options)
    window.addEventListener('blur', finish, options)
    window.addEventListener('scroll', finish, { ...options, capture: true })
    window.document.addEventListener(
      'visibilitychange',
      () => {
        if (window.document.hidden) finish()
      },
      options,
    )
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') finish()
      },
      options,
    )
    // A second touch cancels the move so a pinch cannot accidentally commit a character.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerId !== event.pointerId) finish()
      },
      { ...options, capture: true },
    )
  }
}
