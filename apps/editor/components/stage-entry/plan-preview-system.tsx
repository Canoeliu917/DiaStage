'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { stageToWorldPosition, stageToWorldRotation } from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { Html } from '@react-three/drei'
import { stageFrame } from '@/lib/stage/context'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import { SCENERY_ROUND_SEGMENTS, sceneryProxyParts } from '@/lib/stage/scenery'
import { useSimulationSelection } from '../theatre/simulation-panel'

export function StagePlanPreviewSystem({ enabled }: { enabled: boolean }) {
  const plan = useStagePlanPreview((state) => state.plan)
  const loaded = useScene((state) => state.rootNodeIds.length > 0)
  const nodes = useScene((state) => state.nodes)
  const showGhost = useSimulationSelection((state) => state.showGhost)
  const editing = useEditor(
    (state) => !state.isPreviewMode && !state.isFirstPersonMode && !state.isCaptureMode,
  )
  if (!enabled || !editing || !loaded || !plan || !showGhost) return null
  const venue = plan.venue
  const frame = { ...stageFrame(), ...(venue ? { depthMeters: venue.depthMeters } : {}) }
  return (
    <group>
      {venue && (
        <group name="stage-plan-venue-outline" position={frame.origin} raycast={() => null}>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[0, 0.025, (side * venue.depthMeters) / 2]} raycast={() => null}>
                <boxGeometry args={[venue.widthMeters, 0.015, 0.015]} />
                <meshBasicMaterial color="#86a998" transparent opacity={0.9} depthWrite={false} />
              </mesh>
              <mesh position={[(side * venue.widthMeters) / 2, 0.025, 0]} raycast={() => null}>
                <boxGeometry args={[0.015, 0.015, venue.depthMeters]} />
                <meshBasicMaterial color="#86a998" transparent opacity={0.9} depthWrite={false} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {plan.items.map((item) => {
        const d = item.dimensionsMeters
        const referenceOnly =
          item.libraryAssetId !== null ||
          (item.existingNodeId !== null && nodes[item.existingNodeId as AnyNodeId]?.type === 'item')
        const parts = sceneryProxyParts(
          referenceOnly ? 'neutral-block' : item.kind,
          d,
          item.stepCount ?? 3,
        )
        const color = plan.warnings.some(
          (warning) => warning.blocking && warning.itemIds.includes(item.proposalId),
        )
          ? '#bc746a'
          : '#86a998'
        return (
          <group
            key={item.proposalId}
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
