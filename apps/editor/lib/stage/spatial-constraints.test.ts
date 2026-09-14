import { expect, test } from 'bun:test'
import {
  type SceneContextObject,
  type SceneContextSummary,
  stageObjectsTouch,
} from '@pascal-app/core/stage'
import { groundLanguage } from '../rehearsal-intelligence/language-grounding'
import {
  SPATIAL_RUNTIME_CONFIG,
  StageSpatialConstraintSchema,
  spatialConstraintsForProposal,
} from './spatial-constraints'
import { solveSpatialConstraints } from './spatial-solver'

export const spatialTestObject = (
  id: string,
  x: number,
  z: number,
  kind: SceneContextObject['kind'] = 'scenic-flat',
): SceneContextObject => ({
  id,
  name: kind === 'door-flat' ? '门' : id,
  kind,
  dimensionsMeters: { width: kind === 'door-flat' ? 1.4 : 2, height: 2.4, depth: 0.1 },
  transform: { position: { x, y: 0, z }, rotationDegrees: { x: 0, y: 0, z: 0 } },
})
export function spatialTestContext(count = 3): SceneContextSummary {
  return {
    documentVersion: 1,
    venue: { type: 'black-box', widthMeters: 12, depthMeters: 10, heightMeters: 5 },
    selectedObjectIds: [],
    objects: [
      spatialTestObject('a', 0, 5),
      spatialTestObject('b', -3, 3),
      spatialTestObject('c', 3, 3),
    ].slice(0, count),
  }
}
const solve = (input: string, snapshot = spatialTestContext()) => {
  const placement = groundLanguage(input, snapshot)!.placement!
  const proposal = placement.knowledgeProposal!
  return solveSpatialConstraints({
    snapshot,
    proposal,
    assets: snapshot.objects,
    constraints: spatialConstraintsForProposal(proposal),
  })
}

const semanticCases = [
  ['三块景片围一个空间', 'form_enclosure'],
  ['用三块景片围成一个空间', 'form_enclosure'],
  ['三块景片拼成U型', 'form_enclosure'],
  ['三块景片围一个空间，中间留一个入口', 'form_enclosure,leave_opening'],
  ['三块景片围一个空间，中间留一个1米宽入口', 'form_enclosure,leave_opening'],
  ['两块景片拼成直墙', 'align_edges'],
  ['把两块景片拼成一面直墙。', 'align_edges'],
  ['两块景片拐90度', 'corner_angle'],
  ['让两块景片拐成90度。', 'corner_angle'],
] as const
for (const [input, expected] of semanticCases)
  test(`Semantic Constraint Eval: ${input}`, () => {
    const snapshot = spatialTestContext(input.includes('两块') ? 2 : 3)
    const placement = groundLanguage(input, snapshot)!.placement!
    expect(
      spatialConstraintsForProposal(placement.knowledgeProposal!)
        .map((constraint) => constraint.type)
        .join(','),
    ).toBe(expected)
  })
for (const input of [
  '不要把三块景片围一个空间',
  '三块景片围一个空间还是拼成直墙',
  '景片拼起来',
  '放到左边',
])
  test(`Semantic contrast: ${input}`, () => {
    expect(groundLanguage(input, spatialTestContext())?.placement?.status).toBe('clarify')
  })
