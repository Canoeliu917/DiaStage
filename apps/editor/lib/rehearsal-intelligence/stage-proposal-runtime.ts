import {
  type SceneContextObject,
  type SceneContextSummary,
  type StageItemProposal,
  type StagePlan,
  stageObjectsTouch,
  stageStackPosition,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { scenicConnectionTransforms } from '../stage/scenic-proposal'
import { DiaStageProposalSchema } from './knowledge/stage-proposal'
import type { StagePlacementProposal } from './stage-placement-actions'

export type StageProposalRuntimeResult =
  | { kind: 'plan'; plan: StagePlan }
  | { kind: 'no_preview'; reason: string }

const itemProposal = (
  item: SceneContextObject,
  transform: SceneContextObject['transform'] = item.transform,
  assumptionIds: string[] = [],
): StageItemProposal => ({
  proposalId: `knowledge-${item.id}`,
  existingNodeId: item.id,
  kind: item.kind,
  displayName: item.name,
  libraryAssetId: null,
  dimensionsMeters: structuredClone(item.dimensionsMeters),
  ...(item.collisionGeometry ? { collisionGeometry: structuredClone(item.collisionGeometry) } : {}),
  ...(item.stepCount === undefined ? {} : { stepCount: item.stepCount }),
  transform: structuredClone(transform),
  certainty: 'stated',
  assumptionIds,
  evidenceIds: [],
})

const plan = (
  items: StageItemProposal[],
  extras: Partial<Pick<StagePlan, 'relations' | 'assumptions'>> = {},
): StagePlan => ({
  schemaVersion: 1,
  source: 'typed-command',
  venue: null,
  items,
  relations: extras.relations ?? [],
  assumptions: extras.assumptions ?? [],
  questions: [],
  evidence: [],
  warnings: [],
})

/** Converts semantic StageActions into deterministic preview geometry; it has no Scene write access. */
export function compileStageProposalPreview(
  placement: StagePlacementProposal,
  context: SceneContextSummary,
): StageProposalRuntimeResult {
  if (placement.status !== 'proposal' || !placement.knowledgeProposal)
    return { kind: 'no_preview', reason: placement.message }
  const proposal = DiaStageProposalSchema.parse(placement.knowledgeProposal)
  if (proposal.actions.some((action) => action.type === 'fold_hinge'))
    return {
      kind: 'no_preview',
      reason: '多铰链 Ghost 尚无原子 fold batch；请先明确铰链、折向和角度。',
    }
  if (proposal.constraints.length > 0)
    return {
      kind: 'no_preview',
      reason: '当前约束已保留在 Proposal，但尚未形成可安全采用的持续空间约束。',
    }
  const objects = new Map(context.objects.map((object) => [object.id, object]))
  const action = proposal.actions[0]
  if (!action) return { kind: 'no_preview', reason: proposal.rationale }

  if (action.type === 'place_in_region') {
    const subject = objects.get(action.subject)
    if (!subject) return { kind: 'no_preview', reason: '待移动物件已不存在。' }
    if (!action.parameters?.frame || !action.parameters.region)
      return { kind: 'no_preview', reason: '舞台方向参数不完整。' }
    const item = itemProposal(subject)
    const direction =
      action.parameters.frame === 'audience' && action.parameters.region === 'left'
        ? 'stage-right'
        : action.parameters.frame === 'audience' && action.parameters.region === 'right'
          ? 'stage-left'
          : action.parameters.region === 'left'
            ? 'stage-left'
            : action.parameters.region === 'right'
              ? 'stage-right'
              : action.parameters.region
    return {
      kind: 'plan',
      plan: plan([item], {
        relations: [
          {
            id: `knowledge-region-${subject.id}`,
            subjectId: item.proposalId,
            referenceId: null,
            direction,
            gapMeters: 0,
          },
        ],
      }),
    }
  }

  if (action.type === 'stack_on' || action.type === 'place_on') {
    const legacySource = placement.actions.some(
      (candidate) =>
        (candidate.type === 'stack_on' || candidate.type === 'place_on') &&
        candidate.type === action.type &&
        candidate.subjectId === action.subject &&
        candidate.targetId === action.target,
    )
    if (!legacySource)
      return {
        kind: 'no_preview',
        reason: '现有 Stage Placement 没有提供与 Proposal 一致的 legacy 操作权限。',
      }
    const subject = objects.get(action.subject)
    const target = action.target ? objects.get(action.target) : undefined
    if (!subject || !target) return { kind: 'no_preview', reason: '待摆放物件或支撑物件已不存在。' }
    const transformed = {
      ...structuredClone(subject.transform),
      position: {
        ...subject.transform.position,
        x: target.transform.position.x,
        z: target.transform.position.z,
      },
    }
    const support = stageStackPosition({ ...subject, transform: transformed }, context.objects)
    if (!support || support.supportId !== target.id)
      return {
        kind: 'no_preview',
        reason: '指定支撑面不可用或已经被其他物件占据，无法形成确定性接触。',
      }
    transformed.position.y = support.y
    const moved = { ...subject, transform: transformed }
    if (
      context.objects.some(
        (other) =>
          other.id !== subject.id && other.id !== target.id && stageObjectsTouch(moved, other),
      )
    )
      return {
        kind: 'no_preview',
        reason: '指定支撑面上方已有物件，无法生成不重叠的确定性预演。',
      }
    const candidate = plan([itemProposal(subject, transformed)])
    const checked = validateStagePlan(candidate, context)
    return checked.valid
      ? { kind: 'plan', plan: checked.plan }
      : { kind: 'no_preview', reason: '叠放后的物件超出当前舞台安全边界。' }
  }

  if (action.type === 'connect_edge') {
    const subject = objects.get(action.subject)
    const target = action.target ? objects.get(action.target) : undefined
    if (!subject || !target) return { kind: 'no_preview', reason: '要连接的景片已不存在。' }
    const angleDegrees = action.parameters?.angleDegrees === 90 ? 90 : 0
    const assumptionId = angleDegrees === 90 ? 'corner-preview-alternative' : undefined
    for (const transform of scenicConnectionTransforms(subject, target, angleDegrees)) {
      const moved = { ...subject, transform }
      if (!stageObjectsTouch(moved, target)) continue
      if (
        context.objects.some(
          (other) =>
            other.id !== subject.id && other.id !== target.id && stageObjectsTouch(moved, other),
        )
      )
        continue
      const candidate = plan(
        [itemProposal(subject, transform, assumptionId ? [assumptionId] : [])],
        assumptionId
          ? {
              assumptions: [
                {
                  id: assumptionId,
                  message: 'Ghost 显示离原位置更近的安全直角候选；另一折向仍保留为歧义。',
                },
              ],
            }
          : undefined,
      )
      const checked = validateStagePlan(candidate, context)
      if (checked.valid) return { kind: 'plan', plan: checked.plan }
    }
    return {
      kind: 'no_preview',
      reason: '当前景片轮廓没有位于场内且避开其他物件的三维边缘接触候选。',
    }
  }

  return {
    kind: 'no_preview',
    reason: '该 StageAction 尚未接入本轮确定性 Preview；Formal Scene 保持不变。',
  }
}
