'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getNodeLock,
  runAsSingleSceneHistoryStep,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { stageToWorldPosition } from '@pascal-app/core/stage'
import { runUndo, useEditor, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Compass, Grid2X2, Undo2 } from 'lucide-react'
import { useEffect } from 'react'
import { create } from 'zustand'
import { currentStageContext, stageFrame } from '@/lib/stage/context'
import { rigidRotation } from '@/lib/stage/rigid-rotation'
import { setStageGrid, useStagePlacement } from './manual-stage-panel'

export const useStageRotation = create<{ armed: boolean }>(() => ({ armed: false }))
const isPlanSurface = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('svg')?.querySelector('[data-floorplan-scene]')

export function StagePlanNavigationRuntime() {
  useEffect(() => {
    const keys = new Set<string>()
    let pointer: { id: number; x: number } | null = null
    let turn = 0,
      frame = 0,
      previous = 0
    const tick = (now: number) => {
      const editor = useEditor.getState()
      const pose = editor.navigationSyncPose
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000))
      previous = now
      if (pose && (keys.size || turn) && useInteractionScope.getState().scope.kind === 'idle') {
        const horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
        const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
        const up = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))
        const speed =
          (Math.min(12, Math.max(1, pose.viewWidth * 0.5)) * dt) /
          Math.max(1, Math.hypot(horizontal, forward, up))
        const angle = pose.azimuth + turn
        turn = 0
        editor.publishNavigationSyncPose({
          source: '2d',
          azimuth: angle,
          viewWidth: pose.viewWidth,
          target: [
            pose.target[0] + (horizontal * Math.cos(angle) - forward * Math.sin(angle)) * speed,
            pose.target[1] + up * speed,
            pose.target[2] + (-horizontal * Math.sin(angle) - forward * Math.cos(angle)) * speed,
          ],
        })
      }
      frame = keys.size || pointer || turn ? requestAnimationFrame(tick) : 0
    }
    const start = () => {
      if (!frame) {
        previous = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
    const clear = () => {
      keys.clear()
      pointer = null
      turn = 0
      cancelAnimationFrame(frame)
      frame = 0
    }
    const down = (event: KeyboardEvent) => {
      const editor = useEditor.getState()
      if (
        !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code) ||
        !(editor.viewMode === '2d' || (editor.viewMode === 'split' && editor.isFloorplanHovered)) ||
        editor.isFirstPersonMode ||
        editor.isCaptureMode ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input,textarea,select,[contenteditable=true],[role=dialog]'))
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      keys.add(event.code)
      start()
    }
    const up = (event: KeyboardEvent) => {
      if (keys.delete(event.code)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    const pointerDown = (event: PointerEvent) => {
      if (
        event.button !== 2 ||
        !isPlanSurface(event.target) ||
        useStageRotation.getState().armed ||
        useInteractionScope.getState().scope.kind !== 'idle'
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      pointer = { id: event.pointerId, x: event.clientX }
      start()
    }
    const pointerMove = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return
      event.preventDefault()
      event.stopImmediatePropagation()
      turn += ((event.clientX - pointer.x) * Math.PI) / 360
      pointer.x = event.clientX
      start()
    }
    const pointerUp = (event: PointerEvent) => {
      if (pointer?.id === event.pointerId) {
        event.stopImmediatePropagation()
        pointer = null
      }
    }
    const focus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable=true]')
      )
        clear()
    }
    const unsubscribe = useEditor.subscribe((next, before) => {
      if (next.viewMode !== before.viewMode || next.isCaptureMode || next.isFirstPersonMode) clear()
    })
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointermove', pointerMove, true)
    window.addEventListener('pointerup', pointerUp, true)
    window.addEventListener('pointercancel', clear)
    window.addEventListener('blur', clear)
    window.addEventListener('focusin', focus)
    return () => {
      clear()
      unsubscribe()
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('pointermove', pointerMove, true)
      window.removeEventListener('pointerup', pointerUp, true)
      window.removeEventListener('pointercancel', clear)
      window.removeEventListener('blur', clear)
      window.removeEventListener('focusin', focus)
    }
  }, [])
  return null
}

