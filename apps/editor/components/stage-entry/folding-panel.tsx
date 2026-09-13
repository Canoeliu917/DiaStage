'use client'

import {
  type AnyNodeId,
  getNodeLock,
  type ItemFoldControls,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { useEffect, useState } from 'react'
import {
  enterStageFolding,
  exitStageFolding,
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
}: {
  value: number
  position: number
  nodeId: string
}) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100))
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value])
  return (
    <input
      aria-label={`折叠位置${position + 1}打开角度`}
      type="number"
      min={0}
      max={270}
      step={15}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const next = Number(text)
        setText(String(Math.round(value * 100) / 100))
        if (text.trim() && Number.isFinite(next) && next !== value)
          setFoldAngle(nodeId, position, next)
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
          <small>拖动景片外端或拐点，以15°调整打开角度，最大270°。片宽与高度保持不变。</small>
          {Array.from({ length: count }, (_, position) => (
            <div className="stage-fold-position" key={position}>
              <button
                type="button"
                aria-pressed={folding.position === position}
                disabled={folding.dragging}
                onClick={() => useStageFolding.setState({ position })}
              >
                折叠位置{position + 1}
              </button>
              <label>
                打开角度{' '}
                <FoldAngleInput
                  nodeId={nodeId}
                  position={position}
                  value={controls[foldKeys[position]!]}
                />{' '}
                °
              </label>
              <div className="stage-fold-presets">
                {[90, 180, 270].map((angle) => (
                  <button
                    type="button"
                    key={angle}
                    disabled={folding.dragging}
                    aria-label={`折叠位置${position + 1}打开${angle}度`}
                    onClick={() => setFoldAngle(nodeId, position, angle)}
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
