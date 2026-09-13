'use client'

import '../../../three-types'

import { useEffect, useMemo } from 'react'
import { PlaneGeometry } from 'three'
import { distance, smoothstep, uv, vec2 } from 'three/tsl'
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'
import { EDITOR_LAYER } from '../../../lib/constants'
import { createLineGeometry, getBoxEdgePoints } from './placement-box-geometry'

const VALID_COLOR = 0x22_c5_5e
const INVALID_COLOR = 0xef_44_44

/** Wireframe footprint shown while a stage object follows the cursor. */
export function PlacementBox({
  dimensions,
  position,
  rotationY = 0,
  valid,
}: {
  dimensions: [number, number, number]
  position: [number, number, number]
  rotationY?: number
  valid: boolean
}) {
  const [width, height, depth] = dimensions
  const edgeGeometry = useMemo(
    () =>
      createLineGeometry(
        getBoxEdgePoints({
          min: [-width / 2, 0, -depth / 2],
          max: [width / 2, height, depth / 2],
          dimensions: [width, height, depth],
          center: [0, height / 2, 0],
        }),
      ),
    [width, height, depth],
  )
  const basePlaneGeometry = useMemo(() => {
    const geometry = new PlaneGeometry(width, depth)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, 0.01, 0)
    return geometry
  }, [width, depth])
  const edgeMaterial = useMemo(
    () => new LineBasicNodeMaterial({ linewidth: 3, depthTest: false, depthWrite: false }),
    [],
  )
  const basePlaneMaterial = useMemo(() => {
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    material.opacityNode = smoothstep(0, 0.7, distance(uv(), vec2(0.5, 0.5))).mul(0.6)
    return material
  }, [])

  useEffect(() => {
    const color = valid ? VALID_COLOR : INVALID_COLOR
    edgeMaterial.color.setHex(color)
    basePlaneMaterial.color.setHex(color)
  }, [valid, edgeMaterial, basePlaneMaterial])

  useEffect(
    () => () => {
      edgeGeometry.dispose()
      basePlaneGeometry.dispose()
    },
    [edgeGeometry, basePlaneGeometry],
  )
  useEffect(
    () => () => {
      edgeMaterial.dispose()
      basePlaneMaterial.dispose()
    },
    [edgeMaterial, basePlaneMaterial],
  )

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <lineSegments
        geometry={edgeGeometry}
        layers={EDITOR_LAYER}
        material={edgeMaterial}
        renderOrder={999}
      />
      <mesh
        geometry={basePlaneGeometry}
        layers={EDITOR_LAYER}
        material={basePlaneMaterial}
        renderOrder={999}
      />
    </group>
  )
}
