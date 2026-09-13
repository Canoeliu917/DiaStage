'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { type JoinedRemoteVoiceSession, readRemoteVoiceResponse } from '@/lib/remote-voice/client'
import {
  type RemoteDiaCommandInput,
  RemoteDiaCommandInputSchema,
  RemoteDiaResponseSchema,
  type RemoteDiaSnapshot,
  type RemoteDiaStatus,
  SentDiaResponseSchema,
} from '@/lib/remote-voice/dia-protocol'
import type { VoiceState } from './command-input'
import './mobile-dia.css'

const VoiceRecorder = dynamic(
  () => import('./voice-recorder').then((module) => module.VoiceRecorder),
  { ssr: false, loading: () => <p role="status">正在打开录音…</p> },
)
const storedSchema = z.strictObject({
  draft: z.string().max(2000),
  pending: RemoteDiaCommandInputSchema.nullable(),
})
const busyStates = ['understanding', 'proposing', 'compiling', 'applying']
const stateLabels: Record<RemoteDiaSnapshot['state'], string> = {
  idle: '可以开始聊这一段',
  understanding: '正在理解这一段…',
  proposing: '正在整理可以尝试的方向…',
  'proposal-ready': '有几个方向可以试试',
  compiling: '正在准备舞台预演…',
  'ghost-ready': '已发送到舞台，等待你的决定。',
  'waiting-human': '已发送到舞台，等待你的决定。',
  applying: '电脑正在应用你的决定…',
  applied: '你的决定已应用到舞台',
  rejected: '这个方向已放下，可以换一种',
  stale: '舞台已经变化，请重新生成。',
  failed: '这次没有完成，可以换一种说法再试。',
}
const decisionLabels: Record<RemoteDiaSnapshot['decision'], string> = {
  none: '尚未决定',
  adopt: '已采纳',
  partial: '部分采纳',
  edit: '修改后采纳',
  reject: '已拒绝',
  'manual-edit': '已手动调整',
}
type Action =
  | { type: 'message'; content: string }
  | { type: 'cancel' }
  | { type: 'select' | 'preview' | 'reject'; interactionId: string; proposalId: string }

