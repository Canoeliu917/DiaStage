import { expect, test } from 'bun:test'
import { AiError } from '../ai/api'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import type { PhotoStageObject, PhotoStagePlan } from './plan'
import { groundPhotoSupports, type PhotoSupport } from './support'

const object = (id: string, patch: Partial<PhotoStageObject> = {}): PhotoStageObject => ({
  id,
  name: id,
  kind: 'platform',
  assetId: null,
  dimensions: { width: 2, height: 0.3, depth: 2 },
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  ...patch,
})
const plan = (...objects: PhotoStageObject[]): PhotoStagePlan => ({
  name: '合成支撑测试',
  summary: '仅合成布景数据。',
  stage: { width: 20, depth: 20 },
  uncertainties: [],
  objects,
})
const floor = (): PhotoSupport => ({ type: 'floor', objectId: null, bottomHeightMeters: null })
const on = (objectId: string): PhotoSupport => ({
  type: 'object',
  objectId,
  bottomHeightMeters: null,
})
const elevated = (height: number): PhotoSupport => ({
  type: 'elevated',
  objectId: null,
  bottomHeightMeters: height,
})
const table = (id = 'table') =>
  object(id, {
    kind: 'round-table',
    assetId: 'SCN-TABLE-090',
    dimensions: { width: 0.9, height: 0.75, depth: 0.9 },
    position: [0, 0.375, 0],
  })

function rejects(input: PhotoStagePlan, supports: Record<string, PhotoSupport>, message: string) {
  try {
    groundPhotoSupports(input, supports)
    throw new Error('Expected support rejection')
  } catch (error) {
    expect(error).toBeInstanceOf(AiError)
    expect(error).toMatchObject({ code: 'PLAN_INVALID', status: 422, retryable: true })
    expect((error as Error).message).toContain(message)
  }
}

test('floor means the native bottom pivot, not half the table height, without mutating input', () => {
  const input = plan(table())
  const before = JSON.stringify(input)
  const result = groundPhotoSupports(input, { table: floor() })
  expect(result.objects[0]!.position).toEqual([0, 0, 0])
  expect(result.objects[0]!.dimensions).toEqual(input.objects[0]!.dimensions)
  expect(result.uncertainties[0]).toContain('按明确支撑关系推导')
  expect(JSON.stringify(input)).toBe(before)
})

test('a reverse-ordered support chain uses only its named target, ignoring a higher neighbour', () => {
  const input = plan(
    table(),
    object('middle', { dimensions: { width: 2, height: 0.2, depth: 2 } }),
    object('high', { dimensions: { width: 2, height: 4, depth: 2 } }),
    object('base'),
  )
  const result = groundPhotoSupports(input, {
    table: on('middle'),
    middle: on('base'),
    high: floor(),
    base: floor(),
  })
  expect(result.objects.map((item) => item.position[1])).toEqual([0.5, 0.3, 0, 0])
  for (let i = 0; i < input.objects.length; i++) {
    expect(result.objects[i]!.position[0]).toBe(input.objects[i]!.position[0])
    expect(result.objects[i]!.position[2]).toBe(input.objects[i]!.position[2])
    expect(result.objects[i]!.rotation).toEqual(input.objects[i]!.rotation)
    expect(result.objects[i]!.dimensions).toEqual(input.objects[i]!.dimensions)
  }
})

test('a scenic flat can explicitly stand on a platform and elevated geometry retains its estimate', () => {
  const result = groundPhotoSupports(
    plan(
      object('flat', { kind: 'scenic-flat', dimensions: { width: 1.2, height: 2.4, depth: 0.08 } }),
      object('hanging', { kind: 'scenic-flat', dimensions: { width: 1, height: 1, depth: 0.08 } }),
      object('base'),
    ),
    { flat: on('base'), hanging: elevated(1.7), base: floor() },
  )
  expect(result.objects.map((item) => item.position[1])).toEqual([0.3, 1.7, 0])
  expect(result.uncertainties.some((text) => text.includes('未验证挂装结构'))).toBe(true)
  expect(
    groundPhotoSupports(plan(object('tiny')), { tiny: elevated(1e-10) }).objects[0]!.position[1],
  ).toBe(1e-10)
})

