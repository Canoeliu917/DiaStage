import Link from 'next/link'
import { motifClosedBetaEnabled } from '@/lib/diamotif-search/motif-beta'
import '@/components/diamotif-search/theatre-search.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '投稿已收到 · 咫台 Dia',
  description: '投稿已进入待审。审核通过前不会出现在公开检索里。',
}

export default async function ContributeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>
}) {
  const { receipt } = await searchParams
  const shown = receipt && /^c[a-f0-9]{16}$/.test(receipt) ? receipt : null
  const showBeta = motifClosedBetaEnabled()
  return (
    <main className="motif-home">
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
      <article className="motif-contribute">
        <h1>已收到，正在等待审核</h1>
        <p>
          {shown
            ? `这条资料已记入待审队列，编号 ${shown}。`
            : '如果这次提交有效，资料只记在待审队列里。'}
          审核完成之前，它不会出现在 Dia
          的公开检索中。我们核对作者、完整性与权利之后，才可能展示题名和来源。
        </p>
        <p className="motif-form-note">
          权利尚不明确的材料不会托管全文，只保留题名、作者、链接和短摘要。提交本身不是公开展示。
        </p>
        <p>
          <Link href="/contribute">再提交一条</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/">返回检索</Link>
        </p>
      </article>
    </main>
  )
}
