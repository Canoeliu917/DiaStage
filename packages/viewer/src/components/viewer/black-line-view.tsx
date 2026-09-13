import { sceneRegistry, useLiveTransforms } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Object3D } from 'three'
import { createBlackLineScene } from '../../lib/black-line-scene'
import useViewer from '../../store/use-viewer'

export function BlackLineView() {
  const { gl, scene, camera } = useThree()
  const display = useMemo(createBlackLineScene, [])
  useEffect(() => {
    gl.domElement.dataset.viewStyle = 'black-line'
    return () => {
      display.dispose()
      delete gl.domElement.dataset.viewStyle
    }
  }, [display, gl])
  // After live transforms and contact feedback have settled for this frame.
  useFrame(() => {
    const viewer = useViewer.getState()
    const selected = new Set<Object3D>(viewer.outliner.selectedObjects)
    for (const id of [...viewer.selection.selectedIds, ...viewer.externalSelectedIds]) {
      const object = sceneRegistry.nodes.get(id)
      if (object) selected.add(object)
    }
    const previews = new Set<Object3D>()
    for (const id of useLiveTransforms.getState().transforms.keys()) {
      const object = sceneRegistry.nodes.get(id)
      if (object) previews.add(object)
    }
    display.sync(scene, selected, previews)
    gl.render(display.scene, camera)
  }, 5)
  return null
}
