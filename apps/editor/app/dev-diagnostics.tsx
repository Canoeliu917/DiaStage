'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'

const Agentation = dynamic(() => import('agentation').then((module) => module.Agentation), {
  ssr: false,
})

export function DevDiagnostics({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) void import('react-scan').then(({ scan }) => scan({ enabled: true }))
  }, [enabled])
  return enabled ? <Agentation /> : null
}
