'use client'

import { Plus, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { type DragEvent, useRef, useState } from 'react'
import { classifyDiaAttachment } from './attachment-files'
import './stage-entry.css'

const ScriptStageInput = dynamic(() => import('./script-input').then((m) => m.ScriptStageInput), {
  ssr: false,
  loading: () => <p role="status">正在准备文件…</p>,
})
const PhotoStageBuilder = dynamic(
  () => import('../photo-stage-builder').then((m) => m.PhotoStageBuilder),
  { ssr: false, loading: () => <p role="status">正在准备文件…</p> },
)

export function useDiaAttachments({
  sceneId,
  modelConfigured = false,
  disabled = false,
}: {
  sceneId?: string
  modelConfigured?: boolean
  disabled?: boolean
}) {
  const [attachment, setAttachment] = useState<ReturnType<typeof classifyDiaAttachment> | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [submission, setSubmission] = useState<{ note: string } | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const choose = (files: readonly File[]) => {
    if (disabled || attachment) {
      setError('请先完成或取消当前方案，再添加文件。')
      return
    }
    try {
      setAttachment(classifyDiaAttachment(files))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文件无法读取，请重新选择。')
    }
  }
  const dropProps = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (event.dataTransfer.types.includes('Files')) {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = disabled || attachment ? 'none' : 'copy'
      }
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      choose(Array.from(event.dataTransfer.files))
    },
  }
  const remove = () => {
    if (busy) return
    setAttachment(null)
    setSubmission(null)
    setError('')
  }
  return {
    open: attachment !== null,
    pending: attachment !== null && submission === null,
    busy,
    pick: () => {
      if (!disabled && !attachment) input.current?.click()
    },
    send: (note: string) => {
      if (disabled || !attachment || submission || busy) return
      if (note.trim().length > 2000) {
        setError('补充要求请控制在 2000 字以内。')
        return
      }
      if (attachment.kind === 'photo' && !modelConfigured) {
        setError('照片 AI 尚未启用，暂时无法生成。')
        return
      }
      setError('')
      setSubmission({ note: note.trim() })
    },
    dropProps,
    controls: (
      <div className="dia-attachment-controls">
        <input
          ref={input}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,.pdf"
          disabled={disabled || !!attachment}
          onChange={(event) => {
            choose(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        {attachment ? (
          <div className="dia-attachment-file">
            <span title={attachment.file.name}>{attachment.file.name}</span>
            <button type="button" disabled={busy} onClick={remove} aria-label="移除附件">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dia-attachment-add"
            aria-label="添加图片或 PDF"
            title="添加图片或 PDF"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        )}
        <p className="dia-attachment-hint">
          <span>
            {submission
              ? '确认采用后，才会保存布景。'
              : attachment
                ? '可补充要求，发送后生成布景预览。'
                : '拖入图片或 PDF，发送生成布景。'}
          </span>
          <span role={error ? 'alert' : undefined}>
            {error ||
              (attachment?.kind === 'photo'
                ? modelConfigured
                  ? '图片将交由 AI 识别，尺寸为估算。'
                  : '照片 AI 尚未启用，暂时无法生成。'
                : '仅保存采纳片段，不保存原 PDF。')}
          </span>
        </p>
      </div>
    ),
    panel: attachment && submission && (
      <section className="dia-attachment-panel" aria-label="附件场景布置预览" aria-busy={busy}>
        {attachment.kind === 'script' ? (
          <ScriptStageInput
            sceneId={sceneId}
            initialFile={attachment.file}
            note={submission.note}
            embedded
            onBusyChange={setBusy}
          />
        ) : (
          <PhotoStageBuilder
            modelConfigured={modelConfigured}
            initialFile={attachment.file}
            note={submission.note}
            embedded
            onBusyChange={setBusy}
          />
        )}
      </section>
    ),
  }
}
