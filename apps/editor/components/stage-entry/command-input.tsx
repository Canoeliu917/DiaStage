'use client'

import {
  compileStagePlan,
  parseStageText,
  type SceneContextSummary,
  type StageCommand,
  type StagePlan,
  StagePlanSchema,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAiWithBudgetConsent } from '@/lib/ai/budget-client'
import { formatCostCny } from '@/lib/ai/model-pricing'
import {
  aiCommandContext,
  deleteRecentlyAdded,
  localControl,
  localSceneryOperation,
  rememberAiTransaction,
  undoLastAiTransaction,
} from '@/lib/stage/ai-controls'
import { executeStageCommands } from '@/lib/stage/command-executor'
import { currentStageContext } from '@/lib/stage/context'
import {
  type CreationLease,
  creationDecision,
  draftContext,
  mergeDraftPlan,
} from '@/lib/stage/creation-policy'
import type { ScriptImport } from '@/lib/stage/import-metadata'
import { createManualStageGraph } from '@/lib/stage/initial-stage'
import { CreationModeControl, requestCreationPermission } from './creation-mode'
import { PhoneVoiceLink } from './phone-voice-link'
import { EMPTY_STAGE_CONTEXT, StagePlanReview, useStagePlanPreview } from './plan-review'
import { VoiceRecorder } from './voice-recorder'
import './stage-entry.css'

export type VoiceState =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'transcribing'
  | 'planning'
  | 'needs-clarification'
  | 'review'
  | 'applying'
  | 'complete'
  | 'error'
export type ClarificationAnswer = { questionId: string; answer: string }
export const STAGE_EXAMPLE =
  '建立一个宽8米、深6米的镜框式舞台。舞台中区放一个双人沙发，沙发台右30厘米放一块窗景片，窗景片台右紧邻一块门景片。'
export const PENDING_STAGE_PREFIX = 'diastage:confirmed-plan:'

export async function applyReviewedPlan(
  plan: StagePlan,
  context: SceneContextSummary,
  transactionId: string,
  sceneId?: string,
  signal?: AbortSignal,
  scriptImport?: ScriptImport,
) {
  if (sceneId) {
    const compiled = compileStagePlan(plan, context, {
      transactionId,
      issuedAt: new Date().toISOString(),
    })
    if (!compiled.ok)
      throw new Error(
        compiled.warnings.map((warning) => warning.message).join('；') || '请先补齐方案信息',
      )
    const result = executeStageCommands(compiled.commands, scriptImport)
    if (!result.ok) throw new Error(result.error)
    if (plan.source === 'voice' || plan.source === 'typed-command')
      rememberAiTransaction(
        result,
        context.objects.map((object) => object.id),
        '舞台方案已应用，可撤销',
      )
    return null
  }
  if (!plan.venue) throw new Error('请先填写舞台宽度与深度')
  const id = crypto.randomUUID()
  const key = PENDING_STAGE_PREFIX + id
  // Keep the confirmed proposal separate until the new scene's normal store and undo are ready.
  sessionStorage.setItem(key, JSON.stringify({ plan, transactionId, scriptImport }))
  try {
    const response = await fetch('/api/scenes', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: '新建剧目', graph: createManualStageGraph(plan.venue) }),
    })
    if (!response.ok) throw new Error('建立舞台失败，请检查连接后重试')
    await response.json()
    return `/scene/${id}?workspace=set&applyPlan=1`
  } catch (error) {
    sessionStorage.removeItem(key)
    throw error
  }
}

