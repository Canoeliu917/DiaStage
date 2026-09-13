import { expect, test } from 'bun:test'
import { ItemFoldControlsSchema, ItemNode } from './item'

const legacy = {
  asset: {
    id: 'SCN-FOLD-03',
    category: 'scenery',
    name: '三帘组合',
    thumbnail: '/fold.png',
    src: '/fold.glb',
  },
  position: [2, 0.3, -4],
  rotation: [0.1, 0.2, 0.3],
  scale: [1.2, 1, 0.8],
}

test('legacy item controls remain optional and missing angles resolve to the authored 90 degrees', () => {
  expect(ItemNode.parse(legacy).controls).toBeUndefined()
  expect(ItemFoldControlsSchema.parse({})).toEqual({ fold_angle_1_deg: 90, fold_angle_2_deg: 90 })
  expect(ItemNode.parse({ ...legacy, controls: { fold_angle_2_deg: 135 } }).controls).toEqual({
    fold_angle_1_deg: 90,
    fold_angle_2_deg: 135,
  })
})

test('serialized instance controls retain both angles and all whole-item transforms', () => {
  const item = ItemNode.parse({
    ...legacy,
    controls: { fold_angle_1_deg: 270, fold_angle_2_deg: 225 },
  })
  expect(ItemNode.parse(JSON.parse(JSON.stringify(item)))).toEqual(item)
  expect(item.position).toEqual(legacy.position)
  expect(item.rotation).toEqual(legacy.rotation)
  expect(item.scale).toEqual(legacy.scale)
  for (const invalid of [NaN, Infinity, -Infinity, -1, 270.01, '90', null])
    expect(ItemNode.safeParse({ ...legacy, controls: { fold_angle_1_deg: invalid } }).success).toBe(
      false,
    )
  expect(ItemFoldControlsSchema.parse({ fold_angle_1_deg: 0 }).fold_angle_1_deg).toBe(0)
})
