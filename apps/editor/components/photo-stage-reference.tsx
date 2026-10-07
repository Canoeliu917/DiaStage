'use client'

import { useScene } from '@pascal-app/core'
import { useMemo } from 'react'
import { z } from 'zod'
import { PhotoStagePlanSchema } from '@/lib/photo-stage/plan'
import { sceneGraphSignature } from '@/lib/scene-signature'
import './photo-stage-reference.css'

const PhotoStageReferenceSchema = z.object({
  version: z.literal(1),
  sourceImage: z
    .string()
    .regex(/^data:image\/(?:jpeg|png|webp);base64,/)
    .optional(),
  plan: PhotoStagePlanSchema,
  scaleStatus: z.literal('estimated'),
})

export function PhotoStageReference({ sceneId }: { sceneId: string }) {
  const metadata = useScene(
    (state) =>
      state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')?.metadata
        .photoStage,
  )
  const result = useMemo(() => PhotoStageReferenceSchema.safeParse(metadata), [metadata])
  if (!result.success) return null
  const { plan, sourceImage } = result.data

  function downloadArchive() {
    const url = URL.createObjectURL(
      new Blob([sceneGraphSignature(useScene.getState())], { type: 'application/json' }),
    )
    const link = window.document.createElement('a')
    link.href = url
    link.download = `DiaStage-${sceneId}-照片重建档案.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <details className="photo-stage-reference">
      <summary>照片对照</summary>
      <div className="photo-stage-reference-content">
        {sourceImage ? (
          <img src={sourceImage} alt={`${plan.name}的重建参考原图`} />
        ) : (
          <p>此场景未附原图。</p>
        )}
        <div className="photo-stage-reference-notes">
          <h2>{plan.name}</h2>
          <p>{plan.summary}</p>
          <p className="photo-stage-reference-estimate">
            照片初始估算：宽 {plan.stage.width} m × 深 {plan.stage.depth}{' '}
            m。尺寸来自照片推测，请按实测校准。
          </p>
          {plan.uncertainties.length > 0 && (
            <div>
              <h3>待确认</h3>
              <ul>
                {plan.uncertainties.map((uncertainty, index) => (
                  <li key={`${index}-${uncertainty}`}>{uncertainty}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={downloadArchive}>
            下载重建档案
          </button>
          <p className="photo-stage-reference-export-note">
            包含当前场景{sourceImage ? '与原图' : ''}。
          </p>
        </div>
      </div>
    </details>
  )
}
