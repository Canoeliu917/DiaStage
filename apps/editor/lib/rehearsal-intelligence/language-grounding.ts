import {
  type ClarificationAnswer,
  parseStageLength,
  parseStageNumber,
  parseStageText,
  type SceneContextSummary,
  type StagePlan,
} from '@pascal-app/core/stage'
import { betaCapabilityNotice } from '../beta-capabilities'
import { VERTICAL_VIEW_QUESTION } from './camera-intents'
import { parseViewCommand, type ViewCommand } from './view-commands'

export type GroundedInput = {
  intent: string
  capability: 'build' | 'view' | 'clarify' | 'unsupported'
  target: string[]
  direction: string | null
  amount: { degree: 'exact' | 'small'; meters?: number; degrees?: number } | null
  clarificationRequired: boolean
  clarification: string | null
  normalizedInput: string
  plan?: StagePlan
  view?: ViewCommand
}

export function groundLanguage(
  input: string,
  context: SceneContextSummary,
  priorAnswers: ClarificationAnswer[] = [],
): GroundedInput | null {
  const text = input
    .normalize('NFKC')
    .trim()
    .replace(/^(?:不对[，,。]?\s*|纠正[：:]\s*)/, '')
    .replace(/^不是.+?[，,]\s*(?:而)?是/, '')
  const base = {
    target: [] as string[],
    direction: null,
    amount: null,
    normalizedInput: text,
    clarificationRequired: false,
    clarification: null,
  }
  const notice = betaCapabilityNotice(text)
  if (notice)
    return {
      ...base,
      intent: 'UNSUPPORTED',
      capability: 'unsupported',
      clarificationRequired: true,
      clarification: notice,
    }
  const view = parseViewCommand(text)
  if (view?.type === 'CAMERA_INTENT')
    return {
      ...base,
      intent: view.intents.join('+'),
      capability: view.clarify ? 'clarify' : 'view',
      view,
      target: view.target ? [view.target] : [],
      clarificationRequired: view.clarify,
      clarification: view.clarify ? VERTICAL_VIEW_QUESTION : null,
    }
  if (view)
    return {
      ...base,
      intent: view.type,
      capability: 'view',
      view,
      target:
        view.type === 'FRAME_SELECTION'
          ? context.selectedObjectIds
          : 'name' in view
            ? [view.name]
            : [],
      direction: 'direction' in view ? view.direction : 'view' in view ? view.view : null,
      amount:
        'degrees' in view
          ? { degree: /一点|稍微|小幅|一下/.test(text) ? 'small' : 'exact', degrees: view.degrees }
          : 'meters' in view
            ? view.meters === null
              ? { degree: 'small' }
              : { degree: 'exact', meters: view.meters }
            : 'factor' in view
              ? { degree: 'small' }
              : null,
      clarificationRequired:
        view.type === 'FRAME_SELECTION' && context.selectedObjectIds.length !== 1,
      clarification:
        view.type === 'FRAME_SELECTION' && context.selectedObjectIds.length !== 1
          ? '请先选中一个要观察的物品。'
          : null,
    }
  if (
    /视角|观察位|镜头/.test(text) ||
    /^(?:台左|台右|台前|台后)[。！!？?]?$/.test(text) ||
    /^(?:请)?(?:转一下|转一点|挪一下|挪一点|那个挪过去|这(?:里|块)松一点|按昨天(?:的)?感觉|照昨天那样|弄得?(?:更有戏|舒服)(?:一点)?)[。！!？?]?$/.test(
      text,
    )
  )
    return {
      ...base,
      intent: 'CLARIFY',
      capability: 'clarify',
      clarificationRequired: true,
      clarification: '请明确要调整视角还是舞台物品，并说明对象、方向和幅度。',
    }
  const normalizedInput = text
    .replace(
      /(?:往|向)(台左|台右|台前|台后)(稍微|小幅)(?:移动|挪动|移|挪)?(?:一点)?/g,
      '向$1移一点',
    )
    .replace(
      /(台左|台右|台前|台后)(?=[零〇一二两三四五六七八九十百千万半\d]+(?:厘米|公分|毫米|米|cm|mm|m))/g,
      '$1移',
    )
  const plan = parseStageText(normalizedInput, context, priorAnswers)
  if (!plan) return null
  if (plan.questions.length)
    return {
      ...base,
      normalizedInput,
      plan,
      intent: 'CLARIFY',
      capability: 'clarify',
      clarificationRequired: true,
      clarification: plan.questions.map((question) => question.message).join('；'),
    }
  const moving = plan.items.filter((item) => item.existingNodeId)
  const rotation = /旋转|转动|转.*(?:度|°)/.test(text)
  const angle = text.match(
    /([+-]?(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万点半]+))(?:度|°)/,
  )?.[1]
  const direction = text.match(/台左|台右|台前|台后/)?.[0]
  const length = text.match(
    /[+-]?(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万点半]+)(?:毫米|mm|厘米|公分|cm|米|m)(?:半)?/,
  )?.[0]
  return {
    ...base,
    normalizedInput,
    plan,
    capability: 'build',
    intent: moving.length
      ? rotation
        ? 'ROTATE_SCENERY'
        : 'MOVE_SCENERY'
      : plan.venue
        ? 'SET_VENUE'
        : 'ADD_SCENERY',
    target: plan.items.map(
      (item) => item.existingNodeId ?? item.libraryAssetId ?? item.displayName,
    ),
    direction: direction
      ? ({ 台左: 'stage-left', 台右: 'stage-right', 台前: 'downstage', 台后: 'upstage' } as const)[
          direction as '台左'
        ]
      : /台中|中区|舞台中央/.test(text)
        ? 'center'
        : null,
    amount: /一点|稍微|小幅/.test(text)
      ? { degree: 'small' }
      : angle
        ? { degree: 'exact', degrees: parseStageNumber(angle)! }
        : length
          ? { degree: 'exact', meters: parseStageLength(length)! }
          : null,
    clarificationRequired: plan.questions.length > 0,
    clarification: plan.questions.map((question) => question.message).join('；') || null,
  }
}

export function recordGroundingCorrection(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  record: {
    sceneId: string
    UserInput: string
    DiaInterpretation: unknown
    HumanCorrection: string
    CorrectInterpretation: unknown
    SceneContext: SceneContextSummary
  },
) {
  const key = `diastage:grounding-corrections:v1:${record.sceneId}`
  const previous: unknown = JSON.parse(storage.getItem(key) ?? '[]')
  if (!Array.isArray(previous)) throw new Error('本机纠正记录格式有误，请保留原记录。')
  storage.setItem(
    key,
    JSON.stringify([
      ...previous,
      {
        ...record,
        createdAt: new Date().toISOString(),
        privateProjectData: true,
        trainingAuthorized: false,
        trainingEligible: false,
      },
    ]),
  )
}