export function MobileDia({
  session,
  onExpired,
}: {
  session: JoinedRemoteVoiceSession
  onExpired?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<RemoteDiaStatus | null>(null)
  const [pending, setPending] = useState<RemoteDiaCommandInput | null>(null)
  const [connected, setConnected] = useState(false)
  const [expired, setExpired] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showVoice, setShowVoice] = useState(false)
  const [secureContext, setSecureContext] = useState(true)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [restored, setRestored] = useState(false)
  const currentStatus = useRef<RemoteDiaStatus | null>(null)
  const currentPending = useRef<RemoteDiaCommandInput | null>(null)
  const currentDraft = useRef('')
  const request = useRef<AbortController | null>(null)
  const locked = useRef(false)
  const active = useRef(true)
  const expiryCallback = useRef(onExpired)
  expiryCallback.current = onExpired
  const key = `diastage:remote-dia:${session.id}`
  const headers = useMemo(
    () => ({ 'x-diastage-remote-token': session.remoteToken }),
    [session.remoteToken],
  )
  const endpoint = `/api/remote-voice/sessions/${session.id}/dia`
  currentDraft.current = draft

  useEffect(() => {
    active.current = true
    setSecureContext(globalThis.isSecureContext)
    try {
      const saved = storedSchema.safeParse(JSON.parse(sessionStorage.getItem(key) || 'null'))
      if (saved.success) {
        setDraft(saved.data.draft)
        setPending(saved.data.pending)
        currentPending.current = saved.data.pending
      }
    } catch {
      setError('此浏览器无法恢复本次输入；电脑上的舞台记录仍保留。')
    }
    setRestored(true)
    return () => {
      active.current = false
      request.current?.abort()
    }
  }, [key])

  useEffect(() => {
    if (!restored) return
    try {
      sessionStorage.setItem(key, JSON.stringify({ draft, pending }))
    } catch {
      setError('此浏览器无法保留草稿；刷新可能丢失未发送内容。')
    }
  }, [key, draft, pending, restored])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const poll = async () => {
      const polling = new AbortController()
      controller = polling
      try {
        const response = await fetch(endpoint, {
          cache: 'no-store',
          headers,
          signal: AbortSignal.any([polling.signal, AbortSignal.timeout(10_000)]),
        })
        if (stopped || polling.signal.aborted) return
        if ([401, 403, 404, 410].includes(response.status)) {
          setExpired(true)
          setConnected(false)
          stopped = true
          expiryCallback.current?.()
          return
        }
        const result = await readRemoteVoiceResponse(
          response,
          RemoteDiaResponseSchema,
          '无法读取 Dia 状态。',
        )
        if (stopped || polling.signal.aborted) return
        if (result.status.sceneId !== session.sceneId)
          throw new Error('配对舞台已变化，请重新连接。')
        currentStatus.current = result.status
        setStatus(result.status)
        setConnected(true)
        const waiting = currentPending.current
        if (waiting && result.status.lastAcknowledgedSequence >= waiting.sequence) {
          if (
            waiting.type === 'message' &&
            currentDraft.current.trim() === waiting.content &&
            result.status.lastAcknowledgedSequence === waiting.sequence &&
            result.status.lastAcknowledgedDisposition === 'received'
          )
            setDraft('')
          currentPending.current = null
          setPending(null)
          if (result.status.lastAcknowledgedDisposition !== 'received')
            setError(result.status.summary || '电脑未执行这条请求，请查看当前状态后重试。')
        }
      } catch {
        if (!stopped && !polling.signal.aborted) setConnected(false)
      } finally {
        if (!stopped && controller === polling)
          timer = setTimeout(poll, document.hidden ? 10_000 : 2000)
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
  }, [endpoint, headers, session.sceneId])

  const transmit = async (action: Action, retry = false) => {
    if (locked.current || expired || !connected) return
    const latest = currentStatus.current
    if (!latest?.snapshot || !latest.ownerOnline) return
    locked.current = true
    setSending(true)
    setError('')
    const controller = new AbortController()
    request.current = controller
    let command: RemoteDiaCommandInput | null = null
    try {
      let sequence = latest.nextSequence
      let sceneVersion = latest.snapshot.sceneVersion
      // A lost POST response makes the next sequence uncertain. Refresh before cancelling.
      if (action.type === 'cancel' && !retry) {
        const response = await fetch(endpoint, {
          cache: 'no-store',
          headers,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        })
        const fresh = await readRemoteVoiceResponse(
          response,
          RemoteDiaResponseSchema,
          '停止未送达，请恢复连接后重试。',
        )
        if (
          !fresh.status.snapshot ||
          !fresh.status.ownerOnline ||
          fresh.status.sceneId !== session.sceneId
        )
          throw new Error('电脑暂未连接，无法确认停止；请在电脑上停止。')
        sequence = fresh.status.nextSequence
        sceneVersion = fresh.status.snapshot.sceneVersion
      }
      command = retry
        ? currentPending.current
        : RemoteDiaCommandInputSchema.parse({
            ...action,
            requestId: crypto.randomUUID(),
            sequence,
            sceneVersion,
          })
      if (!command) return
      // Preserve the exact request before transport so a retry cannot duplicate an interaction.
      sessionStorage.setItem(key, JSON.stringify({ draft: currentDraft.current, pending: command }))
      currentPending.current = command
      setPending(command)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(command),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      })
      if (!active.current || controller.signal.aborted) return
      if ([401, 403, 404, 410].includes(response.status)) {
        setExpired(true)
        expiryCallback.current?.()
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        currentPending.current = null
        setPending(null)
      }
      await readRemoteVoiceResponse(
        response,
        SentDiaResponseSchema,
        '发送未确认，可以重试同一请求。',
      )
    } catch (cause) {
      if (active.current && !controller.signal.aborted)
        setError(
          cause instanceof Error && cause.name === 'TimeoutError'
            ? '连接超时，发送尚未确认。请恢复网络后重试同一请求。'
            : cause instanceof TypeError
              ? '连接中断，发送尚未确认。请检查网络后重试同一请求。'
              : cause instanceof Error
                ? cause.message
                : '发送未确认，请检查连接后重试。',
        )
    } finally {
      locked.current = false
      if (active.current) setSending(false)
    }
  }

  const snapshot = status?.snapshot ?? null
  const online = connected && !!status?.ownerOnline && !expired
  const busy = !!snapshot && busyStates.includes(snapshot.state)
  const disabled = !online || sending || !!pending || busy
  const voiceBusy =
    showVoice && ['requesting-permission', 'recording', 'transcribing'].includes(voiceState)
  const selected = snapshot?.proposals.find((p) => p.proposalId === snapshot.selectedProposalId)
  const proposalAction = (type: 'select' | 'preview' | 'reject', proposalId: string) => {
    if (snapshot?.interactionId)
      void transmit({ type, interactionId: snapshot.interactionId, proposalId })
  }

  return (
    <section className="mobile-dia" aria-label="Dia 对话">
      <p className="mobile-dia__connection" role="status">
        {expired
          ? '连接已过期，请断开后重新配对。'
          : !connected
            ? '正在连接电脑 Dia；当前预演状态尚未确认。'
            : !status?.ownerOnline
              ? '电脑 Dia 暂未连接，请在电脑上打开 Dia；尚未确认预演。'
              : '和电脑上的同一个舞台一起搭台。'}
      </p>
      {snapshot?.synthetic && <p className="mobile-dia__synthetic">演示数据 · 非真实模型输出</p>}
      {snapshot && (
        <>
          <div className="mobile-dia__state" role="status" aria-live="polite">
            <p>
              {online
                ? ['ghost-ready', 'waiting-human'].includes(snapshot.state) && !snapshot.ghost
                  ? '方案已准备好，可以请求舞台预演。'
                  : stateLabels[snapshot.state]
                : '以下为上次同步内容，恢复连接后确认最新状态。'}
            </p>
            {snapshot.decision !== 'none' && <p>你的决定：{decisionLabels[snapshot.decision]}</p>}
          </div>
        </>
      )}
      {selected && snapshot && (
        <div className="mobile-dia__current">
          <p>当前方案 · {selected.title}</p>
          <button
            type="button"
            className="mobile-dia__primary"
            disabled={
              disabled ||
              !['proposal-ready', 'ghost-ready', 'waiting-human'].includes(snapshot.state)
            }
            onClick={() => proposalAction('preview', selected.proposalId)}
          >
            预演到舞台
          </button>
          {snapshot.ghost && (
            <button
              type="button"
              disabled={!online || sending || !!pending}
              onClick={() => void transmit({ type: 'cancel' })}
            >
              停止预演
            </button>
          )}
        </div>
      )}
      {pending && (
        <div className="mobile-dia__pending" role="status">
          <p>
            {pending.type === 'preview'
              ? '正在请求舞台预演，等待电脑确认。'
              : pending.type === 'cancel'
                ? '正在请求停止，等待电脑确认。'
                : '已保留这条请求，等待电脑接收。'}
          </p>
          {pending.type === 'message' && <blockquote>{pending.content}</blockquote>}
          <button
            type="button"
            disabled={!online || sending}
            onClick={() => void transmit({ type: 'cancel' }, true)}
          >
            重试同一请求
          </button>
        </div>
      )}
      <div className="mobile-dia__composer">
        <label htmlFor="mobile-dia-input">你想试什么？</label>
        <textarea
          id="mobile-dia-input"
          maxLength={2000}
          value={draft}
          placeholder="比如：给我一张圆桌，两把硬椅。"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!disabled && !voiceBusy && draft.trim())
                void transmit({ type: 'message', content: draft.trim() })
            }
          }}
        />
        <div className="mobile-dia__actions">
          <button
            type="button"
            disabled={disabled && !showVoice}
            onClick={() => {
              setShowVoice(!showVoice)
              setVoiceState('idle')
            }}
          >
            {showVoice ? '收起录音' : '说一句'}
          </button>
          <button
            type="button"
            className="mobile-dia__primary"
            disabled={disabled || voiceBusy || !draft.trim()}
            onClick={() => void transmit({ type: 'message', content: draft.trim() })}
          >
            {sending ? '正在发送…' : '发送给 Dia'}
          </button>
          {(busy || pending) && (
            <button
              type="button"
              disabled={!online || sending}
              onClick={() => void transmit({ type: 'cancel' })}
            >
              停止
            </button>
          )}
        </div>
        {showVoice && (
          <div className="mobile-dia__voice">
            {!secureContext && <p>当前不是 HTTPS，麦克风不可用；可以输入文字。</p>}
            <VoiceRecorder
              state={voiceState}
              setState={setVoiceState}
              onError={setError}
              onTranscript={(text) => {
                setDraft(text.slice(0, 2000))
                if (text.length > 2000)
                  setError('转写超过 2000 字，已保留前段；请精简并校对后发送。')
              }}
              transcribeEndpoint={`/api/remote-voice/sessions/${session.id}/transcribe`}
              requestHeaders={headers}
            />
            <p>转写会填入上方输入框，请校对后再发送。</p>
          </div>
        )}
        <section className="mobile-dia__suggestions" aria-label="试着问 Dia">
          {['一张圆桌，两把硬椅', '查看已保存版本', '从正面看一下'].map((text) => (
            <button type="button" key={text} onClick={() => setDraft(text)}>
              {text}
            </button>
          ))}
        </section>
      </div>
      {error && <p role="alert">{error}</p>}
      {snapshot && (
        <>
          <details className="mobile-dia__stage-details" open={!!snapshot.ghost && online}>
            <summary>查看舞台与预演</summary>
            <MiniDiaStage snapshot={snapshot} showGhost={online} />
          </details>
          <details className="mobile-dia__history">
            <summary>最近舞台对话（{snapshot.thread?.messages.length ?? 0}）</summary>
            <ol className="mobile-dia__messages" aria-label="最近舞台对话">
              {snapshot.thread?.messages.map((message) => (
                <li key={message.messageId} data-role={message.role}>
                  <span>
                    {message.role === 'user' ? '你' : message.role === 'dia' ? 'Dia' : '舞台'}
                  </span>
                  <p>{message.content}</p>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      <section className="mobile-dia__proposals" aria-label="当前方案">
        {snapshot?.proposals.map((proposal, index) => (
          <article
            key={proposal.proposalId}
            data-selected={proposal.proposalId === snapshot.selectedProposalId}
          >
            <p className="mobile-dia__eyebrow">
              方案 {String(index + 1).padStart(2, '0')}
              {proposal.proposalId === snapshot.selectedProposalId ? ' · 当前选择' : ''}
            </p>
            <h3>{proposal.title}</h3>
            <p>{proposal.intention}</p>
            <ul>
              {proposal.changes.map((change, changeIndex) => (
                <li key={`${proposal.proposalId}-${changeIndex}`}>{change}</li>
              ))}
            </ul>
            <details>
              <summary>为什么？</summary>
              <p>{proposal.rationale}</p>
              {proposal.alternatives.map((alternative, alternativeIndex) => (
                <p key={`${proposal.proposalId}-${alternativeIndex}`}>{alternative}</p>
              ))}
            </details>
            <div className="mobile-dia__actions">
              <button
                type="button"
                disabled={
                  disabled ||
                  !['proposal-ready', 'ghost-ready', 'waiting-human'].includes(snapshot.state)
                }
                onClick={() => proposalAction('preview', proposal.proposalId)}
              >
                预演到舞台
              </button>
              <button
                type="button"
                disabled={
                  disabled ||
                  !['proposal-ready', 'ghost-ready', 'waiting-human'].includes(snapshot.state)
                }
                onClick={() => proposalAction('select', proposal.proposalId)}
              >
                选这个
              </button>
              <button
                type="button"
                disabled={
                  disabled ||
                  !['proposal-ready', 'ghost-ready', 'waiting-human'].includes(snapshot.state)
                }
                onClick={() => proposalAction('reject', proposal.proposalId)}
              >
                不成立
              </button>
            </div>
          </article>
        ))}
      </section>
      {!!snapshot?.proposals.length && (
        <button type="button" disabled={disabled} onClick={() => setDraft('换几个方向')}>
          换几个方向
        </button>
      )}
      <p className="mobile-dia__hint">可以在电脑上决定如何落位，也可以保持现在的处理。</p>
    </section>
  )
}

export function MiniDiaStage({
  snapshot,
  showGhost = true,
}: {
  snapshot: RemoteDiaSnapshot
  showGhost?: boolean
}) {
  const { stage } = snapshot
  const ghost = showGhost ? snapshot.ghost : null
  const target = ghost?.venue ?? stage
  const minX = Math.min(stage.origin[0] - stage.width / 2, target.origin[0] - target.width / 2)
  const minZ = Math.min(stage.origin[2] - stage.depth / 2, target.origin[2] - target.depth / 2)
  const width =
    Math.max(stage.origin[0] + stage.width / 2, target.origin[0] + target.width / 2) - minX
  const depth =
    Math.max(stage.origin[2] + stage.depth / 2, target.origin[2] + target.depth / 2) - minZ
  const project = (point: [number, number, number]): [number, number] => [
    15 + ((point[0] - minX) / width) * 270,
    15 + ((point[2] - minZ) / depth) * 150,
  ]
  const frame = (venue: typeof target) => {
    const [x, y] = project([
      venue.origin[0] - venue.width / 2,
      0,
      venue.origin[2] - venue.depth / 2,
    ])
    return { x, y, width: (venue.width / width) * 270, height: (venue.depth / depth) * 150 }
  }
  const scenery = (objects: NonNullable<RemoteDiaSnapshot['stage']['scenery']>, preview: boolean) =>
    objects.map((object) => {
      const [x, y] = project([object.min[0], 0, object.min[1]])
      return (
        <rect
          key={object.id}
          x={x}
          y={y}
          width={((object.max[0] - object.min[0]) / width) * 270}
          height={((object.max[1] - object.min[1]) / depth) * 150}
          className={preview ? 'mobile-dia__ghost-scenery' : 'mobile-dia__scenery'}
          fill={preview ? 'none' : '#999994'}
          fillOpacity={0.35}
          stroke={preview ? '#eeeeec' : '#b1b1ab'}
          strokeWidth={1}
          strokeDasharray={preview ? '4 3' : undefined}
        >
          <title>{`${preview ? '建议：' : ''}${object.name}`}</title>
        </rect>
      )
    })
  return (
    <figure className="mobile-dia__mini">
      <svg
        viewBox="0 0 300 195"
        role="img"
        aria-label="当前舞台俯视缩略图，虚线表示电脑已确认的预演"
      >
        <title>当前舞台与已确认的预演</title>
        <rect {...frame(stage)} className="mobile-dia__stage" />
        <svg x="15" y="15" width="270" height="150" viewBox="15 15 270 150">
          {scenery(stage.scenery ?? [], false)}
          {ghost?.venue && (
            <rect
              {...frame(ghost.venue)}
              fill="none"
              stroke="#eeeeec"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            >
              <title>建议场地边界</title>
            </rect>
          )}
          {scenery(ghost?.scenery ?? [], true)}
          {stage.paths.map((path, index) => (
            <polyline
              key={`${path.performerId}-${index}`}
              points={path.points.map((point) => project(point).join(',')).join(' ')}
              className="mobile-dia__path"
            />
          ))}
          {ghost?.paths.map((path, index) => (
            <polyline
              key={`${path.performerId}-${index}`}
              points={path.points.map((point) => project(point).join(',')).join(' ')}
              className="mobile-dia__ghost-path"
            />
          ))}
          {stage.performers.map((performer) => {
            const [x, y] = project(performer.position)
            return (
              <g key={performer.id}>
                <circle cx={x} cy={y} r="5" className="mobile-dia__actor" />
                <text x={x} y={y - 10} textAnchor="middle">
                  <title>{performer.name}</title>
                  {performer.name.length > 8 ? `${performer.name.slice(0, 8)}…` : performer.name}
                </text>
              </g>
            )
          })}
          {ghost?.performers.map((performer) => {
            const [x, y] = project(performer.position)
            return (
              <circle key={performer.id} cx={x} cy={y} r="8" className="mobile-dia__ghost-actor" />
            )
          })}
        </svg>
        <text x="150" y="185" textAnchor="middle">
          观众
        </text>
      </svg>
      <figcaption>舞台俯视 · 框线为布景边界{ghost ? ' · 虚线为已确认预演' : ''}</figcaption>
    </figure>
  )
}
