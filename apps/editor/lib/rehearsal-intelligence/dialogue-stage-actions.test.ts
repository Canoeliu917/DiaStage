import { expect, test } from 'bun:test'
import {
  compileStagePlan,
  prepareStageCollision,
  type SceneContextObject,
  type SceneContextSummary,
  stageObjectsTouch,
  stageToWorldPosition,
} from '@pascal-app/core/stage'
import { planRoomEdge } from '../stage/edge-run'
import { AVAILABLE_STAGE_SCENERY, stagePropCollisionGeometry } from '../stage/prop-assets'
import {
  assertDialogueSupports,
  buildDialogueStagePlan,
  type DialogueStageAction,
  DialogueStageActionSchema,
} from './dialogue-stage-actions'

const empty: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'black-box', widthMeters: 12, depthMeters: 8, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}
const creation: DialogueStageAction = {
  mode: 'create',
  assetIds: ['SCN-TABLE-090', 'SCN-CHAIR-045', 'SCN-CHAIR-045'],
  objectIds: [],
  region: 'front-center',
  wall: null,
  direction: null,
  distanceMeters: null,
}
function native(id: string, assetId: string, x: number, z: number): SceneContextObject {
  const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)!
  const [width, height, depth] = source.asset.dimensions!
  const dimensionsMeters = { width, height, depth }
  return {
    id,
    name: source.asset.name,
    kind: source.kind,
    dimensionsMeters,
    collisionGeometry: stagePropCollisionGeometry(assetId, dimensionsMeters),
    transform: { position: { x, y: 0, z }, rotationDegrees: { x: 0, y: 180, z: 0 } },
  }
}
function furniture(): SceneContextSummary {
  return {
    ...empty,
    objects: [
      native('table', 'SCN-TABLE-090', 0, 2),
      native('chair-a', 'SCN-CHAIR-045', -1, 2),
      native('chair-b', 'SCN-CHAIR-045', 1, 2),
    ],
  }
}
const move: DialogueStageAction = {
  mode: 'translate',
  assetIds: [],
  objectIds: ['table', 'chair-a', 'chair-b'],
  region: null,
  wall: null,
  direction: 'audience-right',
  distanceMeters: 0.5,
}

test('creates one native table and two inward-facing chairs without mutating or adopting', () => {
  const before = JSON.stringify(empty)
  const plan = buildDialogueStagePlan(creation, empty)
  expect(plan.items.map((item) => item.libraryAssetId)).toEqual(creation.assetIds)
  expect(new Set(plan.items.map((item) => item.proposalId)).size).toBe(3)
  expect(plan.items.every((item) => item.existingNodeId === null)).toBe(true)
  expect(plan.assumptions).toHaveLength(1)
  for (const [index, item] of plan.items.entries()) {
    expect(prepareStageCollision(item).bounds[1]![0]).toBeCloseTo(0, 8)
    expect(item.transform.position.z).toBeLessThan(empty.venue!.depthMeters / 3)
    const asset = AVAILABLE_STAGE_SCENERY.find(
      ({ asset }) => asset.id === item.libraryAssetId,
    )!.asset
    expect(Object.values(item.dimensionsMeters)).toEqual(asset.dimensions!)
    for (const other of plan.items.slice(index + 1))
      expect(stageObjectsTouch(item, other, true)).toBe(false)
  }
  expect(plan.items[1]!.transform.rotationDegrees.y).toBe(90)
  expect(plan.items[2]!.transform.rotationDegrees.y).toBe(-90)
  expect(JSON.stringify(empty)).toBe(before)
  const compiled = compileStagePlan(plan, empty, {
    transactionId: 'new-furniture',
    issuedAt: new Date().toISOString(),
  })
  expect(compiled.ok).toBe(true)
  expect(compiled.commands.map((command) => command.type)).toEqual([
    'AddScenery',
    'AddScenery',
    'AddScenery',
  ])
})

test('asset order does not change the table-and-two-chairs composition', () => {
  const plan = buildDialogueStagePlan(
    { ...creation, assetIds: ['SCN-CHAIR-045', 'SCN-TABLE-090', 'SCN-CHAIR-045'] },
    empty,
  )
  const table = plan.items.find((item) => item.kind === 'round-table')!
  expect(table.transform.position.x).toBeCloseTo(0)
  for (const chair of plan.items.filter((item) => item.kind === 'chair'))
    expect(stageObjectsTouch(table, chair, true)).toBe(false)
})

