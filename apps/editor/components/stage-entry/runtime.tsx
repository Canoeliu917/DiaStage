'use client'
import { type AnyNodeId, useScene } from '@pascal-app/core'
import { compileStagePlan, StagePlanSchema } from '@pascal-app/core/stage'
import { useEffect } from 'react'
import { z } from 'zod'
import {
  connectStageCommandExecutor,
  executeStageCommands,
  useStageCommandNotice,
} from '@/lib/stage/command-executor'
import { currentStageContext } from '@/lib/stage/context'
import { ScriptImportSchema } from '@/lib/stage/import-metadata'
import { PENDING_STAGE_PREFIX } from './command-input'

export function StageCommandRuntime({
  sceneId,
  rootId,
  applyPlan,
}: {
  sceneId: string
  rootId?: string
  applyPlan: boolean
}) {
  const error = useStageCommandNotice((s) => s.error)
  useEffect(() => connectStageCommandExecutor(), [])
  useEffect(() => {
    if (!applyPlan) return
    let active = true,
      attempted = false
    const apply = () => {
      if (!active || attempted || !rootId || !useScene.getState().nodes[rootId as AnyNodeId]) return
      attempted = true
      queueMicrotask(() => {
        if (!active) return
        const key = PENDING_STAGE_PREFIX + sceneId
        try {
          const raw = sessionStorage.getItem(key)
          if (!raw) return
          const pending = z
            .strictObject({
              plan: StagePlanSchema,
              transactionId: z.string().min(1),
              scriptImport: ScriptImportSchema.optional(),
            })
            .parse(JSON.parse(raw))
          const compiled = compileStagePlan(pending.plan, currentStageContext(), {
            transactionId: pending.transactionId,
            issuedAt: new Date().toISOString(),
          })
          if (!compiled.ok)
            throw new Error(
              compiled.warnings.map((warning) => warning.message).join('；') || '方案需要重新确认',
            )
          const result = executeStageCommands(compiled.commands, pending.scriptImport)
          if (!result.ok) throw new Error(result.error)
          sessionStorage.removeItem(key)
        } catch (error) {
          useStageCommandNotice.setState({
            error: `已保留确认方案，刷新页面可重试：${error instanceof Error ? error.message : '未能应用'}`,
          })
        }
      })
    }
    const stop = useScene.subscribe(apply)
    apply()
    return () => {
      active = false
      stop()
    }
  }, [sceneId, rootId, applyPlan])
  return error ? (
    <aside className="stage-command-error" role="alert">
      {error}
      <button
        type="button"
        aria-label="关闭操作提示"
        onClick={() => useStageCommandNotice.setState({ error: '' })}
      >
        关闭
      </button>
    </aside>
  ) : null
}