export function StageCommandInput({ sceneId }: { sceneId?: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [source, setSource] = useState<'voice' | 'typed-command'>('typed-command')
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<StagePlan | null>(null)
  const [answers, setAnswers] = useState<ClarificationAnswer[]>([])
  const [context, setContext] = useState(EMPTY_STAGE_CONTEXT)
  const [deletion, setDeletion] = useState<StageCommand[] | null>(null)
  const [lease, setLease] = useState<CreationLease | null>(null)
  const [usageDetail, setUsageDetail] = useState('')
  const draft = useRef<{ plan: StagePlan; context: SceneContextSummary } | null>(null)
  const requestId = useRef(''),
    abort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const stopCreation = useCallback(() => {
    abort.current?.abort()
    setLease(null)
    setState('idle')
    if (sceneId) void requestCreationPermission(sceneId, 'revoke').catch(() => {})
  }, [sceneId])
  useEffect(() => {
    const stop = () => {
      abort.current?.abort()
      if (sceneId) void requestCreationPermission(sceneId, 'revoke').catch(() => {})
    }
    window.addEventListener('pagehide', stop)
    return () => {
      window.removeEventListener('pagehide', stop)
      stop()
    }
  }, [sceneId])
  useEffect(() => {
    if (!lease) return
    const timer = setTimeout(stopCreation, Math.max(0, lease.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [lease, stopCreation])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abort.current?.abort()
      useStagePlanPreview.setState({ plan: null })
    }
  }, [])
  const busy = [
    'requesting-permission',
    'recording',
    'transcribing',
    'planning',
    'applying',
  ].includes(state)
  const handleControl = (input: string) => {
    const control = localControl(input)
    if (!control) return false
    if (control === 'stop') stopCreation()
    abort.current?.abort()
    setPlan(null)
    setDeletion(null)
    draft.current = null
    useStagePlanPreview.setState({ plan: null })
    setState('idle')
    setError('')
    if (control === 'undo') {
      try {
        undoLastAiTransaction()
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : '撤销失败')
      }
    }
    return true
  }
  const generate = async (
    priorAnswers = answers,
    input = text,
    inputSource = source,
  ): Promise<string> => {
    if (handleControl(input)) return '已处理本地停止、取消或撤销指令；请查看桌面结果'
    if (!input.trim() || busy) return '桌面正在处理，请稍后重试；没有执行新操作'
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setState('planning')
    setError('')
    try {
      if (sceneId) {
        const commands = deleteRecentlyAdded(input) ?? localSceneryOperation(input)
        if (commands) {
          if (lease) {
            let currentLease: CreationLease | null = null
            try {
              currentLease = await requestCreationPermission(sceneId, 'check')
            } catch {
              setLease(null)
            }
            if (controller.signal.aborted || !mounted.current) return '已取消，没有执行'
            if (currentLease) setLease(currentLease)
            if (creationDecision(currentLease, sceneId, commands) === 'execute') {
              const before = currentStageContext()
              const result = executeStageCommands(commands)
              if (!result.ok) throw new Error(result.error)
              rememberAiTransaction(
                result,
                before.objects.map((object) => object.id),
                '布景操作已完成，可撤销',
              )
              setState('complete')
              return `已完成：${input.slice(0, 200)}，可撤销`
            }
          }
          setDeletion(commands)
          setState('review')
          return '布景操作等待桌面确认，尚未写入'
        }
      }
      const full = sceneId ? aiCommandContext(input) : EMPTY_STAGE_CONTEXT
      if (draft.current && draft.current.context.documentVersion !== full.documentVersion)
        throw new Error('正式舞台已改变，请先取消草台并重新生成。')
      const current =
        lease?.mode === 'draft' && draft.current
          ? draftContext(draft.current.context, draft.current.plan)
          : full
      const local = parseStageText(input, current, priorAnswers, inputSource)
      const request = local
        ? null
        : await fetchAiWithBudgetConsent('/api/stage/plan', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: inputSource,
              input,
              sceneContext: current,
              priorAnswers,
            }),
          })
      const response = request?.response
      const result = local
        ? { plan: local, requestId: crypto.randomUUID() }
        : await response!.json()
      if (response && !response.ok)
        throw new Error(result.error?.message || '方案生成失败，请稍后重试')
      const next = StagePlanSchema.parse(result.plan)
      if (controller.signal.aborted || !mounted.current) return '已取消，没有执行'
      requestId.current = result.requestId
      setContext(current)
      if (sceneId && lease && !next.questions.length && !request?.budgetApproved) {
        const compiled = compileStagePlan(next, current, {
          transactionId: result.requestId,
          issuedAt: new Date().toISOString(),
        })
        if (compiled.ok) {
          let renewed: CreationLease | null = null
          try {
            renewed = await requestCreationPermission(sceneId, 'check')
          } catch (failure) {
            setLease(null)
            setError(failure instanceof Error ? failure.message : '授权已失效，方案等待确认')
          }
          if (controller.signal.aborted || !mounted.current) return '已取消，没有执行'
          if (renewed) setLease(renewed)
          const decision = creationDecision(renewed, sceneId, compiled.commands)
          if (decision === 'execute') {
            const execution = executeStageCommands(compiled.commands)
            if (!execution.ok) throw new Error(execution.error)
            rememberAiTransaction(
              execution,
              current.objects.map((object) => object.id),
              '连续制景已完成，可撤销',
            )
            setPlan(null)
            setAnswers([])
            setState('complete')
            return `已完成：${input.slice(0, 200)}，可撤销`
          }
          if (decision === 'draft') {
            const base = draft.current?.context ?? full
            const merged = mergeDraftPlan(
              draft.current?.plan ?? null,
              validateStagePlan(next, current).plan,
              base,
            )
            draft.current = { plan: merged, context: base }
            setContext(base)
            setPlan(merged)
            setState('review')
            return '草台方案已更新，尚未写入正式舞台'
          }
        }
      }
      setPlan(next)
      setState(next.questions.length ? 'needs-clarification' : 'review')
      return next.questions.length ? '需要在桌面补充信息，尚未写入' : '方案已生成，等待桌面确认'
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current) {
        setError(failure instanceof Error ? failure.message : '网络连接失败，请保留口令后重试')
        setState('error')
      }
      return controller.signal.aborted
        ? '已取消，没有执行'
        : `未执行：${failure instanceof Error ? failure.message.slice(0, 240) : '处理失败'}`
    }
  }
  const confirm = async (next: StagePlan) => {
    if (busy) return
    setState('applying')
    setError('')
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const path = await applyReviewedPlan(
        next,
        context,
        requestId.current,
        sceneId,
        controller.signal,
      )
      if (controller.signal.aborted || !mounted.current) return
      useStagePlanPreview.setState({ plan: null })
      setPlan(null)
      draft.current = null
      setState('complete')
      setAnswers([])
      if (path) router.push(path)
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current) {
        setError(failure instanceof Error ? failure.message : '未能搭台，请重试')
        setState('error')
      }
    }
  }
  return (
    <div className="stage-input" aria-busy={busy}>
      <details>
        <summary>AI 使用详情与隐私</summary>
        <p>
          复杂口令和筛选后的剧本片段会发送至模型服务。建议模式逐次确认；本机连续制景须主动授权。
          <a href="/privacy" target="_blank" rel="noreferrer">
            查看数据说明
          </a>
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              const response = await fetch('/api/ai/usage', { cache: 'no-store' })
              const body = await response.json()
              if (!response.ok) throw new Error(body.error?.message ?? '无法读取用量')
              const cost = Number(body.summary?.costCny)
              if (!Number.isFinite(cost)) throw new Error('用量格式无效')
              setUsageDetail(
                `本机工作区本月估算：${formatCostCny(cost)}。按内部参考价计算，不是供应商账单。`,
              )
            } catch (failure) {
              setUsageDetail(failure instanceof Error ? failure.message : '无法读取用量')
            }
          }}
        >
          查看本月估算
        </button>
        {usageDetail && <p role="status">{usageDetail}</p>}
      </details>
      {sceneId && (
        <CreationModeControl
          sceneId={sceneId}
          lease={lease}
          onChange={setLease}
          onStop={stopCreation}
        />
      )}
      <PhoneVoiceLink
        mode={lease?.mode ?? 'suggest'}
        onDisconnect={() => {
          if (lease) stopCreation()
        }}
        sceneLabel={sceneId ? '当前剧目 · 舞台口令' : '新舞台 · 语音开台'}
        storageKey={sceneId ?? 'new-stage'}
        canLoad={!busy && !plan}
        onTranscript={async (transcript) => {
          if (handleControl(transcript)) return '已处理本地停止、取消或撤销指令；请查看桌面结果'
          setText(transcript)
          setSource('voice')
          setAnswers([])
          setError('')
          setState('idle')
          return lease ? generate([], transcript, 'voice') : '文字已载入，等待桌面生成和确认方案'
        }}
      />
      {!plan && (
        <>
          <VoiceRecorder
            state={state}
            setState={setState}
            onError={setError}
            onTranscript={(transcript) => {
              if (handleControl(transcript)) return
              setText(transcript)
              setSource('voice')
              setAnswers([])
            }}
          />
          <label>
            {source === 'voice' ? '我听到的内容 · 可修改' : '舞台口令'}
            <textarea
              maxLength={10000}
              placeholder={sceneId ? '例如：把选中的布景向台后移半米。' : STAGE_EXAMPLE}
              value={text}
              disabled={state === 'applying'}
              onChange={(event) => {
                setText(event.target.value)
                setAnswers([])
              }}
            />
          </label>
          <div className="stage-entry-actions">
            <button
              type="button"
              onClick={() => {
                setText(STAGE_EXAMPLE)
                setSource('typed-command')
                setAnswers([])
              }}
              disabled={busy}
            >
              试用示例
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={(busy && !localControl(text)) || !text.trim()}
            >
              {state === 'planning' ? '正在理解台位…' : '生成舞台方案'}
            </button>
          </div>
        </>
      )}
      {plan && (
        <>
          {draft.current && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPlan(null)
                setText('')
                setAnswers([])
                setState('idle')
              }}
            >
              继续调整草台（暂不落位）
            </button>
          )}
          <details>
            <summary>{source === 'voice' ? '我听到的内容' : '我输入的内容'}</summary>
            <p>{text}</p>
          </details>
          <StagePlanReview
            plan={plan}
            context={context}
            onChange={setPlan}
            onBack={() => {
              draft.current = null
              setPlan(null)
              setState('idle')
            }}
            onConfirm={(next) => void confirm(next)}
            onAnswer={(questionId, answer) => {
              const next = [
                ...answers.filter((item) => item.questionId !== questionId),
                { questionId, answer },
              ]
              setAnswers(next)
              void generate(next)
            }}
            busy={busy}
            error={error}
          />
        </>
      )}
      {deletion && (
        <section aria-label="布景操作确认">
          <p>待确认操作：{text}。确认后写入，可撤销。</p>
          {deletion.some((command) => command.type === 'SetDoorClearance') && (
            <p>
              通道约束作用于所有门景片前后两侧，各侧均保留所输入的净距；后续手动及 AI
              布景调整都须遵守。
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              const before = currentStageContext()
              const result = executeStageCommands(deletion)
              if (!result.ok) {
                setError(result.error ?? '操作失败')
                return
              }
              rememberAiTransaction(
                result,
                before.objects.map((object) => object.id),
                '布景操作已完成，可撤销',
              )
              setDeletion(null)
              setState('complete')
            }}
          >
            确认操作
          </button>
          <button
            type="button"
            onClick={() => {
              setDeletion(null)
              setState('idle')
            }}
          >
            取消操作
          </button>
        </section>
      )}
      {['planning', 'applying'].includes(state) && (
        <button
          type="button"
          onClick={() => {
            abort.current?.abort()
            setState(plan ? 'review' : 'idle')
          }}
        >
          取消处理
        </button>
      )}
      {!plan && error && <p role="alert">{error}</p>}
      {state === 'complete' && <p role="status">已完成，可继续手动调整或撤销。</p>}
    </div>
  )
}
