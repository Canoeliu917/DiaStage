import { z } from 'zod'
import { AVAILABLE_STAGE_ASSET_IDS } from '../stage/prop-assets'
import { PhotoStageObjectSchema, PhotoStagePlanSchema } from './plan'

const coordinate = z.number().finite().min(-100).max(100)
const hingeAngle = z.number().finite().min(0).max(360)
const ordinaryAssetIds = AVAILABLE_STAGE_ASSET_IDS.filter(
  (id) => id !== 'SCN-FOLD-02' && id !== 'SCN-FOLD-03',
)
const common = {
  id: PhotoStageObjectSchema.shape.id,
  name: PhotoStageObjectSchema.shape.name.describe('可说明原物与替代关系，如“钢琴替身·三屉桌”。'),
  position: z
    .strictObject({
      x: coordinate.describe(
        '单位米；舞台地面中心为0，正向为照片画面右侧、演员台左。左右边界为±stage.width/2，需为旋转后的完整道具外框留空间。',
      ),
      z: coordinate.describe(
        '单位米；舞台地面中心为0，台后为负、台前观众方向为正。台后边界-stage.depth/2，台口+stage.depth/2；不是从台口起算的0..depth。',
      ),
    })
    .describe('仅估算模型原点的水平位置；不输出 y，高度由支撑关系确定，不更改 GLB 支点。'),
  yawDegrees: z
    .number()
    .finite()
    .min(-180)
    .max(180)
    .describe(
      '仅绕世界竖直Y轴的平面朝向，单位度；0保持GLB原生朝向，+90把局部+Z转向世界+X，-90反向。不是Euler数组，不侧翻或俯仰。',
    ),
  color: PhotoStageObjectSchema.shape.color.unwrap().nullable(),
  hingeAngles: z.null(),
  support: z
    .strictObject({
      type: z
        .enum(['floor', 'object', 'elevated', 'uncertain'])
        .describe(
          'floor=落地；object=支撑在另一布景表面；elevated=挂装或悬空；uncertain=照片不足以确认，会请求人工补充。',
        ),
      objectId: z
        .string()
        .min(1)
        .max(120)
        .nullable()
        .describe('仅 object 填同一方案中支撑物的对象 id，不是 assetId；其余类型填 null。'),
      bottomHeightMeters: z
        .number()
        .finite()
        .min(0)
        .max(100)
        .nullable()
        .describe(
          '单位米；仅 elevated 填物件最低点距舞台地面的估算高度，不是模型原点高度。floor/object 不填高度，uncertain 等人工确认，均填 null。',
        ),
    })
    .describe('表达照片可见的支撑关系；未知时用 uncertain，不猜地面或其他支撑物。'),
}

const modelObject = z.union([
  z.strictObject({
    ...common,
    assetId: z.literal('SCN-FOLD-02'),
    hingeAngles: z
      .array(hingeAngle)
      .length(1)
      .nullable()
      .describe('二连的一处原生铰链角，单位度。'),
  }),
  z.strictObject({
    ...common,
    assetId: z.literal('SCN-FOLD-03'),
    hingeAngles: z
      .array(hingeAngle)
      .length(2)
      .nullable()
      .describe('三联的两处原生铰链角，单位度。'),
  }),
  z.strictObject({
    ...common,
    assetId: z.enum(ordinaryAssetIds),
  }),
])

export const PhotoModelPlanSchema = z.strictObject({
  ...PhotoStagePlanSchema.shape,
  stage: PhotoStagePlanSchema.shape.stage.describe('舞台宽深，单位米；照片估算，不是实测。'),
  objects: z.array(modelObject).max(160),
})
