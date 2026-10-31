import { z } from 'zod'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { compilePhotoStagePlan } from './compile'
import { type PhotoStagePlan, PhotoStagePlanSchema } from './plan'
import { assertPhotoGroundedSupports, assertPhotoLayout } from './support'

export async function createPhotoStageScene(input: PhotoStagePlan, sourceImage?: string) {
  const plan = PhotoStagePlanSchema.parse(input)
  for (const object of plan.objects) {
    const entry = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === object.assetId)
    if (
      !entry ||
      entry.kind !== object.kind ||
      object.profile !== undefined ||
      object.stepCount !== undefined ||
      [object.dimensions.width, object.dimensions.height, object.dimensions.depth].some(
        (value, axis) => value !== entry.asset.dimensions![axis],
      )
    )
      throw new Error(`「${object.name}」须使用21件标准道具的原生尺寸，请重新分析或更换匹配资产。`)
  }
  assertPhotoLayout(plan)
  assertPhotoGroundedSupports(plan)
  const graph = compilePhotoStagePlan(plan, sourceImage)
  const response = await fetch('/api/scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: plan.name, graph }),
  })
  if (!response.ok) throw new Error(`复原剧目未保存（${response.status}），请重试。`)
  return z.object({ id: z.string().min(1) }).parse(await response.json()).id
}
