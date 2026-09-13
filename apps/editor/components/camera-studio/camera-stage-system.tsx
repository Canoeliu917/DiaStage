'use client'

import { emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import {
  getSceneTheme,
  OVERLAY_LAYER,
  SCENE_LAYER,
  useIsolatedFrame as useFrame,
  useViewer,
  ViewerErrorBoundary,
} from '@pascal-app/viewer'
import type { CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  LineSegments,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import {
  LineBasicNodeMaterial,
  MeshBasicNodeMaterial,
  RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu'
import { cameraObservationShot } from './beta-observation'
import { MONITOR_HEIGHT, MONITOR_WIDTH } from './camera-monitor'
import { renderMonitorPixels } from './camera-monitor-render'
import { transformedCameraPose } from './camera-stage-math'
import { type CameraKeyframe, type CameraPose, type Shot, sampleShot } from './model'
import { useCameraStudio } from './store'

function shotPose(shot: Shot, frame: CameraKeyframe): CameraPose {
  shot = cameraObservationShot(shot)
  if (!shot.follow) return frame
  const target = sceneRegistry.nodes.get(shot.follow.nodeId)
  if (!target) throw new Error('跟随目标尚未加载，请检查运镜设置')
  target.updateWorldMatrix(true, false)
  return sampleShot(shot, frame.time, target.getWorldPosition(new Vector3()).toArray())
}

function applyPose(group: Group, pose: CameraPose) {
  group.position.set(...pose.position)
  group.quaternion.setFromRotationMatrix(
    new Matrix4().lookAt(
      new Vector3(...pose.position),
      new Vector3(...pose.lookAt),
      new Vector3(0, 1, 0),
    ),
  )
  group.updateMatrixWorld(true)
}

function cameraRig() {
  const group = new Group()
  const material = new MeshBasicNodeMaterial({
    color: '#999999',
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const dark = new MeshBasicNodeMaterial({
    color: '#222222',
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const add = (
    geometry: BoxGeometry | CylinderGeometry,
    position: [number, number, number],
    surface = material,
  ) => {
    const mesh = new Mesh(geometry, surface)
    mesh.position.set(...position)
    group.add(mesh)
    return mesh
  }
  add(new BoxGeometry(0.3, 0.2, 0.3), [0, 0, 0.03])
  add(new BoxGeometry(0.2, 0.045, 0.12), [0, 0.14, 0.02])
  add(new CylinderGeometry(0.08, 0.095, 0.2, 12), [0, 0, -0.21], dark).rotation.x = Math.PI / 2
  add(new CylinderGeometry(0.025, 0.025, 0.26, 6), [0, -0.24, 0])
  for (const x of [-0.22, 0.22]) {
    const leg = add(new CylinderGeometry(0.015, 0.015, 0.52, 5), [x / 2, -0.47, 0.08], dark)
    leg.rotation.z = x < 0 ? -0.43 : 0.43
  }
  add(new CylinderGeometry(0.015, 0.015, 0.48, 5), [0, -0.46, -0.14], dark).rotation.x = 0.45
  const lines = [
    new Vector3(0, 0, -0.3),
    new Vector3(0, 0, -0.85),
    new Vector3(-0.09, 0, -0.68),
    new Vector3(0, 0, -0.85),
    new Vector3(0.09, 0, -0.68),
    new Vector3(0, 0, -0.85),
  ]
  const line = new LineSegments(
    new BufferGeometry().setFromPoints(lines),
    new LineBasicNodeMaterial({
      color: '#bbbbbb',
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  line.raycast = () => {}
  group.add(line)
  group.traverse((object) => {
    object.layers.set(OVERLAY_LAYER)
    object.renderOrder = 1000
    object.frustumCulled = false
  })
  return {
    group,
    material,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof Mesh || object instanceof LineSegments) object.geometry.dispose()
      })
      material.dispose()
      dark.dispose()
      line.material.dispose()
    },
  }
}

function CameraTransform({
  object,
  mode,
  controlRef,
  onMouseDown,
  onObjectChange,
  onMouseUp,
}: {
  object: Group
  mode: 'translate' | 'rotate'
  controlRef: MutableRefObject<TransformControls | null>
  onMouseDown: () => void
  onObjectChange: () => void
  onMouseUp: () => void
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const control = useMemo(() => new TransformControls(camera), [camera])
  const callbacks = useRef({ onMouseDown, onObjectChange, onMouseUp })
  callbacks.current = { onMouseDown, onObjectChange, onMouseUp }
  useLayoutEffect(() => {
    controlRef.current = control
    control.connect(gl.domElement)
    control.attach(object)
    control.size = 0.8
    const raycaster = control.getRaycaster()
    const previousLayers = raycaster.layers.mask
    raycaster.layers.set(OVERLAY_LAYER)
    control.getHelper().traverse((child) => {
      child.layers.set(OVERLAY_LAYER)
      child.renderOrder = 1001
    })
    const down = () => callbacks.current.onMouseDown()
    const change = () => {
      callbacks.current.onObjectChange()
      invalidate()
    }
    const up = () => callbacks.current.onMouseUp()
    const redraw = () => invalidate()
    control.addEventListener('mouseDown', down)
    control.addEventListener('objectChange', change)
    control.addEventListener('mouseUp', up)
    control.addEventListener('change', redraw)
    return () => {
      control.removeEventListener('mouseDown', down)
      control.removeEventListener('objectChange', change)
      control.removeEventListener('mouseUp', up)
      control.removeEventListener('change', redraw)
      control.detach()
      control.dispose()
      raycaster.layers.mask = previousLayers
      controlRef.current = null
    }
  }, [control, controlRef, gl, invalidate, object])
  useLayoutEffect(() => {
    control.setMode(mode)
  }, [control, mode])
  return <primitive object={control.getHelper()} dispose={null} />
}

function CameraActor({
  shot,
  frame,
  selected,
}: {
  shot: Shot
  frame: CameraKeyframe
  selected: boolean
}) {
  const rig = useMemo(cameraRig, [])
  const transform = useRef<TransformControls | null>(null)
  const controls = useThree((state) => state.controls) as CameraControlsImpl | undefined
  const observerCamera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const mode = useCameraStudio((state) => state.stageTransformMode)
  const orbitEnabled = useRef(controls?.enabled ?? true)
  const owner = `camera:${shot.id}:${frame.id}`
  const drag = useRef<{
    pose: CameraPose
    project: ReturnType<typeof useCameraStudio.getState>['project']
    controlsEnabled: boolean
    inputDragging: boolean
    mode: 'translate' | 'rotate'
  } | null>(null)

  const cancel = () => {
    const previous = drag.current
    if (!previous) return
    transform.current?.reset()
    if (transform.current) transform.current.dragging = false
    applyPose(rig.group, previous.pose)
    drag.current = null
    if (
      useCameraStudio.getState().stageDraft?.shotId === shot.id &&
      useCameraStudio.getState().stageDraft?.frameId === frame.id
    )
      useCameraStudio.getState().setStageDraft(null)
    useInteractionScope
      .getState()
      .endIf(
        (scope) =>
          scope.kind === 'handle-drag' && scope.handle === 'camera-stage' && scope.nodeId === owner,
      )
    if (controls) controls.enabled = previous.controlsEnabled
    useViewer.getState().setInputDragging(previous.inputDragging)
    invalidate()
  }
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        event.stopImmediatePropagation()
        cancelRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      cancelRef.current()
      rig.dispose()
    }
  }, [rig])
  useLayoutEffect(() => {
    if (drag.current) {
      if (drag.current.project === useCameraStudio.getState().project) return
      cancelRef.current()
    }
    try {
      applyPose(rig.group, shotPose(shot, frame))
    } catch {
      applyPose(rig.group, frame)
    }
    rig.material.color.set(selected ? '#eeeeee' : '#999999')
  }, [rig, shot, frame, selected])
  useEffect(() => {
    if (drag.current && drag.current.mode !== mode) cancelRef.current()
  }, [mode])
  useFrame(() => {
    const overlap = rig.group.position.distanceTo(observerCamera.position) < 0.55
    rig.group.visible = !overlap
    if (transform.current) {
      transform.current.getHelper().visible = !overlap
      transform.current.enabled = Boolean(drag.current) || !overlap
    }
    if (controls && !drag.current && !transform.current?.dragging)
      orbitEnabled.current = controls.enabled
    if (!drag.current) {
      try {
        const draft = useCameraStudio.getState().stageDraft
        applyPose(
          rig.group,
          draft?.shotId === shot.id && draft.frameId === frame.id
            ? draft.pose
            : shotPose(shot, frame),
        )
      } catch {
        /* The monitor explains the missing target. */
      }
    }
  }, 0.8)

  return (
    <>
      <primitive
        object={rig.group}
        dispose={null}
        name={`camera-stage-${shot.id}`}
        onPointerDown={(event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          if (!useCameraStudio.getState().stageReady) return
          if (!selected) useCameraStudio.getState().selectShot(shot.id)
          useViewer.getState().setSelection({ selectedIds: [] })
          if (shot.follow)
            useCameraStudio
              .getState()
              .setNotice('此机位正在跟随目标；请先在运镜设置关闭跟随，再拖拽摄像机')
        }}
      />
      {selected && !shot.follow && !shot.stageLocked && (
        <CameraTransform
          controlRef={transform}
          object={rig.group}
          mode={mode}
          onMouseDown={() => {
            const state = useCameraStudio.getState()
            if (
              !state.stageReady ||
              state.recording ||
              state.previewing ||
              state.playing ||
              shot.stageLocked
            )
              return
            drag.current = {
              pose: {
                position: rig.group.position.toArray(),
                lookAt: [...frame.lookAt],
                fov: frame.fov,
              },
              project: state.project,
              controlsEnabled: orbitEnabled.current,
              inputDragging: useViewer.getState().inputDragging,
              mode,
            }
            if (controls) controls.enabled = false
            useViewer.getState().setInputDragging(true)
            useInteractionScope
              .getState()
              .begin({ kind: 'handle-drag', handle: 'camera-stage', nodeId: owner })
          }}
          onObjectChange={() => {
            if (!drag.current) return
            const pose = transformedCameraPose(
              drag.current.pose,
              rig.group.position.toArray(),
              new Vector3(0, 0, -1).applyQuaternion(rig.group.quaternion).toArray(),
              mode,
            )
            useCameraStudio.getState().setStageDraft({ shotId: shot.id, frameId: frame.id, pose })
          }}
          onMouseUp={() => {
            const previous = drag.current
            if (!previous) return
            const state = useCameraStudio.getState()
            if (
              state.recording ||
              state.previewing ||
              state.playing ||
              state.project !== previous.project ||
              state.selectedShotId !== shot.id ||
              state.selectedKeyframeId !== frame.id
            ) {
              cancelRef.current()
              return
            }
            const pose =
              state.stageDraft?.shotId === shot.id && state.stageDraft.frameId === frame.id
                ? state.stageDraft.pose
                : null
            drag.current = null
            state.setStageDraft(null)
            useInteractionScope
              .getState()
              .endIf(
                (scope) =>
                  scope.kind === 'handle-drag' &&
                  scope.handle === 'camera-stage' &&
                  scope.nodeId === owner,
              )
            if (controls) controls.enabled = previous.controlsEnabled
            useViewer.getState().setInputDragging(previous.inputDragging)
            if (pose) {
              try {
                state.updateShot(shot.id, {
                  keyframes: state.project.shots
                    .find((entry) => entry.id === shot.id)!
                    .keyframes.map((key) => (key.id === frame.id ? { ...key, ...pose } : key)),
                })
              } catch (error) {
                applyPose(rig.group, previous.pose)
                state.setNotice(error instanceof Error ? error.message : '摄像机变换无效')
              }
            }
          }}
        />
      )}
    </>
  )
}

function MonitorRenderer({ shot, frame }: { shot: Shot; frame: CameraKeyframe }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const resource = useRef<{
    target: RenderTarget
    camera: PerspectiveCamera
    alive: boolean
    pending: boolean
    last: number
    failed: boolean
    signature: string
    nodes: unknown
    materials: unknown
    registry: number
  } | null>(null)
  useEffect(() => {
    if (typeof (gl as unknown as WebGPURenderer).readRenderTargetPixelsAsync !== 'function') {
      useCameraStudio.getState().setMonitorStatus('unavailable', '当前渲染器不支持独立监看')
      return
    }
    const target = new RenderTarget(MONITOR_WIDTH, MONITOR_HEIGHT, {
      type: UnsignedByteType,
      colorSpace: SRGBColorSpace,
    })
    const camera = new PerspectiveCamera(50, 16 / 9, 0.05, 100000)
    camera.layers.set(SCENE_LAYER)
    const current = {
      target,
      camera,
      alive: true,
      pending: false,
      last: -Infinity,
      failed: false,
      signature: '',
      nodes: undefined as unknown,
      materials: undefined as unknown,
      registry: -1,
    }
    resource.current = current
    useCameraStudio.getState().setMonitorStatus('waiting', '正在生成所选机位画面')
    return () => {
      current.alive = false
      resource.current = null
      if (!current.pending) target.dispose()
    }
  }, [gl])
  useFrame(() => {
    const current = resource.current
    const state = useCameraStudio.getState()
    const canvas = state.monitorCanvas
    if (
      !current ||
      current.pending ||
      current.failed ||
      !canvas ||
      document.hidden ||
      performance.now() - current.last < 250
    )
      return
    const renderer = gl as unknown as WebGPURenderer
    if (typeof renderer.readRenderTargetPixelsAsync !== 'function') {
      current.failed = true
      state.setMonitorStatus('unavailable', '当前渲染器不支持独立监看')
      return
    }
    let pose: CameraPose
    try {
      pose =
        state.stageDraft?.shotId === shot.id && state.stageDraft.frameId === frame.id
          ? state.stageDraft.pose
          : shotPose(shot, frame)
    } catch (error) {
      state.setMonitorStatus(
        'unavailable',
        error instanceof Error ? error.message : '取景目标不可用',
      )
      return
    }
    const sceneState = useScene.getState()
    const signature = [
      ...pose.position,
      ...pose.lookAt,
      pose.fov,
      useViewer.getState().sceneTheme,
    ].join(',')
    if (
      signature === current.signature &&
      sceneState.nodes === current.nodes &&
      sceneState.materials === current.materials &&
      current.registry === sceneRegistry.revision
    )
      return
    // Wait for geometry rebuilds before recording this scene version as rendered.
    if (sceneState.dirtyNodes.size) return
    current.signature = signature
    current.nodes = sceneState.nodes
    current.materials = sceneState.materials
    current.registry = sceneRegistry.revision
    current.camera.position.set(...pose.position)
    current.camera.lookAt(...pose.lookAt)
    current.camera.fov = pose.fov
    current.camera.updateProjectionMatrix()
    current.camera.updateMatrixWorld()
    current.pending = true
    current.last = performance.now()
    const project = state.project
    void renderMonitorPixels(
      renderer,
      scene,
      current.camera,
      current.target,
      getSceneTheme(useViewer.getState().sceneTheme).background,
    )
      .then((pixels) => {
        const next = useCameraStudio.getState()
        if (
          !current.alive ||
          next.selectedShotId !== shot.id ||
          next.selectedKeyframeId !== frame.id ||
          next.project !== project ||
          next.monitorCanvas !== canvas ||
          next.recording ||
          next.previewing ||
          next.playing
        )
          return
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建监看画布')
        context.putImageData(new ImageData(pixels, MONITOR_WIDTH, MONITOR_HEIGHT), 0, 0)
        next.setMonitorStatus('live')
      })
      .catch((error: unknown) => {
        const next = useCameraStudio.getState()
        if (
          !current.alive ||
          next.project !== project ||
          next.selectedShotId !== shot.id ||
          next.selectedKeyframeId !== frame.id ||
          next.monitorCanvas !== canvas ||
          next.recording ||
          next.previewing ||
          next.playing
        )
          return
        current.failed = true
        useCameraStudio
          .getState()
          .setMonitorStatus(
            'error',
            `监看暂停：${error instanceof Error ? error.message : '渲染失败'}。关闭再开启监看可重试。`,
          )
      })
      .finally(() => {
        current.pending = false
        if (!current.alive) current.target.dispose()
      })
  }, 3)
  return null
}

export function CameraStageSystem({ enabled }: { enabled: boolean }) {
  const project = useCameraStudio((state) => state.project)
  const selectedId = useCameraStudio((state) => state.selectedShotId)
  const frameId = useCameraStudio((state) => state.selectedKeyframeId)
  const showActors = useCameraStudio((state) => state.showStageCameras)
  const showMonitor = useCameraStudio((state) => state.monitorVisible)
  const playback = useCameraStudio((state) => state.playing || state.previewing || state.recording)
  const editorReady = useEditor(
    (state) =>
      state.workspaceMode === 'edit' &&
      !state.isPreviewMode &&
      !state.isCaptureMode &&
      !state.isFirstPersonMode &&
      state.viewMode !== '2d' &&
      state.activeSidebarPanel !== 'remount' &&
      state.mode === 'select',
  )
  const idle = useInteractionScope(
    (state) =>
      state.scope.kind === 'idle' ||
      (state.scope.kind === 'handle-drag' && state.scope.handle === 'camera-stage'),
  )
  const sceneReady = useScene((state) => !state.readOnly && state.rootNodeIds.length > 0)
  const paused = useViewer((state) => state.renderPaused)
  const controls = useThree((state) => state.controls) as CameraControlsImpl | undefined
  const invalidate = useThree((state) => state.invalidate)
  const ready = enabled && editorReady && sceneReady && idle && !playback && !paused
  const observationShots = useMemo(() => project.shots.map(cameraObservationShot), [project])
  const selected = observationShots.find((shot) => shot.id === selectedId)
  const frame = selected?.keyframes.find((frame) => frame.id === frameId) ?? selected?.keyframes[0]
  useEffect(() => {
    const state = useCameraStudio.getState()
    state.setStageReady(ready)
    if (!ready)
      state.setMonitorStatus(
        'paused',
        playback
          ? '主画面取景中；点击“停止并还原”后可继续摆放摄像机'
          : '请返回舞台镜头的三维选择视图后监看',
      )
    else if (!selected) state.setMonitorStatus('waiting', '从当前视角创建或选择一个摄像机')
    else if (!showMonitor) state.setMonitorStatus('off', '独立监看已关闭')
    return () => {
      useCameraStudio.getState().setStageReady(false)
      useCameraStudio.getState().setMonitorStatus('paused', '请返回舞台镜头的三维选择视图后监看')
    }
  }, [ready, playback, selected, showMonitor])
  useEffect(() => {
    if (!ready || !controls) return
    const focus = () => {
      const state = useCameraStudio.getState()
      const shot = state.project.shots.find((shot) => shot.id === state.selectedShotId)
      const key =
        shot?.keyframes.find((frame) => frame.id === state.selectedKeyframeId) ?? shot?.keyframes[0]
      if (!shot || !key) return
      let pose: CameraPose
      try {
        pose = shotPose(shot, key)
      } catch {
        pose = key
      }
      const forward = new Vector3(...pose.lookAt).sub(new Vector3(...pose.position)).normalize()
      const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize()
      const eye = new Vector3(...pose.position)
        .addScaledVector(forward, -3)
        .addScaledVector(right, 1.6)
        .add(new Vector3(0, 1.2, 0))
      emitter.emit('camera-controls:cancel-pose', undefined)
      void controls.setLookAt(...eye.toArray(), ...pose.position, true)
      invalidate()
    }
    useCameraStudio.getState().setStageFocus(focus)
    return () => {
      if (useCameraStudio.getState().stageFocus === focus)
        useCameraStudio.getState().setStageFocus(null)
    }
  }, [ready, controls, invalidate])
  if (!ready) return null
  return (
    <>
      {showActors &&
        observationShots.map((shot) => {
          const active = shot.id === selectedId
          const key = active ? frame : shot.keyframes[0]
          return key ? (
            <CameraActor key={`${shot.id}:${key.id}`} shot={shot} frame={key} selected={active} />
          ) : null
        })}
      {showMonitor && selected && frame && (
        <ViewerErrorBoundary
          fallback={null}
          scope="monitor-render"
          onError={(error) => useCameraStudio.getState().setMonitorStatus('error', error.message)}
        >
          <MonitorRenderer key={`${selected.id}:${frame.id}`} shot={selected} frame={frame} />
        </ViewerErrorBoundary>
      )}
    </>
  )
}
