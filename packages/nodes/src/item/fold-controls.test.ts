import { beforeAll, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Group, type Object3D, Vector3 } from 'three'
import { applyItemFoldControls, computeItemFoldBounds } from './fold-controls'
import { ItemGLTFLoader } from './model-loader'

const originals = new Map<number, Group>()
beforeAll(async () => {
  for (const count of [2, 3]) {
    const bytes = readFileSync(
      resolve(
        import.meta.dir,
        `../../../../apps/editor/public/stage-library/models/SCN-FOLD-0${count}.glb`,
      ),
    )
    const gltf = await new ItemGLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
    originals.set(count, gltf.scene)
  }
})

const fresh = (count: number) => originals.get(count)!.clone(true)
const joint = (root: Object3D, index: number) => root.getObjectByName(`Hinge_0${index}`)!
const meshMatrix = (root: Object3D, index: number) => {
  root.updateWorldMatrix(true, true)
  return root.getObjectByName(`Hinge_0${index}_chalk`)!.matrixWorld.toArray()
}

test('two panels unfold from 90 to 180 using an absolute local Y rotation while the first panel and whole pose stay fixed', () => {
  const root = fresh(2)
  root.position.set(2, 0.3, -4)
  root.rotation.set(0.1, 0.2, 0.3)
  root.scale.set(1.2, 0.8, 1.4)
  const whole = [root.position.toArray(), root.quaternion.toArray(), root.scale.toArray()]
  const first = meshMatrix(root, 1)
  const second = meshMatrix(root, 2)
  const localPosition = joint(root, 2).position.toArray()
  const localScale = joint(root, 2).scale.toArray()
  expect(applyItemFoldControls(root, { fold_angle_1_deg: 180 })).toBe(true)
  expect(joint(root, 2).rotation.y).toBeCloseTo(0, 12)
  expect(meshMatrix(root, 1)).toEqual(first)
  expect(meshMatrix(root, 2)).not.toEqual(second)
  expect(joint(root, 2).position.toArray()).toEqual(localPosition)
  expect(joint(root, 2).scale.toArray()).toEqual(localScale)
  expect(joint(root, 2).parent).toBe(joint(root, 1))
  expect([root.position.toArray(), root.quaternion.toArray(), root.scale.toArray()]).toEqual(whole)
  expect(applyItemFoldControls(root, { fold_angle_1_deg: 180 })).toBe(false)
  applyItemFoldControls(root)
  meshMatrix(root, 2).forEach((value, index) => {
    expect(value).toBeCloseTo(second[index]!, 12)
  })
})

test('the first fold moves the last two panels and retains the second relative angle', () => {
  const root = fresh(3)
  const first = meshMatrix(root, 1)
  const second = meshMatrix(root, 2)
  const third = meshMatrix(root, 3)
  const lastAngle = joint(root, 3).quaternion.toArray()
  applyItemFoldControls(root, { fold_angle_1_deg: 135 })
  expect(meshMatrix(root, 1)).toEqual(first)
  expect(meshMatrix(root, 2)).not.toEqual(second)
  expect(meshMatrix(root, 3)).not.toEqual(third)
  joint(root, 3)
    .quaternion.toArray()
    .forEach((value, index) => {
      expect(value).toBeCloseTo(lastAngle[index]!, 12)
    })
  expect(joint(root, 3).parent).toBe(joint(root, 2))
})

test('the second fold changes only the last panel; two instances and the loader cache stay independent', () => {
  const root = fresh(3)
  const other = fresh(3)
  const first = meshMatrix(root, 1)
  const second = meshMatrix(root, 2)
  const third = meshMatrix(root, 3)
  const otherThird = meshMatrix(other, 3)
  const sourceThird = meshMatrix(originals.get(3)!, 3)
  applyItemFoldControls(root, { fold_angle_2_deg: 135 })
  expect(meshMatrix(root, 1)).toEqual(first)
  meshMatrix(root, 2).forEach((value, index) => {
    expect(value).toBeCloseTo(second[index]!, 12)
  })
  expect(meshMatrix(root, 3)).not.toEqual(third)
  expect(meshMatrix(other, 3)).toEqual(otherThird)
  expect(meshMatrix(originals.get(3)!, 3)).toEqual(sourceThird)
  expect(root.getObjectByName('Hinge_03_chalk')).not.toBe(other.getObjectByName('Hinge_03_chalk'))
})

