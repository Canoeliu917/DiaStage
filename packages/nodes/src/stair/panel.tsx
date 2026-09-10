'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { readStageStair, updateStageStair } from '@pascal-app/core/stage'
import { duplicateStairSubtree, PanelWrapper, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useState } from 'react'

export default function StairPanel() {
  const selected = useViewer((s) => s.selection.selectedIds[0])
  const nodes = useScene((s) => s.nodes)
  const readOnly = useScene((s) => s.readOnly)
  const [error, setError] = useState('')
  const picked = selected ? nodes[selected as AnyNodeId] : undefined
  const node = picked?.type === 'stair-segment' ? nodes[picked.parentId as AnyNodeId] : picked
  if (node?.type !== 'stair') return null
  let parameters: ReturnType<typeof readStageStair> | undefined
  let legacy = ''
  try {
    parameters = readStageStair(node, nodes)
  } catch (cause) {
    legacy = cause instanceof Error ? cause.message : '组合台阶保留原形。'
  }
  const disabled = readOnly || node.metadata.stageLocked === true
  const fields = [
    ['width', '总宽（米）', parameters?.width],
    ['stepHeight', '步高（米）', parameters?.stepHeight],
    ['stepDepth', '步深（米）', parameters?.stepDepth],
    ['stepCount', '级数', parameters?.stepCount],
    ['x', '位置 X（米）', node.position[0]],
    ['y', '位置 Y（米）', node.position[1]],
    ['z', '位置 Z（米）', node.position[2]],
    ['rotation', '朝向（度）', (node.rotation * 180) / Math.PI],
  ] as const
  return (
    <PanelWrapper
      title="舞台台阶"
      icon="/icons/stairs.webp"
      onClose={() => useViewer.getState().setSelection({ selectedIds: [] })}
    >
      <section className="space-y-3 p-3 text-sm" aria-label="舞台台阶参数">
        {legacy && <p className="text-xs text-muted-foreground">{legacy}</p>}
        <form
          key={JSON.stringify(fields)}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (disabled) return
            try {
              const data = new FormData(event.currentTarget)
              const value = (key: string) => {
                const raw = data.get(key)
                if (typeof raw !== 'string' || !raw.trim() || !Number.isFinite(Number(raw)))
                  throw new Error('请填写有效数值。')
                return Number(raw)
              }
              const pose = {
                position: [value('x'), value('y'), value('z')] as [number, number, number],
                rotation: (value('rotation') * Math.PI) / 180,
              }
              const update = parameters
                ? updateStageStair(node, nodes, {
                    ...pose,
                    width: value('width'),
                    stepHeight: value('stepHeight'),
                    stepDepth: value('stepDepth'),
                    stepCount: value('stepCount'),
                  })
                : [{ id: node.id, data: pose }]
              useScene.getState().applyNodeChanges({ update })
              setError('')
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '无法修改台阶。')
            }
          }}
        >
          <fieldset disabled={disabled} className="space-y-2">
            {fields.map(([key, label, value]) =>
              value === undefined ? null : (
                <label key={key} className="flex items-center justify-between gap-2">
                  <span>{label}</span>
                  <input
                    name={key}
                    type="number"
                    required
                    step={key === 'stepCount' ? 1 : 'any'}
                    min={
                      ['width', 'stepHeight', 'stepDepth'].includes(key)
                        ? 0.001
                        : key === 'stepCount'
                          ? 1
                          : undefined
                    }
                    max={key === 'stepCount' ? 200 : undefined}
                    defaultValue={value}
                    className="w-28 rounded border border-border bg-background px-2 py-1 text-foreground"
                  />
                </label>
              ),
            )}
            <button type="submit" className="w-full rounded border border-border px-3 py-2">
              应用台阶参数
            </button>
          </fieldset>
        </form>
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            className="rounded border px-3 py-2"
            onClick={() => useEditor.getState().setMovingNode(node)}
          >
            移动
          </button>
          <button
            type="button"
            disabled={disabled}
            className="rounded border px-3 py-2"
            onClick={() => duplicateStairSubtree(node.id, { mode: 'move' })}
          >
            复制
          </button>
          <button
            type="button"
            disabled={disabled}
            className="rounded border px-3 py-2"
            onClick={() => {
              useScene.getState().deleteNode(node.id)
              useViewer.getState().setSelection({ selectedIds: [] })
            }}
          >
            删除
          </button>
        </div>
      </section>
    </PanelWrapper>
  )
}
