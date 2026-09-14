'use client'

import { emitter } from '@pascal-app/core'
import { stageToWorldPosition } from '@pascal-app/core/stage'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import type { CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { currentStageContext, stageFrame } from '@/lib/stage/context'
import { useStageTransform } from './transform-mode'

export function StageCameraGuard({ enabled }: { enabled: boolean }) {
  const { controls } = useThree()
  useEffect(() => {
    if (!enabled || !controls) return
    const camera = controls as unknown as CameraControlsImpl
    let restore: boolean | null = null
    const update = () => {
      const blocked =
        useStageTransform.getState().cameraLocked ||
        useViewer.getState().inputDragging ||
        useInteractionScope.getState().scope.kind !== 'idle'
      if (blocked && restore === null) {
        restore = camera.enabled
        const position = camera.getPosition(new Vector3(), false)
        const target = camera.getTarget(new Vector3(), false)
        void camera.setLookAt(...position.toArray(), ...target.toArray(), false)
        camera.enabled = false
      } else if (!blocked && restore !== null) {
        camera.enabled = restore
        restore = null
      }
    }
    const unsubscribe = [
      useStageTransform.subscribe(update),
      useViewer.subscribe(update),
      useInteractionScope.subscribe(update),
    ]
    const key = (event: KeyboardEvent) => {
      if (
        !useStageTransform.getState().cameraLocked ||
        !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF'].includes(event.code) ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable=true]'))
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', key, true)
    const compass = (event: MouseEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('button[aria-label="视图朝北"]')
      )
        return
      if (useStageTransform.getState().cameraLocked || useViewer.getState().inputDragging) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (useEditor.getState().viewMode !== '3d') return
      const venue = currentStageContext().venue
      if (!venue) return
      event.preventDefault()
      event.stopImmediatePropagation()
      // This stage-only compass reset uses a nearby audience position. Other compass paths stay unchanged.
      const frame = stageFrame()
      emitter.emit('camera-controls:apply-pose', {
        position: stageToWorldPosition({ x: 0, y: 1.6, z: -1.2 }, frame),
        target: stageToWorldPosition({ x: 0, y: 1.2, z: venue.depthMeters / 2 }, frame),
        projection: 'perspective',
        fov: 50,
      })
    }
    window.addEventListener('click', compass, true)
    update()
    return () => {
      for (const stop of unsubscribe) stop()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('click', compass, true)
      if (restore !== null) camera.enabled = restore
    }
  }, [controls, enabled])
  return null
}
