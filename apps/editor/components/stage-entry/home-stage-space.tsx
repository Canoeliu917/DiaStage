'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { AccountUser } from '@/components/account-panel'
import { TheatreSearchHome } from '@/components/diamotif-search/theatre-search-home'
import { VOICE_INPUT_ENABLED } from '@/lib/remote-voice/availability'
import type { HomeSpaceAction } from './coordinate-field'
import './stage-entry.css'

const StageCommandInput = dynamic(
  () => import('./command-input').then((module) => module.StageCommandInput),
  { ssr: false, loading: () => <p role="status">正在打开 Dia…</p> },
)
const ScriptStageInput = dynamic(
  () => import('./script-input').then((module) => module.ScriptStageInput),
  { ssr: false, loading: () => <p role="status">正在打开剧本导入…</p> },
)
const ManualStageEntry = dynamic(
  () => import('./manual-entry').then((module) => module.ManualStageEntry),
  { ssr: false, loading: () => <p role="status">正在打开舞台设置…</p> },
)

type Entry = HomeSpaceAction
const entries = {
  dialogue: ['和 Dia 构思', '告诉 Dia，你想搭一个什么样的舞台。先预览方案，再确认搭建。'],
  voice: ['语音搭台', '点击“开始说话”，把构想告诉 Dia；转写后可以校对，再生成舞台方案。'],
  script: ['从剧本开始', '带来一份剧本，让 Dia 帮你梳理舞台空间与布景。'],
  manual: ['建立空舞台', '从真实尺寸开始，为你的想象留出空间。'],
  'archive-info': ['留存你的舞台', '每一次修改，都让同一件作品继续生长。'],
} satisfies Record<Entry, readonly [string, string]>

export function HomeStageSpace({
  initialEntry,
  initialQuery,
  initialCategory,
  initialTopic,
  modelConfigured = false,
  user,
}: {
  initialEntry?: string
  initialQuery?: string
  initialCategory?: string
  initialTopic?: string
  modelConfigured?: boolean
  user: AccountUser | null
}) {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [draft, setDraft] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (
      initialEntry === 'dialogue' ||
      (VOICE_INPUT_ENABLED && initialEntry === 'voice') ||
      initialEntry === 'script' ||
      initialEntry === 'manual'
    )
      if (user) setEntry(initialEntry)
      else
        window.location.replace(
          `/login?next=${encodeURIComponent(`/?entry=${initialEntry}&lit=1`)}`,
        )
  }, [initialEntry, user])

  useEffect(() => {
    if (!entry || dialog.current?.open) return
    if (!opener.current && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement
    dialog.current?.showModal()
  }, [entry])

  const open = (action: Entry) => {
    if (!user && action !== 'archive-info') {
      window.location.assign(`/login?next=${encodeURIComponent(`/?entry=${action}&lit=1`)}`)
      return
    }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEntry(action)
  }

  return (
    <div className="motif-home-space">
      <TheatreSearchHome
        user={user}
        initialQuery={initialQuery}
        initialCategory={initialCategory}
        initialTopic={initialTopic}
        openStage={() => open('manual')}
        openScript={() => open('script')}
      />
      {entry && (
        <dialog
          ref={dialog}
          className="stage-entry-dialog dia-space-dialog"
          aria-labelledby="dia-space-dialog-title"
          aria-describedby="dia-space-dialog-description"
          onClose={() => {
            setEntry(null)
            opener.current?.focus({ preventScroll: true })
            opener.current = null
          }}
        >
          <header>
            <h2 id="dia-space-dialog-title">{entries[entry][0]}</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="关闭入口">
              关闭
            </button>
          </header>
          <p id="dia-space-dialog-description">{entries[entry][1]}</p>
          {entry === 'archive-info' ? (
            <div className="dia-space-about">
              <p>
                在“我的剧目”中，以观众视角收藏自己的舞台。保存后，同一剧目的封面、尺寸与精确修改时间随之更新。
              </p>
              <Link href="/scenes">打开我的剧目 ↗</Link>
            </div>
          ) : entry === 'script' ? (
            <ScriptStageInput />
          ) : entry === 'manual' ? (
            <ManualStageEntry initiallyOpen />
          ) : (
            <StageCommandInput
              initialText={draft}
              onTextChange={setDraft}
              modelConfigured={modelConfigured}
            />
          )}
        </dialog>
      )}
    </div>
  )
}