test('live bounds follow the actual folded meshes and remain separate from the first-panel pivot', () => {
  const root = fresh(3)
  const folded = computeItemFoldBounds(root)!
  expect(folded.dimensions[0]).toBeCloseTo(0.92, 5)
  expect(folded.dimensions[1]).toBeCloseTo(2.4, 5)
  expect(folded.dimensions[2]).toBeCloseTo(0.94, 5)
  applyItemFoldControls(root, { fold_angle_1_deg: 180, fold_angle_2_deg: 180 })
  const open = computeItemFoldBounds(root)!
  expect(open.dimensions[0]).toBeCloseTo(2.7, 5)
  expect(open.dimensions[1]).toBeCloseTo(2.4, 5)
  expect(open.dimensions[2]).toBeCloseTo(0.04, 5)
  expect(open.boundsCenter[0]).toBeCloseTo(1.35, 5)
  expect(joint(root, 1).position.toArray()).toEqual([0, 0, 0])
})

test('registry-root bounds remove instance scale once and ignore whole-item movement and rotation', () => {
  const model = fresh(3)
  applyItemFoldControls(model, { fold_angle_1_deg: 180, fold_angle_2_deg: 135 })
  const expected = computeItemFoldBounds(model)!
  const registryRoot = new Group()
  const scaleGroup = new Group()
  registryRoot.position.set(2, 3, 4)
  registryRoot.rotation.set(0.2, 0.7, 0.4)
  scaleGroup.scale.set(2, 0.5, 3)
  registryRoot.add(scaleGroup)
  scaleGroup.add(model)
  const actual = computeItemFoldBounds(registryRoot, [2, 0.5, 3])!
  expect(
    new Vector3(...actual.dimensions).distanceTo(new Vector3(...expected.dimensions)),
  ).toBeCloseTo(0, 9)
  expect(
    new Vector3(...actual.boundsCenter).distanceTo(new Vector3(...expected.boundsCenter)),
  ).toBeCloseTo(0, 9)
})

test('invalid controls are rejected and the mathematical zero endpoint remains distinct from a validated physical limit', () => {
  const root = fresh(2)
  for (const value of [-1, 271, NaN, Infinity])
    expect(() => applyItemFoldControls(root, { fold_angle_1_deg: value })).toThrow()
  applyItemFoldControls(root, { fold_angle_1_deg: 0 })
  expect(joint(root, 2).quaternion.y).toBeCloseTo(1, 12)
  expect(computeItemFoldBounds(root)!.dimensions.every(Number.isFinite)).toBe(true)
  expect(computeItemFoldBounds(new Group())).toBeNull()
})

test('270 degree reverse fold preserves each panel dimensions, translations and independent instance pose', () => {
  const root = fresh(3)
  const first = meshMatrix(root, 1)
  const origins = [2, 3].map((index) => joint(root, index).position.toArray())
  const scales = [1, 2, 3].map((index) => joint(root, index).scale.toArray())
  applyItemFoldControls(root, { fold_angle_1_deg: 270, fold_angle_2_deg: 270 })
  expect(meshMatrix(root, 1)).toEqual(first)
  expect(joint(root, 2).rotation.y).toBeCloseTo(-Math.PI / 2, 10)
  expect(joint(root, 3).rotation.y).toBeCloseTo(-Math.PI / 2, 10)
  expect([2, 3].map((index) => joint(root, index).position.toArray())).toEqual(origins)
  expect([1, 2, 3].map((index) => joint(root, index).scale.toArray())).toEqual(scales)
  expect(computeItemFoldBounds(root)!.dimensions[1]).toBeCloseTo(2.4, 5)
})
