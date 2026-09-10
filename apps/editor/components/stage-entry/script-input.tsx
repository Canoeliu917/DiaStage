'use client'

import { type StagePlan, StagePlanSchema } from '@pascal-app/core/stage'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { currentStageContext } from '@/lib/stage/context'
import {
  confirmedScriptImport,
  type ScriptFile,
  ScriptFileSchema,
} from '@/lib/stage/import-metadata'
import { resolveScriptQuestions } from '@/lib/stage/script-questions'
import { applyReviewedPlan, type ClarificationAnswer } from './command-input'
import { EMPTY_STAGE_CONTEXT, StagePlanReview, useStagePlanPreview } from './plan-review'

const ScriptResponseSchema = z.strictObject({
  requestId: z.string().min(1),
  file: ScriptFileSchema.omit({ sizeBytes: true }),
  plan: StagePlanSchema,
})

export function ScriptStageInput({ sceneId }: { sceneId?: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null),
    [fileInfo, setFileInfo] = useState<ScriptFile | null>(null)
  const [state, setState] = useState<'idle' | 'parsing' | 'review' | 'applying' | 'error'>('idle')
  const [error, setError] = useState(''),
    [plan, setPlan] = useState<StagePlan | null>(null)
  const [context, setContext] = useState(EMPTY_STAGE_CONTEXT),
    [answers, setAnswers] = useState<ClarificationAnswer[]>([])
  const requestId = useRef(''),
    abort = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null)
  const busy = state === 'parsing' || state === 'applying'
  useEffect(
    () => () => {
      abort.current?.abort()
      useStagePlanPreview.setState({ plan: null })
    },
    [],
  )
  const choose = (next?: File) => {
    if (!next || busy) return
    setPlan(null)
    setAnswers([])
    setFileInfo(null)
    setFile(next)
    setState('idle')
    setError('')
    if (/\.doc$/i.test(next.name)) setError('请在 Word/WPS 中另存为 .docx 后上传。')
    else if (!/\.(pdf|docx)$/i.test(next.name)) setError('请选择文本型 PDF 或 Word .docx 文件。')
    else if (!next.size) setError('文件为空，请重新选择。')
    else if (next.size > 20 * 1024 * 1024) setError('文件超过 20 MB，请拆分或压缩后上传。')
  }
  const generate = async (priorAnswers = answers) => {
    if (!file || busy) return
    const controller = new AbortController()
    abort.current?.abort()
    abort.current = controller
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), 65000)
    setError('')
    setState('parsing')
    try {
      const current = sceneId ? currentStageContext() : EMPTY_STAGE_CONTEXT
      const body = new FormData()
      body.set('file', file)
      body.set('sceneContext', JSON.stringify(current))
      body.set('priorAnswers', JSON.stringify(priorAnswers))
      const response = await fetch('/api/script/stage-plan', {
        method: 'POST',
        body,
        signal: controller.signal,
      })
      const json = await response.json()
      if (!response.ok)
        throw new Error(json.error?.message || '剧本提取失败，请重试或重新选择文件。')
      const result = ScriptResponseSchema.parse(json)
      if (result.plan.source !== 'script') throw new Error('方案来源不符，请重新提取。')
      if (controller.signal.aborted) return
      requestId.current = result.requestId
      setContext(current)
      setFileInfo({ ...result.file, sizeBytes: file.size })
      setPlan(result.plan)
      setState('review')
    } catch (failure) {
      if (!controller.signal.aborted || controller.signal.reason?.message === 'timeout') {
        setError(
          controller.signal.aborted
            ? '处理超时，文件仍在本页，可重新提取。'
            : failure instanceof Error
              ? failure.message
              : '连接失败，文件仍在本页，可重试。',
        )
        setState('error')
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  const confirm = async (next: StagePlan) => {
    if (busy || !fileInfo) return
    const controller = new AbortController()
    abort.current = controller
    setState('applying')
    setError('')
    try {
      const record = confirmedScriptImport(next, fileInfo, requestId.current)
      const path = await applyReviewedPlan(
        next,
        context,
        requestId.current,
        sceneId,
        controller.signal,
        record,
      )
      if (controller.signal.aborted) return
      setFile(null)
      setPlan(null)
      useStagePlanPreview.setState({ plan: null })
      setState('idle')
      if (path) router.push(path)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : '确认搭台失败，请重试。')
        setState('review')
      }
    }
  }
  return (
    <div className="stage-input" aria-busy={busy}>
      {!plan && (
        <>
          <p>只提取舞台空间与大型布景，确认前不会更改任何舞台。</p>
          <div
            className="stage-script-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (event.dataTransfer.files.length > 1) {
                setError('一次选择一个剧本文件。')
                return
              }
              choose(event.dataTransfer.files[0])
            }}
          >
            <p>拖入 PDF / Word，或点选文件</p>
            <input
              ref={input}
              type="file"
              accept=".pdf,.docx,.doc"
              aria-label="剧本文件"
              disabled={busy}
              onChange={(event) => choose(event.target.files?.[0])}
            />
            <p>支持文本型 PDF、Word .docx · 最多 20 MB</p>
          </div>
          {file && (
            <p className="stage-script-filename">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
          <button
            type="button"
            disabled={busy || !file || (!!error && state !== 'error')}
            onClick={() => void generate()}
          >
            {state === 'parsing'
              ? '正在提取舞台信息…'
              : state === 'error'
                ? '重新提取'
                : '提取舞台方案'}
          </button>
          <p>原文件仅在本次处理期间使用；项目只保存已确认布景的依据摘录。</p>
        </>
      )}
      {plan && (
        <>
          <p className="stage-script-filename">
            {fileInfo?.name}
            {fileInfo?.pageCount
              ? ` · ${fileInfo.pageCount} 页`
              : fileInfo?.paragraphCount
                ? ` · ${fileInfo.paragraphCount} 段`
                : ''}
          </p>
          <StagePlanReview
            plan={plan}
            context={context}
            onChange={setPlan}
            onConfirm={(next) => void confirm(next)}
            onBack={() => {
              setPlan(null)
              setState('idle')
              setError('')
            }}
            busy={busy}
            error={error}
            onAnswer={(questionId, answer) => {
              const next = [
                ...answers.filter((item) => item.questionId !== questionId),
                { questionId, answer },
              ]
              setAnswers(next)
              const resolved = resolveScriptQuestions(plan, next)
              if (resolved.questions.length < plan.questions.length) {
                setPlan(resolved)
                setError('')
              } else void generate(next)
            }}
          />
        </>
      )}
      {busy && (
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
    </div>
  )
}
