import { headers } from 'next/headers'
import { HomeStageSpace } from '@/components/stage-entry/home-stage-space'
import { isAiProviderConfigured } from '@/lib/ai/provider-config'
import { getSession } from '@/lib/auth/server'
import '@/components/diamotif-search/theatre-search.css'

export const metadata = {
  title: '咫台 DiaStage · 戏剧艺术 AI 检索',
  description: '检索剧本、表导演知识、戏剧视频、院校与演出资料，走进你的排练舞台。',
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string; q?: string; category?: string }>
}) {
  const { entry, q, category } = await searchParams
  const session = await getSession(await headers())
  return (
    <main className="motif-home">
      <HomeStageSpace
        initialEntry={entry}
        initialQuery={q}
        initialCategory={category}
        modelConfigured={isAiProviderConfigured()}
        user={
          session
            ? { id: session.user.id, email: session.user.email, name: session.user.name }
            : null
        }
      />
    </main>
  )
}