export function StageGridToolbar() {
  const snap = useStagePlacement((state) => state.snap)
  const step = useEditor((state) => state.gridSnapStep)
  const view = useEditor((state) => state.viewMode)
  const showGrid = useViewer((state) => state.showGrid)
  const readOnly = useScene((state) => state.readOnly)
  return (
    <>
      <button type="button" onClick={() => runUndo()} disabled={readOnly} title="撤销 · Ctrl+Z">
        <Undo2 size={16} />
        撤销
      </button>
      {view !== '3d' && (
        <button
          type="button"
          aria-label="指南针：居中归正平面"
          onClick={() => {
            const venue = currentStageContext().venue
            if (!venue) return
            useEditor.getState().publishNavigationSyncPose({
              source: '2d',
              target: stageToWorldPosition({ x: 0, y: 0, z: venue.depthMeters / 2 }, stageFrame()),
              azimuth: 0,
              viewWidth: Math.max(venue.widthMeters, venue.depthMeters) * 1.3,
            })
          }}
        >
          <Compass size={16} />
          归正
        </button>
      )}
      <label className="stage-grid-size">
        <Grid2X2 size={16} />
        <select
          aria-label="网格格距"
          value={step}
          onChange={(event) => setStageGrid(Number(event.target.value) as typeof step)}
        >
          {[0.05, 0.1, 0.25, 0.5].map((value) => (
            <option key={value} value={value}>
              每格 {value * 100} cm
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-pressed={showGrid}
        onClick={() => useViewer.getState().setShowGrid(!showGrid)}
        title="切换网格线与纯地面显示，落位步长不变"
      >
        {showGrid ? '网格' : '地面'}
      </button>
      <button
        type="button"
        aria-pressed={snap.guides}
        onClick={() => setStageGrid(snap.grid, !snap.guides)}
        title="靠近景片边缘时优先贴合；可能离开网格"
      >
        贴边
      </button>
      <button
        type="button"
        className="stage-free-placement"
        aria-pressed={!snap.grid && !snap.guides}
        onClick={() => setStageGrid(snap.grid || snap.guides ? 0 : step)}
        title="特殊选项：允许任意落点；再次点击回到网格"
      >
        特殊：自由放置
      </button>
    </>
  )
}

export function StageRotationRuntime() {
  useEffect(() => {
    let drag: { node: AnyNode; x: number; patch: Record<string, unknown> | null } | null = null
    const finish = (commit: boolean) => {
      const active = drag
      drag = null
      if (!active) return
      useLiveNodeOverrides
        .getState()
        .clearFields(active.node.id, ['position', 'rotation', 'topology'])
      useViewer.getState().setInputDragging(false)
      useInteractionScope
        .getState()
        .endIf((scope) => scope.kind === 'handle-drag' && scope.handle === 'stage-right-rotate')
      if (
        commit &&
        active.patch &&
        !useScene.getState().readOnly &&
        !getNodeLock(useScene.getState().nodes, active.node.id, true) &&
        useScene.getState().nodes[active.node.id] === active.node
      )
        runAsSingleSceneHistoryStep(useScene, () =>
          useScene.getState().updateNode(active.node.id, active.patch!),
        )
    }
    const down = (event: PointerEvent) => {
      if (
        event.button !== 2 ||
        !useStageRotation.getState().armed ||
        !(event.target instanceof Element) ||
        !(event.target.closest('.diastage-viewer-column canvas') || isPlanSurface(event.target))
      )
        return
      const id = useViewer.getState().selection.selectedIds[0]
      const scene = useScene.getState()
      const node = id && scene.nodes[id as AnyNodeId]
      if (
        !node ||
        scene.readOnly ||
        getNodeLock(scene.nodes, id!, true) ||
        !['item', 'block', 'stair'].includes(node.type) ||
        useInteractionScope.getState().scope.kind !== 'idle'
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      drag = { node, x: event.clientX, patch: null }
      useViewer.getState().setInputDragging(true)
      useInteractionScope
        .getState()
        .begin({ kind: 'handle-drag', nodeId: node.id, handle: 'stage-right-rotate' })
    }
    const move = (event: PointerEvent) => {
      if (!drag) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const degrees = Math.round((event.clientX - drag.x) / 2 / 15) * 15
      const node = drag.node
      drag.patch =
        node.type === 'item' || node.type === 'block'
          ? rigidRotation(node, 'y', degrees)
          : node.type === 'stair'
            ? { rotation: node.rotation + (degrees * Math.PI) / 180 }
            : null
      if (drag.patch) useLiveNodeOverrides.getState().set(node.id, drag.patch)
    }
    const up = (event: PointerEvent) => {
      if (drag) {
        event.stopImmediatePropagation()
        finish(true)
      }
    }
    const cancel = () => finish(false)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel()
        useStageRotation.setState({ armed: false })
      }
    }
    const context = (event: MouseEvent) => {
      if (
        useStageRotation.getState().armed &&
        event.target instanceof Element &&
        event.target.closest('.diastage-viewer-column')
      )
        event.preventDefault()
    }
    const selection = useViewer.subscribe((next, previous) => {
      if (next.selection.selectedIds !== previous.selection.selectedIds) {
        cancel()
        useStageRotation.setState({ armed: false })
      }
    })
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key, true)
    window.addEventListener('contextmenu', context, true)
    return () => {
      cancel()
      selection()
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('contextmenu', context, true)
    }
  }, [])
  return null
}
