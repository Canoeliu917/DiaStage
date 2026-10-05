import { HomeStageSpace } from '@/components/stage-entry/home-stage-space'
import { StudioWordmark } from '@/components/studio-wordmark'
import '@/components/stage-entry/dia-home.css'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>
}) {
  const { entry } = await searchParams
  return (
    <main className="ds-library dia-home">
      <header className="dia-space-brand">
        <StudioWordmark />
      </header>
      <HomeStageSpace initialEntry={entry} />
    </main>
  )
}
