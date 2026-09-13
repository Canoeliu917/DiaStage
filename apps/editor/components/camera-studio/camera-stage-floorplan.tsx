'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getLevelElevations,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { useEditor, useFloorplanRender, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef } from 'react'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { cameraObservationShot } from './beta-observation'
import { type CameraPose, type CameraProject, type Shot, sampleShot, type Vec3 } from './model'
import { useCameraStudio } from './store'

type PlanPoint = [number, number]

export function cameraFloorplanMatrix(
  nodes: Record<AnyNodeId, AnyNode>,
  levelId: string | null,
): Matrix4 | null {
  if (!levelId || nodes[levelId as AnyNodeId]?.type !== 'level') return null
  const elevation = getLevelElevations(nodes).get(levelId)
  if (!elevation) return null
  const building = elevation.buildingId ? nodes[elevation.buildingId as AnyNodeId] : null
  const matrix = new Matrix4()
  if (building?.type === 'building')
    matrix.compose(
      new Vector3(...building.position),
      new Quaternion().setFromEuler(new Euler(...building.rotation)),
      new Vector3(1, 1, 1),
    )
  return matrix.multiply(new Matrix4().makeTranslation(0, elevation.baseY, 0))
}

export function cameraPlanPoint(pose: Vec3, frame: Matrix4): Vec3 {
  return new Vector3(...pose).applyMatrix4(frame.clone().invert()).toArray()
}

export function moveCameraInPlan(
  original: CameraPose,
  frame: Matrix4,
  start: PlanPoint,
  end: PlanPoint,
  mode: 'translate' | 'rotate',
): CameraPose {
  const position = new Vector3(...cameraPlanPoint(original.position, frame))
  const lookAt = new Vector3(...cameraPlanPoint(original.lookAt, frame))
  if (mode === 'translate') {
    const offset = new Vector3(end[0] - start[0], 0, end[1] - start[1])
    position.add(offset)
    lookAt.add(offset)
  } else {
    const dx = end[0] - position.x,
      dz = end[1] - position.z
    const distance = Math.hypot(lookAt.x - position.x, lookAt.z - position.z)
    const length = Math.hypot(dx, dz)
    if (length < 0.0001 || distance < 0.0001) return original
    lookAt.x = position.x + (dx / length) * distance
    lookAt.z = position.z + (dz / length) * distance
  }
  return {
    position: position.applyMatrix4(frame).toArray(),
    lookAt: lookAt.applyMatrix4(frame).toArray(),
    fov: original.fov,
  }
}

export function cameraPointerToPlan(
  group: SVGGElement,
  clientX: number,
  clientY: number,
): PlanPoint | null {
  const matrix = group.getScreenCTM(),
    svg = group.ownerSVGElement
  if (!matrix || !svg) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const result = point.matrixTransform(matrix.inverse())
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? [result.x, result.y] : null
}

type Drag = {
  pointerId: number
  element: SVGGElement
  shot: Shot
  frameId: string
  original: CameraPose
  project: CameraProject
  nodes: Record<AnyNodeId, AnyNode>
  levelId: string
  matrix: Matrix4
  start: PlanPoint
  mode: 'translate' | 'rotate'
}

const ownerId = (shotId: string, frameId: string) => `camera:${shotId}:${frameId}`

