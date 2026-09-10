import Link from 'next/link'
import { ManualStageEntry } from '@/components/stage-entry/manual-entry'
import { ScriptStageEntry } from '@/components/stage-entry/script-entry'
import { VoiceStageEntry } from '@/components/stage-entry/voice-entry'
import { StudioWordmark } from '@/components/studio-wordmark'
import '@/components/theatre/theatre.css'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>
}) {
  const { entry } = await searchParams
  return (
    <main className="ds-library ds-production-home">
      <header className="ds-library-header">
        <StudioWordmark />
        <nav className="ds-home-links" aria-label="项目与手机">
          <Link href="/remote-voice">手机舞台助手</Link>
          <Link href="/scenes">我的剧目</Link>
        </nav>
      </header>
      <section className="ds-library-main">
        <h1>让舞台上的想象，成为看得见的排演。</h1>
        <p>建立空间，安排人物移动，从机位观察，再带到另一座舞台。</p>
        <div className="ds-start-options">
          <section>
            <h2>语音构台</h2>
            <p>Voice to Stage</p>
            <p>从一句话开始，搭出你的舞台。</p>
            <VoiceStageEntry />
          </section>
          <section>
            <h2>手动置景</h2>
            <p>Set Manually</p>
            <p>用方块和木板，完成舞台。</p>
            <ManualStageEntry initiallyOpen={entry === 'manual'} />
          </section>
          <section>
            <h2>剧本搭台</h2>
            <p>Script to Stage</p>
            <p>上传剧本，把文字变成场景。</p>
            <ScriptStageEntry initiallyOpen={entry === 'script'} />
          </section>
          <section>
            <h2>复台</h2>
            <p>Return to Stage</p>
            <p>找回并继续之前的舞台版本。</p>
            <Link className="ds-remount-entry" href="/scenes?workspace=remount">
              选择已有剧目
            </Link>
          </section>
        </div>
        <Link className="ds-remount-entry" href="/remote-voice">
          连接手机 · 扫描上传
        </Link>
      </section>
    </main>
  )
}
