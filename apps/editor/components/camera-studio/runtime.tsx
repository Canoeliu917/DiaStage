'use client'

import {
  type AnyNodeId,
  emitter,
  getEffectiveNode,
  getFloorStackedPosition,
  sceneRegistry,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useIsolatedFrame as useFrame, useViewer } from '@pascal-app/viewer'
import type { CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { type Object3D, PerspectiveCamera, Vector3 } from 'three'
import { cameraObservationShot } from './beta-observation'
import { type CameraKeyframe, type Shot, sampleMotion, sampleShot, type Vec3 } from './model'
import { useCameraStudio } from './store'

type Session = {
  camera: PerspectiveCamera
  controls: CameraControlsImpl
  position: Vector3
  target: Vector3
  up: Vector3
  fov: number
  enabled: boolean
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
  followObject: Object3D | null
  motion: {
    nodeId: string
    object: Object3D
    position: Vector3
  } | null
}

export function CameraStudioRuntime() {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as CameraControlsImpl | undefined
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const visibleView = useEditor(
    (state) =>
      !state.isFirstPersonMode &&
      !state.isCaptureMode &&
      state.workspaceMode !== 'studio' &&
      (state.isPreviewMode || state.viewMode !== '2d'),
  )
  const renderPaused = useViewer((state) => state.renderPaused)
  const hasScene = useScene((state) => state.rootNodeIds.length > 0)
  const viewReady = visibleView && !renderPaused && hasScene
  const session = useRef<Session | null>(null)
  const clock = useRef({ time: 0, published: 0 })
  const targetPosition = useRef(new Vector3())
  const restoreRef = useRef<() => void>(() => {})

  function restore() {
    const saved = session.current
    session.current = null
    if (!saved) return
    if (saved.motion) {
      const motion = saved.motion
      if (sceneRegistry.nodes.get(motion.nodeId) === motion.object) {
        motion.object.position.copy(motion.position)
        motion.object.updateWorldMatrix(true, true)
      }
      useLiveNodeOverrides
        .getState()
        .clearFields(motion.nodeId, ['cameraStudioPreview', 'position'])
      // Clearing the preview rebinds base-Y props in React. Re-run the floor
      // resolver once so raised slabs retain their original visual height.
      if (useScene.getState().nodes[motion.nodeId as AnyNodeId]) {
        useScene.getState().markDirty(motion.nodeId as AnyNodeId)
      }
    }
    saved.controls.minDistance = saved.minDistance
    saved.controls.maxDistance = saved.maxDistance
    saved.controls.minPolarAngle = saved.minPolarAngle
    saved.controls.maxPolarAngle = saved.maxPolarAngle
    saved.camera.up.copy(saved.up)
    saved.camera.fov = saved.fov
    saved.camera.updateProjectionMatrix()
    void saved.controls.setLookAt(...saved.position.toArray(), ...saved.target.toArray(), false)
    saved.controls.update(0)
    saved.controls.enabled = saved.enabled
    invalidate()
  }
  restoreRef.current = restore

  function fail(message: string) {
    restoreRef.current()
    useCameraStudio.getState().stop()
    useCameraStudio.getState().setNotice(message)
  }

  function findTarget(nodeId: string): Object3D | undefined {
    const nodes = useScene.getState().nodes as Record<string, unknown>
    if (!nodes[nodeId]) return undefined
    return sceneRegistry.nodes.get(nodeId)
  }

  function begin(shot: Shot): boolean {
    if (!viewReady || !(camera instanceof PerspectiveCamera) || !controls?.getTarget) {
      fail('请切换到 3D 透视视图后预演')
      return false
    }
    if (shot.follow && !findTarget(shot.follow.nodeId)) {
      fail('跟随目标未加载或已被删除，预演已停止')
      return false
    }
    const object = shot.motion ? findTarget(shot.motion.nodeId) : undefined
    if (shot.motion && !object) {
      fail('行动线目标未加载或已被删除，预演已停止')
      return false
    }
    if (
      shot.motion &&
      (useLiveNodeOverrides.getState().get(shot.motion.nodeId) ||
        useLiveTransforms.getState().get(shot.motion.nodeId))
    ) {
      fail('目标正在编辑，请结束移动或旋转操作后再预演')
      return false
    }
    emitter.emit('camera-controls:cancel-pose', undefined)
    const saved: Session = {
      camera,
      controls,
      position: controls.getPosition(new Vector3(), false),
      target: controls.getTarget(new Vector3(), false),
      up: camera.up.clone(),
      fov: camera.fov,
      enabled: controls.enabled,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
      minPolarAngle: controls.minPolarAngle,
      maxPolarAngle: controls.maxPolarAngle,
      followObject: shot.follow ? (findTarget(shot.follow.nodeId) ?? null) : null,
      motion: null,
    }
    session.current = saved
    if (shot.motion && object) {
      const position = object.position.clone()
      // Retain the marker while paused too, so the animated object cannot
      // rejoin a static batch before its original pose has been restored.
      useLiveNodeOverrides.getState().set(shot.motion.nodeId, { cameraStudioPreview: true })
      saved.motion = {
        nodeId: shot.motion.nodeId,
        object,
        position,
      }
    }
    controls.enabled = false
    controls.minDistance = 0.001
    controls.maxDistance = 1e6
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI
    clock.current = {
      time: useCameraStudio.getState().time,
      published: useCameraStudio.getState().time,
    }
    return true
  }

  useEffect(() => {
    const capture = (time: number): CameraKeyframe | null => {
      if (!viewReady || !(camera instanceof PerspectiveCamera) || !controls?.getTarget) return null
      return {
        id: crypto.randomUUID(),
        time: Math.max(0, time),
        position: camera.position.toArray(),
        lookAt: controls.getTarget(new Vector3(), false).toArray(),
        fov: camera.fov,
      }
    }
    useCameraStudio.getState().setRuntime({
      canvas: gl.domElement instanceof HTMLCanvasElement ? gl.domElement : null,
      runtimeReady:
        viewReady &&
        camera instanceof PerspectiveCamera &&
        typeof controls?.getTarget === 'function',
      capture,
    })
    const unsubscribe = useCameraStudio.subscribe((next, previous) => {
      if (previous.previewing && !next.previewing) restoreRef.current()
      if (next.previewing || previous.previewing) invalidate()
    })
    const hidden = () => {
      if (document.hidden) useCameraStudio.getState().pause()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', hidden)
      restoreRef.current()
      useCameraStudio.getState().stop()
      useCameraStudio.getState().setRuntime({ canvas: null, runtimeReady: false, capture: null })
    }
  }, [camera, controls, gl, invalidate, viewReady])

  useFrame((_, delta) => {
    if (!viewReady) return
    const state = useCameraStudio.getState()
    if (!state.previewing) return
    const storedShot = state.project.shots.find((shot) => shot.id === state.selectedShotId)
    if (!storedShot) {
      fail('当前机位已不存在，预演已停止')
      return
    }
    const shot = cameraObservationShot(storedShot)
    if (!session.current && !begin(shot)) return
    const saved = session.current!
    if (saved.camera !== camera || saved.controls !== controls) {
      fail('视图已切换，预演已停止并恢复')
      return
    }
    if (state.time !== clock.current.published) clock.current.time = state.time
    if (state.playing)
      clock.current.time = Math.min(shot.duration, clock.current.time + Math.min(delta, 0.1))
    const time = clock.current.time

    if (shot.motion && saved.motion) {
      const object = findTarget(shot.motion.nodeId)
      if (!object || object !== saved.motion.object) {
        fail('行动线目标未加载或已被删除，预演已停止')
        return
      }
      if (useLiveTransforms.getState().get(shot.motion.nodeId)) {
        fail('目标正在编辑，预演已停止')
        return
      }
      const position = sampleMotion(shot.motion, time)
      const overrides = useLiveNodeOverrides.getState()
      const previousPosition = overrides.get(shot.motion.nodeId)?.position as Vec3 | undefined
      if (!previousPosition || position.some((value, axis) => value !== previousPosition[axis])) {
        overrides.set(shot.motion.nodeId, { position })
      }
      const nodes = useScene.getState().nodes
      const node = getEffectiveNode(nodes[shot.motion.nodeId as AnyNodeId]!)
      // Track positions use the node's local base Y. Resolve slab/terrain
      // support exactly as FloorElevationSystem will at priority 1, so the
      // camera follows the rendered height in this same pre-render frame.
      object.position.set(
        ...getFloorStackedPosition({ node, nodes: { ...nodes, [node.id]: node }, position }),
      )
      object.updateWorldMatrix(true, true)
    }
    let target: Vec3 | undefined
    if (shot.follow) {
      const object = findTarget(shot.follow.nodeId)
      if (!object || object !== saved.followObject) {
        fail('跟随目标未加载或已被删除，预演已停止')
        return
      }
      object.updateWorldMatrix(true, false)
      target = object.getWorldPosition(targetPosition.current).toArray()
    }
    const pose = sampleShot(shot, time, target)
    if (pose.position.every((value, i) => Math.abs(value - pose.lookAt[i]!) < 0.0001)) {
      fail('相机位置与注视点重合，请调整跟随偏移或关键帧')
      return
    }
    if (controls!.enabled) controls!.enabled = false
    camera.up.set(0, 1, 0)
    void controls!.setLookAt(...pose.position, ...pose.lookAt, false)
    controls!.update(0)
    ;(camera as PerspectiveCamera).fov = pose.fov
    camera.updateProjectionMatrix()
    if (time - clock.current.published >= 0.05 || !state.playing || time >= shot.duration) {
      clock.current.published = time
      if (state.time !== time || (state.playing && time >= shot.duration)) {
        useCameraStudio.setState({ time, playing: state.playing && time < shot.duration })
      }
    }
    invalidate()
  }, 0.9)

  return null
}

export default CameraStudioRuntime
