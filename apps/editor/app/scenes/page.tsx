import { ArrowRight, ScanLine } from 'lucide-react'
import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { CreateSceneButton } from '@/components/save-button'
import { StudioWordmark } from '@/components/studio-wordmark'
import { getScenePageOperations } from '@/lib/scene-store-server'

export const dynamic = 'force-dynamic'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

export default async function ScenesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>
}) {
  const operations = await getScenePageOperations(await headers())
  const scenes = await operations.listScenes({ limit: 50 })
  const remount = (await searchParams).workspace === 'remount'

  return (
    <div className="ds-library">
      <header className="ds-library-header">
        <Link className="studio-identity" href="/">
          <Image alt="" src="/diastage-mark.svg" width={36} height={36} />
          <div>
            <StudioWordmark />
            <span className="studio-slogan">Stage Build &amp; Remount Preview</span>
          </div>
        </Link>
        <div className="ds-library-actions">
          <Link href="/">
            进入工作台 <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <main className="ds-library-main">
        <div className="ds-library-heading">
          <div>
            <h1>我的剧目</h1>
            <p>搭建舞台，保存版本，对比另一座场地的映射预览。</p>
          </div>
          <CreateSceneButton />
        </div>
        <div className="ds-library-count">
          <span>剧目档案</span>
          <span>{scenes.length} 个剧目</span>
        </div>

        {scenes.length === 0 ? (
          <div className="ds-library-empty">
            <ScanLine size={40} strokeWidth={1} />
            <h2>从一座空舞台开始。</h2>
            <p>新建剧目，设置场地尺寸，用 22 件标准资产放置布景。</p>
            <CreateSceneButton />
          </div>
        ) : (
          <ul className="ds-scene-list">
            {scenes.map((scene) => (
              <li key={scene.id}>
                <Link
                  className="ds-scene-entry"
                  href={`/scene/${scene.id}${remount ? '?workspace=remount' : ''}`}
                >
                  <div className="ds-scene-image">
                    {scene.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={scene.name}
                        className="h-full w-full object-cover"
                        src={scene.thumbnailUrl}
                      />
                    ) : (
                      <ScanLine size={36} strokeWidth={1} aria-label="暂无缩略图" />
                    )}
                  </div>
                  <div className="ds-scene-info">
                    <h2>{scene.name}</h2>
                    <div className="ds-scene-meta">
                      <span>{scene.nodeCount} 个舞台对象</span>
                      <time dateTime={scene.updatedAt}>更新于 {formatDate(scene.updatedAt)}</time>
                    </div>
                  </div>
                  <span className="ds-scene-open">
                    打开剧目 <ArrowRight size={18} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <footer className="ds-library-footer">
          <StudioWordmark />
          <span>Stage Build &amp; Remount Preview</span>
        </footer>
      </main>
    </div>
  )
}
