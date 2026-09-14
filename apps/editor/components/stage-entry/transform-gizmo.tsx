'use client'

import {
  type AnyNodeId,
  DEFAULT_ANGLE_STEP,
  getNodeLock,
  type ItemNode,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { STAGE_OBJECT_REGISTRY, stageMagneticHeight } from '@pascal-app/core/stage'
import {
  ELEVATION_ALIGNMENT_THRESHOLD_M,
  isGridSnapActive,
  isMagneticSnapActive,
  useEditor,
  useHandleDrag,
  useInteractionScope,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type CameraControlsImpl, Html } from '@react-three/drei'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { Euler, Group, Plane, Quaternion, Vector3 } from 'three'
import { axisTransform, type TransformAxis } from '@/lib/stage/axis-transform'
import { currentStageContext, stageContextObject, stageFrame } from '@/lib/stage/context'
import { nearestRotationRing, rotationPointerMetrics } from '@/lib/stage/rotation-ring-hit'
import { useStageTransform } from './transform-mode'

const vectors = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
const colors = ['#ef5757', '#52cf83', '#619cff']
const names = ['X', 'Y', 'Z']
type RotationInput = {
  pointerType: string
  axis: TransformAxis | null
  handles: Map<
    TransformAxis,
    {
      group: Group
      refresh: () => void
      start: (event: ThreeEvent<PointerEvent>) => void
    }
  >
}

function AxisHandle({
  node,
  axis,
  mode,
  input,
  activeAxis,
  setActiveAxis,
}: {
  node: ItemNode
  axis: TransformAxis
  mode: 'move' | 'rotate'
  input: RotationInput
  activeAxis: TransformAxis | null
  setActiveAxis: (axis: TransformAxis | null) => void
}) {
  const group = useMemo(() => new Group(), [])
  const { camera, size, controls } = useThree()
  const [dragging, setDragging] = useState(false)
  const [value, setValue] = useState('')
  const [hovered, setHovered] = useState(false)
  const refresh = () => {
    const root = sceneRegistry.nodes.get(node.id)
    if (!root) return
    root.updateWorldMatrix(true, false)
    root.getWorldPosition(group.position)
    const parentRotation = root.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion()
    const direction = vectors[axis]!.clone()
    if (mode === 'rotate') {
      // XYZ Euler derivatives: each ring changes only its corresponding field.
      const rotation = new Euler(
        axis > 0 ? node.rotation[0] : 0,
        axis > 1 ? node.rotation[1] : 0,
        0,
      )
      direction.applyEuler(rotation)
    }
    direction.applyQuaternion(parentRotation)
    group.quaternion.setFromUnitVectors(vectors[2]!, direction)
    const span =
      'isPerspectiveCamera' in camera
        ? 2 *
          Math.tan((('fov' in camera ? Number(camera.fov) : 50) * Math.PI) / 360) *
          camera.position.distanceTo(group.position)
        : 'top' in camera && 'bottom' in camera
          ? (Number(camera.top) - Number(camera.bottom)) / camera.zoom
          : 10
    const radius = mode === 'rotate' ? rotationPointerMetrics(input.pointerType).radius : 100
    // Preserve the mouse scale exactly; contact input uses view depth for a CSS-pixel radius.
    const contactSpan =
      mode === 'rotate' && input.pointerType !== 'mouse' && 'isPerspectiveCamera' in camera
        ? (span * Math.abs(group.position.clone().applyMatrix4(camera.matrixWorldInverse).z)) /
          camera.position.distanceTo(group.position)
        : span
    group.scale.setScalar((contactSpan * radius) / size.height)
  }
  useFrame(refresh)
  const onPointerDown = useHandleDrag({
    kind: 'drag',
    cursor: 'grabbing',
    handleIndex: axis,
    node,
    rideObject: group,
    setIsDragging: (value) => {
      setDragging(value)
      if (mode === 'rotate') {
        input.axis = value ? axis : null
        setActiveAxis(input.axis)
      }
    },
    dragControls: {
      onStart: () =>
        useInteractionScope.getState().begin({
          kind: 'handle-drag',
          nodeId: node.id,
          handle: mode === 'rotate' ? 'rotate-handle' : `stage-move-${names[axis]}`,
        }),
      onEnd: () =>
        useInteractionScope
          .getState()
          .endIf(
            (scope) =>
              scope.kind === 'handle-drag' &&
              scope.nodeId === node.id &&
              (scope.handle === 'rotate-handle' || scope.handle.startsWith('stage-')),
          ),
    },
    onStart: ({ initialNode, event, intersectPlane, sceneApi }) => {
      if (
        initialNode.type !== 'item' ||
        useScene.getState().readOnly ||
        getNodeLock(useScene.getState().nodes, node.id, true) ||
        useInteractionScope.getState().scope.kind !== 'idle'
      )
        return null
      const origin = group.position.clone()
      const direction = vectors[2]!.clone().applyQuaternion(group.quaternion)
      const eye = camera.getWorldDirection(new Vector3())
      const normal =
        mode === 'rotate'
          ? direction
          : eye.addScaledVector(direction, -eye.dot(direction)).normalize()
      const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin)
      const start = intersectPlane(event.clientX, event.clientY, plane, new Vector3())
      const screenStart = origin.clone().project(camera)
      const screenEnd = origin.clone().addScaledVector(direction, group.scale.x).project(camera)
      const dx = ((screenEnd.x - screenStart.x) * size.width) / 2
      const dy = (-(screenEnd.y - screenStart.y) * size.height) / 2
      const objects = currentStageContext().objects
      let lastAngle = 0,
        totalAngle = 0
      const cameraControls = controls as unknown as CameraControlsImpl | null
      const controlsEnabled = cameraControls?.enabled
      return {
        onBegin: () => {
          if (mode === 'rotate' && cameraControls) {
            if (input.pointerType === 'touch' || input.pointerType === 'pen') {
              // Freeze residual orbit/pan at its current pose; stop() jumps to its endpoint.
              const position = cameraControls.getPosition(new Vector3(), false)
              const target = cameraControls.getTarget(new Vector3(), false)
              void cameraControls.setLookAt(...position.toArray(), ...target.toArray(), false)
            }
            cameraControls.enabled = false
          }
        },
        onEnd: () => {
          if (mode === 'rotate' && cameraControls && controlsEnabled !== undefined)
            cameraControls.enabled = controlsEnabled
        },
        move: ({ event: moveEvent, intersectPlane: intersect }) => {
          if (useScene.getState().readOnly || getNodeLock(useScene.getState().nodes, node.id, true))
            return null
          const point = intersect(moveEvent.clientX, moveEvent.clientY, plane, new Vector3())
          if (mode === 'move') {
            const delta =
              start && point && normal.lengthSq() > 0.01
                ? point.sub(start).dot(direction)
                : (-(moveEvent.clientY - event.clientY) * group.scale.x) / 100
            let position = axisTransform(
              initialNode.position,
              axis,
              delta,
              isGridSnapActive() ? useEditor.getState().gridSnapStep : 0,
            )
            if (axis === 1 && isMagneticSnapActive()) {
              const candidateNode = { ...initialNode, position }
              const candidate = stageContextObject(
                candidateNode,
                { ...useScene.getState().nodes, [node.id]: candidateNode },
                stageFrame(),
              )
              if (candidate)
                position[1] +=
                  stageMagneticHeight(candidate, objects, ELEVATION_ALIGNMENT_THRESHOLD_M) -
                  candidate.transform.position.y
            }
            setValue(`${position[axis].toFixed(3)} m`)
            return { position }
          }
          let angle: number
          if (
            start &&
            point &&
            Math.abs(direction.dot(camera.getWorldDirection(new Vector3()))) > 0.03
          ) {
            const a = start.clone().sub(origin).normalize(),
              b = point.sub(origin).normalize()
            angle = Math.atan2(direction.dot(a.clone().cross(b)), a.dot(b))
          } else {
            angle =
              ((moveEvent.clientX - event.clientX) * (Math.abs(dy) > 1 ? Math.sign(dy) : 1) +
                (moveEvent.clientY - event.clientY) * (Math.abs(dx) > 1 ? Math.sign(dx) : 0)) /
              100
          }
          totalAngle += Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle))
          lastAngle = angle
          const rotation = axisTransform(
            initialNode.rotation,
            axis,
            totalAngle,
            moveEvent.shiftKey ? 0 : DEFAULT_ANGLE_STEP,
          )
          setValue(`${((rotation[axis] * 180) / Math.PI).toFixed(1)}°`)
          return { rotation }
        },
        commit: (patch) => {
          const state = useScene.getState()
          const changed = (['position', 'rotation'] as const).some((field) =>
            (patch as Partial<ItemNode>)[field]?.some(
              (value, i) => value !== initialNode[field][i],
            ),
          )
          if (
            changed &&
            !state.readOnly &&
            !getNodeLock(state.nodes, node.id, true) &&
            state.nodes[node.id] === initialNode
          )
            sceneApi.update(node.id, patch)
        },
      }
    },
  })
  useEffect(() => {
    if (mode !== 'rotate') return
    const handle = { group, refresh, start: onPointerDown }
    input.handles.set(axis, handle)
    return () => {
      if (input.handles.get(axis) === handle) input.handles.delete(axis)
    }
  })
  const dimmed = mode === 'rotate' && activeAxis !== null && activeAxis !== axis
  const color = dragging || hovered ? '#ffffff' : colors[axis]
  return (
    <primitive
      object={group}
      name={`stage-axis-${names[axis]}`}
      userData={{ viewerLineStyle: 'colored' }}
    >
      <group
        onPointerDown={(event) => {
          // Contact input is arbitrated once in native capture, before camera controls.
          if (mode !== 'rotate' || !['touch', 'pen'].includes(event.nativeEvent.pointerType))
            onPointerDown(event)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        {mode === 'move' ? (
          <>
            <mesh position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1100}>
              <cylinderGeometry args={[0.015, 0.015, 0.8, 12]} />
              <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0, 1]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1100}>
              <coneGeometry args={[0.065, 0.18, 16]} />
              <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh
              position={[0, 0, 0.72]}
              rotation={[Math.PI / 2, 0, 0]}
              userData={{ editorHandleHitArea: true }}
            >
              <cylinderGeometry args={[0.22, 0.22, 0.75, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </>
        ) : (
          <>
            <mesh renderOrder={1100}>
              <torusGeometry args={[1, 0.012, 8, 96]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={dimmed ? 0.25 : 1}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            <mesh userData={{ editorHandleHitArea: true }}>
              <torusGeometry args={[1, 0.22, 8, 64]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </>
        )}
      </group>
      <Html
        position={mode === 'move' ? [0, 0, 1.25] : [1.2, 0, 0]}
        center
        style={{
          pointerEvents: 'none',
          color: colors[axis],
          fontSize: 12,
          fontWeight: 700,
          opacity: dimmed ? 0.35 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {names[axis]} {dragging ? value : ''}
      </Html>
    </primitive>
  )
}

export function StageTransformGizmo({ enabled }: { enabled: boolean }) {
  const { camera, gl, invalidate } = useThree()
  const input = useMemo<RotationInput>(
    () => ({
      pointerType: 'mouse',
      axis: null,
      handles: new Map(),
    }),
    [],
  )
  const [activeAxis, setActiveAxis] = useState<TransformAxis | null>(null)
  const mode = useStageTransform((s) => s.mode)
  const selected = useViewer((s) => s.selection.selectedIds)
  const node = useScene((s) =>
    selected.length === 1 ? s.nodes[selected[0] as AnyNodeId] : undefined,
  )
  const locked = useScene((s) => s.readOnly || !node || !!getNodeLock(s.nodes, node.id, true))
  const scope = useInteractionScope((s) => s.scope)
  const active =
    scope.kind === 'idle' ||
    (scope.kind === 'handle-drag' &&
      scope.nodeId === node?.id &&
      (scope.handle === 'rotate-handle' || scope.handle.startsWith('stage-')))
  useEffect(() => {
    const pointerType = (event: PointerEvent) => {
      if (input.axis !== null) return
      const type = event.pointerType || 'mouse'
      if (input.pointerType === type) return
      input.pointerType = type
      for (const handle of input.handles.values()) handle.refresh()
      invalidate()
    }
    const down = (event: PointerEvent) => {
      pointerType(event)
      if (
        !enabled ||
        mode !== 'rotate' ||
        event.target !== gl.domElement ||
        !['touch', 'pen'].includes(event.pointerType) ||
        event.button !== 0
      )
        return
      if (input.axis !== null) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (useInteractionScope.getState().scope.kind !== 'idle') return
      const axis = nearestRotationRing(
        { x: event.clientX, y: event.clientY },
        input.handles,
        camera,
        gl.domElement.getBoundingClientRect(),
        rotationPointerMetrics(event.pointerType).hitRadius,
      )
      if (axis === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      // Only these native fields are consumed by the existing handle-drag hook.
      input.handles.get(axis)!.start({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        nativeEvent: event,
        stopPropagation: () => event.stopPropagation(),
      } as ThreeEvent<PointerEvent>)
    }
    window.addEventListener('pointerover', pointerType, true)
    window.addEventListener('pointermove', pointerType, true)
    window.addEventListener('pointerdown', down, { capture: true, passive: false })
    return () => {
      window.removeEventListener('pointerover', pointerType, true)
      window.removeEventListener('pointermove', pointerType, true)
      window.removeEventListener('pointerdown', down, true)
    }
  }, [camera, enabled, gl, input, invalidate, mode])
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useStageTransform.setState({ mode: null })
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [])
  if (
    !enabled ||
    !mode ||
    locked ||
    !active ||
    node?.type !== 'item' ||
    !STAGE_OBJECT_REGISTRY.some((asset) => asset.canonicalId === node.asset.id)
  )
    return null
  return (
    <group name="stage-transform-gizmo">
      {([0, 1, 2] as const).map((axis) => (
        <AxisHandle
          key={`${node.id}-${mode}-${axis}`}
          node={node}
          axis={axis}
          mode={mode}
          input={input}
          activeAxis={activeAxis}
          setActiveAxis={setActiveAxis}
        />
      ))}
    </group>
  )
}
