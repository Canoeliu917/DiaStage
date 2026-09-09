'use client'

import { useScene } from '@pascal-app/core'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import { OVERLAY_LAYER, SCENE_LAYER, SHADOW_ONLY_LAYER, useViewer } from '@pascal-app/viewer'
import type { CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  LineSegments,
  Mesh,
  SphereGeometry,
  SpotLight,
  Vector3,
} from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'
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

function LightSlot({ light, pose }: { light?: Light; pose?: LightPose }) {
  const source = useMemo(() => {
    const light = new SpotLight('#ffffff', 0)
    light.position.set(0, 4, 0)
    light.angle = Math.PI / 8
    light.updateMatrixWorld()
    light.castShadow = true
    light.layers.set(SCENE_LAYER)
    light.shadow.mapSize.set(512, 512)
    light.shadow.bias = -0.0005
    light.shadow.normalBias = 0.04
    light.shadow.camera.near = 0.05
    light.shadow.camera.layers.enable(SHADOW_ONLY_LAYER)
    return light
  }, [])
  useLayoutEffect(() => {
    source.intensity = light?.enabled ? light.intensity : 0
    if (!light || !pose) return
    source.color.set(light.color)
    source.position.set(...pose.position)
    source.target.position.set(...pose.target)
    source.angle = (light.angle * Math.PI) / 360
    source.penumbra = light.penumbra
    source.shadow.camera.far = Math.max(
      50,
      source.position.distanceTo(source.target.position) * 2 + 10,
    )
    source.target.updateMatrixWorld()
    source.updateMatrixWorld()
  }, [source, light, pose])
  useEffect(() => () => source.dispose(), [source])
  return (
    <>
      <primitive object={source} dispose={null} />
      <primitive object={source.target} />
    </>
  )
}

