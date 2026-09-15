import { expect, test } from 'bun:test'
import type { SceneContextSummary } from '@pascal-app/core/stage'
import { createCompoundStagePlan, isCompoundStageRequest } from './compound-stage'

const context: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}

test('compound stage grammar accepts the bounded request and a paraphrase', () => {
  for (const input of [
    '生成一个有三帘景片和二帘景片联合搭成的舞台，舞台中有桌子椅子沙发',
    '用三联景片、二联景片、桌子、椅子和沙发布置一个舞台',
    '给我搭一套三联加二联景片的布景，再放一张桌子、一把椅子和一个沙发',
  ])
    expect(isCompoundStageRequest(input), input).toBe(true)
})

test('compound stage grammar does not silently drop counts, extra assets, or ambiguity', () => {
  for (const input of [
    '用三联景片、二联景片、桌子、两把椅子和沙发布置一个舞台',
    '生成三联景片、二联景片、桌子、椅子、沙发和门景片',
    '生成三联景片、桌子、椅子和沙发',
    '用折叠景片搭个有桌椅的舞台',
  ])
    expect(isCompoundStageRequest(input), input).toBe(false)
})

test('compound stage plan has exactly five grounded assets and a collision-free layout', () => {
  const plan = createCompoundStagePlan(context)
  expect(plan.items.map((item) => item.libraryAssetId)).toEqual([
    'SCN-FOLD-03',
    'SCN-FOLD-02',
    'SCN-TABLE-090',
    'SCN-CHAIR-045',
    'SCN-SOFA-175',
  ])
  expect(plan.assumptions).toHaveLength(2)
  expect(plan.warnings).toEqual([])
})

test('compound stage plan fails closed when no safe stage exists', () => {
  expect(() =>
    createCompoundStagePlan({
      ...context,
      venue: { type: 'black-box', widthMeters: 2, depthMeters: 2, heightMeters: 4 },
    }),
  ).toThrow(/超出台面|没有合法布局/)
})
