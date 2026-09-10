import Link from 'next/link'
import { ManualStageEntry } from '@/components/stage-entry/manual-entry'
import { ScriptStageEntry } from '@/components/stage-entry/script-entry'
import { VoiceStageEntry } from '@/components/stage-entry/voice-entry'
import { StudioWordmark } from '@/components/studio-wordmark'
import '@/components/theatre/theatre.css'

export default function Home() {
  return (
    <main className="ds-library ds-production-home">
      <header className="ds-library-header">
        <StudioWordmark />
        <Link href="/scenes">我的剧目</Link>
      </header>
      <section className="ds-library-main">
        <h1>让舞台上的想象，成为看得见的排演。</h1>
        <p>建立空间，安排人物移动，从机位观察，再带到另一座舞台。</p>
        <div className="ds-start-options">
          <section>
            <h2>语音开台</h2>
            <p>Voice to Stage</p>
            <p>说出舞台尺寸、主要布景和它们的位置。</p>
            <VoiceStageEntry />
          </section>
          <section>
            <h2>手动置景</h2>
            <p>Set Manually</p>
            <p>设置舞台宽深，从舞台库选择并放置布景。</p>
            <ManualStageEntry />
          </section>
          <section>
            <h2>剧本搭台</h2>
            <p>Script to Stage</p>
            <p>从 PDF 或 Word 中提取舞台空间与大型布景。</p>
            <ScriptStageEntry />
          </section>
        </div>
        <Link className="ds-remount-entry" href="/scenes?workspace=remount">
          复台已有剧目 →
        </Link>
      </section>
    </main>
  )
}
