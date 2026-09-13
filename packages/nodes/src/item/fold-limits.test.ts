import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { applyItemFoldControls } from './fold-controls'
import { itemFoldSelfIntersects, limitItemFoldControls } from './fold-limits'
import { ItemGLTFLoader } from './model-loader'

async function model(id: string) {
  const bytes = await readFile(
    new URL(`../../../../apps/editor/public/stage-library/models/${id}.glb`, import.meta.url),
  )
  const { scene } = await new ItemGLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  return scene
}

for (const id of ['SCN-FOLD-02', 'SCN-FOLD-03']) {
  test(`${id} uses its real boards/frames, permits 90/180 and limits thick-panel closure`, async () => {
    const root = await model(id)
    const before = root.clone(true)
    expect(itemFoldSelfIntersects(root)).toBe(false)
    const opened = limitItemFoldControls(root, {}, { fold_angle_1_deg: 180, fold_angle_2_deg: 180 })
    expect(opened.limited).toBe(false)
    expect(opened.controls).toEqual({ fold_angle_1_deg: 180, fold_angle_2_deg: 180 })
    expect(itemFoldSelfIntersects(root)).toBe(false)
    const closed = limitItemFoldControls(root, opened.controls, { fold_angle_1_deg: 0 })
    expect(closed.limited).toBe(true)
    expect(closed.controls.fold_angle_1_deg).toBeGreaterThan(0)
    expect(closed.controls.fold_angle_1_deg).toBeLessThan(90)
    expect(itemFoldSelfIntersects(root)).toBe(false)
    applyItemFoldControls(root, {
      ...closed.controls,
      fold_angle_1_deg: closed.controls.fold_angle_1_deg - 0.01,
    })
    expect(itemFoldSelfIntersects(root)).toBe(true)
    expect(before.getObjectByName('Hinge_02')!.quaternion.y).toBeCloseTo(Math.SQRT1_2)
    expect(root.position.toArray()).toEqual([0, 0, 0])
    expect(root.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
    expect(root.scale.toArray()).toEqual([1, 1, 1])
  })
}

test('three panels check non-adjacent faces and both controls while allowing the requested reverse folding range', async () => {
  const root = await model('SCN-FOLD-03')
  const result = limitItemFoldControls(root, {}, { fold_angle_1_deg: 0, fold_angle_2_deg: 0 })
  expect(result.limited).toBe(true)
  expect(result.controls.fold_angle_1_deg).toBeGreaterThan(0)
  expect(itemFoldSelfIntersects(root)).toBe(false)
  const opened = limitItemFoldControls(root, result.controls, {
    fold_angle_1_deg: 270,
    fold_angle_2_deg: 270,
  })
  expect(opened.controls).toEqual({ fold_angle_1_deg: 270, fold_angle_2_deg: 270 })
  expect(opened.limited).toBe(false)
  expect(itemFoldSelfIntersects(root)).toBe(false)
})

test('a large angle input cannot jump through a panel even when its target angle is clear', () => {
  const root = new Group()
  const fixed = new Group()
  fixed.name = 'Hinge_01'
  const moving = new Group()
  moving.name = 'Hinge_02'
  root.add(fixed)
  fixed.add(moving)
  const obstacle = new Mesh(new BoxGeometry(0.1, 1, 0.1), new MeshBasicMaterial())
  obstacle.position.set(0, 0.5, -0.8)
  fixed.add(obstacle)
  moving.add(new Mesh(new BoxGeometry(1, 1, 0.04).translate(0.5, 0.5, 0), new MeshBasicMaterial()))
  applyItemFoldControls(root, { fold_angle_1_deg: 180 })
  expect(itemFoldSelfIntersects(root)).toBe(false)
  applyItemFoldControls(root, { fold_angle_1_deg: 0 })
  expect(itemFoldSelfIntersects(root)).toBe(false)
  const result = limitItemFoldControls(root, { fold_angle_1_deg: 180 }, { fold_angle_1_deg: 0 })
  expect(result.limited).toBe(true)
  expect(result.controls.fold_angle_1_deg).toBeGreaterThan(90)
  expect(result.controls.fold_angle_1_deg).toBeLessThan(100)
  expect(itemFoldSelfIntersects(root)).toBe(false)
})
