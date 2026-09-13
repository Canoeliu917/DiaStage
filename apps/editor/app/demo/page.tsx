import Link from 'next/link'
import { StudioWordmark } from '@/components/studio-wordmark'
import { DemoEntry } from './demo-entry'
import '@/components/stage-entry/dia-home.css'

export default function DemoPage() {
  return (
    <main className="ds-library dia-home">
      <header className="ds-library-header">
        <StudioWordmark />
        <Link href="/">返回首页</Link>
      </header>
      <div className="ds-library-main dia-demo-entry">
        <h1>一起排一段告别。</h1>
        <p className="dia-home-demo-label">演示数据 · 非真实模型输出</p>
        <blockquote>
          两个人在告别。
          <br />A 想走。
          <br />B 不想让他走。
        </blockquote>
        <DemoEntry />
      </div>
    </main>
  )
}
