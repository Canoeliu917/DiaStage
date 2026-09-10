'use client'

import { useScene } from '@pascal-app/core'
import { stageToWorldPosition, stageToWorldRotation } from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { stageFrame } from '@/lib/stage/context'
import { useStagePlanPreview } from './plan-review'

export function StagePlanPreviewSystem({ enabled }: { enabled: boolean }) {
  const plan = useStagePlanPreview((state) => state.plan)
  const loaded = useScene((state) => state.rootNodeIds.length > 0)
  const editing = useEditor(
    (state) => !state.isPreviewMode && !state.isFirstPersonMode && !state.isCaptureMode,
  )
  if (!enabled || !editing || !loaded || !plan) return null
  const frame = { ...stageFrame(), ...(plan.venue ? { depthMeters: plan.venue.depthMeters } : {}) }
  return (
    <group>
      {plan.items.map((item) => {
        const d = item.dimensionsMeters
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
            <mesh position={[0, d.height / 2, 0]} raycast={() => null}>
              <boxGeometry args={[d.width, d.height, d.depth]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
            </mesh>
            <mesh position={[0, d.height / 2, 0]} raycast={() => null}>
              <boxGeometry args={[d.width, d.height, d.depth]} />
              <meshBasicMaterial
                color={color}
                wireframe
                transparent
                opacity={0.9}
                depthWrite={false}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
