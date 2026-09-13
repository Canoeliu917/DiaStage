'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import {
  JoinedRemoteVoiceResponseSchema,
  type JoinedRemoteVoiceSession,
  JoinedRemoteVoiceSessionSchema,
  RemoteRemoteVoiceResponseSchema,
  type RemoteVoiceDisposition,
  readRemoteVoiceResponse,
  SentRemoteVoiceResponseSchema,
} from '@/lib/remote-voice/client'
import type { VoiceState } from './command-input'
import { MobileDia } from './mobile-dia'
import './stage-entry.css'

const ScanTransfer = dynamic(
  () => import('./scan-transfer').then((module) => module.ScanTransfer),
  {
    ssr: false,
    loading: () => <p role="status">正在打开扫描上传…</p>,
  },
)
const VoiceRecorder = dynamic(
  () => import('./voice-recorder').then((module) => module.VoiceRecorder),
  { ssr: false, loading: () => <p role="status">正在打开录音…</p> },
)

const STORAGE_KEY = 'diastage:remote-voice-controller'
const pendingSchema = z.strictObject({
  requestId: z.string().uuid(),
  sequence: z.number().int().positive(),
  transcript: z.string().max(10_000),
})
const storedSchema = z.strictObject({
  session: JoinedRemoteVoiceSessionSchema,
  draft: z.string().max(10_000),
  pending: pendingSchema.nullable(),
})
const labels: Record<RemoteVoiceDisposition, string> = {
  received: '已接收',
  processing: '处理中',
  'waiting-confirmation': '等待电脑确认',
  applied: '已应用',
  rejected: '已拒绝',
  failed: '处理失败',
}
const isFinal = (status: RemoteVoiceDisposition | null) =>
  status && ['applied', 'rejected', 'failed'].includes(status)

