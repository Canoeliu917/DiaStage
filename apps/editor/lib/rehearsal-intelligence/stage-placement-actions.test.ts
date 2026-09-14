import { expect, test } from 'bun:test'
import type { SceneContextSummary } from '@pascal-app/core/stage'
import { groundLanguage } from './language-grounding'
import { mapStagePlacementIntent } from './stage-placement-actions'
import { parseStagePlacementIntent } from './stage-placement-intents'

const context: SceneContextSummary = {
  documentVersion: 7,
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 3 },
  selectedObjectIds: ['chair'],
  objects: [
    { id: 'chair', name: '椅子', kind: 'chair' as const },
    { id: 'table', name: '桌子', kind: 'table' as const },
    { id: 'riser', name: '台块', kind: 'platform' as const },
    { id: 'door', name: '门', kind: 'door-flat' as const },
  ].map((object) => ({
    ...object,
    dimensionsMeters: { width: 1, depth: 1, height: 1 },
    transform: { position: { x: 0, y: 0, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  })),
}
const map = (text: string, input = context) =>
  mapStagePlacementIntent(parseStagePlacementIntent(text)!, input)

test('stage and audience left keep opposite frames rather than a shared XYZ', () => {
  const stage = map('椅子放到台左'),
    audience = map('椅子放到观众左')
  expect(stage.actions).toEqual([
    { type: 'place_in_region', subjectId: 'chair', region: 'left', frame: 'stage' },
  ])
  expect(audience.actions).toEqual([
    { type: 'place_in_region', subjectId: 'chair', region: 'left', frame: 'audience' },
  ])
})
test('relative move keeps stated decimal distance and does not default a small amount', () => {
  expect(map('按观众方向把椅子往左移0.25米').actions).toEqual([
    {
      type: 'move_relative',
      subjectId: 'chair',
      direction: 'left',
      frame: 'audience',
      amountMeters: 0.25,
    },
  ])
  expect(map('按舞台方向往右一点').actions).toEqual([
    { type: 'move_relative', subjectId: 'chair', direction: 'right', frame: 'stage' },
  ])
  expect(map('往左一点').status).toBe('clarify')
  expect(map('往左一点').actions).toEqual([])
})
test('object side is a resolved relation, not a region or object local rotation', () => {
  expect(map('按舞台方向把椅子放在桌子左边').actions).toEqual([
    { type: 'place_beside', subjectId: 'chair', targetId: 'table', side: 'left', frame: 'stage' },
  ])
})
for (const [text, type, targetId] of [
  ['靠近桌子', 'place_near', 'table'],
  ['紧贴桌子', 'place_flush', 'table'],
  ['放在台块上', 'place_on', 'riser'],
  ['叠在台块上', 'stack_on', 'riser'],
  ['放在台块上面', 'place_on', 'riser'],
])
  test(`action mapping: ${text}`, () => {
    expect(map(text!).actions).toEqual([{ type, subjectId: 'chair', targetId }])
  })
test('align requires multiple resolved subjects and an explicit axis', () => {
  const selected = { ...context, selectedObjectIds: ['chair', 'table'] }
  expect(map('选中的物件沿纵向对齐', selected).actions).toEqual([
    { type: 'align', subjectIds: ['chair', 'table'], axis: 'z' },
  ])
  expect(map('选中的物件沿纵向对齐').status).toBe('clarify')
  expect(map('对齐', selected).actions).toEqual([])
})
test('clearance and entrance requirements are constraints, not guessed moves', () => {
  expect(map('中间留空').actions).toEqual([{ type: 'preserve_clearance', region: 'center' }])
  expect(map('门口留出1米通道').actions).toEqual([
    { type: 'preserve_path', targetId: 'door', amountMeters: 1 },
  ])
})
test('missing, multiple and self references never fabricate an ID', () => {
  expect(map('不存在的椅子放在台块上').actions).toEqual([])
  expect(map('桌子放在桌子上').actions).toEqual([])
  expect(map('放在台块上', { ...context, selectedObjectIds: [] }).actions).toEqual([])
  const multiple = {
    ...context,
    objects: [...context.objects, { ...context.objects[2]!, id: 'riser-2' }],
  }
  expect(map('椅子放在台块上', multiple).actions).toEqual([])
  expect(
    map('椅子放在台块上', { ...multiple, selectedObjectIds: ['riser-2'] }).actions[0],
  ).toMatchObject({ targetId: 'riser-2' })
})
test('negative, alternative, unknown support and combined inputs have no partial actions', () => {
  for (const input of [
    '不要把椅子贴着桌子',
    '放在上面',
    '叠在上面',
    '把椅子靠近桌子再叠上去',
    '台左还是观众左',
  ]) {
    expect(map(input).status).toBe('clarify')
    expect(map(input).actions).toEqual([])
  }
})
test('grounding returns proposal only, never an old computed StagePlan', () => {
  const before = structuredClone(context)
  const result = groundLanguage('把椅子叠在台块上', context)!
  expect(result.plan).toBeUndefined()
  expect(result.placement).toMatchObject({
    status: 'proposal',
    documentVersion: 7,
    requiresHumanConfirm: true,
  })
  expect(JSON.stringify(result.placement)).not.toMatch(/"(?:position|rotation|transform|xyz)"\s*:/i)
  expect(context).toEqual(before)
})
test('camera and unrelated creation/move paths do not enter placement grammar', () => {
  expect(groundLanguage('从上面看一下', context)?.placement).toBeUndefined()
  for (const text of ['给我一张圆桌，两把椅子', '圆桌往台左移动30厘米', '椅子旋转45度'])
    expect(parseStagePlacementIntent(text)).toBeNull()
})
test('asset names containing 台 are subjects, not stage-direction qualifiers', () => {
  expect(parseStagePlacementIntent('一号台块往左一点')).toMatchObject({
    kind: 'relative_left',
    subject: '一号台块',
    frame: 'unspecified',
  })
  expect(parseStagePlacementIntent('台块往台左移动30厘米')).toBeNull()
})
