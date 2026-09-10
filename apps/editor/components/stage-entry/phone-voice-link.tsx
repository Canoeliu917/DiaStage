'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import {
  CreatedRemoteVoiceResponseSchema,
  type CreatedRemoteVoiceSession,
  CreatedRemoteVoiceSessionSchema,
  OwnerRemoteVoiceResponseSchema,
  type RemoteVoiceCommand,
  type RemoteVoiceDisposition,
  readRemoteVoiceResponse,
} from '@/lib/remote-voice/client'
import { localControl } from '@/lib/stage/ai-controls'
import { ScanTransfer } from './scan-transfer'

export type RemoteVoiceReport = (
  disposition: RemoteVoiceDisposition,
  summary: string,
) => Promise<void>
const receiptSchema = z.strictObject({
  sequence: z.number().int().positive(),
  disposition: z.enum([
    'received',
    'processing',
    'waiting-confirmation',
    'applied',
    'rejected',
    'failed',
  ]),
  summary: z.string().max(300),
})
type Receipt = z.infer<typeof receiptSchema>
const terminal = (value: RemoteVoiceDisposition) =>
  ['applied', 'rejected', 'failed'].includes(value)

export function PhoneVoiceLink({
  sceneId,
  sceneLabel,
  storageKey,
  canLoad,
  onTranscript,
  onDisconnect,
}: {
  sceneId?: string
  sceneLabel: string
  storageKey: string
  canLoad: boolean
  onTranscript: (
    command: RemoteVoiceCommand,
    report: RemoteVoiceReport,
    sessionId: string,
  ) => Promise<void>
  onDisconnect?: () => void
}) {
  const [session, setSession] = useState<CreatedRemoteVoiceSession | null>(null)
  const [connection, setConnection] = useState('等待配对')
  const [incoming, setIncoming] = useState<RemoteVoiceCommand | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [address, setAddress] = useState('')
  const [localOnly, setLocalOnly] = useState(false)
  const [handled, setHandled] = useState<Receipt | null>(null)
  const completed = useRef<Receipt | null>(null)
  const callback = useRef(onDisconnect)
  callback.current = onDisconnect
  const key = `diastage:remote-voice-owner:${storageKey}`
  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_DIASTAGE_REMOTE_URL?.trim()
    let url: URL
    try {
      url = new URL('/remote-voice', configured || window.location.origin)
    } catch {
      url = new URL('/remote-voice', window.location.origin)
    }
    setAddress(url.href)
    setLocalOnly(
      url.protocol !== 'https:' ||
        ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname),
    )
    try {
      const saved = CreatedRemoteVoiceSessionSchema.safeParse(
        JSON.parse(sessionStorage.getItem(key) || 'null'),
      )
      if (
        saved.success &&
        Date.parse(saved.data.expiresAt) > Date.now() &&
        saved.data.sceneId === (sceneId ?? null)
      ) {
        setSession(saved.data)
        const receipt = receiptSchema.safeParse(
          JSON.parse(sessionStorage.getItem(`${key}:receipt`) || 'null'),
        )
        if (receipt.success) {
          completed.current = receipt.data
          setHandled(receipt.data)
        }
      }
    } catch {
      sessionStorage.removeItem(key)
    }
  }, [key, sceneId])

  useEffect(() => {
    if (!session) return
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | undefined
    const poll = async () => {
      const activeRequest = new AbortController()
      request = activeRequest
      try {
        const response = await fetch(`/api/remote-voice/sessions/${session.id}`, {
          cache: 'no-store',
          signal: AbortSignal.any([activeRequest.signal, AbortSignal.timeout(10_000)]),
          headers: { 'x-diastage-owner-token': session.ownerToken },
        })
        if (stopped || activeRequest.signal.aborted) return
        if (response.status === 410) {
          setConnection('已过期')
          stopped = true
          callback.current?.()
          return
        }
        const result = await readRemoteVoiceResponse(
          response,
          OwnerRemoteVoiceResponseSchema,
          '连接检查失败，请重试。',
        )
        if (stopped || activeRequest.signal.aborted) return
        setConnection(
          result.status.paired ? '已连接' : result.status.connectedAt ? '暂时断开' : '等待配对',
        )
        setIncoming(result.status.pendingCommand)
      } catch {
        if (!stopped && !activeRequest.signal.aborted) setConnection('暂时断开')
      } finally {
        if (!stopped && request === activeRequest)
          timer = setTimeout(poll, document.hidden ? 30_000 : 3000)
      }
    }
    const resume = () => {
      if (!document.hidden && !stopped) {
        clearTimeout(timer)
        request?.abort()
        void poll()
      }
    }
    void poll()
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      clearTimeout(timer)
      request?.abort()
      document.removeEventListener('visibilitychange', resume)
    }
  }, [session])

  const reportFor =
    (command: RemoteVoiceCommand): RemoteVoiceReport =>
    async (disposition, summary) => {
      if (!session) return
      const receipt = { sequence: command.sequence, disposition, summary: summary.slice(0, 300) }
      completed.current = receipt
      setHandled(receipt)
      sessionStorage.setItem(`${key}:receipt`, JSON.stringify(receipt))
      try {
        const response = await fetch(`/api/remote-voice/sessions/${session.id}/commands`, {
          method: 'PATCH',
          signal: AbortSignal.timeout(10_000),
          headers: {
            'content-type': 'application/json',
            'x-diastage-owner-token': session.ownerToken,
          },
          body: JSON.stringify(receipt),
        })
        if (!response.ok) throw new Error()
        if (terminal(disposition)) setIncoming(null)
        setError('')
      } catch {
        setError('处理结果已保留，但回执未送达。请重试回执。')
      }
    }

  const load = async (command: RemoteVoiceCommand) => {
    if (busy) return
    setBusy(true)
    setError('')
    const report = reportFor(command)
    try {
      const previous = completed.current
      if (previous?.sequence === command.sequence && terminal(previous.disposition))
        await report(previous.disposition, previous.summary)
      else if (session) {
        await report('processing', '正在生成待确认方案')
        await onTranscript(command, report, session.id)
      }
    } catch (error) {
      await report('failed', error instanceof Error ? error.message : '处理失败，未应用')
    } finally {
      setBusy(false)
    }
  }

  const createPairingCode = async () => {
    if (busy || !sceneId) return
    const previous = session
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/remote-voice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: sceneLabel, sceneId }),
        signal: AbortSignal.timeout(10_000),
      })
      const result = await readRemoteVoiceResponse(
        response,
        CreatedRemoteVoiceResponseSchema,
        '无法生成配对码。',
      )
      sessionStorage.setItem(key, JSON.stringify(result.session))
      sessionStorage.removeItem(`${key}:receipt`)
      setSession(result.session)
      setIncoming(null)
      completed.current = null
      setHandled(null)
      setConnection('等待配对')
      if (previous) {
        callback.current?.()
        void fetch(`/api/remote-voice/sessions/${previous.id}`, {
          method: 'DELETE',
          headers: { 'x-diastage-owner-token': previous.ownerToken },
          signal: AbortSignal.timeout(10_000),
        }).catch(() => {})
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '连接失败')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!session) return
    setBusy(true)
    callback.current?.()
    try {
      const response = await fetch(`/api/remote-voice/sessions/${session.id}`, {
        method: 'DELETE',
        headers: { 'x-diastage-owner-token': session.ownerToken },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok && response.status !== 410) throw new Error()
      setSession(null)
      setIncoming(null)
      completed.current = null
      setHandled(null)
      sessionStorage.removeItem(key)
      sessionStorage.removeItem(`${key}:receipt`)
    } catch {
      setError('断开请求未送达，请重试；未确认撤销连接。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="phone-voice-link" open={!!session}>
      <summary>连接手机舞台助手</summary>
      <div className="phone-voice-link__body">
        {!session ? (
          <>
            <p>手机录音、校对文字或上传扫描。舞台方案和扫描均在电脑端确认后落位。</p>
            {!sceneId && <p>请先建立并保存舞台，再连接手机。</p>}
            <button
              type="button"
              disabled={busy || !sceneId}
              onClick={() => void createPairingCode()}
            >
              {busy ? '正在连接…' : '生成配对码'}
            </button>
          </>
        ) : (
          <>
            <p role="status">手机 · {connection}</p>
            <div className="phone-voice-link__pairing">
              <p className="phone-voice-link__code">{session.pairingCode}</p>
              <button type="button" disabled={busy} onClick={() => void createPairingCode()}>
                {busy ? '正在生成…' : '重新生成配对码'}
              </button>
            </div>
            <label>
              手机打开此地址
              <input readOnly value={address} onFocus={(e) => e.currentTarget.select()} />
            </label>
            {localOnly && (
              <p className="stage-entry-warning">
                手机需使用可访问的 HTTPS 地址。当前地址尚未满足手机录音条件。
              </p>
            )}
            <button type="button" disabled={busy} onClick={() => void disconnect()}>
              断开连接
            </button>
            {incoming && (
              <section className="phone-voice-link__incoming" aria-label="手机传来的口令">
                <h3>手机口令</h3>
                <blockquote>{incoming.transcript}</blockquote>
                {handled?.sequence === incoming.sequence && <p>{handled.summary}</p>}
                <div className="stage-entry-actions">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (!canLoad &&
                        !localControl(incoming.transcript) &&
                        !(handled?.sequence === incoming.sequence && terminal(handled.disposition)))
                    }
                    onClick={() => void load(incoming)}
                  >
                    {handled?.sequence === incoming.sequence && terminal(handled.disposition)
                      ? '重试回执'
                      : '生成待确认方案'}
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (handled?.sequence === incoming.sequence && terminal(handled.disposition))
                    }
                    onClick={() => {
                      callback.current?.()
                      void reportFor(incoming)('rejected', '已拒绝，没有修改舞台')
                    }}
                  >
                    拒绝口令
                  </button>
                </div>
              </section>
            )}
            <ScanTransfer session={session} />
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
