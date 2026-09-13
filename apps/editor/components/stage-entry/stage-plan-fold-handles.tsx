'use client'

import {
  type AnyNodeId,
  getNodeLock,
  type ItemFoldControls,
  sceneRegistry,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { stageToWorldPosition, worldToStagePosition } from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type PointerEvent, useCallback, useEffect, useRef } from 'react'
import { type Matrix4, Vector3 } from 'three'
import { currentStageContext, stageFrame } from '@/lib/stage/context'
import { advanceFoldAngle, type FoldAngleDrag, foldPointerRadians } from '@/lib/stage/fold-drag'
import {
  beginFoldDrag,
  finishFoldDrag,
  foldControls,
  foldKeys,
  foldPositionCount,
  previewFoldAngle,
  useStageFolding,
} from '@/lib/stage/folding'
import { STAGE_PROP_MENU } from '@/lib/stage/prop-assets'
import { cameraPlanPoint, cameraPointerToPlan } from '../camera-studio/camera-stage-floorplan'
import {
  cancelStagePlacement,
  commitStagePlacement,
  startStagePlacement,
  updateStagePlacement,
} from './manual-stage-panel'

type Point = [number, number]
type Project = (point: [number, number, number]) => Point
function PlanMoveNode({
  id,
  point,
  project,
  unit,
  label,
}: {
  id: string
  point: Point
  project: Project
  unit: number
  label: string
}) {
  const gesture = useRef<{
    pointer: number
    start: Point
    x: Point
    z: Point
    position: { x: number; y: number; z: number }
  } | null>(null)
  useEffect(
    () => () => {
      if (gesture.current) cancelStagePlacement()
    },
    [],
  )
  return (
    <g
      className="stage-fold-plan-handle"
      role="button"
      tabIndex={0}
      aria-label={label}
      data-stage-move-node={id}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        const root = event.currentTarget.parentElement as unknown as SVGGElement
        const start = cameraPointerToPlan(root, event.clientX, event.clientY)
        const object = currentStageContext().objects.find((entry) => entry.id === id)
        if (!start || !object) return
        const position = object.transform.position
        const origin = project(stageToWorldPosition(position, stageFrame()))
        const x = project(stageToWorldPosition({ ...position, x: position.x + 1 }, stageFrame()))
        const z = project(stageToWorldPosition({ ...position, z: position.z + 1 }, stageFrame()))
        startStagePlacement(
          {
            id,
            name: object.name,
            kind: object.kind,
            dimensionsMeters: object.dimensionsMeters,
            libraryAssetId: null,
          },
          object,
        )
        gesture.current = {
          pointer: event.pointerId,
          start,
          position,
          x: [x[0] - origin[0], x[1] - origin[1]],
          z: [z[0] - origin[0], z[1] - origin[1]],
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const drag = gesture.current
        if (!drag) return
        event.stopPropagation()
        const next = cameraPointerToPlan(
          event.currentTarget.parentElement as unknown as SVGGElement,
          event.clientX,
          event.clientY,
        )
        if (!next) return
        const dx = next[0] - drag.start[0],
          dy = next[1] - drag.start[1]
        const determinant = drag.x[0] * drag.z[1] - drag.x[1] * drag.z[0]
        if (Math.abs(determinant) < 1e-8) return
        updateStagePlacement({
          ...drag.position,
          x: drag.position.x + (dx * drag.z[1] - dy * drag.z[0]) / determinant,
          z: drag.position.z + (dy * drag.x[0] - dx * drag.x[1]) / determinant,
        })
      }}
      onPointerUp={(event) => {
        if (!gesture.current) return
        event.stopPropagation()
        gesture.current = null
        if (!commitStagePlacement()) cancelStagePlacement()
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        gesture.current = null
        cancelStagePlacement()
      }}
      onLostPointerCapture={() => {
        if (gesture.current) {
          gesture.current = null
          cancelStagePlacement()
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          gesture.current = null
          cancelStagePlacement()
        }
      }}
    >
      <circle cx={point[0]} cy={point[1]} r={8 * unit} />
      <circle
        cx={point[0]}
        cy={point[1]}
        r={2 * unit}
        style={{ fill: 'var(--dia-ink)' }}
        pointerEvents="none"
      />
    </g>
  )
}
type Gesture = {
  pointerId: number
  target: SVGGElement
  pivot: Point
  x: Point
  z: Point
  angle: FoldAngleDrag
}

function PlanFoldHandles({ project, unitsPerPixel }: { project: Project; unitsPerPixel?: number }) {
  const root = useRef<SVGGElement>(null)
  const gesture = useRef<Gesture | null>(null)
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
  const model = sceneRegistry.nodes.get(node.id)
  const source = STAGE_PROP_MENU.assets.find((asset) => asset.id === node.asset.id)
  const dimensions = source?.dimensions_m
  if (!model || !dimensions || !('panel_width' in dimensions) || !dimensions.panel_width)
    return null
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
      {model.getObjectByName('Hinge_01') && (
        <PlanMoveNode
          id={node.id}
          point={project(
            model.getObjectByName('Hinge_01')!.getWorldPosition(new Vector3()).toArray(),
          )}
          project={project}
          unit={unit}
          label="起端节点：整件落位"
        />
      )}
      {Array.from({ length: foldPositionCount(node) }, (_, position) => {
        const joint = model.getObjectByName(`Hinge_0${position + 2}`)
        if (!joint?.parent) return null
        joint.updateWorldMatrix(true, false)
        const pivotWorld = joint.localToWorld(new Vector3())
        const pivot = project(pivotWorld.toArray())
        const end = project(joint.localToWorld(new Vector3(dimensions.panel_width, 0, 0)).toArray())
        return (
          <g key={position}>
            {position === 0 && (
              <PlanMoveNode
                id={node.id}
                point={pivot}
                project={project}
                unit={unit}
                label="转角节点：整件落位"
              />
            )}
            <g
              role="slider"
              tabIndex={0}
              className="stage-fold-plan-handle"
              aria-label={`平面折叠位置${position + 1}打开角度`}
              aria-valuemin={0}
              aria-valuemax={270}
              aria-valuenow={controls[foldKeys[position]!]}
              data-fold-position={position}
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
                      .add(new Vector3().setFromMatrixColumn(joint.parent!.matrixWorld, axis))
                      .toArray(),
                  )
                  return [projected[0] - pivot[0], projected[1] - pivot[1]]
                }
                const x = basis(0),
                  z = basis(2)
                const radians = point && foldPointerRadians(point, pivot, x, z)
                if (radians === null || radians === undefined || !beginFoldDrag(node.id, position))
                  return
                gesture.current = {
                  pointerId: event.pointerId,
                  target: event.currentTarget,
                  pivot,
                  x,
                  z,
                  angle: {
                    startAngle: controls[foldKeys[position]!],
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
                const next = advanceFoldAngle(drag.angle, radians)
                drag.angle = next.drag
                previewFoldAngle(next.angle)
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
                if (!beginFoldDrag(node.id, position)) return
                previewFoldAngle(
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 270
                      : controls[foldKeys[position]!] + (event.key === 'ArrowLeft' ? -15 : 15),
                )
                finishFoldDrag(true)
              }}
            >
              <circle r={8 * unit} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10 * unit}
                pointerEvents="none"
              >
                {position + 1}
              </text>
            </g>
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
