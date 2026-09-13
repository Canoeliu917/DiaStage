'use client'

import { type AnyNodeId, getNodeLock, type ItemNode, useScene } from '@pascal-app/core'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type PointerEvent, useCallback, useEffect, useRef } from 'react'
import { type Group, type Matrix4, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { advanceFoldAngle, type FoldAngleDrag } from '@/lib/stage/fold-drag'
import {
  beginFoldCornerDrag,
  exitStageFolding,
  finishFoldDrag,
  foldControls,
  foldCornerGeometry,
  foldCornerLabel,
  foldHandle,
  foldKeys,
  foldPositionCount,
  previewFoldCornerAngle,
  useStageFolding,
} from '@/lib/stage/folding'
import { STAGE_PROP_MENU } from '@/lib/stage/prop-assets'

function FoldPosition({ node, corner }: { node: ItemNode; corner: number }) {
  const handle = useRef<Group>(null)
  const { camera, gl, controls } = useThree()
  const gesture = useRef<{
    plane: Plane
    pivot: Vector3
    inverseParent: Matrix4
    angle: FoldAngleDrag
    button: HTMLButtonElement
    pointerId: number
    enabled: boolean | undefined
  } | null>(null)
  const source = STAGE_PROP_MENU.assets.find((asset) => asset.id === node.asset.id)
  const dimensions = source?.dimensions_m
  const panelHeight = dimensions?.height ?? 2.4
  const ray = useRef(new Raycaster())
  const dragging = useStageFolding((state) => state.dragging)
  const cameraControls = controls as unknown as { enabled: boolean } | null
  const restoreCamera = useCallback(() => {
    const drag = gesture.current
    if (!drag) return
    gesture.current = null
    if (cameraControls && drag.enabled !== undefined) cameraControls.enabled = drag.enabled
    if (drag.button.hasPointerCapture(drag.pointerId))
      drag.button.releasePointerCapture(drag.pointerId)
  }, [cameraControls])
  useEffect(() => {
    if (!dragging) restoreCamera()
  }, [dragging, restoreCamera])
  useEffect(
    () => () => {
      finishFoldDrag(false)
      restoreCamera()
    },
    [restoreCamera],
  )
  const planePoint = (event: PointerEvent<HTMLButtonElement>, plane: Plane) => {
    const rect = gl.domElement.getBoundingClientRect()
    ray.current.setFromCamera(
      new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    )
    return ray.current.ray.intersectPlane(plane, new Vector3())
  }
  useFrame(() => {
    const geometry = foldCornerGeometry(node, corner, panelHeight / 2)
    if (handle.current) {
      handle.current.visible = !!geometry
      if (geometry) handle.current.position.copy(geometry.point)
    }
  })
  return (
    <group ref={handle}>
      <Html center style={{ pointerEvents: 'none' }}>
        <button
          className="stage-fold-angle-handle"
          type="button"
          aria-label={`拖动${foldCornerLabel(corner)}`}
          data-fold-corner={corner}
          title={`${foldCornerLabel(corner)} · 每格 15°`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            const geometry = foldCornerGeometry(node, corner, panelHeight / 2)
            if (!geometry) return
            const { pivot, parentMatrix } = geometry
            const normal = new Vector3(0, 1, 0).transformDirection(parentMatrix)
            const plane = new Plane().setFromNormalAndCoplanarPoint(normal, pivot)
            const point = planePoint(event, plane)
            if (
              !point ||
              point.distanceToSquared(pivot) < 1e-8 ||
              !beginFoldCornerDrag(node.id, corner)
            )
              return
            const inverseParent = parentMatrix.clone().invert()
            const localPivot = pivot.clone().applyMatrix4(inverseParent)
            const start = point.applyMatrix4(inverseParent).sub(localPivot)
            gesture.current = {
              plane,
              pivot: localPivot,
              inverseParent,
              angle: {
                startAngle:
                  corner === 1 ? 0 : foldControls(node)[foldKeys[Math.max(0, corner - 2)]!],
                pointerRadians: Math.atan2(-start.z, start.x),
                turnRadians: 0,
              },
              button: event.currentTarget,
              pointerId: event.pointerId,
              enabled: cameraControls?.enabled,
            }
            if (cameraControls) cameraControls.enabled = false
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = gesture.current
            if (!drag || drag.pointerId !== event.pointerId) return
            event.preventDefault()
            event.stopPropagation()
            const point = planePoint(event, drag.plane)
            if (!point) return
            const next = point.applyMatrix4(drag.inverseParent).sub(drag.pivot)
            const delta = Math.atan2(-next.z, next.x)
            const advanced = advanceFoldAngle(drag.angle, delta, corner)
            drag.angle = advanced.drag
            previewFoldCornerAngle(advanced.angle)
          }}
          onPointerUp={(event) => {
            if (!gesture.current || event.button !== 0) return
            event.stopPropagation()
            finishFoldDrag(true)
            restoreCamera()
          }}
          onPointerCancel={() => {
            finishFoldDrag(false)
            restoreCamera()
          }}
          onLostPointerCapture={() => {
            finishFoldDrag(false)
            restoreCamera()
          }}
        >
          {corner === 0 ? '↶' : corner === 1 ? '↻' : corner - 1}
        </button>
      </Html>
    </group>
  )
}

export function FoldingSystem({ enabled }: { enabled: boolean }) {
  const folding = useStageFolding()
  const selected = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const readOnly = useScene((state) => state.readOnly)
  const editing = useEditor(
    (state) => !state.isPreviewMode && !state.isFirstPersonMode && !state.isCaptureMode,
  )
  const scope = useInteractionScope((state) => state.scope)
  const nodeId = folding.nodeId ?? (selected.length === 1 ? selected[0] : null)
  const node = nodeId ? nodes[nodeId as AnyNodeId] : undefined
  const available =
    enabled &&
    editing &&
    !readOnly &&
    node?.type === 'item' &&
    selected.length === 1 &&
    selected[0] === node.id &&
    !getNodeLock(nodes, node.id, true)
  useEffect(() => {
    if (
      folding.nodeId &&
      (!available ||
        (scope.kind !== 'idle' && !(scope.kind === 'handle-drag' && scope.handle === foldHandle)))
    )
      exitStageFolding()
  }, [available, folding.nodeId, scope])
  useEffect(() => {
    if (!folding.nodeId) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!useStageFolding.getState().dragging && event.target instanceof HTMLInputElement) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (useStageFolding.getState().dragging) finishFoldDrag(false)
      else exitStageFolding()
    }
    const blur = () => finishFoldDrag(false)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', blur)
    }
  }, [folding.nodeId])
  useEffect(() => () => exitStageFolding(), [])
  if (!available || node?.type !== 'item' || !foldPositionCount(node)) return null
  return (
    <group name={`stage-fold-controls:${node.id}`}>
      {[0, foldPositionCount(node) + 1].map((corner) => (
        <FoldPosition key={`${node.id}:${corner}`} node={node} corner={corner} />
      ))}
    </group>
  )
}
