import { expect, test } from 'bun:test'
import { parseStageText } from './parser'
import { compileStagePlan } from './plan'
import type { SceneContextSummary } from './schema'
import {
  createStageStair,
  readStageStair,
  stageStairBounds,
  updateStageStair,
} from './stage-stairs'

const context: SceneContextSummary = {
  documentVersion: 0,
  venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}

test('stage stair parameters generate three physical treads without level links', () => {
  const { stair, segment } = createStageStair({ stepCount: 3 }, 'level_test')
  expect(segment.stepCount).toBe(3)
  expect(segment.height).toBeCloseTo(0.45)
  expect(segment.length).toBeCloseTo(0.9)
  expect(stair.fromLevelId).toBeNull()
  expect(stair.toLevelId).toBeNull()
  expect(stair.slabOpeningMode).toBe('none')
  expect(stair.deckSlabId).toBeUndefined()
  const nodes = { [stair.id]: stair, [segment.id]: segment }
  const updates = updateStageStair(stair, nodes, {
    stepCount: 4,
    stepDepth: 0.4,
    rotation: Math.PI / 2,
  })
  expect(updates[1]?.data).toMatchObject({ height: 0.6, length: 1.6, stepCount: 4 })
  expect(nodes[segment.id]).toEqual(segment)
  expect(stageStairBounds(stair, nodes).boundsCenter[2]).toBeCloseTo(0.45)
  expect(readStageStair(stair, nodes).stepHeight).toBeCloseTo(0.15)
  for (const input of [
    { width: NaN },
    { stepHeight: Infinity },
    { stepCount: 0 },
    { stepCount: 1.2 },
    { position: [0, Infinity, 0] },
  ])
    expect(() => createStageStair(input, 'level_test')).toThrow()
})

test('offline stage-right three-step command keeps count through compilation', () => {
  const plan = parseStageText('在台右增加三级台阶', context)!
  expect(plan.questions).toEqual([])
  expect(plan.items[0]?.stepCount).toBe(3)
  expect(plan.items[0]?.transform.position.x).toBeCloseTo(3.1)
  const compiled = compileStagePlan(plan, context, {
    transactionId: 'stairs',
    issuedAt: '2026-09-10T00:00:00Z',
  })
  expect(compiled.ok).toBe(true)
  if (compiled.ok)
    expect(compiled.commands[0]).toMatchObject({ type: 'AddScenery', kind: 'stairs', stepCount: 3 })
  const placed = {
    ...context,
    objects: [
      {
        id: 'steps',
        name: '舞台台阶',
        kind: 'stairs' as const,
        stepCount: 3,
        dimensionsMeters: { width: 1.2, height: 0.45, depth: 0.9 },
        transform: { position: { x: 3.1, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      },
      {
        id: 'platform',
        name: '平台',
        kind: 'platform' as const,
        dimensionsMeters: { width: 2, height: 0.45, depth: 1 },
        transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      },
    ],
  }
  const moved = parseStageText('把台阶移到平台前方', placed)!
  expect(moved.questions).toEqual([])
  expect(moved.items[0]?.stepCount).toBe(3)
  expect(moved.items[0]?.transform.position.z).toBeCloseTo(1.75)
  expect(moved.items[0]?.transform.position.x).toBe(0)
})
