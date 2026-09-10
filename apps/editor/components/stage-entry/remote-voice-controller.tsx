'use client'

import { useEffect, useMemo, useState } from 'react'
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
import './stage-entry.css'
import { VoiceRecorder } from './voice-recorder'

const STORAGE_KEY = 'diastage:remote-voice-controller'
const StoredControllerSchema = z.strictObject({
  session: JoinedRemoteVoiceSessionSchema,
  draft: z.string().max(10_000),
  sentSequence: z.number().int().positive().nullable(),
})

export function RemoteVoiceController() {
  const [pairingCode, setPairingCode] = useState('')
  const [session, setSession] = useState<JoinedRemoteVoiceSession | null>(null)
  const [draft, setDraft] = useState('')
  const [sentSequence, setSentSequence] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<RemoteVoiceDisposition | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [joining, setJoining] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [secureContext, setSecureContext] = useState(true)

  const transcribeHeaders = useMemo(
    () => (session ? { 'x-diastage-remote-token': session.remoteToken } : undefined),
    [session],
  )

  useEffect(() => {
    setSecureContext(globalThis.isSecureContext)
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return
    try {
      const parsed = StoredControllerSchema.safeParse(JSON.parse(stored))
      if (!parsed.success || Date.parse(parsed.data.session.expiresAt) <= Date.now()) {
        sessionStorage.removeItem(STORAGE_KEY)
        return
      }
      setSession(parsed.data.session)
      setDraft(parsed.data.draft)
      setSentSequence(parsed.data.sentSequence)
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ session, draft, sentSequence }))
  }, [session, draft, sentSequence])

  useEffect(() => {
    if (!session) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const poll = async () => {
      controller = new AbortController()
      try {
        const response = await fetch(`/api/remote-voice/sessions/${session.id}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'x-diastage-remote-token': session.remoteToken },
        })
        const result = await readRemoteVoiceResponse(
          response,
          RemoteRemoteVoiceResponseSchema,
          '无法读取舞台端状态，请重新配对。',
        )
        if (stopped) return
        if (
          sentSequence !== null &&
          result.status.lastAcknowledgedSequence >= sentSequence &&
          result.status.lastAcknowledgedDisposition
        ) {
          setReceipt(result.status.lastAcknowledgedDisposition)
        }
      } catch (failure) {
        if (stopped || controller.signal.aborted) return
        setError(failure instanceof Error ? failure.message : '手机连接已失效，请重新配对。')
      } finally {
        if (!stopped) timer = setTimeout(poll, 1500)
      }
    }
    void poll()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      controller?.abort()
    }
  }, [session, sentSequence])

  const join = async () => {
    if (joining || !pairingCode.trim()) return
    setJoining(true)
    setError('')
    try {
      const response = await fetch('/api/remote-voice/sessions/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: pairingCode }),
      })
      const result = await readRemoteVoiceResponse(
        response,
        JoinedRemoteVoiceResponseSchema,
        '无法连接舞台端，请检查配对码。',
      )
      setSession(result.session)
      setPairingCode('')
      setDraft('')
      setSentSequence(null)
      setReceipt(null)
      setVoiceState('idle')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法连接舞台端。')
    } finally {
      setJoining(false)
    }
  }

  const send = async () => {
    if (!session || sending || sentSequence !== null || !draft.trim()) return
    setSending(true)
    setError('')
    try {
      const response = await fetch(`/api/remote-voice/sessions/${session.id}/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-diastage-remote-token': session.remoteToken,
        },
        body: JSON.stringify({ transcript: draft }),
      })
      const result = await readRemoteVoiceResponse(
        response,
        SentRemoteVoiceResponseSchema,
        '口令未能发送，请检查连接后重试。',
      )
      setSentSequence(result.command.sequence)
      setReceipt(null)
      setVoiceState('planning')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '口令未能发送。')
    } finally {
      setSending(false)
    }
  }

  const disconnect = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setDraft('')
    setSentSequence(null)
    setReceipt(null)
    setVoiceState('idle')
    setError('')
  }

  if (!session) {
    return (
      <section className="remote-voice-card" aria-busy={joining}>
        <h1>iPhone 舞台口令</h1>
        <p>在电脑或 iPad 的“语音开台 / 舞台口令”中选择“连接 iPhone”，再输入配对码。</p>
        <label>
          8 位配对码
          <input
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={9}
            placeholder="ABCD-EFGH"
            value={pairingCode}
            onChange={(event) =>
              setPairingCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^0-9A-Z-]/g, '')
                  .slice(0, 9),
              )
            }
          />
        </label>
        <button
          type="button"
          disabled={joining || pairingCode.replace(/-/g, '').length !== 8}
          onClick={() => void join()}
        >
          {joining ? '正在连接…' : '连接舞台端'}
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }

  return (
    <section className="remote-voice-card" aria-busy={sending}>
      <header>
        <div>
          <h1>iPhone 舞台口令</h1>
          <p>{session.label || '咫台舞台'} · 已安全配对</p>
        </div>
        <button type="button" onClick={disconnect}>
          断开
        </button>
      </header>
      {!secureContext && (
        <p className="stage-entry-warning" role="note">
          当前不是 HTTPS，iPhone 浏览器不会开放麦克风；你仍可输入文字发送。
        </p>
      )}
      {sentSequence === null ? (
        <>
          <VoiceRecorder
            state={voiceState}
            setState={setVoiceState}
            onError={setError}
            onTranscript={(transcript) => {
              setDraft(transcript)
              setError('')
            }}
            transcribeEndpoint={`/api/remote-voice/sessions/${session.id}/transcribe`}
            requestHeaders={transcribeHeaders}
          />
          <label>
            我听到的内容 · 发送前请校对
            <textarea
              maxLength={10_000}
              value={draft}
              placeholder="例如：建立一个宽8米、深6米的镜框式舞台，中区放一个双人沙发。"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()}>
            {sending ? '正在发送…' : '发送到舞台端'}
          </button>
        </>
      ) : receipt ? (
        <div className="remote-voice-receipt" role="status">
          <h2>{receipt === 'loaded' ? '舞台端已载入口令' : '舞台端已忽略这条口令'}</h2>
          <blockquote>{draft}</blockquote>
          <button
            type="button"
            onClick={() => {
              setDraft('')
              setSentSequence(null)
              setReceipt(null)
              setVoiceState('idle')
            }}
          >
            说下一条
          </button>
        </div>
      ) : (
        <div className="remote-voice-receipt" role="status">
          <h2>已发送，等待舞台端载入</h2>
          <blockquote>{draft}</blockquote>
          <p>电脑端确认载入后，仍会先显示舞台方案，不会直接移动任何布景。</p>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