export function CameraStageFloorplan({ enabled }: { enabled: boolean }) {
  const context = useFloorplanRender()
  const nodes = useScene((state) => state.nodes)
  const readOnly = useScene((state) => state.readOnly)
  const levelId = useViewer((state) => state.selection.levelId)
  const project = useCameraStudio((state) => state.project)
  const selectedId = useCameraStudio((state) => state.selectedShotId)
  const frameId = useCameraStudio((state) => state.selectedKeyframeId)
  const visible = useCameraStudio((state) => state.showStageCameras)
  const draft = useCameraStudio((state) => state.stageDraft)
  const playback = useCameraStudio((state) => state.playing || state.previewing || state.recording)
  const scope = useInteractionScope((state) => state.scope)
  const editorReady = useEditor(
    (state) =>
      state.workspaceMode === 'edit' &&
      state.mode === 'select' &&
      state.viewMode !== '3d' &&
      state.activeSidebarPanel !== 'picture' &&
      !state.isPreviewMode &&
      !state.isCaptureMode &&
      !state.isFirstPersonMode,
  )
  const matrix = useMemo(() => cameraFloorplanMatrix(nodes, levelId), [nodes, levelId])
  const ready = enabled && visible && !readOnly && !playback && editorReady && !!context && !!matrix
  const floorplanReady =
    ready &&
    (scope.kind === 'idle' || (scope.kind === 'handle-drag' && scope.handle === 'camera-stage'))
  const group = useRef<SVGGElement>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    useCameraStudio.getState().setFloorplanReady(floorplanReady)
    return () => useCameraStudio.getState().setFloorplanReady(false)
  }, [floorplanReady])

  const finish = (commit: boolean) => {
    const active = drag.current
    if (!active) return
    drag.current = null
    const state = useCameraStudio.getState()
    const editor = useEditor.getState()
    const owner = ownerId(active.shot.id, active.frameId)
    const currentScope = useInteractionScope.getState().scope
    const owns =
      currentScope.kind === 'handle-drag' &&
      currentScope.handle === 'camera-stage' &&
      currentScope.nodeId === owner
    const temporary = state.stageDraft
    const matchesDraft =
      temporary?.shotId === active.shot.id && temporary.frameId === active.frameId
    if (matchesDraft) state.setStageDraft(null)
    useInteractionScope
      .getState()
      .endIf(
        (current) =>
          current.kind === 'handle-drag' &&
          current.handle === 'camera-stage' &&
          current.nodeId === owner,
      )
    if (active.element.hasPointerCapture(active.pointerId))
      active.element.releasePointerCapture(active.pointerId)
    if (
      !commit ||
      !owns ||
      !matchesDraft ||
      state.project !== active.project ||
      state.selectedShotId !== active.shot.id ||
      state.selectedKeyframeId !== active.frameId ||
      state.recording ||
      state.playing ||
      state.previewing ||
      editor.workspaceMode !== 'edit' ||
      editor.mode !== 'select' ||
      editor.viewMode === '3d' ||
      editor.isPreviewMode ||
      editor.isCaptureMode ||
      editor.isFirstPersonMode ||
      useScene.getState().readOnly ||
      useScene.getState().nodes !== active.nodes ||
      useViewer.getState().selection.levelId !== active.levelId
    )
      return
    try {
      state.updateShot(active.shot.id, {
        keyframes: state.project.shots
          .find((entry) => entry.id === active.shot.id)!
          .keyframes.map((key) =>
            key.id === active.frameId ? { ...key, ...temporary.pose } : key,
          ),
      })
    } catch (error) {
      state.setNotice(error instanceof Error ? error.message : '二维机位变换无效')
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      finishRef.current(false)
    }
    window.addEventListener('keydown', cancel, true)
    return () => {
      window.removeEventListener('keydown', cancel, true)
      finishRef.current(false)
    }
  }, [])
  useEffect(() => {
    const active = drag.current
    if (
      active &&
      (!ready ||
        project !== active.project ||
        nodes !== active.nodes ||
        levelId !== active.levelId ||
        selectedId !== active.shot.id ||
        frameId !== active.frameId ||
        scope.kind !== 'handle-drag' ||
        scope.nodeId !== ownerId(active.shot.id, active.frameId) ||
        scope.handle !== 'camera-stage')
    )
      finishRef.current(false)
  }, [ready, project, nodes, levelId, selectedId, frameId, scope])

  const start = (event: ReactPointerEvent<SVGGElement>, shot: Shot, keyId: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (
      !ready ||
      !matrix ||
      !levelId ||
      !group.current ||
      useInteractionScope.getState().scope.kind !== 'idle'
    )
      return
    const state = useCameraStudio.getState()
    if (state.selectedShotId !== shot.id) state.selectShot(shot.id)
    state.selectKeyframe(keyId)
    useViewer.getState().setSelection({ selectedIds: [] })
    if (shot.stageLocked) {
      state.setNotice(`${shot.name}已固定，请先解除固定。`)
      return
    }
    if (shot.follow) {
      state.setNotice('此机位正在跟随目标；请先关闭跟随，再移动或调整朝向')
      return
    }
    const key = shot.keyframes.find((key) => key.id === keyId)
    const point = cameraPointerToPlan(group.current, event.clientX, event.clientY)
    if (!key || !point) return
    drag.current = {
      pointerId: event.pointerId,
      element: group.current,
      shot,
      frameId: keyId,
      original: key,
      project: state.project,
      nodes,
      levelId,
      matrix,
      start: point,
      mode: state.stageTransformMode,
    }
    group.current.setPointerCapture(event.pointerId)
    useInteractionScope
      .getState()
      .begin({ kind: 'handle-drag', nodeId: ownerId(shot.id, keyId), handle: 'camera-stage' })
  }

  if (!ready || !matrix || !context) return null
  const unit = context.unitsPerPixel
  return (
    <g
      ref={group}
      data-camera-stage-floorplan=""
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerMove={(event) => {
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        event.stopPropagation()
        const owner = useInteractionScope.getState().scope
        if (
          owner.kind !== 'handle-drag' ||
          owner.handle !== 'camera-stage' ||
          owner.nodeId !== ownerId(active.shot.id, active.frameId)
        ) {
          finish(false)
          return
        }
        const point = cameraPointerToPlan(active.element, event.clientX, event.clientY)
        if (point)
          useCameraStudio.getState().setStageDraft({
            shotId: active.shot.id,
            frameId: active.frameId,
            pose: moveCameraInPlan(
              active.original,
              active.matrix,
              active.start,
              point,
              active.mode,
            ),
          })
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return
        event.stopPropagation()
        finish(true)
      }}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => finish(false)}
    >
      {project.shots.map((storedShot) => {
        const shot = cameraObservationShot(storedShot)
        const selected = shot.id === selectedId
        const key =
          (selected ? shot.keyframes.find((key) => key.id === frameId) : undefined) ??
          shot.keyframes[0]
        if (!key) return null
        let pose: CameraPose =
          draft?.shotId === shot.id && draft.frameId === key.id ? draft.pose : key
        if (shot.follow) {
          const target = sceneRegistry.nodes.get(shot.follow.nodeId)
          if (!target || !nodes[shot.follow.nodeId as AnyNodeId]) return null
          target.updateWorldMatrix(true, false)
          pose = sampleShot(shot, key.time, target.getWorldPosition(new Vector3()).toArray())
        }
        const position = cameraPlanPoint(pose.position, matrix),
          target = cameraPlanPoint(pose.lookAt, matrix)
        const angle = (Math.atan2(target[2] - position[2], target[0] - position[0]) * 180) / Math.PI
        const color = selected ? context.palette.selectedStroke : context.palette.measurementStroke
        return (
          <g
            key={shot.id}
            role="button"
            aria-label={`${shot.name}：${shot.stageLocked ? '已固定' : '拖动移动或调整机位朝向'}`}
            tabIndex={0}
            transform={`translate(${position[0]} ${position[2]})`}
            onPointerDown={(event) => start(event, shot, key.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              event.stopPropagation()
              if (useInteractionScope.getState().scope.kind !== 'idle') return
              useCameraStudio.getState().selectShot(shot.id)
              useCameraStudio.getState().selectKeyframe(key.id)
            }}
            style={{ cursor: shot.stageLocked || shot.follow ? 'pointer' : 'grab' }}
          >
            <title>
              {shot.name} · {key.time.toFixed(2)} 秒 · 高度 {pose.position[1].toFixed(2)} 米
            </title>
            <g transform={`rotate(${angle})`}>
              <rect
                x={-12 * unit}
                y={-12 * unit}
                width={52 * unit}
                height={24 * unit}
                fill="transparent"
              />
              <rect
                x={-10 * unit}
                y={-7 * unit}
                width={20 * unit}
                height={14 * unit}
                fill={context.palette.measurementLabelBackground}
                stroke={color}
                strokeWidth={1.5 * unit}
              />
              <path
                d={`M ${10 * unit} ${-5 * unit} L ${17 * unit} 0 L ${10 * unit} ${5 * unit}`}
                fill="none"
                stroke={color}
                strokeWidth={1.5 * unit}
              />
              <path
                d={`M ${17 * unit} 0 H ${36 * unit} M ${31 * unit} ${-4 * unit} L ${36 * unit} 0 L ${31 * unit} ${4 * unit}`}
                fill="none"
                stroke={color}
                strokeWidth={unit}
              />
            </g>
            <text
              y={-18 * unit}
              textAnchor="middle"
              fontSize={11 * unit}
              fill={context.palette.measurementLabelText}
              transform={`rotate(${-context.sceneRotationDeg})`}
              pointerEvents="none"
            >
              {shot.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
