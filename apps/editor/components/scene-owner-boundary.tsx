'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { activateLocalAccount } from '@/lib/auth/local-account'

export function SceneOwnerBoundary({
  ownerId,
  children,
}: {
  ownerId: string
  children: ReactNode
}) {
  const [readyOwner, setReadyOwner] = useState<string | null>(null)
  useEffect(() => {
    if (!activateLocalAccount(ownerId)) {
      window.location.reload()
      return
    }
    setReadyOwner(ownerId)
  }, [ownerId])
  return readyOwner === ownerId ? children : <p role="status">正在打开你的舞台…</p>
}