test('a requested rear window stays a native window, while generic chairs are separated', () => {
  const window = buildDialogueStagePlan(
    { ...creation, assetIds: ['SCN-WIN-130'], region: 'rear-center' },
    empty,
  ).items[0]!
  expect(window.kind).toBe('window-flat')
  expect(window.transform.position.z).toBeGreaterThan((empty.venue!.depthMeters * 2) / 3)
  const chairs = buildDialogueStagePlan(
    { ...creation, assetIds: ['SCN-CHAIR-045', 'SCN-CHAIR-050'] },
    empty,
  ).items
  expect(stageObjectsTouch(chairs[0]!, chairs[1]!, true)).toBe(false)
})

test('translation preserves every identity, pairwise offset, rotation and dimension', () => {
  const context = furniture()
  context.objects[1]!.transform.rotationDegrees.y = 35
  const before = JSON.stringify(context)
  const plan = buildDialogueStagePlan(move, context)
  expect(plan.items.map((item) => item.existingNodeId)).toEqual(move.objectIds)
  for (const [index, item] of plan.items.entries()) {
    const previous = context.objects[index]!
    expect(item.transform.position.x).toBeCloseTo(previous.transform.position.x - 0.5)
    expect(item.transform.position.z).toBe(previous.transform.position.z)
    expect(item.transform.rotationDegrees).toEqual(previous.transform.rotationDegrees)
    expect(item.dimensionsMeters).toEqual(previous.dimensionsMeters)
    expect(item.collisionGeometry).toEqual(previous.collisionGeometry)
    expect(item.libraryAssetId).toBeNull()
  }
  expect(JSON.stringify(context)).toBe(before)
  const compiled = compileStagePlan(plan, context, {
    transactionId: 'move-group',
    issuedAt: new Date().toISOString(),
  })
  expect(compiled.ok).toBe(true)
  expect(
    compiled.commands.some((command) => ['AddScenery', 'ReplaceScenery'].includes(command.type)),
  ).toBe(false)
})

for (const [direction, axis, sign] of [
  ['audience-left', 'x', 1],
  ['audience-right', 'x', -1],
  ['upstage', 'z', 1],
  ['downstage', 'z', -1],
] as const)
  test(`translation direction ${direction} uses the domain coordinate frame`, () => {
    const context = furniture()
    const plan = buildDialogueStagePlan({ ...move, direction }, context)
    expect(
      plan.items[0]!.transform.position[axis] - context.objects[0]!.transform.position[axis],
    ).toBeCloseTo(sign * 0.5)
    if (axis === 'x') {
      const world = stageToWorldPosition(plan.items[0]!.transform.position, {
        origin: [0, 0, 0],
        depthMeters: 8,
      })
      expect(world[0]! * sign).toBeLessThan(0)
    }
  })

test('relocate is a rigid group move and never creates duplicates', () => {
  const context = furniture()
  const plan = buildDialogueStagePlan(
    { ...move, mode: 'relocate', region: 'rear-left', direction: null, distanceMeters: null },
    context,
  )
  expect(plan.items[0]!.transform.position.x).toBeGreaterThan(0)
  expect(plan.items[0]!.transform.position.z).toBeGreaterThan(5)
  for (let index = 1; index < plan.items.length; index++) {
    expect(
      plan.items[index]!.transform.position.x - plan.items[0]!.transform.position.x,
    ).toBeCloseTo(
      context.objects[index]!.transform.position.x - context.objects[0]!.transform.position.x,
    )
    expect(
      plan.items[index]!.transform.position.z - plan.items[0]!.transform.position.z,
    ).toBeCloseTo(
      context.objects[index]!.transform.position.z - context.objects[0]!.transform.position.z,
    )
  }
})

