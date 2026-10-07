import { STAGE_OBJECT_REGISTRY, StageItemKindSchema } from '@pascal-app/core/stage'
import { z } from 'zod'

const length = z.number().finite().min(0.01).max(100)
const angle = z
  .number()
  .finite()
  .min(-Math.PI * 2)
  .max(Math.PI * 2)
const coordinate = z.number().finite().min(-100).max(100)

// Native stage coordinates: centre origin, +Y up, +Z audience, -Z rear, -X photo-left.
// Positions are bottom pivots; stairs rise along local +Z. Rotations use radians.
export const PhotoStageObjectSchema = z
  .strictObject({
    id: z.string().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    kind: StageItemKindSchema.exclude(['camera', 'performer-marker']),
    assetId: z.string().min(1).max(120).nullable(),
    dimensions: z.strictObject({ width: length, height: length, depth: length }),
    position: z.tuple([coordinate, z.number().finite().min(0).max(100), coordinate]),
    rotation: z.tuple([angle, angle, angle]),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    stepCount: z.number().int().min(1).max(200).optional(),
    profile: z.enum(['box', 'cylinder', 'rounded-platform']).optional(),
    hingeAngles: z.array(z.number().finite().min(0).max(360)).min(1).max(2).optional(),
  })
  .superRefine((object, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (object.assetId !== null) {
      const asset = STAGE_OBJECT_REGISTRY.find((entry) => entry.canonicalId === object.assetId)
      if (!asset || asset.kind !== object.kind)
        issue('assetId', '请选择与布景类型相符的 22 件舞台库资产。')
    } else if (Math.abs(object.rotation[0]) > 1e-8 || Math.abs(object.rotation[2]) > 1e-8) {
      issue('rotation', '可编辑基础形体仅支持绕竖直轴旋转。')
    }
    if (
      object.profile &&
      (object.assetId !== null || !['platform', 'neutral-block'].includes(object.kind))
    )
      issue('profile', '形状仅适用于无库资产的台块或基础形体。')
    if (object.stepCount !== undefined && object.kind !== 'stairs')
      issue('stepCount', '级数仅适用于台阶。')
    if (object.hingeAngles) {
      const count = object.assetId === 'SCN-FOLD-02' ? 1 : object.assetId === 'SCN-FOLD-03' ? 2 : 0
      if (object.hingeAngles.length !== count)
        issue('hingeAngles', '折叠角度须对应二帘的一处或三帘的两处原生铰链。')
    }
  })

export const PhotoStagePlanSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    summary: z.string().min(1).max(2000),
    stage: z.strictObject({
      width: z.number().finite().min(1).max(100),
      depth: z.number().finite().min(1).max(100),
    }),
    uncertainties: z.array(z.string().min(1).max(600)).max(30),
    objects: z.array(PhotoStageObjectSchema).min(1).max(160),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>()
    plan.objects.forEach((object, index) => {
      if (ids.has(object.id))
        ctx.addIssue({
          code: 'custom',
          path: ['objects', index, 'id'],
          message: '物件编号不能重复。',
        })
      ids.add(object.id)
      if (
        Math.abs(object.position[0]) > plan.stage.width / 2 + object.dimensions.width / 2 ||
        Math.abs(object.position[2]) > plan.stage.depth / 2 + object.dimensions.depth / 2
      )
        ctx.addIssue({
          code: 'custom',
          path: ['objects', index, 'position'],
          message: '物件须位于估算舞台范围附近。',
        })
    })
  })

export type PhotoStagePlan = z.infer<typeof PhotoStagePlanSchema>
export type PhotoStageObject = z.infer<typeof PhotoStageObjectSchema>
