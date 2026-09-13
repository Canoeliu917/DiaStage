'use client'

import { Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useStore } from 'zustand'
import type { DiaConversation } from '@/lib/rehearsal-intelligence/conversation-controller'
import { DiaBuildProposalSchema } from '@/lib/rehearsal-intelligence/dia-backbone'
import { readFeedbackLog } from '@/lib/rehearsal-intelligence/feedback'
import { recentProposalRounds } from '@/lib/rehearsal-intelligence/recent-rounds'
import {
  type Interaction,
  InteractionSchema,
  type ThreadMessage,
  ThreadMessageSchema,
} from '@/lib/rehearsal-intelligence/schema'
import { DiaMessageRecord } from './dia-message-record'

const FavoriteSchema = z.object({
  message: ThreadMessageSchema,
  prompt: z.string(),
  build: DiaBuildProposalSchema.nullable(),
  interaction: InteractionSchema.nullable(),
})
type Favorite = z.infer<typeof FavoriteSchema>

export function DiaRecords({
  sceneId,
  controller,
}: {
  sceneId: string
  controller: DiaConversation
}) {
  const state = useStore(controller.store)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [notice, setNotice] = useState('')
  const history = useRef<Interaction[]>([])
  const key = `diastage:favorite-proposals:${sceneId}`
  useEffect(() => {
    let disposed = false
    void readFeedbackLog(sceneId)
      .then((log) => {
        if (!disposed) history.current = log.interactions
      })
      .catch(() => {})
    try {
      setFavorites(z.array(FavoriteSchema).parse(JSON.parse(localStorage.getItem(key) ?? '[]')))
    } catch {
      setNotice('收藏未能读取，原记录仍保留在本机。')
    }
    return () => {
      disposed = true
    }
  }, [key, sceneId])
  const save = (next: Favorite[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setFavorites(next)
      setNotice('')
    } catch {
      setNotice('收藏未保存，请检查浏览器存储空间。')
    }
  }
  const rounds = recentProposalRounds(state.thread?.messages ?? [])
  const toggle = (message: ThreadMessage) => {
    if (favorites.some((entry) => entry.message.messageId === message.messageId)) {
      save(favorites.filter((entry) => entry.message.messageId !== message.messageId))
      return
    }
    const round = rounds.find((entries) =>
      entries.some((entry) => entry.messageId === message.messageId),
    )
    const linked = round?.find((entry) => entry.role === 'dia' && entry.interactionId) ?? message
    const input = round?.find((entry) => entry.role === 'user')
    const build =
      state.builds.find((entry) => linked.proposalIds?.includes(entry.id)) ??
      [...state.builds]
        .reverse()
        .find(
          (entry) =>
            entry.input === input?.content &&
            entry.createdAt >= input.createdAt &&
            entry.createdAt <= (round?.at(-1)?.createdAt ?? message.createdAt),
        ) ??
      null
    const interaction =
      state.interaction?.interactionId === linked.interactionId
        ? state.interaction
        : (history.current.find((entry) => entry.interactionId === linked.interactionId) ?? null)
    save([
      ...favorites,
      {
        message,
        prompt: round?.find((entry) => entry.role === 'user')?.content ?? message.content,
        build,
        interaction,
      },
    ])
  }
  return (
    <>
      {!!rounds.length && (
        <details className="dia-conversation-records dia-secondary" aria-label="对话">
          <summary>舞台记录 · 最近 {rounds.length} 轮</summary>
          <div className="dia-message-log" role="region" aria-label="最近20轮舞台提案记录">
            {rounds.flat().map((message) => (
              <DiaMessageRecord
                key={message.messageId}
                message={message}
                controller={controller}
                favorite={favorites.some((entry) => entry.message.messageId === message.messageId)}
                onFavorite={() => toggle(message)}
              />
            ))}
          </div>
        </details>
      )}
      <details className="dia-secondary dia-other-proposals">
        <summary>其他提案</summary>
        <details className="dia-favorites">
          <summary>收藏提案 · {favorites.length}</summary>
          {!favorites.length && <p>点击舞台记录右侧的星星，保留这条提案。</p>}
          {favorites.map((entry) => (
            <article className="dia-favorite" key={entry.message.messageId}>
              <header>
                <strong>{entry.message.content.slice(0, 70)}</strong>
                <button type="button" aria-label="取消收藏" onClick={() => toggle(entry.message)}>
                  <Star size={16} fill="currentColor" />
                </button>
              </header>
              <details>
                <summary>查看已收藏内容</summary>
                <p>{entry.message.content}</p>
                {entry.build && (
                  <ul>
                    {entry.build.plan.items.map((item) => (
                      <li key={item.proposalId}>{item.displayName}</li>
                    ))}
                  </ul>
                )}
                {entry.interaction?.proposals.map((proposal) => (
                  <p key={proposal.proposalId}>
                    {proposal.title} · {proposal.intention}
                  </p>
                ))}
              </details>
              {controller.rehearsalEnabled || !entry.interaction ? (
                <button type="button" onClick={() => controller.patch({ draft: entry.prompt })}>
                  用此构思继续讨论
                </button>
              ) : (
                <p>历史提案 · 只读保留</p>
              )}
            </article>
          ))}
        </details>
      </details>
      {notice && <p role="alert">{notice}</p>}
    </>
  )
}
