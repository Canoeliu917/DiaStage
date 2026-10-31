import Link from 'next/link'
import { ContributeForm } from '@/components/diamotif-search/contribute-form'
import { motifClosedBetaEnabled } from '@/lib/diamotif-search/motif-beta'
import '@/components/diamotif-search/theatre-search.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '投稿资料 · 咫台 Dia',
  description: '向 Dia 提交待审戏剧资料。未审核内容不会进入公开检索。',
}

export default function ContributePage() {
  const showBeta = motifClosedBetaEnabled()
  return (
    <main className="motif-home">
      <a className="motif-skip" href="#contribute-form">
        跳到投稿表
      </a>
      <header className="motif-header">
        <div className="motif-brand-lockup">
          <Link href="/" className="motif-small-brand" aria-label="咫台 DiaStage 首页">
            DiaStage<span>咫台</span>
          </Link>
          {showBeta ? <span className="motif-beta-badge">内测</span> : null}
        </div>
        <nav aria-label="返回检索">
          <Link href="/">返回检索</Link>
        </nav>
      </header>
      <article className="motif-contribute" id="contribute-form">
        <h1>投稿资料</h1>
        <p>
          戏剧爱好者、导演与表演者可以在这里提交剧作线索。本页免费，不必登录。我们只征集中国大陆作者的完整原作、已核完整译本，或逐卷核完的剧作集。节选、改编和排练删改不收。提交后先进入待审，审核通过前不会出现在公开检索里。
        </p>
        <ContributeForm />
      </article>
    </main>
  )
}
