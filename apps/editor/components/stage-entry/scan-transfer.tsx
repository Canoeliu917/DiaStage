'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { CreatedRemoteVoiceSession, JoinedRemoteVoiceSession } from '@/lib/remote-voice/client'
import { readRemoteVoiceResponse } from '@/lib/remote-voice/client'
import {
  SCAN_LIMITS,
  type ScanUpload,
  ScanUploadSchema,
  validateScanGlb,
} from '@/lib/remote-voice/scan-glb'

const listSchema = z.strictObject({ uploads: z.array(ScanUploadSchema) })
const uploadSchema = z.strictObject({ upload: ScanUploadSchema })
const states = {
  uploading: '正在上传',
  ready: '等待电脑确认',
  imported: '已导入 · 本机已保存',
  rejected: '已放弃',
  failed: '上传失败',
}

export function ScanTransfer({
  session,
}: {
  session: CreatedRemoteVoiceSession | JoinedRemoteVoiceSession
}) {
  const owner = 'ownerToken' in session
  const token = owner ? session.ownerToken : session.remoteToken
  const [uploads, setUploads] = useState<ScanUpload[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const work = useRef<AbortController | null>(null)
  const xhr = useRef<XMLHttpRequest | null>(null)
  const uploadId = useRef<string | null>(null)
  const headers = (): Record<string, string> =>
    owner ? { 'x-diastage-owner-token': token } : { 'x-diastage-remote-token': token }
  const base = `/api/remote-voice/sessions/${session.id}/scans`
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined
    let pollRequest: AbortController | undefined
    const poll = async () => {
      const activeRequest = new AbortController()
      pollRequest = activeRequest
      try {
        const response = await fetch(base, {
          headers: owner
            ? { 'x-diastage-owner-token': token }
            : { 'x-diastage-remote-token': token },
          signal: AbortSignal.any([activeRequest.signal, AbortSignal.timeout(10_000)]),
          cache: 'no-store',
        })
        if (stopped || activeRequest.signal.aborted) return
        if (response.status === 410) {
          stopped = true
          return
        }
        const result = await readRemoteVoiceResponse(response, listSchema, '无法读取扫描状态。')
        if (!stopped && !activeRequest.signal.aborted) setUploads(result.uploads)
      } catch {
        /* The shared session header reports connection failures. */
      } finally {
        if (!stopped && pollRequest === activeRequest)
          timer = setTimeout(poll, document.hidden ? 30_000 : 4000)
      }
    }
    const resume = () => {
      if (!document.hidden && !stopped) {
        clearTimeout(timer)
        pollRequest?.abort()
        void poll()
      }
    }
    void poll()
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      clearTimeout(timer)
      pollRequest?.abort()
      work.current?.abort()
      xhr.current?.abort()
      document.removeEventListener('visibilitychange', resume)
    }
  }, [base, owner, token])

  const cancel = async () => {
    work.current?.abort()
    xhr.current?.abort()
    const id = uploadId.current
    if (id) {
      try {
        const response = await fetch(`${base}/${id}`, {
          method: 'DELETE',
          headers: headers(),
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error()
        setMessage('已取消上传。')
      } catch {
        setMessage('本机上传已停止；服务器未确认取消，临时文件会在到期后清理。')
      }
    }
  }

  const upload = async (file: File) => {
    if (busy || owner) return
    setBusy(true)
    setProgress(0)
    setMessage('正在检查扫描文件…')
    const controller = new AbortController()
    work.current = controller
    const id = crypto.randomUUID()
    uploadId.current = id
    try {
      if (!session.sceneId) throw new Error('请先在电脑端保存场景并重新配对。')
      if (!/\.glb$/i.test(file.name) || file.size > SCAN_LIMITS.bytes)
        throw new Error('只支持 32MB 以内的单文件 .glb。')
      await validateScanGlb(async (offset, length) => {
        controller.signal.throwIfAborted()
        return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
      }, file.size)
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
      controller.signal.throwIfAborted()
      const sha256 = [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('')
      setMessage('正在上传，请保持页面打开…')
      const result = await new Promise<ScanUpload>((resolve, reject) => {
        const request = new XMLHttpRequest()
        xhr.current = request
        request.open('POST', base)
        request.timeout = SCAN_LIMITS.uploadMs
        for (const [key, value] of Object.entries({
          ...headers(),
          'content-type': 'model/gltf-binary',
          'x-scan-id': id,
          'x-scan-name': encodeURIComponent(`${file.name.slice(0, -4).slice(0, 156)}.glb`),
          'x-scan-bytes': String(file.size),
          'x-scan-sha256': sha256,
        }))
          request.setRequestHeader(key, value)
        request.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        request.onerror = () => reject(new Error('上传连接中断，请查看回执或重试。'))
        request.ontimeout = () => reject(new Error('上传超时，请重试。'))
        request.onabort = () => reject(new Error('上传已取消。'))
        request.onload = () => {
          try {
            const json: unknown = JSON.parse(request.responseText)
            const parsed = uploadSchema.safeParse(json)
            if (!parsed.success) {
              const failure = z.object({ error: z.object({ message: z.string() }) }).safeParse(json)
              throw new Error(
                failure.success
                  ? failure.data.error.message
                  : '服务器未确认扫描，请查看连接状态后重试。',
              )
            }
            if (request.status >= 400)
              throw new Error(parsed.data.upload.error ?? '上传未通过校验。')
            resolve(parsed.data.upload)
          } catch (error) {
            reject(error)
          }
        }
        request.send(file)
      })
      setUploads([result])
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '扫描上传失败。')
    } finally {
      setBusy(false)
      setProgress(null)
      xhr.current = null
    }
  }

  const finish = async (item: ScanUpload, state: 'imported' | 'rejected') => {
    if (busy) return
    setBusy(true)
    setMessage(state === 'imported' ? '正在校验并保存到本机…' : '正在放弃…')
    const controller = new AbortController()
    work.current = controller
    try {
      if (state === 'imported') {
        if (!owner || !session.sceneId) throw new Error('只有当前场景的电脑端可以确认导入。')
        const { importConfirmedScan } = await import('@/lib/remote-voice/scan-import')
        await importConfirmedScan(
          item,
          session,
          session.sceneId,
          AbortSignal.any([controller.signal, AbortSignal.timeout(SCAN_LIMITS.uploadMs)]),
        )
      }
      const response = await fetch(`${base}/${item.id}`, {
        method: owner ? 'PATCH' : 'DELETE',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: owner ? JSON.stringify({ state }) : undefined,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      })
      const result = await readRemoteVoiceResponse(
        response,
        uploadSchema,
        '回执未送达，可重试；已导入的扫描不会重复创建。',
      )
      setUploads([result.upload])
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '处理失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="scan-transfer" aria-label="扫描上传">
      <h2>扫描上传</h2>
      <p>在扫描应用中导出单文件 GLB，再上传到这里。网页本身不进行 LiDAR 扫描。</p>
      {!owner && (
        <label>
          选择场地扫描（.glb，最多 32MB）
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            disabled={busy || !session.sceneId}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void upload(file)
            }}
          />
        </label>
      )}
      {!session.sceneId && <p role="note">尚未绑定已保存的场景。请在电脑端保存场景后重新配对。</p>}
      <details>
        <summary>文件要求</summary>
        <p>
          普通静态 GLB，最多150万顶点，内嵌 PNG/JPEG
          贴图每张不超过4096像素；暂不接受压缩网格、动画、灯光和扩展。
        </p>
      </details>
      {progress !== null && (
        <>
          <progress max={100} value={progress} aria-label="扫描上传进度" />
          <p>{progress}%</p>
          <button type="button" onClick={() => void cancel()}>
            取消上传
          </button>
        </>
      )}
      {uploads.length === 0 && <p>暂无待导入扫描。</p>}
      {uploads.map((item) => (
        <div className="scan-transfer__file" key={item.id}>
          <strong>{item.name}</strong>
          <p>
            {(item.bytes / 1024 / 1024).toFixed(2)} MB · {item.vertices.toLocaleString()} 顶点 ·{' '}
            {states[item.state]}
          </p>
          {item.error && <p role="alert">{item.error}</p>}
          {item.state === 'ready' && (
            <div className="stage-entry-actions">
              {owner && (
                <button type="button" disabled={busy} onClick={() => void finish(item, 'imported')}>
                  确认导入扫描
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => void finish(item, 'rejected')}>
                放弃扫描
              </button>
            </div>
          )}
        </div>
      ))}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  )
}
