'use client'

import {
  type AnyNodeId,
  type StairNode,
  type StairSegmentNode,
  useLiveNodeOverrides,
  useRegistry,
  useScene,
} from '@pascal-app/core'
import {
  getStairBodyMaterials,
  resolveMaterialRef,
  resolveSlotDefaultMaterial,
  useNodeEvents,
  useViewer,
} from '@pascal-app/viewer'
import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { STAIR_BODY_SLOT_DEFAULT, STAIR_TREADS_SLOT_DEFAULT } from './slots'

type SceneMaterials = ReturnType<typeof useScene.getState>['materials']

function resolveSlot(
  ref: string | undefined,
  fallbackRef: string,
  fallback: THREE.Material,
  sceneMaterials: SceneMaterials,
  shading: Parameters<typeof resolveMaterialRef>[2],
  textures: boolean,
) {
  if (!textures) return fallback
  return (
    resolveMaterialRef(ref, sceneMaterials, shading) ??
    resolveSlotDefaultMaterial(fallbackRef, shading)
  )
}

export const StairRenderer = ({ node: rawNode }: { node: StairNode }) => {
  const ref = useRef<THREE.Group>(null!)
  const override = useLiveNodeOverrides((state) => state.overrides.get(rawNode.id))
  const node = override ? ({ ...rawNode, ...override } as StairNode) : rawNode
  const segment = useScene((state) => {
    const child = state.nodes[node.children[0] as AnyNodeId]
    return child?.type === 'stair-segment' ? child : undefined
  }) as StairSegmentNode | undefined
  const sceneMaterials = useScene((state) => state.materials)
  const shading = useViewer((state) => state.shading)
  const textures = useViewer((state) => state.textures)
  const colorPreset = useViewer((state) => state.colorPreset)
  const base = useMemo(
    () => getStairBodyMaterials(node, shading, textures, colorPreset),
    [node, shading, textures, colorPreset],
  )
  const materials = useMemo(() => {
    const tread = resolveSlot(
      node.slots?.treads,
      STAIR_TREADS_SLOT_DEFAULT,
      base[0],
      sceneMaterials,
      shading,
      textures,
    )
    const body = resolveSlot(
      node.slots?.body,
      STAIR_BODY_SLOT_DEFAULT,
      base[1],
      sceneMaterials,
      shading,
      textures,
    )
    return [body, body, tread, body, body, body]
  }, [base, node.slots, sceneMaterials, shading, textures])

  useRegistry(node.id, 'stair', ref)
  const handlers = useNodeEvents(node, 'stair')
  if (!segment) return null

  const count = Math.max(1, Math.round(segment.stepCount))
  const stepDepth = segment.length / count
  const stepHeight = segment.height / count

  return (
    <group
      {...handlers}
      position={node.position}
      ref={ref}
      rotation-y={node.rotation}
      visible={node.visible}
    >
      {Array.from({ length: count }, (_, index) => {
        const height = stepHeight * (index + 1)
        return (
          <mesh
            castShadow
            key={index}
            material={materials}
            name={index === 0 ? 'stage-steps' : undefined}
            position={[0, height / 2, stepDepth * (index + 0.5)]}
            receiveShadow
            userData={{ slotIds: ['body', 'body', 'treads', 'body', 'body', 'body'] }}
          >
            <boxGeometry args={[segment.width, height, stepDepth]} />
          </mesh>
        )
      })}
    </group>
  )
}

export default StairRenderer
