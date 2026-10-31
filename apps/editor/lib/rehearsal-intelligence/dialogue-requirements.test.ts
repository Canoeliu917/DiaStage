import { expect, test } from 'bun:test'
import type { SceneContextSummary, StagePlan } from '@pascal-app/core/stage'
import { extractDialogueRequirements } from './dialogue-requirements'
import { buildDialogueStagePlan } from './dialogue-stage-actions'

const empty: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'black-box', widthMeters: 12, depthMeters: 8, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}
const plan = buildDialogueStagePlan(
  {
    mode: 'create',
    assetIds: ['SCN-TABLE-090', 'SCN-CHAIR-045', 'SCN-CHAIR-045'],
    objectIds: [],
    region: 'front-center',
    wall: null,
    direction: null,
    distanceMeters: null,
  },
  empty,
)
const ids = plan.items.map((item) => item.proposalId)
function context(
  selected: string[] = [],
  last: string[] = [],
  pendingPlan: StagePlan | null = null,
) {
  const planning: SceneContextSummary = {
    ...empty,
    objects: plan.items.map((item) => ({
      id: item.proposalId,
      name: item.displayName,
      kind: item.kind,
      dimensionsMeters: item.dimensionsMeters,
      transform: item.transform,
    })),
    selectedObjectIds: selected,
  }
  return {
    planning,
    pendingPlan,
    openContext: { lastReferencedIds: last },
  }
}

test('wall requirements preserve requested audience and actor coordinates before model output', () => {
  for (const [text, wall, wallRegion] of [
    ['在舞台右后靠墙位置生成沙发', 'back', 'rear-right'],
    ['把沙发搬到观众左边的后区，靠后面的墙', 'back', 'rear-left'],
    ['把沙发放到台左后区靠后墙', 'back', 'rear-right'],
    ['把沙发摆到演员右侧，贴右墙', 'left', null],
    ['沙发贴着观众右墙', 'right', null],
    ['把沙发靠后墙摆放', 'back', null],
  ]) {
    expect(extractDialogueRequirements(text!, context())).toMatchObject({
      wall,
      wallRegion,
      clarification: null,
    })
  }
})

test('wall uncertainty, conflicting walls and front boundary are not invented as contact', () => {
  for (const text of ['沙发靠墙放', '沙发靠前墙', '沙发靠左墙，同时靠右墙'])
    expect(extractDialogueRequirements(text, context()).clarification).toContain('哪面现有墙片')
  expect(extractDialogueRequirements('不要靠左墙，改为靠右墙摆放', context())).toMatchObject({
    wall: 'right',
  })
})

test('negated requirements and theory questions do not request those actions', () => {
  for (const text of [
    '沙发不要靠墙',
    '沙发不靠墙',
    '不需要通道',
    '不用预留通道',
    '不要留通道',
    '别整组动，只把沙发向前移',
    '整组不要移动，只把沙发向前移',
    '解释一下整组向右平移是什么意思',
    '靠墙摆放是什么意思？',
    '怎么保留门前通道？',
  ]) {
    expect(extractDialogueRequirements(text, context(ids))).toEqual({
      wall: null,
      wallRegion: null,
      groupObjectIds: null,
      preservePath: false,
      clarification: null,
    })
  }
})

test('passage negation prevents blocking a route rather than negating route protection', () => {
  for (const text of [
    '在中前区放一套桌椅，但别挡住现有单门前的通道',
    '门口留一条通道',
    '把桌椅向右挪，避开门前通道',
    '不要堵住过道',
  ])
    expect(extractDialogueRequirements(text, context()).preservePath).toBe(true)
})

test('whole-group identities come from pending, then selection, then recent reference', () => {
  const text = '整组向观众右侧挪0.5米，桌椅之间距离不变'
  const pending = context(ids.slice(0, 2), ids.slice(1), plan)
  const before = JSON.stringify(pending)
  expect(extractDialogueRequirements(text, pending).groupObjectIds).toEqual(ids)
  expect(
    extractDialogueRequirements(text, context(ids.slice(0, 2), ids.slice(1))).groupObjectIds,
  ).toEqual(ids.slice(0, 2))
  expect(extractDialogueRequirements('桌椅一起向后移动', context([], ids)).groupObjectIds).toEqual(
    ids,
  )
  expect(JSON.stringify(pending)).toBe(before)
})

test('a group cannot silently lose stale members or invent a selection', () => {
  for (const current of [
    context(),
    context([ids[0]!]),
    context([ids[0]!, 'missing']),
    context([ids[0]!, ids[0]!]),
  ]) {
    const result = extractDialogueRequirements('整组往台后移动', current)
    expect(result.groupObjectIds).toBeNull()
    expect(result.clarification).toContain('哪些物件')
  }
  expect(extractDialogueRequirements('生成一组桌椅', context()).groupObjectIds).toBeNull()
  expect(extractDialogueRequirements('只把桌子向右移', context(ids)).groupObjectIds).toBeNull()
})