export function RemoteVoiceController() {
  const [pairingCode, setPairingCode] = useState('')
  const [session, setSession] = useState<JoinedRemoteVoiceSession | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<z.infer<typeof pendingSchema> | null>(null)
  const [acknowledged, setAcknowledged] = useState(0)
  const [receipt, setReceipt] = useState<RemoteVoiceDisposition | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [connection, setConnection] = useState<
    'connecting' | 'connected' | 'disconnected' | 'expired'
  >('disconnected')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [secureContext, setSecureContext] = useState(true)
  const [tab, setTab] = useState<'dia' | 'voice' | 'scan'>('dia')
  const request = useRef<AbortController | null>(null)
  const sessionExpired = connection === 'expired'
  const transcribeHeaders = useMemo(
    () => (session ? { 'x-diastage-remote-token': session.remoteToken } : undefined),
    [session],
  )

  useEffect(() => {
    setSecureContext(globalThis.isSecureContext)
    try {
      const result = storedSchema.safeParse(
        JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'),
      )
      if (result.success) {
        setSession(result.data.session)
        setDraft(result.data.draft)
        setPending(result.data.pending)
        setConnection(
          Date.parse(result.data.session.expiresAt) <= Date.now() ? 'expired' : 'connecting',
        )
      }
    } catch {
      setError('浏览器未允许恢复配对，请重新连接；电脑排演仍保留。')
    }
    return () => request.current?.abort()
  }, [])
  useEffect(() => {
    if (session) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ session, draft, pending }))
      } catch {
        setError('配对和草稿暂未保存在本机，请复制文字后再刷新。')
      }
    }
  }, [session, draft, pending])

  useEffect(() => {
    if (!session || sessionExpired) return
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const poll = async () => {
      const activeRequest = new AbortController()
      controller = activeRequest
      try {
        const response = await fetch(`/api/remote-voice/sessions/${session.id}`, {
          cache: 'no-store',
          signal: AbortSignal.any([activeRequest.signal, AbortSignal.timeout(10_000)]),
          headers: { 'x-diastage-remote-token': session.remoteToken },
        })
        if (stopped || activeRequest.signal.aborted) return
        if ([401, 403, 404, 410].includes(response.status)) {
          setConnection('expired')
          stopped = true
          return
        }
        const result = await readRemoteVoiceResponse(
          response,
          RemoteRemoteVoiceResponseSchema,
          '无法读取电脑状态。',
        )
        if (stopped || activeRequest.signal.aborted) return
        setConnection('connected')
        setAcknowledged(result.status.lastAcknowledgedSequence)
        if (pending) {
          if (result.status.lastAcknowledgedSequence >= pending.sequence) {
            setReceipt(result.status.lastAcknowledgedDisposition)
            setSummary(result.status.summary)
          } else if (result.status.pendingSequence === pending.sequence) {
            setReceipt(result.status.progress ?? 'received')
            setSummary(result.status.summary)
          }
        }
      } catch {
        if (!stopped && !activeRequest.signal.aborted) setConnection('disconnected')
      } finally {
        if (!stopped && controller === activeRequest)
          timer = setTimeout(poll, document.hidden ? 30_000 : 3000)
      }
    }
    const resume = () => {
      if (!document.hidden && !stopped) {
        clearTimeout(timer)
        controller?.abort()
        void poll()
      }
    }
    void poll()
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', resume)
    }
  }, [session, pending, sessionExpired])

  const join = async () => {
    setConnection('connecting')
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const response = await fetch('/api/remote-voice/sessions/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: pairingCode }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      })
      const result = await readRemoteVoiceResponse(
        response,
        JoinedRemoteVoiceResponseSchema,
        '配对失败，请检查配对码。',
      )
      setSession(result.session)
      setPairingCode('')
      setDraft('')
      setPending(null)
      setReceipt(null)
      setAcknowledged(0)
      setConnection('connected')
    } catch (error) {
      setError(error instanceof Error ? error.message : '连接失败')
      setConnection('disconnected')
    }
  }
  const send = async () => {
    if (!session || sending || isFinal(receipt)) return
    const command = pending ?? {
      requestId: crypto.randomUUID(),
      sequence: acknowledged + 1,
      transcript: draft.trim(),
    }
    if (!command.transcript) return
    setSending(true)
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      // Persist the exact request before sending; a lost response must retry the same ID and sequence.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ session, draft, pending: command }))
      setPending(command)
      const response = await fetch(`/api/remote-voice/sessions/${session.id}/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-diastage-remote-token': session.remoteToken,
        },
        body: JSON.stringify(command),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      })
      await readRemoteVoiceResponse(
        response,
        SentRemoteVoiceResponseSchema,
        '发送未确认，请重试同一口令。',
      )
      setReceipt('received')
    } catch (error) {
      setError(error instanceof Error ? error.message : '发送未确认，请重试。')
    } finally {
      setSending(false)
    }
  }
  const disconnect = async () => {
    if (!session) return
    request.current?.abort()
    setSending(true)
    try {
      const response =
        connection === 'expired'
          ? null
          : await fetch(`/api/remote-voice/sessions/${session.id}`, {
              method: 'DELETE',
              headers: { 'x-diastage-remote-token': session.remoteToken },
              signal: AbortSignal.timeout(10_000),
            })
      if (response && !response.ok && response.status !== 410)
        throw new Error('断开未获确认，请恢复网络后重试。')
      sessionStorage.removeItem(STORAGE_KEY)
      setSession(null)
      setDraft('')
      setPending(null)
      setReceipt(null)
      setVoiceState('idle')
      setConnection('disconnected')
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : '断开失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="remote-voice-card">
      <header>
        <div>
          <h1>Dia</h1>
          <p>{session?.label || '咫台 DiaStage · 一起排'}</p>
        </div>
        {session && (
          <button type="button" disabled={sending} onClick={() => void disconnect()}>
            {connection === 'expired' ? '重新配对' : '断开连接'}
          </button>
        )}
      </header>
      {tab !== 'dia' && (
        <button type="button" onClick={() => setTab('dia')}>
          回到 Dia 对话
        </button>
      )}
      {session && connection === 'expired' && (
        <p role="alert">配对已过期或被断开。请点击“重新配对”，在电脑获取新配对码。</p>
      )}
      {session && connection !== 'expired' && tab === 'dia' && (
        <MobileDia key={session.id} session={session} onExpired={() => setConnection('expired')} />
      )}
      {!session && tab === 'dia' && (
        <div className="mobile-dia-welcome">
          <h2>今天想排什么？</h2>
          <p>说一句，或输入文字。连接舞台后，和 Dia 看同一段戏，试几个方向，再由你决定。</p>
        </div>
      )}
      <details className="mobile-assistant-tools">
        <summary>继续最近排演 · 剧本 · 舞台 · 扫描</summary>
        <nav aria-label="其他排演工具">
          <button type="button" aria-pressed={tab === 'voice'} onClick={() => setTab('voice')}>
            语音构台
          </button>
          <a
            href={
              session?.sceneId
                ? `/scene/${encodeURIComponent(session.sceneId)}?workspace=set`
                : '/?entry=manual'
            }
          >
            手动置景
          </a>
          <a href="/?entry=script">剧本搭台</a>
          <a
            href={
              session?.sceneId
                ? `/scene/${encodeURIComponent(session.sceneId)}?workspace=remount&versions=1`
                : '/scenes'
            }
          >
            复台
          </a>
          <button type="button" aria-pressed={tab === 'scan'} onClick={() => setTab('scan')}>
            扫描上传
          </button>
        </nav>
      </details>
      {!session ? (
        <>
          <h2>{tab === 'scan' ? '连接后上传扫描' : '连接电脑舞台'}</h2>
          <p>在电脑已保存的场景中，打开“连接手机舞台助手”，获取配对码。</p>
          <label>
            8 位配对码
            <input
              autoCapitalize="characters"
              autoComplete="one-time-code"
              maxLength={9}
              value={pairingCode}
              placeholder="ABCD-EFGH"
              onChange={(e) =>
                setPairingCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^0-9A-Z-]/g, '')
                    .slice(0, 9),
                )
              }
            />
          </label>
          <button
            type="button"
            disabled={connection === 'connecting' || pairingCode.replace(/-/g, '').length !== 8}
            onClick={() => void join()}
          >
            {connection === 'connecting' ? '正在连接…' : '连接舞台'}
          </button>
        </>
      ) : connection !== 'expired' && tab !== 'dia' ? (
        <>
          <p role="status">
            {
              {
                connecting: '正在连接',
                connected: '已连接',
                disconnected: '已断开 · 正在重新检查',
                expired: '已过期 · 请断开后重新配对',
              }[connection]
            }
          </p>
          {tab === 'scan' ? (
            <ScanTransfer session={session} />
          ) : (
            <>
              <h2>语音构台</h2>
              <p>台左、台右以演员面向观众为准。发送后先在电脑预览，再确认落位。</p>
              {!secureContext && (
                <p role="note">当前不是 HTTPS，麦克风不可用；可以输入文字口令。</p>
              )}
              {!pending ? (
                <>
                  <VoiceRecorder
                    state={voiceState}
                    setState={setVoiceState}
                    onError={setError}
                    onTranscript={setDraft}
                    transcribeEndpoint={`/api/remote-voice/sessions/${session.id}/transcribe`}
                    requestHeaders={transcribeHeaders}
                  />
                  <label>
                    我听到的内容 · 发送前请校对
                    <textarea
                      maxLength={10_000}
                      value={draft}
                      placeholder="例如：把选中的布景向台右移动30厘米。"
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={sending || connection !== 'connected' || !draft.trim()}
                    onClick={() => void send()}
                  >
                    发送口令
                  </button>
                </>
              ) : (
                <div className="remote-voice-receipt" role="status">
                  <h3>{receipt ? labels[receipt] : '正在确认是否送达'}</h3>
                  <blockquote>{pending.transcript}</blockquote>
                  {summary && <p>{summary}</p>}
                  {isFinal(receipt) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPending(null)
                        setDraft('')
                        setReceipt(null)
                        setSummary(null)
                        setVoiceState('idle')
                      }}
                    >
                      说下一条
                    </button>
                  ) : (
                    <button type="button" disabled={sending} onClick={() => void send()}>
                      {sending ? '正在重试…' : '重试发送（不会重复应用）'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      ) : null}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
