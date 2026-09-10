'use client'

import { useScene } from '@pascal-app/core'
import {
  stagePositionLabel,
  stageToWorldPosition,
  stageToWorldRotation,
  validateStagePlan,
  worldToStagePosition,
} from '@pascal-app/core/stage'
import { useEditor, useFloorplanRender } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { currentStageContext, stageFrame } from '@/lib/stage/context'
import {
  cameraFloorplanMatrix,
  cameraPlanPoint,
  cameraPointerToPlan,
} from '../camera-studio/camera-stage-floorplan'
import {
  commitStagePlacement,
  placementPlan,
  updateStagePlacement,
  useStagePlacement,
} from './manual-stage-panel'

function usePlacementEnabled(enabled: boolean) {
  const readOnly = useScene((state) => state.readOnly)
  const editorReady = useEditor(
    (state) => !state.isCaptureMode && !state.isFirstPersonMode && !state.isPreviewMode,
  )
  return enabled && !readOnly && editorReady
}
function moveAtWorld(world: Vector3) {
  const draft = useStagePlacement.getState().draft
  if (!draft) return
  const point = worldToStagePosition([world.x, world.y, world.z], stageFrame())
  updateStagePlacement({ ...point, y: draft.item.transform.position.y })
}
function preview() {
  const draft = useStagePlacement.getState().draft
  if (!draft) return null
  const context = currentStageContext()
  const result = validateStagePlan(placementPlan(draft), context)
  return {
    draft,
    context,
    color: result.valid ? '#86a998' : '#c67b73',
    valid: result.valid,
    message: result.warnings
      .filter((warning) => warning.blocking)
      .map((warning) => warning.message)
      .join(' '),
  }
}

