'use client'

import {
  type AnyNodeId,
  getNodeLock,
  type ItemFoldControls,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { useEffect, useState } from 'react'
import { FOLD_ANGLE_STEP } from '@/lib/stage/fold-drag'
import {
  enterStageFolding,
  exitStageFolding,
  foldAngleRange,
  foldControls,
  foldKeys,
  foldPositionCount,
  setFoldAngle,
  useStageFolding,
} from '@/lib/stage/folding'

function FoldAngleInput({
  value,
  position,
  nodeId,
  range,
  side,
}: {
  value: number
  position: number
  nodeId: string
  range: readonly number[]
  side: 'left' | 'right'
}) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100))
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value])
  return (
    <input
      aria-label={`第${position + 1}折点打开角度`}
      type="number"
      min={range[0]}
      max={range[1]}
      step={FOLD_ANGLE_STEP}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const next = Number(text)
        setText(String(Math.round(value * 100) / 100))
        if (text.trim() && Number.isFinite(next) && next !== value)
          setFoldAngle(nodeId, position, next, side)
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          setText(String(Math.round(value * 100) / 100))
        }
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

export function FoldingPanel({ nodeId }: { nodeId: string }) {
  const node = useScene((state) => state.nodes[nodeId as AnyNodeId])
  const disabled = useScene((state) => state.readOnly || !!getNodeLock(state.nodes, nodeId, true))
  const live = useLiveNodeOverrides(
    (state) => state.overrides.get(nodeId)?.controls as ItemFoldControls | undefined,
  )
  const folding = useStageFolding()
  const count = foldPositionCount(node)
  if (!count || node?.type !== 'item') return null
  const active = folding.nodeId === nodeId
  const controls = live ?? foldControls(node)
  return (
    <fieldset className="stage-fold-panel" disabled={disabled} aria-label="折叠景片">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => (active ? exitStageFolding() : enterStageFolding(nodeId))}
      >
        {active ? '退出折叠景片' : '折叠景片'}
      </button>
      {active && (
        <>
          <small>
            数字是折点编号，“左／右”表示转动哪侧景片组，另一侧保持原位。左右按景片连接顺序区分，不随视角变化。
            每格 {FOLD_ANGLE_STEP}°，按住 Shift 可自由调整；允许合拢贴合，遇到穿模即停止。
          </small>
          <div className="stage-fold-presets" role="group" aria-label="折叠活动侧">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                type="button"
                disabled={folding.dragging}
                aria-pressed={folding.side === side}
                onClick={() => useStageFolding.setState({ side })}
              >
                {side === 'left' ? '转动左侧景片' : '转动右侧景片'}
              </button>
            ))}
          </div>
          {Array.from({ length: count }, (_, position) => (
            <div className="stage-fold-position" key={position}>
              <button
                type="button"
                aria-pressed={folding.position === position}
                disabled={folding.dragging}
                onClick={() => useStageFolding.setState({ position })}
              >
                第{position + 1}折点
              </button>
              <label>
                打开角度{' '}
                <FoldAngleInput
                  nodeId={nodeId}
                  range={foldAngleRange(node, position)}
                  position={position}
                  side={folding.side}
                  value={controls[foldKeys[position]!]}
                />{' '}
                °
              </label>
              <div className="stage-fold-presets">
                {[0, 90, 180, 270, 360]
                  .filter(
                    (angle) =>
                      angle >= foldAngleRange(node, position)[0]! &&
                      angle <= foldAngleRange(node, position)[1]!,
                  )
                  .map((angle) => (
                    <button
                      type="button"
                      key={angle}
                      disabled={folding.dragging}
                      aria-label={`第${position + 1}折点打开${angle}度`}
                      onClick={() => setFoldAngle(nodeId, position, angle, folding.side)}
                    >
                      {angle}°
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {folding.notice && <small role="status">{folding.notice}</small>}
        </>
      )}
    </fieldset>
  )
}
