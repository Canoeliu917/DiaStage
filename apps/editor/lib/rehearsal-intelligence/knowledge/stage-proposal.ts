import { z } from 'zod'
import type { StagePlacementProposal } from '../stage-placement-actions'
import { explainConcept, lookupAlias, lookupCanonical } from './retrieval'
import {
  KnowledgeAuthorityTierSchema,
  KnowledgeConceptKindSchema,
  KnowledgeDefinitionStatusSchema,
  KnowledgeExecutionEligibilitySchema,
  KnowledgeRelationSchema,
  KnowledgeSourceRefSchema,
  KnowledgeStatusSchema,
} from './schema'

const id = z.string().trim().min(1).max(160)
const text = z.string().trim().min(1).max(2000)

export const StageProposalResolvedConceptSchema = z.strictObject({
  id,
  canonicalLabel: text,
  conceptKind: KnowledgeConceptKindSchema.exclude(['example_pattern']),
  status: KnowledgeStatusSchema,
  executionEligibility: KnowledgeExecutionEligibilitySchema,
  authorityTier: KnowledgeAuthorityTierSchema,
  definitionStatus: KnowledgeDefinitionStatusSchema,
  tradition: id,
  disputedNotes: z.array(text),
  relations: z.array(KnowledgeRelationSchema),
  executableIntents: z.array(id),
  sourceRefs: z.array(KnowledgeSourceRefSchema).min(1),
})

export const StageProposalAmbiguitySchema = z.strictObject({
  term: text,
  candidates: z.array(text).min(1).max(12),
  clarification: text,
})

const StageProposalActionParametersSchema = z.strictObject({
  frame: z.enum(['stage', 'audience']).optional(),
  region: z.enum(['left', 'right', 'upstage', 'downstage', 'center']).optional(),
  axis: z.enum(['x', 'z']).optional(),
  angleDegrees: z.number().finite().min(0).max(360).optional(),
  hingeIndex: z.number().int().min(0).max(12).optional(),
  layout: z.enum(['straight', 'corner', 'u', 'enclosure']).optional(),
})

export const StageProposalActionSchema = z.strictObject({
  type: z.enum([
    'place_in_region',
    'connect_edge',
    'align',
    'set_angle',
    'fold_hinge',
    'place_on',
    'stack_on',
  ]),
  subject: id,
  target: id.optional(),
  parameters: StageProposalActionParametersSchema.optional(),
  sourceIntent: id,
  knowledgeConceptIds: z.array(id).max(12),
})

export const StageProposalConstraintSchema = z.strictObject({
  type: z.enum(['leave_opening', 'preserve_path']),
  subject: id,
  target: id.optional(),
  widthMeters: z.number().finite().positive().max(1000).optional(),
  sourceIntent: id,
  knowledgeConceptIds: z.array(id).min(1).max(12),
})

export const StageProposalKnowledgeRefSchema = KnowledgeSourceRefSchema.extend({
  conceptId: id,
}).strict()

const actionIntents: Record<z.infer<typeof StageProposalActionSchema>['type'], readonly string[]> =
  {
    place_in_region: [
      'place_stage_left',
      'place_stage_right',
      'place_upstage',
      'place_downstage',
      'place_audience_left',
      'place_audience_right',
    ],
    connect_edge: ['splice_flats', 'align_edge'],
    align: ['align_assets'],
    set_angle: ['set_angle'],
    fold_hinge: ['fold_flat', 'set_hinge_angle'],
    // These two operations retain the pre-existing Stage Placement authority;
    // the Knowledge catalog deliberately does not invent equivalent concepts.
    place_on: [],
    stack_on: [],
  }

const constraintIntents: Record<
  z.infer<typeof StageProposalConstraintSchema>['type'],
  readonly string[]
> = {
  leave_opening: ['preserve_opening', 'preserve_entrance'],
  preserve_path: ['preserve_passage', 'preserve_entrance'],
}

