'use client'

import { VenueProposalSchema } from '@pascal-app/core/stage'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import './stage-entry.css'

export function ManualStageEntry({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const router = useRouter(),
    [open, setOpen] = useState(initiallyOpen),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    setReady(true)
    return () => abort.current?.abort()
  }, [])
  if (!open)
    return (
      <button type="button" disabled={!ready} onClick={() => setOpen(true)}>
        建立空舞台
      </button>
    )
  return (
    <form
      className="stage-entry-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        const controller = new AbortController()
        abort.current = controller
        try {
          const data = new FormData(event.currentTarget),
            height = String(data.get('height') ?? '')
          const venue = VenueProposalSchema.parse({
            type: data.get('type'),
            widthMeters: Number(data.get('width')),
            depthMeters: Number(data.get('depth')),
            heightMeters: height ? Number(height) : null,
          })
          const { createManualStageGraph } = await import('@/lib/stage/initial-stage')
          const response = await fetch('/api/scenes', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '未命名剧目', graph: createManualStageGraph(venue) }),
          })
          if (!response.ok) throw new Error('建立舞台失败，请检查连接后重试')
          const result = await response.json()
          if (controller.signal.aborted) return
          router.push(`/scene/${encodeURIComponent(result.id)}?workspace=set`)
        } catch (e) {
          if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '舞台尺寸无效')
        } finally {
          if (!controller.signal.aborted) setBusy(false)
        }
      }}
    >
      <label>
        舞台类型
        <select name="type" defaultValue="proscenium">
          <option value="proscenium">镜框式</option>
          <option value="black-box">黑匣子</option>
          <option value="thrust">伸出式</option>
          <option value="classroom">教室</option>
          <option value="other">其他</option>
        </select>
      </label>
      <label>
        宽度（米）
        <input type="number" name="width" defaultValue={8} min={1} max={1000} step="0.1" required />
      </label>
      <label>
        深度（米）
        <input type="number" name="depth" defaultValue={6} min={1} max={1000} step="0.1" required />
      </label>
      <label>
        高度（米，可稍后补充）
        <input
          type="number"
          name="height"
          min={1}
          max={1000}
          step="0.1"
          placeholder="未测量时暂按 4 米预览"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? '正在建立…' : '建立舞台'}
      </button>
    </form>
  )
}
