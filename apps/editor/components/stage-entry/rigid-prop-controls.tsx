'use client'

import { type AnyNodeId, getNodeLock, useScene } from '@pascal-app/core'
import { useState } from 'react'
import {
  commandMeta,
  executeStageCommands,
  useStageCommandNotice,
} from '@/lib/stage/command-executor'
import { useStageContactFeedback } from '@/lib/stage/contact-feedback'
import { currentStageContext } from '@/lib/stage/context'
import { floorSafeItemPatch } from '@/lib/stage/floor-transform'
import { type RotationAxis, rigidRotation } from '@/lib/stage/rigid-rotation'
import { useStagePlacement } from './manual-stage-panel'
import './manual-stage.css'

export function PropRotationControls({ nodeId }: { nodeId: string }) {
  const node = useScene((s) => s.nodes[nodeId as AnyNodeId])
  const readOnly = useScene((s) => s.readOnly)
  const locked = useScene((s) => !!getNodeLock(s.nodes, nodeId, true))
  const [step, setStep] = useState(30)
  const feedback = useStageContactFeedback()
  if (!node || !['block', 'item', 'stair'].includes(node.type)) return null
  const rotate = (axis: RotationAxis, angle: number) => {
    try {
      if (node.type === 'block' || node.type === 'item') {
        const patch = rigidRotation(node, axis, angle)
        useScene
          .getState()
          .updateNode(
            node.id,
            node.type === 'item' ? floorSafeItemPatch(node, patch as Partial<typeof node>) : patch,
          )
        if (useScene.getState().nodes[node.id] === node)
          throw new Error(useStageCommandNotice.getState().error || '台位需要调整，未旋转。')
      } else if (node.type === 'stair') {
        const object = currentStageContext().objects.find((entry) => entry.id === node.id)
        if (!object) return
        const result = executeStageCommands([
          {
            type: 'RotateObject',
            nodeId,
            meta: commandMeta('manual'),
            rotationDegrees: {
              ...object.transform.rotationDegrees,
              y: object.transform.rotationDegrees.y + angle,
            },
          },
        ])
        if (!result.ok) throw new Error(result.error)
      }
      useStagePlacement.setState({ notice: '已整件旋转，可撤销。' })
    } catch (error) {
      useStagePlacement.setState({ notice: error instanceof Error ? error.message : '无法旋转。' })
    }
  }
  return (
    <fieldset
      data-stage-rotation=""
      tabIndex={-1}
      className="stage-prop-rotation"
      disabled={readOnly || locked}
      aria-label="整件旋转"
    >
      <label>
        整件旋转{' '}
        <select
          aria-label="旋转步幅"
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
        >
          <option value={30}>每次 30°</option>
          <option value={90}>转面 90°</option>
        </select>
      </label>
      {(['y', 'x', 'z'] as const).map((axis, i) => (
        <div key={axis}>
          <span>{['左右转向', '前后倾转', '左右侧转'][i]}</span>
          <button
            type="button"
            aria-label={`${axis}轴反向旋转`}
            disabled={node.type === 'stair' && axis !== 'y'}
            onClick={() => rotate(axis, -step)}
          >
            −
          </button>
          <button
            type="button"
            aria-label={`${axis}轴正向旋转`}
            disabled={node.type === 'stair' && axis !== 'y'}
            onClick={() => rotate(axis, step)}
          >
            ＋
          </button>
        </div>
      ))}
      {node.type === 'stair' && <small>台阶保持踏面水平。</small>}
      <p role="status">{feedback.message}</p>
      <button
        type="button"
        onClick={() => useStageContactFeedback.setState({ acknowledged: feedback.signature })}
      >
        {feedback.acknowledged === feedback.signature
          ? '已确认当前布局（几何校验仍有效）'
          : '确认当前摆放'}
      </button>
    </fieldset>
  )
}
