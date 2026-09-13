import Link from 'next/link'
import { ManualStageEntry } from '@/components/stage-entry/manual-entry'
import { StudioWordmark } from '@/components/studio-wordmark'
import { DIASTAGE_BRAND } from '@/lib/brand'
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
        <section className="dia-home-conversation" aria-labelledby="dia-home-heading">
          <div className="dia-home-introduction">
            <h1 id="dia-home-heading">{DIASTAGE_BRAND.headline}</h1>
            <p>{DIASTAGE_BRAND.tagline}</p>
          </div>
          <p>选择场地，用 22 件标准资产搭台。在舞台中告诉 Dia 你的想法，先预演，再决定是否采用。</p>
          <nav className="dia-home-shortcuts" aria-label="舞台入口">
            <Link href="/?entry=manual#stage-tools">开始置景</Link>
            <Link href="/scenes">继续已有剧目</Link>
            <Link href="/scenes?workspace=remount">复台映射预览</Link>
          </nav>
        </section>
        <section className="dia-home-tools" id="stage-tools" aria-labelledby="stage-tools-heading">
          <h2 id="stage-tools-heading">从自己的舞台开始</h2>
          <div className="dia-home-tool-list">
            <section>
              <div>
                <h3>手动置景</h3>
                <p>用 22 件标准舞台资产搭台。</p>
              </div>
              <ManualStageEntry
                key={entry === 'manual' ? 'open' : 'closed'}
                initiallyOpen={entry === 'manual'}
              />
            </section>
            <section>
              <div>
                <h3>复台</h3>
                <p>选择保存版本，对比目标场地的映射预览。</p>
              </div>
              <Link href="/scenes?workspace=remount">选择已有剧目</Link>
            </section>
          </div>
          <details className="dia-brand-explanation">
            <summary>认识 DiaStage 与 Dia</summary>
            <p>{DIASTAGE_BRAND.product}</p>
            <p>{DIASTAGE_BRAND.companion}</p>
            <dl>
              {DIASTAGE_BRAND.capabilities.map(([name, description]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
            <p>
              这四个词解释同一个 Dia
              的能力。当前记录保存在本机浏览器，复杂方案仍需模型服务；它们不是任意生成或永久记忆的承诺。
            </p>
          </details>
        </section>
        <footer className="dia-home-footer">AI 提议。舞台先演。人来决定。</footer>
      </div>
    </main>
  )
}
