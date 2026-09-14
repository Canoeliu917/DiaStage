import { expect, test } from 'bun:test'
import { prepareStageCollision, stageObjectsTouch } from './collision'
import { STAGE_OBJECT_CATEGORIES, STAGE_OBJECT_REGISTRY } from './object-registry'
import type { SceneContextObject } from './schema'
import { canStageStack, stageMagneticHeight, stageStackPosition } from './stacking'

const object = (
  id: string,
  kind: SceneContextObject['kind'] = 'platform',
  height = 0.15,
): SceneContextObject => ({
  id,
  name: id,
  kind,
  dimensionsMeters: { width: 1.8, height, depth: 0.9 },
  transform: { position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
})

test('A: category display order preserves all 22 canonical identities', () => {
  expect(STAGE_OBJECT_CATEGORIES).toEqual(['空间围合', '台块与支撑', '门窗', '沙发', '桌', '椅凳'])
  expect(new Set(STAGE_OBJECT_REGISTRY.map((asset) => asset.canonicalId)).size).toBe(22)
})

test('B/C: A → B → C and ten layers have exact contact without stored clearance', () => {
  const placed: SceneContextObject[] = []
  for (let i = 0; i < 10; i++) {
    const item = object(String(i))
    item.transform.position.y = stageStackPosition(item, placed)!.y
    expect(item.transform.position.y).toBeCloseTo(i * 0.15, 14)
    if (i) {
      const bottom = prepareStageCollision(item).bounds[1]![0]
      const top = prepareStageCollision(placed[i - 1]!).bounds[1]![1]
      expect(bottom).toBeCloseTo(top, 14)
    }
    placed.push(item)
  }
  expect(stageStackPosition(placed[9]!, placed)!.y).toBeCloseTo(1.35, 14)
})

test('D: table/chair/sofa/platform can each stack on every other eligible kind', () => {
  const kinds = ['table', 'chair', 'sofa', 'platform', 'round-table', 'neutral-block'] as const
  for (const moving of kinds)
    for (const support of kinds) {
      const a = object('a', support, 0.8),
        b = object('b', moving, 0.7)
      const result = stageStackPosition(b, [a])!
      expect(result.supportId).toBe('a')
      b.transform.position.y = result.y
      expect(stageObjectsTouch(a, b)).toBe(true)
    }
})

test('E: scenic/window/door flats participate in neither side of stacking', () => {
  for (const kind of ['scenic-flat', 'window-flat', 'door-flat'] as const) {
    const flat = object('flat', kind, 2.4)
    expect(canStageStack(flat)).toBe(false)
    expect(stageStackPosition(flat, [object('support')])).toBeNull()
    expect(stageStackPosition(object('moving'), [flat])).toEqual({ y: 0, supportId: null })
  }
  for (const asset of STAGE_OBJECT_REGISTRY)
    expect(canStageStack(asset)).toBe(!/flat/.test(asset.kind))
})

test('H: tilted moving and support collision parts make contact, not dimensions.height', () => {
  const a = object('support'),
    b = object('moving')
  a.transform.rotationDegrees = { x: 20, y: 37, z: 12 }
  b.transform.rotationDegrees = { x: 90, y: 15, z: 0 }
  b.transform.position.y = stageStackPosition(b, [a])!.y
  expect(b.transform.position.y).not.toBeCloseTo(a.dimensionsMeters.height)
  expect(stageObjectsTouch(a, b)).toBe(true)
  b.transform.position.y += 0.00001
  expect(stageObjectsTouch(a, b)).toBe(false)
})

test('side contact is not support; magnetic tolerance is detection only', () => {
  const a = object('a'),
    b = object('b')
  b.transform.position.x = 1.8
  expect(stageStackPosition(b, [a])!.supportId).toBeNull()
  b.transform.position.x = 0
  b.transform.position.y = 0.2
  expect(stageMagneticHeight(b, [a], 0.12)).toBeCloseTo(0.15, 14)
  b.transform.position.y = 1
  expect(stageMagneticHeight(b, [a], 0.12)).toBe(1)
})
