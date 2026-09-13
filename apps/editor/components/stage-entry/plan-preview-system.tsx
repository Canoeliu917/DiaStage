'use client'

import {
  type AnyNodeId,
  getNodeLock,
  type LiveTransform,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { inverseRotatePoint, subtract } from '@pascal-app/core/remount'
import {
  stageLayoutObjects,
  stageToWorldPosition,
  stageToWorldRotation,
} from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { Html } from '@react-three/drei'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { worldPose } from '@/lib/remount-scene'
import { stageContactIds } from '@/lib/stage/contacts'
import { stageFrame } from '@/lib/stage/context'
import { useStageContext } from '@/lib/stage/live-context'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import { SCENERY_ROUND_SEGMENTS, sceneryProxyParts } from '@/lib/stage/scenery'
import { DIA_COLORS } from '@/lib/visual-system'
import { useSimulationSelection } from '../theatre/simulation-panel'
import { placementPlan, useStagePlacement } from './manual-stage-panel'

export function StagePlanPreviewSystem({ enabled }: { enabled: boolean }) {
  const storedPlan = useStagePlanPreview((state) => state.plan)
  const dragPlan = useStagePlanPreview((state) => state.draft)
  const showGhost = useSimulationSelection((state) => state.showGhost)
  const buildPlan = dragPlan ?? (showGhost ? storedPlan : null)
  const placement = useStagePlacement((state) => state.draft)
  const suspended = useStagePlanPreview((state) => state.suspended)
  const loaded = useScene((state) => state.rootNodeIds.length > 0)
  const nodes = useScene((state) => state.nodes)
  const context = useStageContext()
  const plan = useMemo(() => {
    if (!placement) return buildPlan
    return {
      ...(buildPlan ?? placementPlan(placement)),
      items: [
        ...(buildPlan?.items.filter((item) =>
          placement.item.existingNodeId
            ? item.existingNodeId !== placement.item.existingNodeId
            : item.proposalId !== placement.item.proposalId,
        ) ?? []),
        {
          ...placement.item,
          transform: {
            ...placement.item.transform,
            position: {
              ...placement.item.transform.position,
              z:
                placement.item.transform.position.z +
                (buildPlan?.venue && context.venue
                  ? (buildPlan.venue.depthMeters - context.venue.depthMeters) / 2
                  : 0),
            },
          },
        },
      ],
    }
  }, [buildPlan, placement, context.venue])
  const contacts = useMemo(
    () => stageContactIds(stageLayoutObjects(context, plan)),
    [context, plan],
  )
  const editing = useEditor(
    (state) => !state.isPreviewMode && !state.isFirstPersonMode && !state.isCaptureMode,
  )
  const owned = useRef(new Map<string, LiveTransform>())
  const restore = useCallback(() => {
    const transforms = useLiveTransforms.getState().transforms
    let next: typeof transforms | undefined
    for (const [id, value] of owned.current)
      if (transforms.get(id) === value) {
        next ??= new Map(transforms)
        next.delete(id)
      }
    owned.current.clear()
    if (next) useLiveTransforms.setState({ transforms: next })
  }, [])
  useLayoutEffect(() => {
    useStagePlanPreview.setState({ restoreExisting: restore })
    return () => {
      restore()
      if (useStagePlanPreview.getState().restoreExisting === restore)
        useStagePlanPreview.setState({ restoreExisting: null })
    }
  }, [restore])
  useLayoutEffect(() => {
    if (!enabled || !editing || !loaded || !plan || suspended) {
      restore()
      return
    }
    const frame = {
      ...stageFrame(),
      ...(plan.venue ? { depthMeters: plan.venue.depthMeters } : {}),
    }
    const transforms = useLiveTransforms.getState().transforms
    let next: typeof transforms | undefined
    const active = new Set<string>()
    const originals = new Map(context.objects.map((object) => [object.id, object]))
    for (const item of plan.items) {
      const node = item.existingNodeId && nodes[item.existingNodeId as AnyNodeId]
      const original = item.existingNodeId && originals.get(item.existingNodeId)
      if (
        !node ||
        getNodeLock(nodes, node.id, true) ||
        !original ||
        !['block', 'item', 'stair'].includes(node.type) ||
        !('position' in node)
      )
        continue
      const delta = inverseRotatePoint(
        subtract(
          stageToWorldPosition(item.transform.position, frame),
          stageToWorldPosition(original.transform.position, stageFrame()),
        ),
        worldPose(node.parentId, nodes).rotation,
      )
      const value = {
        position: node.position.map((v, axis) => v + delta[axis]!) as [number, number, number],
        rotation: typeof node.rotation === 'number' ? node.rotation : node.rotation[1],
      }
      active.add(node.id)
      const previous = transforms.get(node.id)
      if (
        previous?.rotation === value.rotation &&
        previous.position.every((v, axis) => v === value.position[axis])
      )
        continue
      next ??= new Map(transforms)
      next.set(node.id, value)
      owned.current.set(node.id, value)
    }
    for (const [id, value] of owned.current)
      if (!active.has(id)) {
        if (transforms.get(id) === value) {
          next ??= new Map(transforms)
          next.delete(id)
        }
        owned.current.delete(id)
      }
    if (next) useLiveTransforms.setState({ transforms: next })
  }, [enabled, editing, loaded, plan, nodes, suspended, context, restore])
  if (!enabled || !editing || !loaded || !plan) return null
  const venue = plan.venue
  const frame = { ...stageFrame(), ...(venue ? { depthMeters: venue.depthMeters } : {}) }
  return (
    <group userData={{ viewerLineStyle: 'colored' }}>
      {venue && (
        <group name="stage-plan-venue-outline" position={frame.origin} raycast={() => null}>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[0, 0.025, (side * venue.depthMeters) / 2]} raycast={() => null}>
                <boxGeometry args={[venue.widthMeters, 0.015, 0.015]} />
                <meshBasicMaterial
                  color={DIA_COLORS.blue}
                  transparent
                  opacity={0.9}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[(side * venue.widthMeters) / 2, 0.025, 0]} raycast={() => null}>
                <boxGeometry args={[0.015, 0.015, venue.depthMeters]} />
                <meshBasicMaterial
                  color={DIA_COLORS.blue}
                  transparent
                  opacity={0.9}
                  depthWrite={false}
                />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {plan.items.map((item) => {
        if (placement?.item.proposalId === item.proposalId) return null
        if (
          item.existingNodeId &&
          ['block', 'item', 'stair'].includes(nodes[item.existingNodeId as AnyNodeId]?.type ?? '')
        )
          return null
        const d = item.dimensionsMeters
        const referenceOnly =
          item.libraryAssetId !== null ||
          (item.existingNodeId !== null && nodes[item.existingNodeId as AnyNodeId]?.type === 'item')
        const parts = sceneryProxyParts(
          referenceOnly ? 'neutral-block' : item.kind,
          d,
          item.stepCount ?? 3,
        )
        if (referenceOnly && item.collisionGeometry) {
          const vertices = item.collisionGeometry.flatMap((part) => part.vertices)
          const center = [0, 1, 2].map(
            (axis) =>
              (Math.min(...vertices.map((p) => p[axis]!)) +
                Math.max(...vertices.map((p) => p[axis]!))) /
              2,
          )
          for (const part of parts) part.position = [center[0]!, center[1]!, center[2]!]
        }
        const color =
          contacts.has(item.existingNodeId ?? item.proposalId) ||
          plan.warnings.some(
            (warning) => warning.blocking && warning.itemIds.includes(item.proposalId),
          )
            ? DIA_COLORS.error
            : DIA_COLORS.blue
        return (
          <group
            key={item.proposalId}
            name={`stage-plan-item:${item.proposalId}`}
            position={stageToWorldPosition(item.transform.position, frame)}
            rotation={stageToWorldRotation(item.transform.rotationDegrees)}
          >
            {parts.map((part, i) =>
              [false, true].map((wireframe) => (
                <mesh
                  key={`${i}:${wireframe}`}
                  position={part.position}
                  scale={part.size}
                  raycast={() => null}
                >
                  {part.shape === 'cylinder' ? (
                    <cylinderGeometry args={[0.5, 0.5, 1, SCENERY_ROUND_SEGMENTS]} />
                  ) : (
                    <boxGeometry args={[1, 1, 1]} />
                  )}
                  <meshBasicMaterial
                    color={color}
                    wireframe={wireframe}
                    transparent
                    opacity={wireframe ? 0.9 : 0.3}
                    depthWrite={false}
                  />
                </mesh>
              )),
            )}
            {referenceOnly && (
              <Html
                center
                position={[0, d.height + 0.15, 0]}
                style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
              >
                <span
                  style={{ background: '#202020', color: '#eee', padding: '2px 5px', fontSize: 11 }}
                >
                  {item.displayName} · 轮廓参考
                </span>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}