test('floor placement honours a rotated, scaled native asset pivot rather than its overall centre', () => {
  const asset = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === 'SCN-DOOR-130')!.asset
  const input = object('door', {
    kind: 'door-flat',
    assetId: asset.id,
    dimensions: {
      width: asset.dimensions![0] * 1.5,
      height: asset.dimensions![1] * 0.8,
      depth: asset.dimensions![2] * 2,
    },
    position: [1.25, 0, -0.7],
    rotation: [Math.PI / 2, 0, 0],
  })
  const grounded = groundPhotoSupports(plan(input), { door: floor() }).objects[0]!
  expect(grounded.position[1]).toBeCloseTo(
    (asset.boundsCenter![2] + asset.dimensions![2] / 2) * 2,
    10,
  )
  expect(grounded.position[0]).toBe(1.25)
  expect(grounded.position[2]).toBe(-0.7)
  expect(grounded.rotation).toEqual(input.rotation)
  expect(grounded.dimensions).toEqual(input.dimensions)
  const raised = groundPhotoSupports(plan(input), { door: elevated(0.6) }).objects[0]!
  expect(raised.position[1] - grounded.position[1]).toBeCloseTo(0.6, 12)
  expect(raised.position[1] - (asset.boundsCenter![2] + asset.dimensions![2] / 2) * 2).toBeCloseTo(
    0.6,
    12,
  )
})

test('fold support uses actual hinge geometry and the same native scale as compilation', () => {
  const asset = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === 'SCN-FOLD-02')!.asset
  const fold = object('fold', {
    kind: 'scenic-flat',
    assetId: asset.id,
    hingeAngles: [180],
    dimensions: {
      width: asset.dimensions![0] * 2,
      height: asset.dimensions![1] * 1.25,
      depth: asset.dimensions![2],
    },
  })
  const base = object('base', {
    position: [2.8, 0, 0],
    dimensions: { width: 0.2, height: 0.4, depth: 0.2 },
  })
  const result = groundPhotoSupports(plan(fold, base), { fold: on('base'), base: floor() })
  expect(result.objects[0]!.position[1]).toBeCloseTo(0.4, 12)
  expect(result.objects[0]!.hingeAngles).toEqual([180])
  expect(result.objects[0]!.dimensions).toEqual(fold.dimensions)
})

test('the empty centre of a folded enclosure is not a supporting solid', () => {
  const asset = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === 'SCN-FOLD-03')!.asset
  const fold = object('fold', {
    kind: 'scenic-flat',
    assetId: asset.id,
    hingeAngles: [90, 90],
    dimensions: {
      width: asset.dimensions![0],
      height: asset.dimensions![1],
      depth: asset.dimensions![2],
    },
  })
  const base = object('base', {
    position: [0.45, 0, -0.45],
    dimensions: { width: 0.2, height: 0.3, depth: 0.2 },
  })
  rejects(plan(fold, base), { fold: on('base'), base: floor() }, '没有可用的水平接触')
})

test('missing, uncertain, dangling, self and cyclic supports are rejected clearly', () => {
  const input = plan(object('a'), object('b'))
  rejects(input, { b: floor() }, '缺少支撑说明')
  rejects(
    input,
    { a: { type: 'uncertain', objectId: null, bottomHeightMeters: null }, b: floor() },
    '支撑关系不确定',
  )
  rejects(input, { a: on('missing'), b: floor() }, '支撑道具不存在')
  rejects(input, { a: on('a'), b: floor() }, '不能支撑自己')
  rejects(input, { a: on('b'), b: on('a') }, '形成循环')
  rejects(input, { a: { ...floor(), objectId: 'b' }, b: floor() }, '互相矛盾')
  rejects(input, { a: { ...on('b'), bottomHeightMeters: 1 }, b: floor() }, '不能同时填写离地高度')
})

test('side-only and disjoint contacts do not become supports', () => {
  for (const x of [2, 3]) {
    const input = plan(object('a', { position: [x, 0, 0] }), object('b'))
    rejects(input, { a: on('b'), b: floor() }, '没有可用的水平接触')
  }
})

test('invalid elevated heights and a support chain beyond the persisted range are rejected', () => {
  for (const height of [-1, 101, NaN, Infinity])
    rejects(plan(object('a')), { a: elevated(height) }, '有效的估计底部高度')
  rejects(plan(object('a')), { a: { ...elevated(1), objectId: 'other' } }, '不能同时指定支撑道具')
  rejects(
    plan(object('a'), object('b', { dimensions: { width: 2, height: 0.3, depth: 2 } })),
    { a: on('b'), b: elevated(100) },
    '高度或位置无效',
  )
})

test('special profiles may rest on the floor or retain elevation, but unknown contacts fail closed', () => {
  for (const profile of ['cylinder', 'rounded-platform'] as const) {
    const shaped = object('shaped', { profile })
    expect(groundPhotoSupports(plan(shaped), { shaped: floor() }).objects[0]!.position[1]).toBe(0)
    expect(
      groundPhotoSupports(plan(shaped), { shaped: elevated(0.8) }).objects[0]!.position[1],
    ).toBe(0.8)
    rejects(plan(shaped, object('base')), { shaped: on('base'), base: floor() }, '特殊轮廓')
    rejects(plan(object('top'), shaped), { top: on('shaped'), shaped: floor() }, '特殊轮廓')
  }
})
