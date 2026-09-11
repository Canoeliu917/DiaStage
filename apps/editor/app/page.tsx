import Link from 'next/link'
import { DiaHomeEntry } from '@/components/stage-entry/dia-home-entry'
import { ManualStageEntry } from '@/components/stage-entry/manual-entry'
import { ScriptStageEntry } from '@/components/stage-entry/script-entry'
import { VoiceStageEntry } from '@/components/stage-entry/voice-entry'
import { StudioWordmark } from '@/components/studio-wordmark'
import '@/components/theatre/theatre.css'
import '@/components/stage-entry/dia-home.css'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>
}) {
  const { entry } = await searchParams
  return (
    <main className="ds-library dia-home">
      <header className="ds-library-header">
        <StudioWordmark />
        <nav className="ds-home-links" aria-label="项目与手机">
          <Link href="/remote-voice">连接手机</Link>
          <Link href="/scenes">我的剧目</Link>
        </nav>
      </header>
      <div className="ds-library-main">
        <DiaHomeEntry />
        <section className="dia-home-tools" id="stage-tools" aria-labelledby="stage-tools-heading">
          <h2 id="stage-tools-heading">从自己的舞台开始</h2>
          <div className="dia-home-tool-list">
            <section>
              <div>
                <h3>语音构台</h3>
                <p>说出空间，先看方案。</p>
              </div>
              <VoiceStageEntry />
            </section>
            <section>
              <div>
                <h3>手动置景</h3>
                <p>用方块和木板，搭出舞台。</p>
              </div>
              <ManualStageEntry
                key={entry === 'manual' ? 'open' : 'closed'}
                initiallyOpen={entry === 'manual'}
              />
            </section>
            <section>
              <div>
                <h3>剧本搭台</h3>
                <p>从剧本里找到舞台空间。</p>
              </div>
              <ScriptStageEntry
                key={entry === 'script' ? 'open' : 'closed'}
                initiallyOpen={entry === 'script'}
              />
            </section>
            <section>
              <div>
                <h3>复台</h3>
                <p>把已有排演带回舞台。</p>
              </div>
              <Link href="/scenes?workspace=remount">选择已有剧目</Link>
            </section>
          </div>
        </section>
        <footer className="dia-home-footer">AI 提议。舞台先演。人来决定。</footer>
      </div>
    </main>
  )
}