test('rear sofa contacts an existing wall face and missing walls require clarification', () => {
  const context: SceneContextSummary = {
    ...empty,
    objects: planRoomEdge('back', empty.venue!).pieces.map((piece, index) => ({
      id: `wall-${index}`,
      name: piece.name,
      kind: 'scenic-flat',
      dimensionsMeters: piece.dimensionsMeters,
      collisionGeometry: piece.collisionGeometry,
      transform: { position: piece.position, rotationDegrees: { x: 0, y: piece.yaw, z: 0 } },
    })),
  }
  const action = { ...creation, assetIds: ['SCN-SOFA-175'], region: 'rear-right', wall: 'back' }
  const sofa = buildDialogueStagePlan(action, context).items[0]!
  expect(sofa.transform.position.x).toBeLessThan(0)
  expect(
    prepareStageCollision(context.objects[0]!).bounds[2]![0] -
      prepareStageCollision(sofa).bounds[2]![1],
  ).toBeCloseTo(0.001, 6)
  for (const wall of context.objects) expect(stageObjectsTouch(sofa, wall, true)).toBe(false)
  expect(() => buildDialogueStagePlan(action, empty)).toThrow('没有可确认的现有墙片')
})

test('collisions and complete-footprint boundary failures stop rather than move other objects', () => {
  const context = furniture()
  const before = JSON.stringify(context)
  expect(() =>
    buildDialogueStagePlan(
      { ...move, objectIds: ['chair-a'], direction: 'audience-left', distanceMeters: 1 },
      context,
    ),
  ).toThrow('穿插')
  expect(() => buildDialogueStagePlan({ ...move, distanceMeters: 10 }, context)).toThrow('超出')
  expect(() =>
    buildDialogueStagePlan(creation, { ...empty, venue: { ...empty.venue!, widthMeters: 1 } }),
  ).toThrow('超出')
  expect(JSON.stringify(context)).toBe(before)
})

test('a raised chair cannot leave its support, while its complete supported group can move', () => {
  const platform = native('platform', 'SCN-RISER-01', 0, 3)
  const chair = native('chair', 'SCN-CHAIR-045', 0, 3)
  chair.transform.position.y = 0.15
  const context = { ...empty, objects: [platform, chair] }
  expect(() =>
    buildDialogueStagePlan({ ...move, objectIds: ['chair'], distanceMeters: 2 }, context),
  ).toThrow('缺少接触支撑')
  const plan = buildDialogueStagePlan({ ...move, objectIds: ['platform', 'chair'] }, context)
  expect(plan.items.map((item) => item.transform.position.y)).toEqual([0, 0.15])
  expect(plan.items.map((item) => item.transform.position.x)).toEqual([-0.5, -0.5])
  expect(() => assertDialogueSupports(plan.items, context)).not.toThrow()
  const floatingLocalCandidate = structuredClone(
    plan.items.filter((item) => item.existingNodeId === 'chair'),
  )
  floatingLocalCandidate[0]!.transform.position.x = 2
  expect(() => assertDialogueSupports(floatingLocalCandidate, context)).toThrow('缺少接触支撑')
})

test('mode confusion, duplicate/missing references, absent dimensions and unknown assets fail closed', () => {
  const context = furniture()
  for (const action of [
    { ...creation, objectIds: ['table'] },
    { ...move, assetIds: ['SCN-TABLE-090'] },
    { ...move, objectIds: [] },
    { ...move, objectIds: ['table', 'table'] },
    { ...move, objectIds: ['missing'] },
    { ...move, distanceMeters: null },
    { ...move, region: 'center' },
    { ...creation, region: null },
    { ...creation, wall: 'left', region: 'rear-right' },
  ])
    expect(() => buildDialogueStagePlan(action, context)).toThrow()
  expect(() =>
    buildDialogueStagePlan(move, {
      ...context,
      objects: [...context.objects, context.objects[0]!],
    }),
  ).toThrow('没有唯一')
  expect(() => buildDialogueStagePlan(creation, { ...empty, venue: null })).toThrow(
    '舞台宽度和深度',
  )
  expect(
    DialogueStageActionSchema.safeParse({ ...creation, assetIds: ['PROFESSIONAL-PIANO'] }).success,
  ).toBe(false)
  expect(DialogueStageActionSchema.safeParse({ ...creation, position: [0, 0, 0] }).success).toBe(
    false,
  )
})
