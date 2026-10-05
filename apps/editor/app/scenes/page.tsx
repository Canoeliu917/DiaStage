import { ArrowRight } from 'lucide-react'
import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { CreateSceneButton } from '@/components/save-button'
import { StageDrawing } from '@/components/stage-entry/stage-drawing'
import { StudioWordmark } from '@/components/studio-wordmark'
import { artworkModifiedTime, sceneArtworkDimensions } from '@/lib/scene-artwork'
import { getScenePageOperations } from '@/lib/scene-store-server'
import './scene-gallery.css'

export const dynamic = 'force-dynamic'

export default async function ScenesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>
}) {
  const operations = await getScenePageOperations(await headers())
  const scenes = await operations.listScenes({ limit: 50 })
  const artworks = await Promise.all(
    scenes.map(async (scene) => {
      const stored = await operations.loadStoredScene(scene.id)
      return {
        scene: stored ?? scene,
        dimensions: stored ? sceneArtworkDimensions(stored.graph) : null,
      }
    }),
  )
  const remount = (await searchParams).workspace === 'remount'

  return (
    <div className="ds-library dia-scene-gallery">
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
            <p className="dia-gallery-kicker" lang="en">
              Selected stages
            </p>
            <h1>我的剧目</h1>
            <p>从观众席，收藏每一座正在成形的舞台。</p>
          </div>
          <CreateSceneButton />
        </div>
        <div className="ds-library-count">
          <span lang="en">Stage studies / Audience view</span>
          <span>{String(scenes.length).padStart(2, '0')} 个剧目</span>
        </div>

        {scenes.length === 0 ? (
          <div className="ds-library-empty">
            <div className="ds-empty-stage" aria-hidden="true">
              <StageDrawing />
            </div>
            <h2>从一座空舞台开始。</h2>
            <p>新建剧目，设置场地尺寸，用 22 件标准资产放置布景。</p>
            <CreateSceneButton />
          </div>
        ) : (
          <ul className="ds-scene-list">
            {artworks.map(({ scene, dimensions }, index) => (
              <li key={scene.id}>
                <Link
                  className="ds-scene-entry"
                  href={`/scene/${scene.id}${remount ? '?workspace=remount' : ''}`}
                  prefetch={false}
                  aria-label={`${index + 1}. ${scene.name}，最后修改 ${artworkModifiedTime(scene.updatedAt)}，打开剧目`}
                >
                  <figure className="dia-gallery-artwork">
                    <div className="ds-scene-image">
                      {scene.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={`${scene.name}，观众视角`}
                          src={scene.thumbnailUrl}
                          width={1280}
                          height={720}
                          loading={index === 0 ? 'eager' : 'lazy'}
                        />
                      ) : (
                        <div className="dia-gallery-cover-pending">
                          <span lang="en">Audience view</span>
                          <p>打开剧目后，生成这座舞台的观众视角封面。</p>
                        </div>
                      )}
                    </div>
                    <figcaption className="ds-scene-info">
                      <div className="dia-gallery-title-row">
                        <h2>
                          <span lang="en">{index + 1}.</span> {scene.name}
                        </h2>
                        <span className="ds-scene-open">
                          打开剧目 <ArrowRight size={18} />
                        </span>
                      </div>
                      <div className="ds-scene-meta">
                        <p className="dia-gallery-modified">
                          <span>最后修改</span>{' '}
                          <time dateTime={scene.updatedAt}>
                            {artworkModifiedTime(scene.updatedAt)}
                          </time>{' '}
                          <small>UTC+8</small>
                        </p>
                        <p className="dia-gallery-medium" lang="en">
                          <em>Stage design, audience perspective</em>
                        </p>
                        <p className="dia-gallery-dimensions">
                          <em>{dimensions ?? '场地尺寸未记录'}</em>
                          <span>
                            宽 × 深 × 高{dimensions?.includes('—') ? ' · 高度未测量' : ''}
                          </span>
                        </p>
                      </div>
                    </figcaption>
                  </figure>
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
