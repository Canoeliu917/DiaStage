import { createUUID } from '../uuid'

export const ACCOUNT_CHANGE_KEY = 'diastage:account-change'
export const ACCOUNT_DOCUMENT_ID = createUUID()

export function isForeignAccountChange(message: unknown): boolean {
  return (
    !!message &&
    typeof message === 'object' &&
    'sender' in message &&
    typeof message.sender === 'string' &&
    message.sender !== ACCOUNT_DOCUMENT_ID
  )
}

export function notifyAccountChanged() {
  try {
    localStorage.setItem(ACCOUNT_CHANGE_KEY, createUUID())
  } catch {
    // The channel also works when browser storage is unavailable.
  }
  try {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(ACCOUNT_CHANGE_KEY)
    channel.postMessage({ sender: ACCOUNT_DOCUMENT_ID })
    channel.close()
  } catch {
    // Focus/session checks remain available when both browser channels are blocked.
  }
}

export function accountChangeDestination(
  previousUserId: string | null,
  nextUserId: string | null,
  path: string,
): string | null {
  if (previousUserId === nextUserId) return null
  if (/^\/(?:scenes|scene|photo-stage)(?:[/?#]|$)/.test(path))
    return nextUserId ? '/scenes' : `/login?next=${encodeURIComponent(path)}`
  return path
}
