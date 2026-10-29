'use client'

import { type AnyNodeId, getNodeLock, useScene } from '@pascal-app/core'
import {
  applyFoldStops,
  foldAngleRange,
  foldControls,
  foldPositionCount,
} from '@/lib/stage/folding'

export function FoldStops({
  nodeId,
  onNotice,
}: {
  nodeId: string
  onNotice: (message: string) => void
}) {
  const node = useScene((state) => state.nodes[nodeId as AnyNodeId])
  const disabled = useScene((state) => state.readOnly || !!getNodeLock(state.nodes, nodeId, true))
  const count = foldPositionCount(node)
  if (!count || node?.type !== 'item') return null
  const controls = foldControls(node)
  const angles = [controls.fold_angle_1_deg, controls.fold_angle_2_deg] as [number, number]
  const straight = angles.slice(0, count).every((angle) => angle === 180)
  const apply = (next: [number, number]) => onNotice(applyFoldStops(nodeId, next))
  return (
    <fieldset className="stage-fold-stops" disabled={disabled} aria-label="折角">
      <legend>{straight ? '现在是直墙' : '折角 · 每 45°'}</legend>
      <button type="button" disabled={straight} onClick={() => apply([180, 180])}>
        {straight ? '已经是直墙' : '拉成直墙'}
      </button>
      {Array.from({ length: count }, (_, position) => {
        const [min, max] = foldAngleRange(node, position)
        const angle = angles[position]!
        const step = (delta: number) => {
          const next = Math.min(max!, Math.max(min!, angle + delta))
          const anglesNext: [number, number] = [...angles]
          anglesNext[position] = next
          apply(anglesNext)
        }
        return (
          <div className="stage-fold-stop" key={position}>
            <span>
              第{position + 1}折 {angle}°
            </span>
            <button
              type="button"
              aria-label={`第${position + 1}折收一档`}
              disabled={angle <= min!}
              onClick={() => step(-45)}
            >
              收一档
            </button>
            <button
              type="button"
              aria-label={`第${position + 1}折开一档`}
              disabled={angle >= max!}
              onClick={() => step(45)}
            >
              开一档
            </button>
          </div>
        )
      })}
    </fieldset>
  )
}