function makeHelper() {
  const root = new Group(),
    lamp = new Group(),
    target = new Group()
  const material = new MeshBasicNodeMaterial({
    color: '#eeeeee',
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const body = new Mesh(new CylinderGeometry(0.12, 0.16, 0.28, 12), material)
  body.rotation.x = Math.PI / 2
  lamp.add(body)
  target.add(new Mesh(new SphereGeometry(0.08, 10, 6), material))
  const geometry = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()])
  const lineMaterial = new LineBasicNodeMaterial({
    color: '#aaaaaa',
    transparent: true,
    opacity: 0.7,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const line = new LineSegments(geometry, lineMaterial)
  line.raycast = () => {}
  root.add(lamp, target, line)
  root.traverse((object) => {
    object.layers.set(OVERLAY_LAYER)
    object.renderOrder = 1000
    object.frustumCulled = false
  })
  return {
    root,
    lamp,
    target,
    material,
    sync(pose: LightPose) {
      lamp.position.set(...pose.position)
      lamp.lookAt(...pose.target)
      target.position.set(...pose.target)
      const positions = geometry.getAttribute('position')
      positions.setXYZ(0, ...pose.position)
      positions.setXYZ(1, ...pose.target)
      positions.needsUpdate = true
      root.updateMatrixWorld(true)
    },
    dispose() {
      body.geometry.dispose()
      target.children.forEach((child) => {
        if (child instanceof Mesh) child.geometry.dispose()
      })
      geometry.dispose()
      material.dispose()
      lineMaterial.dispose()
    },
  }
}

function LightHandle({
  light,
  sceneId,
  selected,
}: {
  light: Light
  sceneId: string
  selected: boolean
}) {
  const helper = useMemo(makeHelper, [])
  const { camera, gl, invalidate } = useThree()
  const controls = useThree((state) => state.controls) as CameraControlsImpl | undefined
  const editTarget = useLighting((state) => state.editTarget)
  const transform = useMemo(() => new TransformControls(camera), [camera])
  const drag = useRef<{
    project: ReturnType<typeof useLighting.getState>['project']
    pose: LightPose
    inputDragging: boolean
    controlsEnabled: boolean
    field: 'position' | 'target'
  } | null>(null)
  const orbitEnabled = useRef(controls?.enabled ?? true)
  const releaseClickCleanup = useRef<(() => void) | null>(null)
  const owner = lightOwner(sceneId, light.id)
  const finish = (commit: boolean) => {
    const active = drag.current
    if (!active) return
    drag.current = null
    const state = useLighting.getState(),
      scope = useInteractionScope.getState().scope
    const temporary = state.draft?.id === light.id ? state.draft : null
    const owns =
      scope.kind === 'handle-drag' && scope.handle === 'lighting' && scope.nodeId === owner
    const allowed = lightingEditAllowed(sceneId, '3d')
    if (temporary) state.setDraft(null)
    useInteractionScope
      .getState()
      .endIf(
        (scope) =>
          scope.kind === 'handle-drag' && scope.handle === 'lighting' && scope.nodeId === owner,
      )
    if (commit) {
      // Trusted pointer events can run microtasks between native listeners.
      // Keep node selection suppressed through every listener and the trailing click.
      setTimeout(() => {
        if (useInteractionScope.getState().scope.kind !== 'idle') return
        const current = useLighting.getState(),
          viewer = useViewer.getState()
        if (current.loadedSceneId === sceneId && current.selectedLightId === light.id) {
          viewer.setSelection({ selectedIds: [] })
          viewer.setPreviewSelectedIds([])
        }
        viewer.setInputDragging(active.inputDragging)
      }, 0)
      releaseClickCleanup.current?.()
      const clear = () => {
        window.removeEventListener('click', swallow, true)
        clearTimeout(timeout)
        releaseClickCleanup.current = null
      }
      const swallow = (event: Event) => {
        event.preventDefault()
        event.stopImmediatePropagation()
        clear()
      }
      const timeout = setTimeout(clear, 300)
      releaseClickCleanup.current = clear
      window.addEventListener('click', swallow, { capture: true, once: true })
    } else useViewer.getState().setInputDragging(active.inputDragging)
    if (controls) controls.enabled = active.controlsEnabled
    transform.dragging = false
    if (
      commit &&
      owns &&
      allowed &&
      state.project === active.project &&
      state.selectedLightId === light.id &&
      state.editTarget === active.field &&
      temporary
    ) {
      try {
        state.updateLight(light.id, { position: temporary.position, target: temporary.target })
      } catch (error) {
        state.setNotice(error instanceof Error ? error.message : '灯位变换无效')
      }
    }
    const current = useLighting.getState().project.lights.find((entry) => entry.id === light.id)
    helper.sync(current ?? active.pose)
    invalidate()
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  useLayoutEffect(() => {
    helper.sync(light)
    helper.material.color.set(selected ? '#eeeeee' : '#888888')
  }, [helper, light, selected])
  useFrame(() => {
    if (drag.current) {
      const state = useLighting.getState()
      if (
        state.project !== drag.current.project ||
        state.editTarget !== drag.current.field ||
        state.selectedLightId !== light.id ||
        !lightingEditAllowed(sceneId, '3d')
      )
        finishRef.current(false)
    } else {
      const draft = useLighting.getState().draft
      helper.sync(draft?.id === light.id ? draft : light)
      if (controls) orbitEnabled.current = controls.enabled
    }
  }, 0.8)
  useLayoutEffect(() => {
    if (!selected) return
    transform.connect(gl.domElement)
    transform.attach(editTarget === 'position' ? helper.lamp : helper.target)
    transform.setMode('translate')
    transform.size = 0.8
    const raycaster = transform.getRaycaster(),
      oldLayers = raycaster.layers.mask
    raycaster.layers.set(OVERLAY_LAYER)
    transform.getHelper().traverse((object) => {
      object.layers.set(OVERLAY_LAYER)
      object.renderOrder = 1001
    })
    const down = () => {
      if (
        !lightingEditAllowed(sceneId, '3d') ||
        useInteractionScope.getState().scope.kind !== 'idle'
      ) {
        transform.dragging = false
        return
      }
      const state = useLighting.getState()
      drag.current = {
        project: state.project,
        pose: light,
        inputDragging: useViewer.getState().inputDragging,
        controlsEnabled: orbitEnabled.current,
        field: editTarget,
      }
      if (controls) controls.enabled = false
      useViewer.getState().setSelection({ selectedIds: [] })
      useViewer.getState().setPreviewSelectedIds([])
      useViewer.getState().setInputDragging(true)
      useInteractionScope
        .getState()
        .begin({ kind: 'handle-drag', handle: 'lighting', nodeId: owner })
    }
    const change = () => {
      const active = drag.current
      if (!active) return
      const position = (
        active.field === 'position' ? helper.lamp : helper.target
      ).position.toArray()
      const pose = { ...active.pose, [active.field]: position }
      if (validLightPose(pose)) {
        useLighting
          .getState()
          .setDraft({ id: light.id, position: pose.position, target: pose.target })
        helper.sync(pose)
      } else {
        const last = useLighting.getState().draft
        helper.sync(last?.id === light.id ? last : active.pose)
      }
      invalidate()
    }
    const up = () => finishRef.current(true)
    const redraw = () => invalidate()
    transform.addEventListener('mouseDown', down)
    transform.addEventListener('objectChange', change)
    transform.addEventListener('mouseUp', up)
    transform.addEventListener('change', redraw)
    return () => {
      finishRef.current(false)
      transform.removeEventListener('mouseDown', down)
      transform.removeEventListener('objectChange', change)
      transform.removeEventListener('mouseUp', up)
      transform.removeEventListener('change', redraw)
      transform.detach()
      transform.disconnect()
      raycaster.layers.mask = oldLayers
    }
  }, [selected, transform, gl, helper, controls, editTarget, light, owner, sceneId, invalidate])
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        event.stopImmediatePropagation()
        finishRef.current(false)
      }
    }
    const abort = () => finishRef.current(false)
    window.addEventListener('keydown', cancel, true)
    window.addEventListener('pointercancel', abort)
    window.addEventListener('blur', abort)
    return () => {
      window.removeEventListener('keydown', cancel, true)
      window.removeEventListener('pointercancel', abort)
      window.removeEventListener('blur', abort)
      abort()
      releaseClickCleanup.current?.()
      if (transform.domElement) transform.dispose()
      else transform.getHelper().dispose()
      helper.dispose()
    }
  }, [helper, transform])
  return (
    <>
      <primitive
        object={helper.root}
        dispose={null}
        name={`lighting-helper-${light.id}`}
        onPointerDown={(event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          if (useInteractionScope.getState().scope.kind === 'idle') {
            useLighting.getState().selectLight(light.id)
            useViewer.getState().setSelection({ selectedIds: [] })
          }
        }}
      />
      {selected && <primitive object={transform.getHelper()} dispose={null} />}
    </>
  )
}

export function LightingSystem({ enabled, sceneId }: { enabled: boolean; sceneId: string }) {
  const state = useLighting()
  useEditor((state) => lightingEditorView(state, '3d'))
  useInteractionScope(
    (state) =>
      state.scope.kind === 'idle' ||
      (state.scope.kind === 'handle-drag' && state.scope.handle === 'lighting'),
  )
  useScene((state) => state.readOnly)
  useCameraStudio((state) => state.playing || state.previewing || state.recording)
  const paused = useViewer((state) => state.renderPaused)
  const lights = state.loadedSceneId === sceneId ? state.project.lights : []
  const helpers = enabled && !paused && lightingEditAllowed(sceneId, '3d')
  return (
    <>
      {[0, 1, 2, 3].map((slot) => {
        const light = lights[slot]
        return (
          <LightSlot
            key={slot}
            light={light}
            pose={light && state.draft?.id === light.id ? state.draft : light}
          />
        )
      })}
      {helpers &&
        lights.map((light) => (
          <LightHandle
            key={light.id}
            light={light}
            sceneId={sceneId}
            selected={light.id === state.selectedLightId}
          />
        ))}
    </>
  )
}
