import { headers } from 'next/headers'
import { HomeStageSpace } from '@/components/stage-entry/home-stage-space'
import { StudioWordmark } from '@/components/studio-wordmark'
import { getAuthMailEnabled, getSession } from '@/lib/auth/server'
import '@/components/stage-entry/dia-home.css'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string; lit?: string }>
}) {
  const { entry, lit } = await searchParams
  const session = await getSession(await headers())
  return (
    <main className="ds-library dia-home">
      <header className="dia-space-brand">
        <StudioWordmark />
      </header>
      <HomeStageSpace
        initialEntry={entry}
        initiallyLit={lit === '1'}
        emailEnabled={getAuthMailEnabled()}
        modelConfigured={Boolean(process.env.OPENAI_API_KEY?.trim())}
        user={
          session
            ? { id: session.user.id, email: session.user.email, name: session.user.name }
            : null
        }
      />
    </main>
  )
}