export const DiaStageProposalSchema = z
  .strictObject({
    proposalId: z.string().uuid(),
    userRequest: text,
    resolvedConcepts: z.array(StageProposalResolvedConceptSchema).max(40),
    ambiguities: z.array(StageProposalAmbiguitySchema).max(12),
    actions: z.array(StageProposalActionSchema).max(40),
    constraints: z.array(StageProposalConstraintSchema).max(20),
    rationale: text,
    knowledgeRefs: z.array(StageProposalKnowledgeRefSchema).max(120),
    confidence: z.number().min(0).max(1),
    status: z.literal('preview_only'),
  })
  .superRefine((proposal, ctx) => {
    const concepts = new Map(proposal.resolvedConcepts.map((concept) => [concept.id, concept]))
    for (const concept of proposal.resolvedConcepts) {
      const current = lookupCanonical(concept.id)
      const currentView = current && {
        canonicalLabel: current.canonicalLabel,
        conceptKind: current.conceptKind,
        status: current.status,
        executionEligibility: current.executionEligibility,
        authorityTier: current.authorityTier,
        definitionStatus: current.definitionStatus,
        tradition: current.tradition,
        disputedNotes: current.disputedNotes,
        relations: current.relations,
        executableIntents: current.executableIntents,
        sourceRefs: current.sourceRefs,
      }
      const proposalView = {
        canonicalLabel: concept.canonicalLabel,
        conceptKind: concept.conceptKind,
        status: concept.status,
        executionEligibility: concept.executionEligibility,
        authorityTier: concept.authorityTier,
        definitionStatus: concept.definitionStatus,
        tradition: concept.tradition,
        disputedNotes: concept.disputedNotes,
        relations: concept.relations,
        executableIntents: concept.executableIntents,
        sourceRefs: concept.sourceRefs,
      }
      if (!currentView || JSON.stringify(proposalView) !== JSON.stringify(currentView))
        ctx.addIssue({
          code: 'custom',
          message: `${concept.id}: Proposal authority/provenance 与当前 Knowledge catalog 不一致`,
        })
    }
    const referenceKeys = new Set(
      proposal.knowledgeRefs.map((reference) =>
        JSON.stringify([
          reference.conceptId,
          reference.sourceId,
          reference.locator,
          reference.role,
        ]),
      ),
    )
    const expectedReferenceKeys = new Set<string>()
    for (const concept of proposal.resolvedConcepts)
      for (const reference of concept.sourceRefs) {
        const key = JSON.stringify([
          concept.id,
          reference.sourceId,
          reference.locator,
          reference.role,
        ])
        expectedReferenceKeys.add(key)
        if (!referenceKeys.has(key))
          ctx.addIssue({
            code: 'custom',
            message: `${concept.id}: knowledgeRefs 缺少可追溯来源`,
          })
      }
    if (
      referenceKeys.size !== proposal.knowledgeRefs.length ||
      [...referenceKeys].some((key) => !expectedReferenceKeys.has(key))
    )
      ctx.addIssue({ code: 'custom', message: 'knowledgeRefs 含重复或非 resolvedConcept 来源' })
    for (const action of proposal.actions) {
      const legacyPlacement =
        (action.type === 'stack_on' || action.type === 'place_on') &&
        action.sourceIntent === `existing_placement:${action.type}`
      let grantsAction = false
      for (const conceptId of action.knowledgeConceptIds) {
        const concept = concepts.get(conceptId)
        if (!concept)
          ctx.addIssue({
            code: 'custom',
            message: `${action.type}: knowledge concept ${conceptId} 未保留在 resolvedConcepts`,
          })
        else if (concept.status !== 'ACTIVE' || concept.executionEligibility !== 'allowed')
          ctx.addIssue({
            code: 'custom',
            message: `${action.type}: ${conceptId} 不具备 ACTIVE + allowed 执行资格`,
          })
        else if (
          concept.executableIntents.some((intent) => actionIntents[action.type].includes(intent))
        )
          grantsAction = true
      }
      if (!legacyPlacement && !grantsAction)
        ctx.addIssue({
          code: 'custom',
          message: `${action.type}: 没有对应的 ACTIVE + allowed executableIntent`,
        })
    }
    for (const constraint of proposal.constraints) {
      let grantsConstraint = false
      for (const conceptId of constraint.knowledgeConceptIds)
        if (!concepts.has(conceptId))
          ctx.addIssue({
            code: 'custom',
            message: `${constraint.type}: knowledge concept ${conceptId} 未保留在 resolvedConcepts`,
          })
        else {
          const concept = concepts.get(conceptId)!
          if (concept.executionEligibility === 'knowledge_only')
            ctx.addIssue({
              code: 'custom',
              message: `${constraint.type}: ${conceptId} 是 knowledge_only，不能成为方案约束`,
            })
          else if (
            concept.executableIntents.some((intent) =>
              constraintIntents[constraint.type].includes(intent),
            )
          )
            grantsConstraint = true
        }
      if (!grantsConstraint)
        ctx.addIssue({
          code: 'custom',
          message: `${constraint.type}: 没有对应的 allowed/proposal_only executableIntent`,
        })
    }
  })

