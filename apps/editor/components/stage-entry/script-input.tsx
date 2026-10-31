'use client'

import { type StagePlan, StagePlanSchema, validateStagePlan } from '@pascal-app/core/stage'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { fetchAiWithBudgetConsent } from '@/lib/ai/budget-client'
import { VOICE_INPUT_ENABLED } from '@/lib/remote-voice/availability'
import { currentStageContext } from '@/lib/stage/context'
import { draftContext, mergeDraftPlan } from '@/lib/stage/creation-policy'
import {
  confirmedScriptImport,
  type ScriptFile,
  ScriptFileSchema,
} from '@/lib/stage/import-metadata'
import { resolveScriptQuestions } from '@/lib/stage/script-questions'
import { scheduleAttachmentParse } from './attachment-files'
import { applyReviewedPlan, type ClarificationAnswer, type VoiceState } from './command-input'
import { EMPTY_STAGE_CONTEXT, StagePlanReview, useStagePlanPreview } from './plan-review'
import { VoiceRecorder } from './voice-recorder'

const ScriptResponseSchema = z.strictObject({
  requestId: z.string().min(1),
  file: ScriptFileSchema.omit({ sizeBytes: true }),
  plan: StagePlanSchema,
})

export function ScriptStageInput({
  sceneId,
  initialFile,
  embedded = false,
  note = '',
  onBusyChange,
}: {
  sceneId?: string
  initialFile?: File
  embedded?: boolean
  note?: string
  onBusyChange?: (busy: boolean) => void
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null),
    [fileInfo, setFileInfo] = useState<ScriptFile | null>(null)
  const [state, setState] = useState<
    'idle' | 'parsing' | 'review' | 'applying' | 'complete' | 'error'
  >('idle')
  const [error, setError] = useState(''),
    [plan, setPlan] = useState<StagePlan | null>(null)
  const [context, setContext] = useState(EMPTY_STAGE_CONTEXT),
    [answers, setAnswers] = useState<ClarificationAnswer[]>([])
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [revisionText, setRevisionText] = useState('')
  const requestId = useRef(''),
    abort = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null)
  const busy =
    state === 'parsing' ||
    state === 'applying' ||
    (VOICE_INPUT_ENABLED &&
      ['recording', 'transcribing', 'requesting-permission'].includes(voiceState))
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  useEffect(
    () => () => {
      abort.current?.abort()
      useStagePlanPreview.setState({ plan: null })
    },
    [],
  )
  const choose = (next?: File) => {
    if (!next || busy) return false
    setPlan(null)
    setAnswers([])
    setFileInfo(null)
    setFile(next)
    setState('idle')
    setError('')
    let message = ''
    if (/\.doc$/i.test(next.name)) message = '请在 Word/WPS 中另存为 .docx 后上传。'
    else if (!/\.(pdf|docx)$/i.test(next.name)) message = '请选择文本型 PDF 或 Word .docx 文件。'
    else if (!next.size) message = '文件为空，请重新选择。'
    else if (next.size > 20 * 1024 * 1024) message = '文件超过 20 MB，请拆分或压缩后上传。'
    setError(message)
    return !message
  }
  const generate = async (priorAnswers = answers, selectedFile = file) => {
    if (!selectedFile || busy) return
    const controller = new AbortController()
    abort.current?.abort()
    abort.current = controller
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), 65000)
    setError('')
    setState('parsing')
    try {
      const current = sceneId ? currentStageContext() : EMPTY_STAGE_CONTEXT
      const body = new FormData()
      body.set('file', selectedFile)
      body.set('sceneContext', JSON.stringify(current))
      body.set('priorAnswers', JSON.stringify(priorAnswers))
      if (note) body.set('note', note)
      const { response } = await fetchAiWithBudgetConsent('/api/script/stage-plan', {
        method: 'POST',
        body,
        signal: controller.signal,
      })
      const json = await response.json()
      if (!response.ok)
        throw new Error(
          json.error?.code === 'SCANNED_PDF'
            ? '这份 PDF 没有可读取的文字。本次只支持文本型 PDF，不支持扫描剧本 OCR。'
            : json.error?.message || '剧本提取失败，请重试或重新选择文件。',
        )
      const result = ScriptResponseSchema.parse(json)
      if (result.plan.source !== 'script') throw new Error('方案来源不符，请重新提取。')
      if (controller.signal.aborted) return
      requestId.current = result.requestId
      setContext(current)
      setFileInfo({ ...result.file, sizeBytes: selectedFile.size })
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
  // Launch once per attached file, rather than resubmitting paid work on state updates.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Attachment changes alone start the initial parse.
  useEffect(() => {
    if (!initialFile) return
    const cancel = scheduleAttachmentParse(() => {
      if (choose(initialFile)) void generate([], initialFile)
    })
    return () => {
      cancel()
      abort.current?.abort()
    }
  }, [initialFile])
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
      setState('complete')
      if (path) router.push(path)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : '确认搭台失败，请重试。')
        setState('review')
      }
    }
  }
  const revise = async () => {
    if (!plan || busy || !revisionText.trim() || plan.questions.length) return
    const controller = new AbortController()
    abort.current?.abort()
    abort.current = controller
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), 65_000)
    setState('parsing')
    setError('')
    try {
      const draft = draftContext(context, validateStagePlan(plan, context).plan)
      const { response } = await fetchAiWithBudgetConsent('/api/stage/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          input: revisionText,
          source: 'typed-command',
          sceneContext: draft,
          priorAnswers: [],
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error?.message ?? '调整方案失败')
      const next = StagePlanSchema.parse(json.plan)
      controller.signal.throwIfAborted()
      const reviewed = validateStagePlan(next, draft).plan
      if (reviewed.questions.length)
        throw new Error(
          `请补充调整口令后重试：${reviewed.questions.map((q) => q.message).join('；')}`,
        )
      setPlan(mergeDraftPlan(plan, reviewed, context))
      setState('review')
      setRevisionText('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '调整失败，原草案已保留')
      setState('review')
    } finally {
      clearTimeout(timeout)
    }
  }
  return (
    <div className="stage-input" aria-busy={busy}>
      {!plan && (
        <>
          {!embedded && (
            <p>只解析已有剧本中的舞台空间与大型布景，不生成剧本文字；确认前不会更改舞台。</p>
          )}
          {!initialFile && (
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
          )}
          {!embedded && file && (
            <p className="stage-script-filename">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
          {embedded && busy && <p role="status">正在生成场景布置…</p>}
          {(!embedded || !busy) && (
            <button
              type="button"
              disabled={busy || !file || (!!error && state !== 'error')}
              onClick={() => void generate()}
            >
              {state === 'parsing'
                ? '正在提取舞台信息…'
                : state === 'error'
                  ? '重新提取'
                  : '解析场景布置'}
            </button>
          )}
          {!embedded && <p>原文件仅在本次处理期间使用；项目只保存已确认布景的依据摘录。</p>}
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
            compact={embedded}
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
          <details>
            <summary>继续调整布置草案</summary>
            <p>先补齐待确认的问题，再修改台位。所有调整仍留在草案中，最后统一确认搭台。</p>
            {VOICE_INPUT_ENABLED && (
              <VoiceRecorder
                state={voiceState}
                setState={setVoiceState}
                onError={setError}
                onTranscript={setRevisionText}
              />
            )}
            <label>
              调整布置
              <textarea
                value={revisionText}
                maxLength={10_000}
                onChange={(e) => setRevisionText(e.target.value)}
                placeholder="例如：把沙发向台右移动20厘米。"
              />
            </label>
            <button
              type="button"
              disabled={busy || !revisionText.trim() || plan.questions.length > 0}
              onClick={() => void revise()}
            >
              预览草案调整
            </button>
          </details>
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
      {state === 'complete' && <p role="status">布置已应用，可继续手动调整。</p>}
    </div>
  )
}
