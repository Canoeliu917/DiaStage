'use client'

import {
  type AnyNode,
  type AnyNodeId,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { worldToStagePosition, worldToStageRotation } from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { useMemo, useRef } from 'react'
import { useCameraStudio } from '@/components/camera-studio/store'
import { currentStageContext, stageContextObject, stageFrame } from './context'

export function useStageContext() {
  const nodes = useScene((state) => state.nodes)
  const materials = useScene((state) => state.materials)
  const roots = useScene((state) => state.rootNodeIds)
  const cameras = useCameraStudio((state) => state.project)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const geometryRevision = useViewer((state) => state.geometryRevision)
  const snapshot = useRef<{
    nodes: typeof nodes
    materials: typeof materials
    roots: typeof roots
    cameras: typeof cameras
    selectedIds: typeof selectedIds
    geometryRevision: number
    context: ReturnType<typeof currentStageContext>
  } | null>(null)
  if (
    !snapshot.current ||
    snapshot.current.nodes !== nodes ||
    snapshot.current.materials !== materials ||
    snapshot.current.roots !== roots ||
    snapshot.current.cameras !== cameras ||
    snapshot.current.selectedIds !== selectedIds ||
    snapshot.current.geometryRevision !== geometryRevision
  )
    snapshot.current = {
      nodes,
      materials,
      roots,
      cameras,
      selectedIds,
      geometryRevision,
      context: currentStageContext(selectedIds, true),
    }
  return snapshot.current.context
}

export function useLiveStageContext() {
  const context = useStageContext()
  const nodes = useScene((state) => state.nodes)
  const transforms = useLiveTransforms((state) => state.transforms)
  const overrides = useLiveNodeOverrides((state) => state.overrides)
  return useMemo(() => {
    if (!context.venue || (!transforms.size && !overrides.size)) return context
    const frame = stageFrame()
    const effectiveNodes = { ...nodes }
    for (const id of new Set([...transforms.keys(), ...overrides.keys()])) {
      const node = nodes[id as AnyNodeId]
      if (!node || !('position' in node) || !('rotation' in node)) continue
      const live = transforms.get(id)
      const rotation = live
        ? typeof node.rotation === 'number'
          ? live.rotation
          : [node.rotation[0], live.rotation, node.rotation[2]]
        : node.rotation
      effectiveNodes[id as AnyNodeId] = {
        ...node,
        ...(live ? { position: live.position, rotation } : {}),
        ...overrides.get(id),
      } as AnyNode
    }
    return {
      ...context,
      objects: context.objects.map((item) => {
        const live = transforms.get(item.id)
        const node = effectiveNodes[item.id as AnyNodeId]
        if (!node || !('position' in node) || !('rotation' in node)) return item
        let ancestor: AnyNode | undefined = node
        while (ancestor && !transforms.has(ancestor.id) && !overrides.has(ancestor.id))
          ancestor = ancestor.parentId ? effectiveNodes[ancestor.parentId as AnyNodeId] : undefined
        if (!ancestor) return item
        const parent = node.parentId ? nodes[node.parentId as AnyNodeId] : undefined
        // Native item-surface drags publish world coordinates for their 2D ghost.
        if (live && node.type === 'item' && (parent?.type === 'item' || parent?.type === 'shelf'))
          return {
            ...item,
            transform: {
              position: worldToStagePosition(live.position, frame),
              rotationDegrees: worldToStageRotation([
                node.rotation[0],
                live.rotation,
                node.rotation[2],
              ]),
            },
          }
        try {
          return stageContextObject(node, effectiveNodes, frame) ?? item
        } catch {
          return item
        }
      }),
    }
  }, [context, nodes, transforms, overrides])
}
