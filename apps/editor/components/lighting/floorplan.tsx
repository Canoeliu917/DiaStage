'use client'

import { useScene } from '@pascal-app/core'
import { useEditor, useFloorplanRender, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef } from 'react'
import { type Matrix4, Vector3 } from 'three'
import {
  cameraFloorplanMatrix,
  cameraPlanPoint,
  cameraPointerToPlan,
} from '../camera-studio/camera-stage-floorplan'
import { useCameraStudio } from '../camera-studio/store'
import {
  type Light,
  type LightPose,
  lightingEditAllowed,
  lightingEditorView,
  lightOwner,
  validLightPose,
} from './interaction'
import { useLighting } from './store'

export function moveLightInPlan(
  original: LightPose,
  matrix: Matrix4,
  start: [number, number],
  end: [number, number],
  field: 'position' | 'target',
): LightPose {
  const point = new Vector3(...cameraPlanPoint(original[field], matrix))
  point.x += end[0] - start[0]
  point.z += end[1] - start[1]
  return { ...original, [field]: point.applyMatrix4(matrix).toArray() }
}

export function LightingFloorplan({ enabled, sceneId }: { enabled: boolean; sceneId: string }) {
  const context = useFloorplanRender()
  const nodes = useScene((state) => state.nodes)
  useScene((state) => state.readOnly)
  const levelId = useViewer((state) => state.selection.levelId)
  const state = useLighting()
  useEditor((state) => lightingEditorView(state, '2d'))
  useCameraStudio((state) => state.playing || state.previewing || state.recording)
  const scope = useInteractionScope((state) => state.scope)
  const matrix = useMemo(() => cameraFloorplanMatrix(nodes, levelId), [nodes, levelId])
  const ready = enabled && !!context && !!matrix && lightingEditAllowed(sceneId, '2d')
  const group = useRef<SVGGElement>(null)
  const drag = useRef<{
    light: Light
    project: typeof state.project
    nodes: typeof nodes
    levelId: string
    matrix: Matrix4
    start: [number, number]
    field: 'position' | 'target'
    pointerId: number
    element: SVGGElement
  } | null>(null)

  const finish = (commit: boolean) => {
    const active = drag.current
    if (!active) return
    drag.current = null
    const current = useLighting.getState(),
      scope = useInteractionScope.getState().scope
    const owner = lightOwner(sceneId, active.light.id)
    const owns =
      scope.kind === 'handle-drag' && scope.handle === 'lighting' && scope.nodeId === owner
    const pose = current.draft?.id === active.light.id ? current.draft : null
    const allowed = lightingEditAllowed(sceneId, '2d')
    if (pose) current.setDraft(null)
    useInteractionScope
      .getState()
      .endIf(
        (scope) =>
          scope.kind === 'handle-drag' && scope.handle === 'lighting' && scope.nodeId === owner,
      )
    if (active.element.hasPointerCapture(active.pointerId))
      active.element.releasePointerCapture(active.pointerId)
    if (
      !commit ||
      !owns ||
      !pose ||
      !allowed ||
      current.project !== active.project ||
      current.selectedLightId !== active.light.id ||
      current.editTarget !== active.field ||
      useScene.getState().nodes !== active.nodes ||
      useViewer.getState().selection.levelId !== active.levelId
    )
      return
    try {
      current.updateLight(active.light.id, { position: pose.position, target: pose.target })
    } catch (error) {
      current.setNotice(error instanceof Error ? error.message : '二维灯位变换无效')
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        finishRef.current(false)
      }
    }
    const blur = () => finishRef.current(false)
    window.addEventListener('keydown', cancel, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', cancel, true)
      window.removeEventListener('blur', blur)
      blur()
    }
  }, [])
  useEffect(() => {
    const active = drag.current
    if (
      active &&
      (!ready ||
        state.project !== active.project ||
        nodes !== active.nodes ||
        levelId !== active.levelId ||
        state.selectedLightId !== active.light.id ||
        state.editTarget !== active.field ||
        scope.kind !== 'handle-drag' ||
        scope.handle !== 'lighting' ||
        scope.nodeId !== lightOwner(sceneId, active.light.id))
    )
      finishRef.current(false)
  }, [
    ready,
    state.project,
    state.selectedLightId,
    state.editTarget,
    nodes,
    levelId,
    sceneId,
    scope,
  ])

  const start = (event: ReactPointerEvent<SVGGElement>, light: Light) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (
      !ready ||
      !group.current ||
      !matrix ||
      !levelId ||
      useInteractionScope.getState().scope.kind !== 'idle'
    )
      return
    const point = cameraPointerToPlan(group.current, event.clientX, event.clientY)
    if (!point) return
    const current = useLighting.getState()
    current.selectLight(light.id)
    useViewer.getState().setSelection({ selectedIds: [] })
    drag.current = {
      light,
      project: current.project,
      nodes,
      levelId,
      matrix,
      start: point,
      field: current.editTarget,
      pointerId: event.pointerId,
      element: group.current,
    }
    group.current.setPointerCapture(event.pointerId)
    useInteractionScope
      .getState()
      .begin({ kind: 'handle-drag', handle: 'lighting', nodeId: lightOwner(sceneId, light.id) })
  }
  if (!ready || !matrix || !context) return null
  const unit = context.unitsPerPixel
  return (
    <g
      ref={group}
      data-lighting-floorplan=""
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerMove={(event) => {
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        event.stopPropagation()
        const scope = useInteractionScope.getState().scope
        if (
          !lightingEditAllowed(sceneId, '2d') ||
          scope.kind !== 'handle-drag' ||
          scope.handle !== 'lighting' ||
          scope.nodeId !== lightOwner(sceneId, active.light.id)
        ) {
          finish(false)
          return
        }
        const point = cameraPointerToPlan(active.element, event.clientX, event.clientY)
        if (!point) return
        const pose = moveLightInPlan(active.light, active.matrix, active.start, point, active.field)
        if (validLightPose(pose))
          useLighting
            .getState()
            .setDraft({ id: active.light.id, position: pose.position, target: pose.target })
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          event.stopPropagation()
          finish(true)
        }
      }}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => finish(false)}
    >
      {state.project.lights.map((light) => {
        const pose = state.draft?.id === light.id ? state.draft : light
        const position = cameraPlanPoint(pose.position, matrix),
          target = cameraPlanPoint(pose.target, matrix)
        const selected = light.id === state.selectedLightId
        const color = selected ? context.palette.selectedStroke : context.palette.measurementStroke
        const handle = state.editTarget === 'position' ? position : target
        return (
          <g key={light.id}>
            <line
              x1={position[0]}
              y1={position[2]}
              x2={target[0]}
              y2={target[2]}
              stroke={color}
              strokeWidth={unit}
              strokeDasharray={`${4 * unit} ${4 * unit}`}
              pointerEvents="none"
            />
            <circle
              cx={position[0]}
              cy={position[2]}
              r={6 * unit}
              fill={light.enabled ? context.palette.measurementLabelBackground : 'transparent'}
              stroke={color}
              strokeWidth={1.5 * unit}
              pointerEvents="none"
            />
            <path
              d={`M ${target[0] - 5 * unit} ${target[2]} h ${10 * unit} M ${target[0]} ${target[2] - 5 * unit} v ${10 * unit}`}
              stroke={color}
              strokeWidth={unit}
              pointerEvents="none"
            />
            <g
              role="button"
              aria-label={`${light.name}：拖动${state.editTarget === 'position' ? '灯位' : '照射目标'}`}
              tabIndex={0}
              style={{ cursor: 'grab' }}
              onPointerDown={(event) => start(event, light)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  if (useInteractionScope.getState().scope.kind === 'idle')
                    useLighting.getState().selectLight(light.id)
                }
              }}
            >
              <title>
                {light.name} · 高度 {pose.position[1].toFixed(2)} 米
              </title>
              <circle
                cx={handle[0]}
                cy={handle[2]}
                r={12 * unit}
                fill="transparent"
                stroke={selected ? color : 'none'}
                strokeWidth={unit}
              />
            </g>
            <text
              x={position[0]}
              y={position[2] - 16 * unit}
              fontSize={11 * unit}
              fill={context.palette.measurementLabelText}
              textAnchor="middle"
              pointerEvents="none"
            >
              {light.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
