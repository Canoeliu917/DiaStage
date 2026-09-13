import { expect, test } from 'bun:test'
import {
  resolveStageObjectSpecs,
  STAGE_OBJECT_CATEGORIES,
  STAGE_OBJECT_REGISTRY,
} from './object-registry'

test('guide catalog has 22 stable identities in the six source categories', () => {
  expect(STAGE_OBJECT_REGISTRY).toHaveLength(22)
  expect(new Set(STAGE_OBJECT_REGISTRY.map((spec) => spec.canonicalId)).size).toBe(22)
  expect(
    STAGE_OBJECT_CATEGORIES.map(
      (category) => STAGE_OBJECT_REGISTRY.filter((entry) => entry.category === category).length,
    ),
  ).toEqual([3, 4, 5, 2, 4, 4])
})

test('approved dimensions remain meters at 1:1 and folded extents are not guessed', () => {
  expect(resolveStageObjectSpecs('SCN-TABLE-090')[0]!.defaultDimensions).toEqual({
    width: 0.9,
    height: 0.75,
    depth: 0.9,
  })
  expect(resolveStageObjectSpecs('SCN-STOOL-035')[0]!.defaultDimensions).toEqual({
    width: 0.35,
    height: 0.42,
    depth: 0.25,
  })
  expect(resolveStageObjectSpecs('SCN-RISER-01')[0]!.defaultDimensions).toEqual({
    width: 1.8,
    height: 0.15,
    depth: 0.9,
  })
  for (const id of ['SCN-FOLD-02', 'SCN-FOLD-03'])
    expect(resolveStageObjectSpecs(id)[0]!.defaultDimensions).toBeNull()
  expect(STAGE_OBJECT_REGISTRY.every((spec) => spec.allowedDimensionRange === null)).toBe(true)
})

test('generic categories retain alternatives instead of inventing a default object', () => {
  expect(resolveStageObjectSpecs('桌子')).toHaveLength(4)
  expect(resolveStageObjectSpecs('椅子')).toHaveLength(2)
  expect(resolveStageObjectSpecs('凳子')).toHaveLength(2)
  expect(resolveStageObjectSpecs('沙发')).toHaveLength(2)
  expect(resolveStageObjectSpecs('门')).toHaveLength(2)
  expect(resolveStageObjectSpecs('窗')).toHaveLength(2)
  expect(resolveStageObjectSpecs('台块')).toHaveLength(3)
})

test('manifest instance extents remain separate from panel and frame specifications', () => {
  const folded = resolveStageObjectSpecs('二帘组合')[0]!
  expect(folded.defaultDimensions).toBeNull()
  expect(folded.sourceDimensions).toBe('单片宽0.90m')
  expect(folded.modelDimensions).toEqual({ width: 0.92, height: 2.4, depth: 0.92 })
  expect(resolveStageObjectSpecs('三帘组合')[0]!.modelDimensions!.depth).toBeCloseTo(0.94)
  const door = resolveStageObjectSpecs('单门景片')[0]!
  expect(door.defaultDimensions!.depth).toBe(0.08)
  expect(door.modelDimensions!.depth).toBeCloseTo(0.48669697251359767)
  expect(door.supplementalDimensions).toContain('manifest门厚0.035m')
  expect(door.modelDimensionsSource).toContain('prop-menu-manifest.json')
})
