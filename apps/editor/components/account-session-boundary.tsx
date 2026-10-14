'use client'

import { useEffect } from 'react'
import {
  ACCOUNT_CHANGE_KEY,
  accountChangeDestination,
  isForeignAccountChange,
} from '@/lib/auth/account-change'

export function AccountSessionBoundary({ userId }: { userId: string | null }) {
  useEffect(() => {
    let disposed = false
    let checking = false
    let navigating = false
    let concealed = false
    let changeVersion = 0
    const visibility = document.body.style.visibility
    const conceal = () => {
      if (!userId) return
      concealed = true
      document.body.style.visibility = 'hidden'
    }
    const reveal = () => {
      if (concealed) document.body.style.visibility = visibility
      concealed = false
    }
    const check = async () => {
      if (checking || navigating || disposed) return
      checking = true
      const version = changeVersion
      try {
        const response = await fetch('/api/auth/get-session', {
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) return
        const session = await response.json()
        if (disposed || version !== changeVersion) return
        const nextUserId = typeof session?.user?.id === 'string' ? session.user.id : null
        const path = `${location.pathname}${location.search}${location.hash}`
        const destination = accountChangeDestination(userId, nextUserId, path)
        if (destination) {
          conceal()
          navigating = true
          location.replace(destination)
        } else reveal()
      } catch {
        // Keep concealed private content closed until identity can be checked again.
      } finally {
        checking = false
        if (version !== changeVersion) void check()
      }
    }
    const changed = () => {
      changeVersion++
      conceal()
      void check()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === ACCOUNT_CHANGE_KEY) changed()
    }
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) changed()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    let channel: BroadcastChannel | null = null
    try {
      if (typeof BroadcastChannel !== 'undefined')
        channel = new BroadcastChannel(ACCOUNT_CHANGE_KEY)
      if (channel)
        channel.onmessage = (event) => {
          if (isForeignAccountChange(event.data)) changed()
        }
    } catch {
      // Storage events and focus checks still cover browsers that block this API.
    }
    window.addEventListener('storage', storage)
    window.addEventListener('focus', visible)
    window.addEventListener('pagehide', conceal)
    window.addEventListener('pageshow', pageShow)
    document.addEventListener('visibilitychange', visible)
    const timer = setInterval(() => void check(), 60_000)
    void check()
    return () => {
      disposed = true
      clearInterval(timer)
      channel?.close()
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', visible)
      window.removeEventListener('pagehide', conceal)
      window.removeEventListener('pageshow', pageShow)
      document.removeEventListener('visibilitychange', visible)
      if (!navigating) reveal()
    }
  }, [userId])
  return null
}
