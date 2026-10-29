import { groundStageAssets } from '../stage/ground-assets'
import { createCompoundStagePlan, isCompoundStageRequest } from './compound-stage'
import type { DiaDialogueResult } from './dialogue-schema'
import { DiaDialogueRequestSchema } from './dialogue-schema'
import { groundLanguage } from './language-grounding'
import { emptyGrounding, parseOpenLanguage } from './open-language'

export function dialogueTestRequest(init?: RequestInit) {
  return DiaDialogueRequestSchema.parse(JSON.parse(String(init?.body)))
}

// Deterministic fixtures for controller contracts, never evidence of live-model quality.
export function dialogueTestResponse(
  request: ReturnType<typeof dialogueTestRequest>,
  overrides: Partial<DiaDialogueResult> = {},
) {
  const local = groundLanguage(request.rawUtterance, request.sceneContext)
  const plan = isCompoundStageRequest(request.rawUtterance)
    ? createCompoundStagePlan(request.sceneContext)
    : local?.capability === 'build' && local.plan
      ? groundStageAssets(local.plan)
      : null
  const grounding =
    plan || local?.view
      ? null
      : (parseOpenLanguage(request.rawUtterance) ?? {
          ...emptyGrounding(request.rawUtterance),
          requiresClarification: true,
          ambiguities: [local?.clarification ?? '请明确要操作的对象与要求。'],
        })
  return Response.json({
    requestId: crypto.randomUUID(),
    sceneVersion: request.sceneVersion,
    reply:
      local?.clarification ??
      (grounding?.requiresClarification
        ? `需要澄清：${grounding.ambiguities.join('；')}`
        : local?.view
          ? '已调整观察视角，舞台物品保持原位。'
          : '已提供 Stage Proposal，先预览再采用。'),
    provider: 'aliyun',
    model: 'mock-provider-not-live',
    plan,
    grounding,
    localView: !!local?.view,
    ...overrides,
  })
}
