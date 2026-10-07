import { headers } from 'next/headers'
import Link from 'next/link'
import { PhotoStageBuilder } from '@/components/photo-stage-builder'
import { getScenePageOperations } from '@/lib/scene-store-server'
import './photo-stage.css'

export const dynamic = 'force-dynamic'

export default async function PhotoStagePage() {
  await getScenePageOperations(await headers())
  return (
    <main className="photo-stage-page">
      <header className="photo-stage-header">
        <Link href="/scenes">← 我的剧目</Link>
        <span>DiaStage / Photo study</span>
      </header>
      <div className="photo-stage-intro">
        <p>从观众席，带走这一幕</p>
        <h1>照片复原</h1>
        <p>将照片里的空间，搭成可以继续编辑的舞台。</p>
      </div>
      <PhotoStageBuilder modelConfigured={Boolean(process.env.OPENAI_API_KEY?.trim())} />
    </main>
  )
}
