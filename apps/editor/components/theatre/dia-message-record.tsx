'use client'

import { Star } from 'lucide-react'
import type { ThreadMessage } from '@/lib/rehearsal-intelligence/conversation'
import type { DiaConversation } from '@/lib/rehearsal-intelligence/conversation-controller'
import './dia-message-record.css'

export function DiaMessageRecord({
  message,
  controller,
  favorite = false,
  onFavorite,
}: {
  message: ThreadMessage
  controller: DiaConversation
  favorite?: boolean
  onFavorite?: () => void
}) {
  return (
    <article
      className={`dia-message dia-message-${message.role}`}
      data-message-id={message.messageId}
    >
      <header className="dia-message-heading">
        <strong className={message.role === 'dia' ? 'dia-notation' : undefined}>
          {message.role === 'user' ? '你' : message.role === 'dia' ? 'DIA' : '舞台记录'}
        </strong>
        <div className="dia-message-actions">
          {onFavorite && (
            <button
              className="dia-message-star"
              type="button"
              aria-label={favorite ? '取消收藏这条提案' : '收藏这条提案'}
              aria-pressed={favorite}
              onClick={onFavorite}
            >
              <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
            </button>
          )}
          <button
            className="dia-message-delete"
            type="button"
            aria-label="删除这条对话"
            title="删除这条对话"
            onClick={() => void controller.deleteMessage(message.messageId)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>
      <p>{message.content}</p>
    </article>
  )
}
