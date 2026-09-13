import { expect, test } from 'bun:test'
import type { SceneContextSummary } from '@pascal-app/core/stage'
import { groundStageAssets } from '../stage/ground-assets'
import { createStageSceneDocument } from '../theatre/simulation'
import { diaIntent } from './dia-backbone'
import { ACTIVE_DIMENSIONS } from './dimensions'
import { groundLanguage, recordGroundingCorrection } from './language-grounding'
import { localRehearsalOutput } from './local-rehearsal'
import { compileProposal } from './proposal-compiler'
import { createInteraction } from './proposal-generator'
import type { RehearsalContext } from './schema'
import { STAGE_COMMAND_CLARIFY_CASES, STAGE_COMMAND_NORMAL_CASES } from './stage-command-eval'

const context: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'proscenium', widthMeters: 12, depthMeters: 8, heightMeters: null },
  selectedObjectIds: ['table'],
  objects: [
    {
      id: 'table',
      name: '圆桌',
      kind: 'round-table',
      dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
      transform: { position: { x: -2, y: 0, z: 4 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
    {
      id: 'chair',
      name: '椅子',
      kind: 'chair',
      dimensionsMeters: { width: 0.45, height: 0.85, depth: 0.4 },
      transform: { position: { x: 2, y: 0, z: 4 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
    {
      id: 'door',
      name: '门',
      kind: 'door-flat',
      dimensionsMeters: { width: 1.3, height: 2.4, depth: 0.08 },
      transform: { position: { x: 4, y: 0, z: 5 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ],
}
function rehearsal(intention: string): RehearsalContext {
  const document = createStageSceneDocument('语言回归合成场景')
  return {
    sceneId: 'grounding-eval',
    productionId: document.production.id,
    script: '',
    intention,
    directorIntention: '',
    selectedPerformerId: null,
    venue: document.venue,
    performers: [
      { id: 'a', name: 'A', color: '#888888', position: [-2, 0, 1], facing: 0.3, visible: true },
      { id: 'b', name: 'B', color: '#aaaaaa', position: [2, 0, 1], facing: -0.3, visible: true },
    ],
    paths: [],
    durationSeconds: 20,
    obstacles: [],
    activeDimensions: [...ACTIVE_DIMENSIONS],
  }
}

test('eval inventory has 40 normal and 15 clarification/reject cases with explicit expected fields', () => {
  expect(STAGE_COMMAND_NORMAL_CASES).toHaveLength(40)
  expect(STAGE_COMMAND_CLARIFY_CASES).toHaveLength(15)
})
for (const item of [...STAGE_COMMAND_NORMAL_CASES, ...STAGE_COMMAND_CLARIFY_CASES]) {
  test(`stage grounding: ${item.input}`, () => {
    const before = structuredClone(context)
    const grounded = groundLanguage(item.input, context)
    let actual = grounded && {
      intent: grounded.intent,
      capability: grounded.capability as string,
      target: grounded.target,
      direction: grounded.direction,
      amount: grounded.amount,
      clarificationRequired: grounded.clarificationRequired,
    }
    if (item.expectedCapability === 'rehearse') {
      const input = rehearsal(item.input)
      const original = structuredClone(input)
      const output = localRehearsalOutput(input)!
      const moving = output.proposals[0]!.suggestions.find(
        (suggestion) => suggestion.movement !== 'hold',
      )!
      actual = {
        intent: 'MOVE_PERFORMER',
        capability: diaIntent(
          item.input,
          false,
          input.performers.map((performer) => performer.name),
        ),
        target: [moving.performerId, moving.targetPerformerId!],
        direction: moving.movement,
        amount: { degree: moving.extent as 'small' },
        clarificationRequired: false,
      }
      const compiled = compileProposal(
        input,
        createInteraction(input, output, 'local-eval').proposals[0]!,
      )
      expect(compiled.performers.find((actor) => actor.id === 'a')).toEqual(input.performers[0])
      expect(input).toEqual(original)
    }
    expect(actual).toEqual({
      intent: item.expectedIntent,
      capability: item.expectedCapability,
      target: item.expectedTarget,
      direction: item.expectedDirection,
      amount: item.expectedAmount,
      clarificationRequired: item.clarificationRequired,
    })
    expect(context).toEqual(before)
  })
}

test('registry resolves identity and guide dimensions, while unavailable models never become proxy proposals', () => {
  const parsed = groundLanguage('添加圆桌', context)!.plan!
  expect(parsed.items[0]).toMatchObject({
    libraryAssetId: 'SCN-TABLE-090',
    dimensionsMeters: { width: 0.9, depth: 0.9, height: 0.75 },
  })
  expect(groundStageAssets(parsed, []).items).toHaveLength(0)
  expect(groundStageAssets(parsed, []).questions[0]!.message).toContain('规范模型尚未接入')
  expect(groundStageAssets(parsed).items).toHaveLength(1)
  expect(groundStageAssets(parsed, ['SCN-TABLE-090']).items).toHaveLength(1)
  const moved = groundLanguage('圆桌往台右一点', context)!.plan!
  expect(groundStageAssets(moved).items).toHaveLength(1)
  expect(
    moved.items[0]!.transform.position.x - context.objects[0]!.transform.position.x,
  ).toBeCloseTo(0.225)
  const smallVenue = { ...context, venue: { ...context.venue!, widthMeters: 4 } }
  expect(
    groundLanguage('圆桌往台右一点', smallVenue)!.plan!.items[0]!.transform.position.x -
      context.objects[0]!.transform.position.x,
  ).toBeCloseTo(0.08)
  expect(
    groundLanguage('圆桌往台右移动30厘米', smallVenue)!.plan!.items[0]!.transform.position.x -
      context.objects[0]!.transform.position.x,
  ).toBeCloseTo(0.3)
})

test('same-kind scene references and unsupported references clarify; human corrections remain local and never train', () => {
  const duplicate = {
    ...context,
    objects: [...context.objects, { ...context.objects[0]!, id: 'table-2', name: '第二张圆桌' }],
  }
  expect(groundLanguage('桌子往台右一点', duplicate)!.clarificationRequired).toBe(true)
  expect(groundLanguage('不存在的桌子往台右一点', context)!.clarificationRequired).toBe(true)
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
  recordGroundingCorrection(storage, {
    sceneId: 'eval',
    UserInput: '圆桌往台左一点',
    DiaInterpretation: groundLanguage('圆桌往台左一点', context),
    HumanCorrection: '不是台左，是台右',
    CorrectInterpretation: { direction: 'stage-right', clarificationRequired: true },
    SceneContext: context,
  })
  const saved = JSON.parse([...data.values()][0]!)[0]
  expect(saved).toMatchObject({
    HumanCorrection: '不是台左，是台右',
    trainingAuthorized: false,
    trainingEligible: false,
    privateProjectData: true,
  })
  expect(saved.SceneContext).toEqual(context)
})
