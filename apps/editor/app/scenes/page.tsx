import { ArrowRight, ScanLine } from 'lucide-react'
import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { CreateSceneButton } from '@/components/save-button'
import type { SceneMeta } from '@/components/scene-loader'
import { StudioWordmark } from '@/components/studio-wordmark'

export const dynamic = 'force-dynamic'

async function resolveBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  if (!host) {
    return 'http://localhost:3000'
  }
  return `${proto}://${host}`
}

async function fetchScenes(): Promise<SceneMeta[]> {
  const base = await resolveBaseUrl()
  const response = await fetch(`${base}/api/scenes?limit=50`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    return []
  }
  const payload = (await response.json()) as { scenes?: SceneMeta[] } | SceneMeta[]
  if (Array.isArray(payload)) {
    return payload
  }
  return payload.scenes ?? []
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

export default async function ScenesPage() {
  const scenes = await fetchScenes()

  return (
    <div className="ds-library">
      <header className="ds-library-header">
        <Link className="studio-identity" href="/">
          <Image alt="" src="/diastage-mark.svg" width={36} height={36} />
          <div>
            <StudioWordmark />
            <span className="studio-slogan">AI Dramaturgy &amp; Spatial Previs</span>
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
            <h1>我的场景</h1>
            <p>从空间到画面，让每一个行动有迹可循。</p>
          </div>
          <CreateSceneButton />
        </div>
        <div className="ds-library-count">
          <span>场景档案</span>
          <span>{scenes.length} 个场景</span>
        </div>

        {scenes.length === 0 ? (
          <div className="ds-library-empty">
            <ScanLine size={40} strokeWidth={1} />
            <h2>第一幕，从一个空间开始。</h2>
            <p>新建场景，在搭台中放置物件，再到看台安排机位与编排。</p>
            <CreateSceneButton />
          </div>
        ) : (
          <ul className="ds-scene-list">
            {scenes.map((scene) => (
              <li key={scene.id}>
                <Link className="ds-scene-entry" href={`/scene/${scene.id}`}>
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
                      <span>{scene.nodeCount} 个物件与结构节点</span>
                      <time dateTime={scene.updatedAt}>更新于 {formatDate(scene.updatedAt)}</time>
                    </div>
                  </div>
                  <span className="ds-scene-open">
                    打开场景 <ArrowRight size={18} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <footer className="ds-library-footer">
          <StudioWordmark />
          <span>AI Dramaturgy &amp; Spatial Previs</span>
        </footer>
      </main>
    </div>
  )
}
