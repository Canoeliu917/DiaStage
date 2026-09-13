'use client'

import {
  type AnyNodeId,
  getNodeLock,
  type ItemFoldControls,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { worldToStagePosition } from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type PointerEvent, useCallback, useEffect, useRef } from 'react'
import { type Matrix4, Vector3 } from 'three'
import { stageFrame } from '@/lib/stage/context'
import { advanceFoldAngle, type FoldAngleDrag, foldPointerRadians } from '@/lib/stage/fold-drag'
import {
  beginFoldCornerDrag,
  finishFoldDrag,
  foldControls,
  foldCornerGeometry,
  foldCornerLabel,
  foldKeys,
  foldPositionCount,
  previewFoldCornerAngle,
  useStageFolding,
} from '@/lib/stage/folding'
import { cameraPlanPoint, cameraPointerToPlan } from '../camera-studio/camera-stage-floorplan'

type Point = [number, number]
type Project = (point: [number, number, number]) => Point
type Gesture = {
  pointerId: number
  target: SVGGElement
  pivot: Point
  x: Point
  z: Point
  angle: FoldAngleDrag
  corner: number
}

function PlanFoldHandles({ project, unitsPerPixel }: { project: Project; unitsPerPixel?: number }) {
  const root = useRef<SVGGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const releasedPointer = useRef<number | null>(null)
  const selected = useViewer((state) => state.selection.selectedIds)
  const revision = useViewer((state) => state.geometryRevision)
  const nodeId = selected.length === 1 ? selected[0] : null
  const node = useScene((state) => (nodeId ? state.nodes[nodeId as AnyNodeId] : undefined))
  const disabled = useScene(
    (state) => state.readOnly || (!!nodeId && !!getNodeLock(state.nodes, nodeId, true)),
  )
  const editing = useEditor(
    (state) => !state.isPreviewMode && !state.isFirstPersonMode && !state.isCaptureMode,
  )
  const live = useLiveNodeOverrides((state) => (nodeId ? state.overrides.get(nodeId) : undefined))
  const dragging = useStageFolding((state) => state.dragging)
  const release = useCallback(() => {
    const drag = gesture.current
    gesture.current = null
    if (drag) releasedPointer.current = drag.pointerId
    if (drag?.target.hasPointerCapture(drag.pointerId))
      drag.target.releasePointerCapture(drag.pointerId)
  }, [])
  const finish = useCallback(
    (commit: boolean) => {
      if (!gesture.current) return
      finishFoldDrag(commit)
      release()
    },
    [release],
  )
  useEffect(() => {
    // Cancelling moves the node away from the pointer. Its trailing click must not select the floor.
    const pointerDown = () => {
      releasedPointer.current = null
    }
    const click = (event: MouseEvent) => {
      if (releasedPointer.current === null || event.detail === 0) return
      releasedPointer.current = null
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('click', click, true)
    }
  }, [])
  useEffect(() => {
    if (!dragging) release()
  }, [dragging, release])
  useEffect(() => {
    if (!nodeId || disabled || !editing) finish(false)
    return () => finish(false)
  }, [nodeId, disabled, editing, finish])
  useEffect(() => {
    const cancel = () => finish(false)
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(false)
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', cancel)
      finish(false)
    }
  }, [finish])
  if (node?.type !== 'item' || !foldPositionCount(node) || disabled || !editing) return null
  const controls = {
    ...foldControls(node),
    ...(live?.controls as Partial<ItemFoldControls> | undefined),
  }
  const matrix = root.current?.getScreenCTM()
  const unit = unitsPerPixel ?? (matrix ? 1 / Math.hypot(matrix.a, matrix.b) : 0.025)
  const pointer = (event: PointerEvent<SVGGElement>) =>
    root.current && cameraPointerToPlan(root.current, event.clientX, event.clientY)
  return (
    <g
      ref={root}
      data-stage-fold-plan={node.id}
      data-geometry-revision={revision}
      pointerEvents="auto"
    >
      {Array.from({ length: foldPositionCount(node) + 2 }, (_, corner) => {
        const geometry = foldCornerGeometry(node, corner)
        if (!geometry) return null
        const { pivot: pivotWorld, parentMatrix } = geometry
        const pivot = project(pivotWorld.toArray())
        const end = project(geometry.point.toArray())
        const position = Math.max(0, corner - 2)
        const angle = corner === 1 ? 0 : controls[foldKeys[position]!]
        return (
          <g
            key={corner}
            role="slider"
            tabIndex={0}
            className="stage-fold-plan-handle"
            aria-label={`平面${foldCornerLabel(corner)}`}
            aria-valuemin={corner === 1 ? undefined : 0}
            aria-valuemax={corner === 1 ? undefined : 270}
            aria-valuenow={angle}
            data-fold-position={corner >= 2 ? position : undefined}
            data-fold-corner={corner}
            transform={`translate(${end[0]} ${end[1]})`}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              const point = pointer(event)
              const basis = (axis: number): Point => {
                const projected = project(
                  pivotWorld
                    .clone()
                    .add(new Vector3().setFromMatrixColumn(parentMatrix, axis))
                    .toArray(),
                )
                return [projected[0] - pivot[0], projected[1] - pivot[1]]
              }
              const x = basis(0),
                z = basis(2)
              const radians = point && foldPointerRadians(point, pivot, x, z)
              if (
                radians === null ||
                radians === undefined ||
                !beginFoldCornerDrag(node.id, corner)
              )
                return
              gesture.current = {
                pointerId: event.pointerId,
                target: event.currentTarget,
                corner,
                pivot,
                x,
                z,
                angle: {
                  startAngle: angle,
                  pointerRadians: radians,
                  turnRadians: 0,
                },
              }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              const drag = gesture.current
              if (!drag || drag.pointerId !== event.pointerId) return
              event.preventDefault()
              event.stopPropagation()
              const point = pointer(event)
              const radians = point && foldPointerRadians(point, drag.pivot, drag.x, drag.z)
              if (radians === null || radians === undefined) return
              const next = advanceFoldAngle(drag.angle, radians, drag.corner)
              drag.angle = next.drag
              previewFoldCornerAngle(next.angle)
            }}
            onPointerUp={(event) => {
              if (gesture.current?.pointerId === event.pointerId) {
                event.stopPropagation()
                finish(true)
              }
            }}
            onPointerCancel={() => finish(false)}
            onLostPointerCapture={() => finish(false)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              event.stopPropagation()
              if (!beginFoldCornerDrag(node.id, corner)) return
              previewFoldCornerAngle(
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 270
                    : angle + (event.key === 'ArrowLeft' ? -15 : 15),
              )
              finishFoldDrag(true)
            }}
          >
            <title>{foldCornerLabel(corner)} · 每格 15°</title>
            <circle r={11 * unit} style={{ fill: 'transparent', stroke: 'none' }} />
            <circle r={8 * unit} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10 * unit}
              pointerEvents="none"
            >
              {corner === 0 ? '↶' : corner === 1 ? '↻' : corner - 1}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function StagePlanFoldHandles({
  depthMeters,
  unitsPerPixel,
}: {
  depthMeters: number
  unitsPerPixel?: number
}) {
  return (
    <PlanFoldHandles
      unitsPerPixel={unitsPerPixel}
      project={(world) => {
        const point = worldToStagePosition(world, stageFrame())
        return [-point.x, depthMeters - point.z]
      }}
    />
  )
}

export function NativePlanFoldHandles({
  frame,
  unitsPerPixel,
}: {
  frame: Matrix4
  unitsPerPixel: number
}) {
  return (
    <PlanFoldHandles
      unitsPerPixel={unitsPerPixel}
      project={(world) => {
        const point = cameraPlanPoint(world, frame)
        return [point[0], point[2]]
      }}
    />
  )
}