export type DiaStageProposal = z.infer<typeof DiaStageProposalSchema>

export type KnowledgeProposalContext = {
  objects: Array<{ id: string; kind: string }>
}

const directionConcept: Partial<Record<StagePlacementProposal['intent']['kind'], string>> = {
  stage_left: 'stage-left',
  stage_right: 'stage-right',
  audience_left: 'audience-left',
  audience_right: 'audience-right',
  upstage: 'upstage',
  downstage: 'downstage',
}

const conceptForAsset = (kind: string) =>
  ({
    'scenic-flat': 'scenic-flat',
    'door-flat': 'door-flat',
    'window-flat': 'window-flat',
    platform: 'platform',
  })[kind]

export function resolveKnowledgeForProposal(
  userRequest: string,
  placement: StagePlacementProposal,
  context: KnowledgeProposalContext,
  proposalId = crypto.randomUUID(),
): DiaStageProposal {
  const ids = new Set<string>()
  const include = (...conceptIds: string[]) =>
    conceptIds.forEach((conceptId) => {
      ids.add(conceptId)
    })
  const assetIds = (...objectIds: string[]) =>
    objectIds.flatMap((objectId) => {
      const conceptId = conceptForAsset(
        context.objects.find((object) => object.id === objectId)?.kind ?? '',
      )
      return conceptId ? [conceptId] : []
    })
  const intent = placement.intent
  const direct = directionConcept[intent.kind]
  if (direct) include(direct)
  if (intent.kind === 'connect_flats')
    include(
      'scenic-flat',
      'splice',
      'edge-align',
      'align',
      ...(intent.angleDegrees ? ['angle'] : []),
    )
  if (intent.kind === 'fold_hinge') include('triple-fold-flat', 'fold-flat', 'hinge')
  if (intent.kind === 'enclose_with_opening')
    include('scenic-flat', 'enclosure', 'splice', 'opening', 'entrance')
  if (intent.kind === 'preserve_path') include('passage', 'entrance')
  if (intent.kind === 'knowledge_question') include('stage-zone', 'stage-right', 'upstage')
  for (const action of placement.actions) {
    if ('subjectId' in action) include(...assetIds(action.subjectId))
    if ('targetId' in action) include(...assetIds(action.targetId))
    if ('subjectIds' in action) include(...assetIds(...action.subjectIds))
  }

  if (intent.kind === 'ambiguous' && /左边/.test(userRequest)) {
    const alias = lookupAlias('左边')
    if (alias.kind === 'ambiguous') include(...alias.candidates.map((concept) => concept.id))
  }

  const resolved = [...ids]
    .map((conceptId) => lookupCanonical(conceptId))
    .filter((concept) => concept !== undefined)
  const safe = (...conceptIds: string[]) =>
    conceptIds.filter((conceptId) => {
      const concept = lookupCanonical(conceptId)
      return concept?.status === 'ACTIVE' && concept.executionEligibility === 'allowed'
    })
  const applicableConstraint = (...conceptIds: string[]) =>
    conceptIds.filter((conceptId) => {
      const concept = lookupCanonical(conceptId)
      return (
        !!concept &&
        concept.status !== 'FUTURE' &&
        concept.executionEligibility !== 'knowledge_only'
      )
    })
  const actions: DiaStageProposal['actions'] = []
  const constraints: DiaStageProposal['constraints'] = []

  for (const action of placement.actions) {
    switch (action.type) {
      case 'place_in_region': {
        const conceptId = directionConcept[intent.kind]
        if (!conceptId) break
        actions.push({
          type: 'place_in_region',
          subject: action.subjectId,
          parameters: { frame: action.frame, region: action.region },
          sourceIntent: intent.kind,
          knowledgeConceptIds: safe(conceptId),
        })
        break
      }
      case 'connect_edge': {
        actions.push({
          type: 'connect_edge',
          subject: action.subjectId,
          target: action.targetId,
          parameters: {
            angleDegrees: action.angleDegrees,
            layout: action.angleDegrees === 90 ? 'corner' : 'straight',
          },
          sourceIntent: intent.kind,
          knowledgeConceptIds: safe('scenic-flat', 'splice', 'edge-align'),
        })
        actions.push(
          action.angleDegrees === 90
            ? {
                type: 'set_angle',
                subject: action.subjectId,
                target: action.targetId,
                parameters: { angleDegrees: 90, layout: 'corner' },
                sourceIntent: intent.kind,
                knowledgeConceptIds: safe('angle'),
              }
            : {
                type: 'align',
                subject: action.subjectId,
                target: action.targetId,
                parameters: { layout: 'straight' },
                sourceIntent: intent.kind,
                knowledgeConceptIds: safe('align'),
              },
        )
        break
      }
      case 'fold_hinge':
        actions.push({
          type: 'fold_hinge',
          subject: action.subjectId,
          parameters: {
            ...(action.hingeIndex === undefined ? {} : { hingeIndex: action.hingeIndex }),
            ...(action.angleDegrees === undefined ? {} : { angleDegrees: action.angleDegrees }),
            ...(intent.shape === 'u' ? { layout: 'u' as const } : {}),
          },
          sourceIntent: intent.kind,
          knowledgeConceptIds: safe('triple-fold-flat', 'fold-flat', 'hinge'),
        })
        break
      case 'enclose_with_opening':
        for (let index = 1; index < action.subjectIds.length; index++)
          actions.push({
            type: 'connect_edge',
            subject: action.subjectIds[index]!,
            target: action.subjectIds[index - 1]!,
            parameters: { layout: 'enclosure' },
            sourceIntent: intent.kind,
            knowledgeConceptIds: safe('scenic-flat', 'splice', 'enclosure'),
          })
        constraints.push({
          type: 'leave_opening',
          subject: '$enclosure',
          sourceIntent: intent.kind,
          knowledgeConceptIds: applicableConstraint('opening', 'entrance'),
        })
        break
      case 'preserve_path':
        constraints.push({
          type: 'preserve_path',
          subject: '$stage',
          target: action.targetId,
          ...(action.amountMeters === undefined ? {} : { widthMeters: action.amountMeters }),
          sourceIntent: intent.kind,
          knowledgeConceptIds: applicableConstraint('passage', 'entrance'),
        })
        break
      case 'align':
        if (action.subjectIds.length >= 2)
          actions.push({
            type: 'align',
            subject: action.subjectIds[0]!,
            target: action.subjectIds[1]!,
            parameters: { axis: action.axis },
            sourceIntent: intent.kind,
            knowledgeConceptIds: safe('align'),
          })
        break
      case 'place_on':
      case 'stack_on':
        actions.push({
          type: action.type,
          subject: action.subjectId,
          target: action.targetId,
          sourceIntent: `existing_placement:${action.type}`,
          knowledgeConceptIds: safe(...assetIds(action.subjectId, action.targetId)),
        })
        break
    }
  }

  const ambiguities: DiaStageProposal['ambiguities'] = []
  if (placement.status === 'clarify')
    ambiguities.push({
      term: intent.kind === 'ambiguous' && /左边/.test(userRequest) ? '左边' : userRequest,
      candidates:
        intent.kind === 'ambiguous' && /左边/.test(userRequest)
          ? ['stage-left', 'audience-left', 'relative-left', 'object-left']
          : ['补充唯一对象或明确空间关系'],
      clarification: placement.message,
    })
  if (intent.kind === 'connect_flats' && intent.angleDegrees === 90)
    ambiguities.push({
      term: '90度转角方向',
      candidates: ['顺时针直角预演', '逆时针直角预演'],
      clarification: '当前仅显示离原位置更近的确定性预演；采用前请确认折向。',
    })
  if (intent.kind === 'fold_hinge')
    ambiguities.push({
      term: intent.shape === 'u' ? 'U形折向' : '铰链位置与角度',
      candidates:
        intent.shape === 'u'
          ? ['开口朝台前', '开口朝台后', '镜像折向']
          : ['第一个铰链', '第二个铰链', '两个铰链'],
      clarification: '请明确铰链、折向和角度后再生成可采用的 Ghost。',
    })
  if (intent.kind === 'enclose_with_opening')
    ambiguities.push({
      term: '围合与入口几何',
      candidates: ['入口朝台前', '入口朝台左', '入口朝台右'],
      clarification: '请明确入口方向与宽度；当前只保留多动作和开口约束。',
    })

  const rationale = (() => {
    if (intent.kind === 'knowledge_question')
      return explainConcept('stage-zone')?.statement ?? '舞台区位强弱属于启发式分析，不是普遍规律。'
    if (intent.kind === 'connect_flats')
      return intent.angleDegrees === 90
        ? '景片、边缘拼接与90度角关系已解析；接触变换交给确定性景片引擎。'
        : '景片、边缘拼接与共线对齐已解析；接触变换交给确定性景片引擎。'
    if (intent.kind === 'fold_hinge')
      return '景片折叠与整件旋转保持不同操作；多铰链几何未明确，因此不会直接执行。'
    if (intent.kind === 'enclose_with_opening')
      return '围合被保留为多个连接动作和入口约束，不会退化成单个坐标移动。'
    if (intent.kind === 'preserve_path')
      return '通道是本次方案约束；当前不会借此自动移动门或其他布景。'
    if (intent.kind === 'ambiguous') return placement.message
    if (actions.some((action) => action.type === 'stack_on'))
      return 'stack-on 保留现有 Stage Placement 权限；Knowledge 只补充资产来源，不创造别名。'
    if (actions.some((action) => action.type === 'place_on'))
      return 'place-on 保留现有 Stage Placement 权限；Knowledge 不创造不存在的操作别名。'
    return actions.length
      ? '术语已归一到可执行的 ACTIVE concept；精确变换由确定性 Stage Engine 计算。'
      : '当前 Knowledge 只补充理解，不生成可执行 StageAction。'
  })()

  const resolvedConcepts = resolved.map((concept) => ({
    id: concept.id,
    canonicalLabel: concept.canonicalLabel,
    status: concept.status,
    executionEligibility: concept.executionEligibility,
    authorityTier: concept.authorityTier,
    definitionStatus: concept.definitionStatus,
    conceptKind: concept.conceptKind,
    tradition: concept.tradition,
    disputedNotes: [...concept.disputedNotes],
    relations: concept.relations.map((relation) => ({ ...relation })),
    executableIntents: [...concept.executableIntents],
    sourceRefs: concept.sourceRefs.map((ref) => ({ ...ref })),
  }))
  const knowledgeRefs = resolvedConcepts.flatMap((concept) =>
    concept.sourceRefs.map((ref) => ({ conceptId: concept.id, ...ref })),
  )
  const confidence = resolved.length
    ? Math.max(
        0,
        Math.min(...resolved.map((concept) => concept.confidence)) *
          (ambiguities.length ? 0.85 : 1),
      )
    : 0.5

  return DiaStageProposalSchema.parse({
    proposalId,
    userRequest,
    resolvedConcepts,
    ambiguities,
    actions,
    constraints,
    rationale,
    knowledgeRefs,
    confidence,
    status: 'preview_only',
  })
}
