import { resolveStageObjectSpecs, type SceneContextSummary } from '@pascal-app/core/stage'
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
export type StagePlacementProposal = {
  intent: StagePlacementIntent
  documentVersion: number
  status: 'proposal' | 'clarify'
  requiresHumanConfirm: true
  actions: StageAction[]
  message: string
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
  const amount = intent.amountMeters === undefined ? {} : { amountMeters: intent.amountMeters }
  if (
    intent.amountMeters !== undefined &&
    (!Number.isFinite(intent.amountMeters) || intent.amountMeters <= 0)
  ) {
    result.message = '请说明有效的正数距离。'
    return result
  }
  let action: StageAction
  if (intent.kind === 'preserve_clearance')
    action = { type: 'preserve_clearance', region: 'center', ...amount }
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
  }
  return {
    ...result,
    status: 'proposal',
    actions: [action],
    message:
      '已理解这个摆放要求。当前仅形成动作草案，尚未计算落点或生成空间预演，正式舞台没有改变；落位仍需先预演、再由你确认。',
  }
}
