import { z } from 'zod'

export const MAX_STAGE_LIGHTS = 4

const coordinate = z.number().finite().min(-10_000).max(10_000)
const vector = z.tuple([coordinate, coordinate, coordinate])
export type LightingVector = z.infer<typeof vector>

export function isValidLightPose(
  position: Readonly<LightingVector>,
  target: Readonly<LightingVector>,
): boolean {
  return (
    [...position, ...target].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 10_000,
    ) && Math.hypot(...position.map((value, axis) => value - target[axis]!)) > 0.0001
  )
}

const stageLightSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(160),
    enabled: z.boolean(),
    position: vector,
    target: vector,
    intensity: z.number().finite().min(0).max(1000),
    color: z.string().regex(/^#[\da-fA-F]{6}$/),
    angle: z.number().finite().min(5).max(90),
    penumbra: z.number().finite().min(0).max(1),
  })
  .refine((light) => isValidLightPose(light.position, light.target), {
    message: '灯具位置与照射目标须相距超过 0.0001 米',
    path: ['target'],
  })
const projectSchema = z.strictObject({
  version: z.literal(1),
  lights: z.array(stageLightSchema).max(MAX_STAGE_LIGHTS),
})

export type StageLight = z.infer<typeof stageLightSchema>
export type LightingProject = z.infer<typeof projectSchema>

const fieldNames: Record<string, string> = {
  version: '版本',
  lights: '灯具',
  id: '编号',
  name: '名称',
  enabled: '开关',
  position: '位置',
  target: '照射目标',
  intensity: '亮度',
  color: '颜色',
  angle: '光束角度',
  penumbra: '边缘柔化',
}

export function validateLightingProject(input: unknown): LightingProject {
  const result = projectSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]!
    const field = issue.path
      .map((part) => (typeof part === 'number' ? `第 ${part + 1} 项` : fieldNames[String(part)]))
      .filter(Boolean)
      .join('·')
    const message = issue.code === 'custom' ? issue.message : '请检查类型、格式或数值范围'
    throw new Error(`布光工程格式无效（${field || '工程'}）：${message}`)
  }
  if (new Set(result.data.lights.map((light) => light.id)).size !== result.data.lights.length) {
    throw new Error('灯具 ID 不可重复')
  }
  return result.data
}

export function createStageLight(id: string, index: number): StageLight {
  return validateLightingProject({
    version: 1,
    lights: [
      {
        id,
        name: `聚光灯 ${index + 1}`,
        enabled: true,
        position: [2, 4, 2],
        target: [0, 0, 0],
        intensity: 150,
        color: '#ffffff',
        angle: 45,
        penumbra: 0.5,
      },
    ],
  }).lights[0]!
}
