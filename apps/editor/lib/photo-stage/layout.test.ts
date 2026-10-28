import { expect, test } from 'bun:test'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import type { PhotoStageObject, PhotoStagePlan } from './plan'
import { assertPhotoLayout } from './support'

function prop(
  id: string,
  assetId: string,
  patch: Partial<PhotoStageObject> = {},
): PhotoStageObject {
  const { asset, kind } = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)!
  const [width, height, depth] = asset.dimensions!
  return {
    id,
    name: id,
    assetId,
    kind,
    dimensions: { width, height, depth },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    ...patch,
  }
}
const plan = (...objects: PhotoStageObject[]): PhotoStagePlan => ({
  name: '合成摆位检查',
  summary: '仅合成数据',
  stage: { width: 8, depth: 6 },
  uncertainties: [],
  objects,
})

test('keeps front and rear positions unchanged with catalogue geometry inside the stage', () => {
  const input = plan(
    prop('rear', 'SCN-CUBE-045', { position: [-1, 0, -2] }),
    prop('front', 'SCN-CUBE-045', { position: [1, 0, 2] }),
  )
  const before = JSON.stringify(input)
  expect(() => assertPhotoLayout(input)).not.toThrow()
  expect(JSON.stringify(input)).toBe(before)
})

test('checks complete rotated extents, not only a pivot near the stage', () => {
  const atEdge = prop('riser', 'SCN-RISER-01', { position: [0, 0, 2.5] })
  expect(() => assertPhotoLayout(plan(atEdge))).not.toThrow()
  expect(() => assertPhotoLayout(plan({ ...atEdge, rotation: [0, Math.PI / 2, 0] }))).toThrow(
    '超出场地',
  )
  for (const position of [
    [3.9, 0, 0],
    [-3.9, 0, 0],
    [0, 0, 2.9],
    [0, 0, -2.9],
  ])
    expect(() =>
      assertPhotoLayout(
        plan(
          prop('edge', 'SCN-CUBE-045', {
            position: position as [number, number, number],
          }),
        ),
      ),
    ).toThrow('超出场地')
})

test('permits exact riser seams and a supported object above them', () => {
  const left = prop('left', 'SCN-RISER-01', { position: [-0.9, 0, 0] })
  const right = prop('right', 'SCN-RISER-01', { position: [0.9, 0, 0] })
  expect(() =>
    assertPhotoLayout(
      plan(
        left,
        right,
        prop('top', 'SCN-CUBE-045', { position: [-0.9, left.dimensions.height, 0] }),
      ),
    ),
  ).not.toThrow()
  expect(() => assertPhotoLayout(plan(left, { ...right, position: [0.85, 0, 0] }))).toThrow(
    '外框重叠',
  )
})

test('rejects geometry under the floor and collisions with unrelated scenery', () => {
  expect(() =>
    assertPhotoLayout(
      plan(
        prop('below', 'SCN-CUBE-045', {
          position: [0, -0.01, 0],
        }),
      ),
    ),
  ).toThrow('低于地面')
  expect(() =>
    assertPhotoLayout(plan(prop('a', 'SCN-CUBE-045'), prop('b', 'SCN-CUBE-045'))),
  ).toThrow('外框重叠')
})

test('folded enclosure keeps its empty centre free but rejects overlap with a leaf', () => {
  const fold = prop('fold', 'SCN-FOLD-03', { hingeAngles: [90, 90] })
  const cube = prop('cube', 'SCN-CUBE-045', { position: [0.45, 0, -0.45] })
  expect(() => assertPhotoLayout(plan(fold, cube))).not.toThrow()
  expect(() => assertPhotoLayout(plan(fold, { ...cube, position: [0.45, 0, 0] }))).toThrow(
    '外框重叠',
  )
})

test('unfolded native pivot and hinge extents must also remain inside the stage', () => {
  const fold = prop('fold', 'SCN-FOLD-02', { hingeAngles: [180], position: [2.5, 0, 0] })
  expect(() => assertPhotoLayout(plan(fold))).toThrow('超出场地')
})

test('rejects self-intersecting fold leaves while preserving open and touching arrangements', () => {
  for (const hingeAngles of [
    [30, 30],
    [45, 45],
  ])
    expect(() => assertPhotoLayout(plan(prop('fold', 'SCN-FOLD-03', { hingeAngles })))).toThrow(
      '景片自身重叠',
    )
  for (const hingeAngles of [
    [60, 60],
    [90, 90],
    [180, 180],
  ])
    expect(() =>
      assertPhotoLayout(plan(prop('fold', 'SCN-FOLD-03', { hingeAngles }))),
    ).not.toThrow()
})
