'use client'

import dynamic from 'next/dynamic'
import { type DragEvent, useRef, useState } from 'react'
import { classifyDiaAttachment } from './attachment-files'
import './stage-entry.css'

const ScriptStageInput = dynamic(() => import('./script-input').then((m) => m.ScriptStageInput), {
  ssr: false,
})
const PhotoStageBuilder = dynamic(
  () => import('../photo-stage-builder').then((m) => m.PhotoStageBuilder),
  { ssr: false },
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
  return {
    open: attachment !== null,
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
        <button
          type="button"
          disabled={disabled || !!attachment}
          onClick={() => input.current?.click()}
        >
          添加图片 / PDF
        </button>
        <p>
          也可拖入文字栏：解析已有剧本或照片中的场景布置，确认前不更改舞台。图片仅识别可见场地与布景，不做扫描剧本
          OCR。
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
    ),
    panel: attachment && (
      <section className="dia-attachment-panel" aria-label="附件场景布置预览" aria-busy={busy}>
        <div className="dia-attachment-heading">
          <p>{attachment.file.name}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAttachment(null)
              setError('')
            }}
          >
            关闭附件草稿
          </button>
        </div>
        <h3>解析场景布置</h3>
        {attachment.kind === 'script' ? (
          <ScriptStageInput
            sceneId={sceneId}
            initialFile={attachment.file}
            embedded
            onBusyChange={setBusy}
          />
        ) : (
          <PhotoStageBuilder
            modelConfigured={modelConfigured}
            initialFile={attachment.file}
            embedded
            onBusyChange={setBusy}
          />
        )}
      </section>
    ),
  }
}
