import { headers } from 'next/headers'
import Link from 'next/link'
import { SceneLoader } from '@/components/scene-loader'
import { getScenePageOperations } from '@/lib/scene-store-server'

export const dynamic = 'force-dynamic'

export default async function ScenePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const operations = await getScenePageOperations(await headers())
  const scene = await operations.loadStoredScene(id)

  if (!scene) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-6 text-center shadow-xl">
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">404</p>
          <h1 className="mt-2 font-semibold text-lg">未找到场景</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            未找到编号为 <code className="font-mono">{id}</code> 的场景。
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link
              className="rounded-md border border-border bg-accent px-3 py-2 font-medium text-sm hover:bg-accent/80"
              href="/scenes"
            >
              浏览场景库
            </Link>
            <Link
              className="rounded-md border border-border bg-background px-3 py-2 font-medium text-sm hover:bg-accent/40"
              href="/"
            >
              返回编辑器
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { graph, ...meta } = scene
  return <SceneLoader initialScene={graph} meta={meta} />
}
