import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { createPhotoStageScene } from './adoption'
import { PHOTO_STAGE_EXAMPLE } from './example'
import type { PhotoStageObject, PhotoStagePlan } from './plan'
import { groundPhotoSupports, replacePhotoStageAsset } from './support'

afterEach(() => mock.restore())

const object = (assetId = 'SCN-TABLE-090', id = 'table'): PhotoStageObject => {
  const { asset, kind } = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)!
  const [width, height, depth] = asset.dimensions!
  return {
    id,
    name: id,
    assetId,
    kind: kind as PhotoStageObject['kind'],
    dimensions: { width, height, depth },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  }
}
const plan = (...objects: PhotoStageObject[]): PhotoStagePlan => ({
  name: '照片采用测试',
  summary: '合成方案，不调用模型。',
  stage: { width: 20, depth: 20 },
  uncertainties: [],
  objects,
})

test('replacing an asset restores all 21 native shapes before the confirmed scene is saved', async () => {
  const saved: Record<string, unknown>[] = []
  const send = spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    expect(url).toBe('/api/scenes')
    expect(init?.method).toBe('POST')
    saved.push(JSON.parse(init!.body as string))
    return Response.json({ id: 'saved-scene' })
  })
  const old = object()
  old.dimensions = { width: 0.6, height: 0.5, depth: 0.6 }
  old.position = [1, 0, -1]
  const original = plan(old)
  const before = JSON.stringify(original)
  for (const { asset } of AVAILABLE_STAGE_SCENERY) {
    const replacement = replacePhotoStageAsset(original, 0, asset.id)
    expect(replacement.objects[0]!.dimensions).toEqual({
      width: asset.dimensions![0],
      height: asset.dimensions![1],
      depth: asset.dimensions![2],
    })
    expect(replacement.objects[0]!.position[0]).toBe(1)
    expect(replacement.objects[0]!.position[2]).toBe(-1)
    expect(await createPhotoStageScene(replacement)).toBe('saved-scene')
    const graph = saved.at(-1)!.graph as {
      nodes: Record<string, { type: string; scale?: number[] }>
    }
    const items = Object.values(graph.nodes).filter((node) => node.type === 'item')
    expect(items).toHaveLength(1)
    expect(items[0]!.scale).toEqual([1, 1, 1])
  }
  expect(send).toHaveBeenCalledTimes(21)
  expect(JSON.stringify(original)).toBe(before)
})

test('replacement preserves the physical bottom height and orientation, including a rotated pivot', () => {
  const old = object('SCN-DOOR-130', 'door')
  old.rotation = [Math.PI / 2, 0.4, 0]
  old.position = [1, 0, -1]
  const original = groundPhotoSupports(plan(old), {
    door: { type: 'elevated', objectId: null, bottomHeightMeters: 0.6 },
  })
  const replaced = replacePhotoStageAsset(original, 0, 'SCN-CUBE-045')
  const cube = replaced.objects[0]!
  expect(cube.position[0]).toBe(1)
  expect(cube.position[2]).toBe(-1)
  expect(cube.rotation).toEqual(old.rotation)
  // XYZ rotation projects both horizontal half-extents onto the vertical axis.
  expect(cube.position[1]).toBeCloseTo(
    0.6 + (Math.sin(0.4) * cube.dimensions.width + Math.cos(0.4) * cube.dimensions.depth) / 2,
    8,
  )
})

test('replacing a supporting platform cannot silently leave its child floating', () => {
  const riser = object('SCN-RISER-01', 'riser')
  const child = object('SCN-CUBE-045', 'child')
  const original = groundPhotoSupports(plan(riser, child), {
    riser: { type: 'floor', objectId: null, bottomHeightMeters: null },
    child: { type: 'object', objectId: 'riser', bottomHeightMeters: null },
  })
  const before = JSON.stringify(original)
  expect(() => replacePhotoStageAsset(original, 0, 'SCN-TABLE-090')).toThrow('支撑')
  expect(JSON.stringify(original)).toBe(before)
})

test('invalid native dimensions, free shapes, and legacy examples cannot send a scene write', async () => {
  const send = spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('must not write a scene')
  })
  const resized = object()
  resized.dimensions.width *= 2
  const freeShape = { ...object(), kind: 'neutral-block' as const, assetId: null }
  for (const input of [plan(resized), plan(freeShape), PHOTO_STAGE_EXAMPLE]) {
    const before = JSON.stringify(input)
    await expect(createPhotoStageScene(input)).rejects.toThrow('原生尺寸')
    expect(JSON.stringify(input)).toBe(before)
  }
  expect(send).not.toHaveBeenCalled()
})

test('a valid replacement that overlaps its neighbour is rejected before saving and remains reviewable', async () => {
  const send = spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('must not write a scene')
  })
  const first = object('SCN-CHAIR-045', 'first')
  const second = object('SCN-CHAIR-045', 'second')
  second.position = [0.8, 0, 0]
  const replacement = replacePhotoStageAsset(plan(first, second), 0, 'SCN-SOFA-175')
  const before = JSON.stringify(replacement)
  await expect(createPhotoStageScene(replacement)).rejects.toThrow('外框重叠')
  expect(send).not.toHaveBeenCalled()
  expect(JSON.stringify(replacement)).toBe(before)
})

test('current rotated bounds are checked again at adoption', async () => {
  const send = spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('must not write a scene')
  })
  const riser = object('SCN-RISER-01')
  riser.position = [9.5, 0, 0]
  await expect(createPhotoStageScene(plan(riser))).rejects.toThrow('超出场地')
  expect(send).not.toHaveBeenCalled()
})

test('a native sofa 1.8m above the floor cannot be saved without physical support', async () => {
  const send = spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('must not write a scene')
  })
  const sofa = object('SCN-SOFA-175', 'sofa')
  sofa.position[1] = 1.8
  const input = plan(sofa)
  const before = JSON.stringify(input)
  await expect(createPhotoStageScene(input)).rejects.toThrow('最终落地的实体支撑')
  expect(send).not.toHaveBeenCalled()
  expect(JSON.stringify(input)).toBe(before)
})

test('a real riser supports a native object through a floor-connected chain regardless of item order', async () => {
  const send = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'supported' }))
  const riser = object('SCN-RISER-01', 'riser')
  const middle = object('SCN-CUBE-045', 'middle')
  const top = object('SCN-CUBE-045', 'top')
  middle.position[1] = riser.dimensions.height
  top.position[1] = riser.dimensions.height + middle.dimensions.height
  const input = plan(top, middle, riser)
  const before = JSON.stringify(input)
  expect(await createPhotoStageScene(input)).toBe('supported')
  expect(send).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(input)).toBe(before)
})

test('floating blocks cannot certify each other as support without a path to the floor', async () => {
  const send = spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('must not write a scene')
  })
  const lower = object('SCN-CUBE-045', 'lower')
  const upper = object('SCN-CUBE-045', 'upper')
  lower.position[1] = 1
  upper.position[1] = 1 + lower.dimensions.height
  const stacked = plan(upper, lower)
  const beside = structuredClone(upper)
  beside.position = [lower.dimensions.width, 1, 0]
  for (const input of [stacked, plan(lower, beside)]) {
    const before = JSON.stringify(input)
    await expect(createPhotoStageScene(input)).rejects.toThrow('最终落地的实体支撑')
    expect(JSON.stringify(input)).toBe(before)
  }
  expect(send).not.toHaveBeenCalled()
})
