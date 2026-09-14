import { resolveStageObjectSpecs, type SceneContextSummary } from '@pascal-app/core/stage'
import type { DiaStageProposal } from './knowledge/stage-proposal'
import type { PlacementFrame, StagePlacementIntent } from './stage-placement-intents'

type Frame = Exclude<PlacementFrame, 'unspecified'>
export type StageAction =
  | {
      type: 'move_relative'
      subjectId: string
      direction: 'left' | 'right'
      frame: Frame
      amountMeters?: number
    }
  | {
      type: 'place_in_region'
      subjectId: string
      region: 'left' | 'right' | 'upstage' | 'downstage' | 'center'
      frame: Frame
    }
  | {
      type: 'place_beside'
      subjectId: string
      targetId: string
      side: 'left' | 'right'
      frame: Frame
    }
  | {
      type: 'place_near' | 'place_flush' | 'place_on' | 'stack_on'
      subjectId: string
      targetId: string
    }
  | { type: 'align'; subjectIds: string[]; axis: 'x' | 'z' }
  | { type: 'preserve_clearance'; region: 'center'; amountMeters?: number }
  | { type: 'preserve_path'; targetId: string; amountMeters?: number }
  | {
      type: 'connect_edge'
      subjectId: string
      targetId: string
      angleDegrees: 0 | 90
    }
  | {
      type: 'fold_hinge'
      subjectId: string
      hingeIndex?: number
      angleDegrees?: number
    }
  | { type: 'enclose_with_opening'; subjectIds: string[] }
export type StagePlacementProposal = {
  intent: StagePlacementIntent
  documentVersion: number
  status: 'proposal' | 'clarify'
  requiresHumanConfirm: true
  actions: StageAction[]
  message: string
  knowledgeProposal?: DiaStageProposal
}

