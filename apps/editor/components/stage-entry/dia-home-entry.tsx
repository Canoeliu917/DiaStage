'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { prepareSyntheticDemo } from '@/lib/rehearsal-intelligence/synthetic-demo-intention'
import type { VoiceState } from './command-input'

const VoiceRecorder = dynamic(
  () => import('./voice-recorder').then((module) => module.VoiceRecorder),
  {
    ssr: false,
    loading: () => <p role="status">正在打开录音…</p>,
  },
)

export function DiaHomeEntry() {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [voice, setVoice] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [error, setError] = useState('')
  const [opening, startTransition] = useTransition()
  const input = useRef<HTMLTextAreaElement>(null)
  const busy =
    opening || ['recording', 'transcribing', 'requesting-permission'].includes(voiceState)
  const openDemo = () => {
    if (busy) return
    try {
      const href = prepareSyntheticDemo(draft)
      setError('')
      startTransition(() => router.push(href))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文字未能暂存，请保留输入后重试。')
    }
  }
  return (
    <section className="dia-home-conversation" aria-labelledby="dia-home-heading">
      <div className="dia-home-introduction">
        <h1 id="dia-home-heading">
          Dia<span>今天想排什么？</span>
        </h1>
        <p>说说你的想法。一起看人物的位置，试几个方向，再由你决定。</p>
        <p className="dia-home-demo-label">演示数据 · 非真实模型输出</p>
      </div>
      <div className="dia-home-example">
        <p>从一段原创告别开始</p>
        <blockquote>
          两个人在告别。
          <br />A 想走。
          <br />B 不想让他走。
        </blockquote>
      </div>
      <form
        className="dia-home-composer"
        onSubmit={(event) => {
          event.preventDefault()
          openDemo()
        }}
      >
        <label htmlFor="dia-home-intention">你想让这一段发生什么？</label>
        <textarea
          id="dia-home-intention"
          ref={input}
          value={draft}
          maxLength={2000}
          rows={3}
          placeholder="比如：这场太平了，我想让他们之间更紧张一点。"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              openDemo()
            }
          }}
        />
        <div className="dia-home-input-actions">
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setVoice((value) => !value)}
              aria-expanded={voice}
            >
              说一句
            </button>
            <button type="button" disabled={busy} onClick={() => input.current?.focus()}>
              输入文字
            </button>
          </div>
          <button className="dia-home-primary" type="submit" disabled={busy}>
            {opening ? '正在打开…' : draft.trim() ? '和 Dia 一起排' : '打开原创示例'}
          </button>
        </div>
        {voice && (
          <VoiceRecorder
            state={voiceState}
            setState={setVoiceState}
            onTranscript={setDraft}
            onError={setError}
          />
        )}
        {error && <p role="alert">{error}</p>}
        <p className="dia-home-hint">每次打开都是独立演示。先预演，确认后才改变舞台。</p>
      </form>
      <nav className="dia-home-shortcuts" aria-label="继续排演与轻量入口">
        <Link href="/scenes">继续已有排演</Link>
        <Link href="/?entry=script#stage-tools">剧本</Link>
        <Link href="/?entry=manual#stage-tools">舞台</Link>
        <Link href="/remote-voice">扫描上传</Link>
      </nav>
      <div className="dia-home-prompts" role="group" aria-label="排演想法">
        {['帮我看看这一段', '给我两个排法', '这个人物还能怎么做'].map((text) => (
          <button
            key={text}
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(text)
              input.current?.focus()
            }}
          >
            {text}
          </button>
        ))}
        <Link href="/?entry=manual#stage-tools">我自己来</Link>
      </div>
    </section>
  )
}
