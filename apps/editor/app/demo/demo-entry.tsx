'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import {
  finishSyntheticDemoIntention,
  pendingSyntheticDemoIntention,
} from '@/lib/rehearsal-intelligence/synthetic-demo-intention'

const CreatedSceneSchema = z.object({ id: z.string().min(1).max(64) })

export function DemoEntry() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [intention, setIntention] = useState('')
  const creating = useRef<Promise<string> | null>(null)
  useEffect(() => {
    let active = true
    // Share a creation request across React's effect replay; a mount makes only one new scene.
    creating.current ??= (async () => {
      const draft = pendingSyntheticDemoIntention()
      setIntention(draft)
      const { createSyntheticDemoScene, SYNTHETIC_DEMO_NAME } = await import(
        '@/lib/rehearsal-intelligence/synthetic-demo'
      )
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: SYNTHETIC_DEMO_NAME, graph: createSyntheticDemoScene() }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error('未能建立演示舞台，请检查连接后重试。')
      const { id } = CreatedSceneSchema.parse(await response.json())
      if (draft) {
        try {
          finishSyntheticDemoIntention(id, draft)
        } catch {
          throw new Error(
            '演示舞台已建立，但浏览器未允许暂存文字。请允许此网站存储后重试，或保留下面的文字并返回首页。',
          )
        }
      }
      return id
    })()
    void creating.current
      .then((id) => {
        if (active)
          router.replace(`/scene/${encodeURIComponent(id)}?workspace=rehearse&demo=synthetic`)
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : '演示未能打开，请重试。')
      })
    return () => {
      active = false
    }
  }, [router])
  return error ? (
    <div>
      <p role="alert">{error}</p>
      {intention && <blockquote>{intention}</blockquote>}
      <button className="dia-home-primary" type="button" onClick={() => window.location.reload()}>
        重新打开演示
      </button>
    </div>
  ) : (
    <p role="status" aria-live="polite">
      正在准备两个人与一座独立舞台…
    </p>
  )
}