export function StagePlacementSystem({ enabled }: { enabled: boolean }) {
  const active = usePlacementEnabled(enabled)
  const draft = useStagePlacement((state) => state.draft)
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new Raycaster(), [])
  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement
    const update = (event: DragEvent) => {
      if (!useStagePlacement.getState().draft) return false
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return false
      const frame = stageFrame()
      raycaster.setFromCamera(
        new Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      )
      const point = raycaster.ray.intersectPlane(
        new Plane(new Vector3(0, 1, 0), -frame.origin[1]),
        new Vector3(),
      )
      if (!point) return false
      moveAtWorld(point)
      return true
    }
    const drop = (event: DragEvent) => {
      if (update(event)) {
        event.stopPropagation()
        commitStagePlacement()
      }
    }
    canvas.addEventListener('dragover', update)
    canvas.addEventListener('drop', drop)
    return () => {
      canvas.removeEventListener('dragover', update)
      canvas.removeEventListener('drop', drop)
    }
  }, [active, camera, gl, raycaster])
  if (!active || !draft) return null
  const state = preview()
  if (!state?.context.venue) return null
  const frame = stageFrame()
  const { width, height, depth } = draft.item.dimensionsMeters
  const point = draft.item.transform.position
  const position = stageToWorldPosition(point, frame)
  const rotation = stageToWorldRotation(draft.item.transform.rotationDegrees)
  const venue = state.context.venue
  return (
    <group>
      <mesh
        position={[frame.origin[0], frame.origin[1] + 0.015, frame.origin[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(event) => {
          event.stopPropagation()
          moveAtWorld(event.point)
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          moveAtWorld(event.point)
          commitStagePlacement()
        }}
      >
        <planeGeometry args={[venue.widthMeters * 3, venue.depthMeters * 3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group position={position} rotation={rotation}>
        <mesh position={[0, height / 2, 0]} raycast={() => null}>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial color={state.color} transparent opacity={0.28} depthWrite={false} />
        </mesh>
        <mesh position={[0, height / 2, 0]} raycast={() => null}>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial
            color={state.color}
            wireframe
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
        <Html position={[0, height + 0.15, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="stage-ghost-label">
            {draft.item.displayName} · {stagePositionLabel(point, venue.depthMeters)}
            <br />
            距中心线 {Math.abs(point.x).toFixed(2)} 米 · 距台口 {point.z.toFixed(2)} 米
            {!state.valid && (
              <>
                <br />
                请调整：{state.message}
              </>
            )}
          </div>
        </Html>
      </group>
    </group>
  )
}

export function StagePlacementFloorplan({ enabled }: { enabled: boolean }) {
  const active = usePlacementEnabled(enabled)
  const draft = useStagePlacement((state) => state.draft)
  const context = useFloorplanRender()
  const nodes = useScene((state) => state.nodes)
  const levelId = useViewer((state) => state.selection.levelId)
  const group = useRef<SVGGElement>(null)
  const frame = useMemo(() => cameraFloorplanMatrix(nodes, levelId), [nodes, levelId])
  const hasDraft = Boolean(draft)
  useEffect(() => {
    if (!active || !hasDraft || !group.current || !frame) return
    const svg = group.current.ownerSVGElement
    if (!svg) return
    const update = (event: DragEvent) => {
      if (!group.current || !useStagePlacement.getState().draft) return false
      const plan = cameraPointerToPlan(group.current, event.clientX, event.clientY)
      if (!plan) return false
      event.preventDefault()
      moveAtWorld(new Vector3(plan[0], 0, plan[1]).applyMatrix4(frame))
      return true
    }
    const drop = (event: DragEvent) => {
      if (update(event)) {
        event.stopPropagation()
        commitStagePlacement()
      }
    }
    svg.addEventListener('dragover', update)
    svg.addEventListener('drop', drop)
    return () => {
      svg.removeEventListener('dragover', update)
      svg.removeEventListener('drop', drop)
    }
  }, [active, frame, hasDraft])
  if (!active || !draft || !context || !frame) return null
  const state = preview()
  if (!state?.context.venue) return null
  const stage = stageFrame(),
    venue = state.context.venue
  const project = (x: number, z: number) => {
    const p = cameraPlanPoint(stageToWorldPosition({ x, y: 0, z }, stage), frame)
    return `${p[0]},${p[2]}`
  }
  const { position, rotationDegrees } = draft.item.transform
  const dimensions = draft.item.dimensionsMeters
  const angle = (rotationDegrees.y * Math.PI) / 180
  const footprint = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
    .map(([x, z]) => {
      const dx = (x! * dimensions.width) / 2,
        dz = (z! * dimensions.depth) / 2
      return project(
        position.x + dx * Math.cos(angle) + dz * Math.sin(angle),
        position.z - dx * Math.sin(angle) + dz * Math.cos(angle),
      )
    })
    .join(' ')
  const label = cameraPlanPoint(stageToWorldPosition(position, stage), frame)
  const unit = context.unitsPerPixel
  const move = (clientX: number, clientY: number) => {
    if (!group.current) return
    const p = cameraPointerToPlan(group.current, clientX, clientY)
    if (p) moveAtWorld(new Vector3(p[0], 0, p[1]).applyMatrix4(frame))
  }
  return (
    <g ref={group} aria-label="布景落位预览">
      <polygon
        data-stage-placement-surface="true"
        points={[
          project(-venue.widthMeters * 1.5, -venue.depthMeters),
          project(venue.widthMeters * 1.5, -venue.depthMeters),
          project(venue.widthMeters * 1.5, venue.depthMeters * 2),
          project(-venue.widthMeters * 1.5, venue.depthMeters * 2),
        ].join(' ')}
        fill="transparent"
        pointerEvents="all"
        onPointerMove={(event) => {
          event.stopPropagation()
          move(event.clientX, event.clientY)
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          move(event.clientX, event.clientY)
          commitStagePlacement()
        }}
      />
      <g pointerEvents="none">
        <polygon
          points={footprint}
          fill={state.color}
          fillOpacity={0.3}
          stroke={state.color}
          strokeWidth={2 * unit}
          strokeDasharray={`${5 * unit} ${3 * unit}`}
        />
        <text
          x={label[0]}
          y={label[2] - 18 * unit}
          textAnchor="middle"
          fontSize={12 * unit}
          fill={context.palette.measurementLabelText}
        >
          {draft.item.displayName} · {stagePositionLabel(position, venue.depthMeters)}
        </text>
        <text
          x={label[0]}
          y={label[2] + 20 * unit}
          textAnchor="middle"
          fontSize={11 * unit}
          fill={context.palette.measurementLabelText}
        >
          {state.valid
            ? `中心线 ${Math.abs(position.x).toFixed(2)} 米 · 台口 ${position.z.toFixed(2)} 米`
            : '此处不可落位，请调整'}
        </text>
      </g>
    </g>
  )
}