test('Semantic defaults live in runtime config, user width survives', () => {
  const a = solve('三块景片围一个空间，中间留一个入口')
  expect(a.constraints[1]!.parameters).toEqual({
    minimumWidthMeters: SPATIAL_RUNTIME_CONFIG.minimumOpeningMeters,
    widthSource: 'runtime_default',
  })
  const b = solve('三块景片围一个空间，中间留一个1米宽入口')
  expect(b.constraints[1]!.parameters).toEqual({ minimumWidthMeters: 1, widthSource: 'user' })
  expect(
    StageSpatialConstraintSchema.safeParse({ ...a.constraints[0], subjects: ['a', 'a', 'b'] })
      .success,
  ).toBe(false)
})
test('Solver: three flats form U with two exact contacts, no hierarchy mutation', () => {
  const snapshot = spatialTestContext(),
    before = JSON.stringify(snapshot)
  const solution = solve('三块景片围一个空间', snapshot)
  expect(solution.candidates.length).toBeGreaterThanOrEqual(2)
  for (const candidate of solution.candidates) {
    const [base, a, b] = candidate.plan.items
    expect(stageObjectsTouch(base!, a!)).toBe(true)
    expect(stageObjectsTouch(base!, b!)).toBe(true)
    expect(candidate.constraintsUnsatisfied).toEqual([])
  }
  expect(JSON.stringify(snapshot)).toBe(before)
})
test('Solver: opening is measured and impossible width is not adoptable', () => {
  const solution = solve('三块景片围一个空间，中间留一个入口')
  expect(solution.candidates.length).toBeGreaterThan(0)
  expect(
    solution.candidates.every((candidate) => candidate.clearanceRegions[0]!.widthMeters >= 0.8),
  ).toBe(true)
  expect(solve('三块景片围一个空间，中间留一个9米宽入口').candidates).toEqual([])
})
test('Solver: corner has two visual sides; blocked side is removed', () => {
  const snapshot = spatialTestContext(2)
  const initial = solve('两块景片拐90度', snapshot)
  expect(initial.candidates.length).toBe(2)
  const blocker = spatialTestObject('obstacle', 0, 3.9, 'neutral-block')
  blocker.dimensionsMeters = { width: 8, depth: 2, height: 2 }
  snapshot.objects.push(blocker)
  expect(solve('两块景片拐90度', snapshot).candidates.length).toBe(1)
})
test('Solver: preserve path checks the real aperture and moves an obstruction outside the corridor', () => {
  const snapshot = spatialTestContext(0)
  snapshot.objects = [
    spatialTestObject('door', 0, 7, 'door-flat'),
    spatialTestObject('box', 0, 3, 'neutral-block'),
  ]
  snapshot.objects[1]!.dimensionsMeters = { width: 0.5, depth: 0.5, height: 1 }
  const solution = solve('门口留一条通道', snapshot)
  expect(solution.constraints[0]!.type).toBe('preserve_path')
  expect(solution.candidates.length).toBe(2)
  for (const candidate of solution.candidates) {
    expect(candidate.clearanceRegions[0]!.polygon[0]![1]).toBe(0)
    expect(candidate.actions).toContainEqual({ type: 'move', subject: 'box' })
  }
  snapshot.objects[0]!.dimensionsMeters.width = 0.7
  expect(solve('门口留一条通道', snapshot).candidates).toEqual([])
})
test('Solver: invalid boundaries and provenance cannot create candidates', () => {
  const snapshot = spatialTestContext(3)
  snapshot.venue!.widthMeters = 1
  expect(solve('三块景片围一个空间', snapshot).candidates).toEqual([])
  const proposal = groundLanguage('三块景片围一个空间', snapshot)!.placement!.knowledgeProposal!
  const constraints = spatialConstraintsForProposal(proposal)
  constraints[0]!.knowledgeConceptIds = ['stage-event']
  expect(() =>
    solveSpatialConstraints({ snapshot, assets: snapshot.objects, proposal, constraints }),
  ).toThrow()
})

test('Solver: repeatable ordering, input assets and upright floor checks', () => {
  const snapshot = spatialTestContext(2)
  const proposal = groundLanguage('两块景片拐90度', snapshot)!.placement!.knowledgeProposal!
  const input = {
    snapshot,
    assets: snapshot.objects,
    proposal,
    constraints: spatialConstraintsForProposal(proposal),
  }
  expect(solveSpatialConstraints(input)).toEqual(solveSpatialConstraints(input))
  expect(() => solveSpatialConstraints({ ...input, assets: [] })).toThrow()
  snapshot.objects[0]!.transform.rotationDegrees.x = 10
  expect(solveSpatialConstraints(input).candidates).toEqual([])
  snapshot.objects[0]!.transform.rotationDegrees.x = 0
  snapshot.objects[0]!.transform.position.y = -0.1
  expect(solveSpatialConstraints(input).candidates).toEqual([])
})