export function mapStagePlacementIntent(
  intent: StagePlacementIntent,
  context: SceneContextSummary,
  referenceFrame?: Frame,
): StagePlacementProposal {
  const result: StagePlacementProposal = {
    intent,
    documentVersion: context.documentVersion,
    status: 'clarify',
    requiresHumanConfirm: true,
    actions: [],
    message: intent.message ?? '请明确要调整的对象。',
  }
  if (intent.clarify) return result
  const resolve = (name: string) => {
    const selected = context.objects.filter((object) =>
      context.selectedObjectIds.includes(object.id),
    )
    if (name === '$selection' || /^(它|这个|那个)$/.test(name)) return selected
    const noun = name.replace(/^[这那][张把块件个扇]/, '')
    const exact = context.objects.filter((object) => object.id === noun || object.name === noun)
    const specs = resolveStageObjectSpecs(noun)
    const matches = exact.length
      ? exact
      : context.objects.filter((object) => specs.some((spec) => spec.kind === object.kind))
    const picked = matches.filter((object) => context.selectedObjectIds.includes(object.id))
    return picked.length ? picked : matches
  }
  const resolveScenicCount = (count: number) => {
    const scenic = context.objects.filter((object) => /flat|door|window/.test(object.kind))
    const selected = scenic.filter((object) => context.selectedObjectIds.includes(object.id))
    if (selected.length > 0) return selected.length === count ? selected : []
    return scenic.length === count ? scenic : []
  }
  const amount = intent.amountMeters === undefined ? {} : { amountMeters: intent.amountMeters }
  if (
    intent.amountMeters !== undefined &&
    (!Number.isFinite(intent.amountMeters) || intent.amountMeters <= 0)
  ) {
    result.message = '请说明有效的正数距离。'
    return result
  }
  let actions: StageAction[]
  if (intent.kind === 'preserve_clearance')
    actions = [{ type: 'preserve_clearance', region: 'center', ...amount }]
  else if (intent.kind === 'connect_flats') {
    const scenic = resolveScenicCount(intent.count ?? 2)
    if (scenic.length !== 2) {
      result.message = '请选中恰好两块要连接的景片；没有唯一对象时我不会猜。'
      return result
    }
    actions = [
      {
        type: 'connect_edge',
        subjectId: scenic[1]!.id,
        targetId: scenic[0]!.id,
        angleDegrees: intent.angleDegrees === 90 ? 90 : 0,
      },
    ]
  } else if (intent.kind === 'fold_hinge') {
    const selected = context.objects.filter(
      (object) =>
        context.selectedObjectIds.includes(object.id) && /flat|door|window/.test(object.kind),
    )
    const named = context.objects.filter(
      (object) => /flat|door|window/.test(object.kind) && /三联|三折/.test(object.name),
    )
    const scenic = selected.length === 1 ? selected : named.length === 1 ? named : []
    if (scenic.length !== 1) {
      result.message = '请选中唯一的三联景片；没有唯一对象时我不会猜。'
      return result
    }
    actions =
      intent.shape === 'u'
        ? [0, 1].map((hingeIndex) => ({
            type: 'fold_hinge' as const,
            subjectId: scenic[0]!.id,
            hingeIndex,
            angleDegrees: intent.angleDegrees,
          }))
        : [{ type: 'fold_hinge', subjectId: scenic[0]!.id }]
  } else if (intent.kind === 'enclose_with_opening') {
    const scenic = resolveScenicCount(intent.count ?? 3)
    if (scenic.length !== 3) {
      result.message = '请选中恰好三块要围合的景片；没有唯一组合时我不会猜。'
      return result
    }
    actions = [{ type: 'enclose_with_opening', subjectIds: scenic.map((object) => object.id) }]
  } else if (intent.kind === 'knowledge_question') actions = []
  else {
    const subjects = intent.subject === '$stage' ? [] : resolve(intent.subject)
    if (
      intent.kind !== 'preserve_path' &&
      (intent.kind === 'align' ? subjects.length < 2 : subjects.length !== 1)
    ) {
      result.message =
        intent.kind === 'align'
          ? '请选中至少两个要对齐的物件。'
          : '请选中唯一的待移动物件，或说明它的名称。'
      return result
    }
    const subjectId = subjects[0]?.id ?? ''
    const targets = intent.target ? resolve(intent.target) : []
    if (intent.target && (targets.length !== 1 || targets[0]!.id === subjectId)) {
      result.message = '请明确另一个参照物件；不能猜测对象，也不能把物件放到自己上面。'
      return result
    }
    const targetId = targets[0]?.id
    const frame = intent.frame === 'unspecified' ? referenceFrame : intent.frame
    if (intent.frame === 'unspecified' && !frame) {
      result.message =
        '这里的左右按演员面向观众，还是观众面向舞台？请在完整口令前加“按舞台方向”或“按观众方向”。'
      return result
    }
    let action: StageAction
    switch (intent.kind) {
      case 'stage_left':
      case 'stage_right':
      case 'audience_left':
      case 'audience_right':
      case 'upstage':
      case 'downstage':
      case 'center_on_stage':
        action = {
          type: 'place_in_region',
          subjectId,
          region: intent.kind.endsWith('left')
            ? 'left'
            : intent.kind.endsWith('right')
              ? 'right'
              : intent.kind === 'center_on_stage'
                ? 'center'
                : (intent.kind as 'upstage' | 'downstage'),
          frame: frame ?? 'stage',
        }
        break
      case 'relative_left':
      case 'relative_right':
        action = {
          type: 'move_relative',
          subjectId,
          direction: intent.kind === 'relative_left' ? 'left' : 'right',
          frame: frame!,
          ...amount,
        }
        break
      case 'left_of_object':
      case 'right_of_object':
        if (!targetId) return result
        action = {
          type: 'place_beside',
          subjectId,
          targetId,
          side: intent.kind === 'left_of_object' ? 'left' : 'right',
          frame: frame!,
        }
        break
      case 'near_object':
      case 'flush_to_object':
      case 'place_on':
      case 'stack_on':
        if (!targetId) return result
        action = {
          type:
            intent.kind === 'near_object'
              ? 'place_near'
              : intent.kind === 'flush_to_object'
                ? 'place_flush'
                : intent.kind,
          subjectId,
          targetId,
        }
        break
      case 'align':
        if (!intent.axis) return result
        action = {
          type: 'align',
          subjectIds: subjects.map((object) => object.id),
          axis: intent.axis,
        }
        break
      case 'preserve_path':
        if (!targetId) return result
        action = { type: 'preserve_path', targetId, ...amount }
        break
      default:
        return result
    }
    actions = [action]
  }
  return {
    ...result,
    status: 'proposal',
    actions,
    message:
      '已理解这个摆放要求。当前仅形成动作草案，尚未计算落点或生成空间预演，正式舞台没有改变；落位仍需先预演、再由你确认。',
  }
}
