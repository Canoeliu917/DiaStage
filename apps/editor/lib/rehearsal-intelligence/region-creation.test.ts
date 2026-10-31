import { expect, test } from 'bun:test'
import {
  prepareStageCollision,
  type SceneContextSummary,
  stageObjectsTouch,
  stageToWorldPosition,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { planRoomEdge } from '../stage/edge-run'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { groundLanguage } from './language-grounding'

const context: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}

for (const phrase of [
  '请在舞台中前区生成一组桌椅',
  '在中前区添加一套桌椅',
  '帮我摆放一组桌椅到舞台中前区',
])
  test(`table-and-chair group: ${phrase}`, () => {
    const before = structuredClone(context)
    const result = groundLanguage(phrase, context)!
    expect(result.capability).toBe('build')
    const plan = result.plan!
    expect(plan.items.map((item) => item.libraryAssetId)).toEqual([
      'SCN-TABLE-090',
      'SCN-CHAIR-045',
      'SCN-CHAIR-045',
    ])
    expect(plan.assumptions.some(({ message }) => message.includes('一张圆桌、两把硬椅'))).toBe(
      true,
    )
    expect(plan.items[0]!.transform.position.x).toBeCloseTo(0)
    for (const item of plan.items) {
      expect(item.transform.position.z).toBeLessThan(2)
      expect(item.existingNodeId).toBeNull()
      const dims = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === item.libraryAssetId)!
        .asset.dimensions!
      expect(Object.values(item.dimensionsMeters)).toEqual(dims)
    }
    expect(validateStagePlan(plan, context).warnings).toEqual([])
    expect(context).toEqual(before)
  })

test('right-rear sofa touches the existing back scenery instead of penetrating it', () => {
  const walls = planRoomEdge('back', context.venue!).pieces.map((piece, index) => ({
    id: `wall-${index}`,
    name: piece.name,
    kind: 'scenic-flat' as const,
    dimensionsMeters: piece.dimensionsMeters,
    collisionGeometry: piece.collisionGeometry,
    transform: { position: piece.position, rotationDegrees: { x: 0, y: piece.yaw, z: 0 } },
  }))
  const result = groundLanguage('在舞台右后靠墙位置生成沙发', { ...context, objects: walls })!
  expect(result.capability).toBe('build')
  const sofa = result.plan!.items[0]!
  expect(sofa.libraryAssetId).toBe('SCN-SOFA-175')
  expect(
    stageToWorldPosition(sofa.transform.position, { origin: [0, 0, 0], depthMeters: 6 })[0],
  ).toBeGreaterThan(0)
  expect(sofa.transform.position.z).toBeGreaterThan(4)
  const back = prepareStageCollision(walls[0]!).bounds[2]![0]
  expect(back - prepareStageCollision(sofa).bounds[2]![1]).toBeCloseTo(0.001, 5)
  for (const wall of walls) expect(stageObjectsTouch(sofa, wall, true)).toBe(false)
})

test('a missing wall is disclosed and an unspecified central wall is clarified', () => {
  const result = groundLanguage('生成一张长沙发在舞台右后靠墙', context)!
  expect(result.capability).toBe('build')
  expect(result.plan!.assumptions.some(({ id }) => id === 'region-wall')).toBe(true)
  const unclear = groundLanguage('在舞台中央靠墙生成沙发', context)!
  expect(unclear.clarificationRequired).toBe(true)
  expect(unclear.plan!.items).toEqual([])
})

for (const [region, sign] of [
  ['舞台左后', 1],
  ['舞台右后', -1],
  ['观众左后', 1],
  ['观众右后', -1],
  ['台左后', -1],
  ['台右后', 1],
  ['演员左后', -1],
  ['演员右后', 1],
] as const)
  test(`audience default and explicit actor frame: ${region}`, () => {
    const result = groundLanguage(`在${region}生成沙发`, context)!
    expect(result.capability).toBe('build')
    expect(result.plan!.items[0]!.transform.position.x * sign).toBeGreaterThan(0)
  })

for (const phrase of [
  '不要在舞台中前区生成一组桌椅',
  '在舞台左后或者右后生成沙发',
  '舞台右后是最弱的位置吗？',
  '在舞台中前区生成两组桌椅',
  '在舞台右后生成沙发和人',
  '在舞台右后生成两张长沙发',
  '在舞台右后生成红色沙发',
  '在舞台右后靠左墙生成沙发',
  '在舞台左后靠右墙生成沙发',
  '在舞台中前靠后墙生成沙发',
])
  test(`does not discard a restriction or invent a group: ${phrase}`, () => {
    const result = groundLanguage(phrase, context)
    expect(result?.plan?.items.some((item) => !item.existingNodeId) ?? false).toBe(false)
  })

test('moving an existing object remains a placement operation', () => {
  const snapshot: SceneContextSummary = {
    ...context,
    objects: [
      {
        id: 'sofa',
        name: '沙发',
        kind: 'sofa',
        dimensionsMeters: { width: 1.75, height: 0.85, depth: 0.8 },
        transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      },
    ],
    selectedObjectIds: ['sofa'],
  }
  expect(groundLanguage('把沙发移到台右', snapshot)?.capability).toBe('placement')
  const created = groundLanguage('在舞台中前区生成沙发', snapshot)!
  expect(created.plan!.items[0]!.existingNodeId).toBeNull()
})

test('out-of-bounds or occupied regions ask for adjustment, preserving all existing objects', () => {
  const small = groundLanguage('在舞台中前区生成一组桌椅', {
    ...context,
    venue: { ...context.venue!, widthMeters: 2, depthMeters: 2 },
  })!
  expect(small.clarificationRequired).toBe(true)
  expect(small.plan!.items).toEqual([])
  const occupied: SceneContextSummary = {
    ...context,
    objects: [
      {
        id: 'obstacle',
        name: '已有圆桌',
        kind: 'round-table',
        dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
        transform: { position: { x: 0, y: 0, z: 1.5 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      },
    ],
  }
  const before = structuredClone(occupied)
  const result = groundLanguage('在舞台中前区生成一组桌椅', occupied)!
  expect(result.clarificationRequired).toBe(true)
  expect(result.plan!.items).toEqual([])
  expect(occupied).toEqual(before)
})
