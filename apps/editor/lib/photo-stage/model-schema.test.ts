import { expect, test } from 'bun:test'
import { zodTextFormat } from 'openai/helpers/zod'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { PhotoModelPlanSchema } from './model-schema'

const object = {
  id: 'cube',
  name: '方台',
  assetId: 'SCN-CUBE-045',
  position: { x: 0, z: 0 },
  rotation: [0, 0, 0],
  color: null,
  hingeAngles: null,
  support: { type: 'floor', objectId: null, bottomHeightMeters: null },
}
const plan = (objects: unknown[]) => ({
  name: '照片模型测试',
  summary: '照片比例估算，未提供实测尺寸。',
  stage: { width: 8, depth: 6 },
  uncertainties: [],
  objects,
})

test('real SDK emits three strict catalogue branches without unsupported schema keywords', () => {
  const format = zodTextFormat(PhotoModelPlanSchema, 'photo_stage_plan')
  expect(format.strict).toBe(true)
  expect(format.schema.type).toBe('object')
  expect(format.schema).not.toHaveProperty('anyOf')
  const schema = format.schema as {
    properties: { objects: { items: { anyOf: Record<string, unknown>[] } } }
  }
  expect(schema.properties.objects.items.anyOf).toHaveLength(3)
  for (const branch of schema.properties.objects.items.anyOf) {
    for (const field of ['kind', 'dimensions', 'profile', 'stepCount'])
      expect(branch.properties).not.toHaveProperty(field)
  }
  const unsupported = new Set([
    'oneOf',
    'allOf',
    'if',
    'then',
    'else',
    'not',
    'prefixItems',
    'dependencies',
    'dependentSchemas',
    'patternProperties',
    'unevaluatedProperties',
  ])
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as Record<string, unknown>
    for (const key of Object.keys(node)) expect(unsupported.has(key)).toBe(false)
    if (node.type === 'object') {
      expect(node.additionalProperties).toBe(false)
      expect(node.required).toEqual(Object.keys(node.properties as object))
    }
    Object.values(node).forEach(visit)
  }
  visit(format.schema)
  expect(JSON.stringify(format.schema)).toContain('仅估算模型原点的水平位置')
  expect(JSON.stringify(format.schema)).toContain('不是模型原点高度')
  expect(format.$parseRaw(JSON.stringify(plan([object])))).toEqual(plan([object]))
})

test('all 21 installed assets keep their native shape and allow clear substitute names', () => {
  expect(AVAILABLE_STAGE_SCENERY).toHaveLength(21)
  for (const { asset } of AVAILABLE_STAGE_SCENERY) {
    expect(PhotoModelPlanSchema.safeParse(plan([{ ...object, assetId: asset.id }])).success).toBe(
      true,
    )
  }
  for (const branch of [
    { assetId: 'SCN-FOLD-02', hingeAngles: [90] },
    { assetId: 'SCN-FOLD-03', hingeAngles: [135, 225] },
    { assetId: 'SCN-DESK-120', name: '钢琴替身·三屉桌', color: '#A0b1C2' },
  ])
    expect(PhotoModelPlanSchema.safeParse(plan([{ ...object, ...branch }])).success).toBe(true)
  expect(PhotoModelPlanSchema.safeParse(plan([])).success).toBe(true)
})

test('new photo output rejects primitives, dimensions and fields that could alter catalogue shape', () => {
  const format = zodTextFormat(PhotoModelPlanSchema, 'photo_stage_plan')
  for (const patch of [
    { profile: 'box' },
    { profile: null },
    { stepCount: 3 },
    { stepCount: null },
    { dimensions: { width: 2, height: 1, depth: 0.3 } },
    { kind: 'neutral-block' },
    { primitive: 'cylinder' },
    { hingeAngles: [90] },
    { assetId: 'SCN-FOLD-02', hingeAngles: [90, 90] },
    { assetId: 'SCN-FOLD-03', hingeAngles: [90] },
    { assetId: 'SCN-FOLD-03', hingeAngles: [90, 90, 90] },
    { assetId: 'SCN-FOLD-02', hingeAngles: [-1] },
    { assetId: 'SCN-FOLD-03', hingeAngles: [90, 361] },
    { assetId: 'SCN-FOLD-03', profile: 'box' },
    { assetId: null },
    { assetId: null, kind: 'stairs', stepCount: 3 },
    { assetId: null, kind: 'platform', profile: 'rounded-platform' },
    { assetId: 'invented-asset' },
    { assetId: 'SCN-FLAT-090' },
  ])
    expect(() => format.$parseRaw(JSON.stringify(plan([{ ...object, ...patch }])))).toThrow()
})

test('horizontal coordinates, support fields and numerical bounds are strict', () => {
  for (const patch of [
    { position: [0, 0, 0] },
    { position: { x: 0, y: 0, z: 0 } },
    { position: { x: 101, z: 0 } },
    { position: { x: 0, z: NaN } },
    { support: undefined },
    { support: { type: 'unknown', objectId: null, bottomHeightMeters: null } },
    { support: { type: 'object', objectId: 'x'.repeat(121), bottomHeightMeters: null } },
    { support: { type: 'elevated', objectId: null, bottomHeightMeters: -1 } },
    { support: { type: 'elevated', objectId: null, bottomHeightMeters: 101 } },
    { support: { type: 'floor', objectId: null, bottomHeightMeters: null, y: 0 } },
    { rotation: [0, 90, 0] },
    { color: 'red' },
    { color: '#12345' },
    { color: 'url(https://example.invalid/image)' },
  ])
    expect(PhotoModelPlanSchema.safeParse(plan([{ ...object, ...patch }])).success).toBe(false)
  expect(
    PhotoModelPlanSchema.safeParse(
      plan([
        {
          ...object,
          position: { x: -100, z: 100 },
          support: { type: 'elevated', objectId: null, bottomHeightMeters: 100 },
        },
      ]),
    ).success,
  ).toBe(true)
})

for (const fixture of [
  {
    label: 'positive: the cube stands on the stage floor',
    support: { type: 'floor', objectId: null, bottomHeightMeters: null },
  },
  {
    label: 'positive: the cube rests on the named platform',
    support: { type: 'object', objectId: 'platform', bottomHeightMeters: null },
  },
  {
    label: 'contrast: a suspended cube has an estimated bottom height, not a support object',
    support: { type: 'elevated', objectId: null, bottomHeightMeters: 2.2 },
  },
  {
    label: 'contrast: the image does not identify what supports the cube',
    support: { type: 'uncertain', objectId: null, bottomHeightMeters: null },
  },
  {
    label: 'paraphrase: the bottom of the cube touches the deck',
    support: { type: 'floor', objectId: null, bottomHeightMeters: null },
  },
])
  test(`support semantic fixture preserves ${fixture.label}`, () => {
    const result = PhotoModelPlanSchema.parse(plan([{ ...object, support: fixture.support }]))
    expect(result.objects[0]!.support).toEqual(fixture.support)
    expect(result.objects[0]!.position).toEqual({ x: 0, z: 0 })
    expect(result.objects[0]!.position).not.toHaveProperty('y')
  })
