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

type HandledCommand = {
  sequence: number
  disposition: RemoteVoiceDisposition
}

export function PhoneVoiceLink({
  sceneLabel,
  storageKey,
  canLoad,
  onTranscript,
  onDisconnect,
}: {
  sceneLabel: string
  storageKey: string
  canLoad: boolean
  onTranscript: (transcript: string) => void
  onDisconnect?: () => void
}) {
  const [session, setSession] = useState<CreatedRemoteVoiceSession | null>(null)
  const [paired, setPaired] = useState(false)
  const [incoming, setIncoming] = useState<RemoteVoiceCommand | null>(null)
  const [handled, setHandled] = useState<HandledCommand | null>(null)
  const [state, setState] = useState<'idle' | 'creating' | 'acknowledging'>('idle')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [remoteAddress, setRemoteAddress] = useState('')
  const [localOnly, setLocalOnly] = useState(false)
  const [insecureAddress, setInsecureAddress] = useState(false)
  const details = useRef<HTMLDetailsElement>(null)
  const disconnectCallback = useRef(onDisconnect)
  disconnectCallback.current = onDisconnect
  const ownerStorageKey = `diastage:remote-voice-owner:${storageKey}`

  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_DIASTAGE_REMOTE_URL?.trim()
    let url: URL
    try {
      url = new URL('/remote-voice', configured || window.location.origin)
    } catch {
      url = new URL('/remote-voice', window.location.origin)
    }
    setRemoteAddress(url.href)
    setLocalOnly(['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname))
    setInsecureAddress(url.protocol !== 'https:')
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem(ownerStorageKey)
    if (!saved) return
    try {
      const parsed = CreatedRemoteVoiceSessionSchema.safeParse(JSON.parse(saved))
      if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) {
        sessionStorage.removeItem(ownerStorageKey)
        return
      }
      setSession(parsed.data)
    } catch {
      sessionStorage.removeItem(ownerStorageKey)
    }
  }, [ownerStorageKey])

  useEffect(() => {
    if (session && details.current) details.current.open = true
  }, [session])

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
          headers: { 'x-diastage-owner-token': session.ownerToken },
        })
        const result = await readRemoteVoiceResponse(
          response,
          OwnerRemoteVoiceResponseSchema,
          '无法读取手机连接状态，请重新连接。',
        )
        if (stopped) return
        setPaired(result.status.paired)
        setIncoming(result.status.pendingCommand)
        if (!result.status.pendingCommand) setHandled(null)
      } catch (failure) {
        if (stopped || controller.signal.aborted) return
        disconnectCallback.current?.()
        setError(failure instanceof Error ? failure.message : '手机连接已中断，请重新连接。')
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
  }, [session])

  const createSession = async () => {
    if (state !== 'idle') return
    setState('creating')
    setError('')
    setCopied(false)
    try {
      const response = await fetch('/api/remote-voice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: sceneLabel }),
      })
      const result = await readRemoteVoiceResponse(
        response,
        CreatedRemoteVoiceResponseSchema,
        '无法建立手机连接，请检查网络后重试。',
      )
      setSession(result.session)
      sessionStorage.setItem(ownerStorageKey, JSON.stringify(result.session))
      setPaired(false)
      setIncoming(null)
      setHandled(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法建立手机连接。')
    } finally {
      setState('idle')
    }
  }

  const acknowledge = async (command: RemoteVoiceCommand, disposition: RemoteVoiceDisposition) => {
    if (!session || state !== 'idle') return
    if (disposition === 'loaded' && handled?.sequence !== command.sequence) {
      onTranscript(command.transcript)
    }
    setHandled({ sequence: command.sequence, disposition })
    setState('acknowledging')
    setError('')
    try {
      const response = await fetch(`/api/remote-voice/sessions/${session.id}/commands`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-diastage-owner-token': session.ownerToken,
        },
        body: JSON.stringify({ sequence: command.sequence, disposition }),
      })
      await readRemoteVoiceResponse(
        response,
        zAcknowledgement,
        '口令已处理，但回执失败。请点击重试回执。',
      )
      setIncoming(null)
      setHandled(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '回执失败，请重试。')
    } finally {
      setState('idle')
    }
  }

  const disconnect = async () => {
    disconnectCallback.current?.()
    const current = session
    setSession(null)
    setPaired(false)
    setIncoming(null)
    setHandled(null)
    setError('')
    sessionStorage.removeItem(ownerStorageKey)
    if (!current) return
    await fetch(`/api/remote-voice/sessions/${current.id}`, {
      method: 'DELETE',
      keepalive: true,
      headers: { 'x-diastage-owner-token': current.ownerToken },
    }).catch(() => {})
  }

  return (
    <details ref={details} className="phone-voice-link">
      <summary>用 iPhone 说口令</summary>
      {!session ? (
        <div className="phone-voice-link__body">
          <p>手机只负责录音和校对文字；舞台端仍会预演方案，确认后才修改场景。</p>
          <button type="button" disabled={state !== 'idle'} onClick={() => void createSession()}>
            {state === 'creating' ? '正在生成配对码…' : '连接 iPhone'}
          </button>
        </div>
      ) : (
        <div className="phone-voice-link__body">
          <p role="status" aria-live="polite">
            {paired ? 'iPhone 已连接' : '等待 iPhone 输入配对码'}
          </p>
          <p className="phone-voice-link__code">
            <span className="sr-only">配对码：</span>
            {session.pairingCode}
          </p>
          <label>
            手机打开此地址
            <input
              readOnly
              value={remoteAddress}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="stage-entry-actions">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(remoteAddress)
                  setCopied(true)
                } catch {
                  setError('无法自动复制，请长按上方地址复制。')
                }
              }}
            >
              {copied ? '地址已复制' : '复制手机地址'}
            </button>
            <button type="button" onClick={() => void disconnect()}>
              断开连接
            </button>
          </div>
          {localOnly ? (
            <p className="stage-entry-warning" role="note">
              当前是仅本机地址，iPhone 无法打开。请用手机可访问的 HTTPS 地址部署或启动咫台；HTTP
              局域网地址也无法获得 iPhone 麦克风权限。
            </p>
          ) : insecureAddress ? (
            <p className="stage-entry-warning" role="note">
              此地址可以用于手机文字口令，但 iPhone 只会在 HTTPS 页面开放麦克风。请为手机地址配置
              HTTPS 后再测试录音。
            </p>
          ) : null}
          {incoming && (
            <section className="phone-voice-link__incoming" aria-label="手机传来的口令">
              <h3>手机传来一条口令</h3>
              <blockquote>{incoming.transcript}</blockquote>
              {!canLoad && <p>请先结束当前方案处理，再载入这条口令。</p>}
              <div className="stage-entry-actions">
                <button
                  type="button"
                  disabled={(!canLoad && !localControl(incoming.transcript)) || state !== 'idle'}
                  onClick={() => void acknowledge(incoming, handled?.disposition ?? 'loaded')}
                >
                  {handled?.sequence === incoming.sequence ? '重试回执' : '载入口令'}
                </button>
                <button
                  type="button"
                  disabled={state !== 'idle' || handled?.sequence === incoming.sequence}
                  onClick={() => void acknowledge(incoming, 'dismissed')}
                >
                  忽略
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  )
}

const zAcknowledgement = z.strictObject({
  acknowledged: z.number().int().positive(),
  disposition: z.enum(['loaded', 'dismissed']),
})
