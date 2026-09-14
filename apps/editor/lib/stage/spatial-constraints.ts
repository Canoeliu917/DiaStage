import { StagePlanSchema, StageTransformSchema } from '@pascal-app/core/stage'
import { z } from 'zod'
import {
  type DiaStageProposal,
  DiaStageProposalSchema,
} from '../rehearsal-intelligence/knowledge/stage-proposal'

export const SPATIAL_RUNTIME_CONFIG = Object.freeze({
  minimumOpeningMeters: 0.8,
  minimumPathMeters: 0.8,
  pathClearanceHeightMeters: 1.9,
  pathTarget: 'downstage_boundary' as const,
  maxCandidates: 8,
})

const id = z.string().min(1).max(160)
export const StageSpatialConstraintSchema = z
  .strictObject({
    type: z.enum([
      'form_enclosure',
      'leave_opening',
      'preserve_path',
      'align_edges',
      'corner_angle',
    ]),
    subjects: z.array(id).min(1).max(3),
    target: id.optional(),
    parameters: z.strictObject({
      shape: z.enum(['u', 'partial']).optional(),
      angleDegrees: z.literal(90).optional(),
      minimumWidthMeters: z.number().finite().positive().max(1000).optional(),
      widthSource: z.enum(['user', 'runtime_default']).optional(),
      targetRegion: z.literal('downstage_boundary').optional(),
    }),
    sourceIntent: id,
    knowledgeConceptIds: z.array(id).min(1).max(12),
    requirement: z.enum(['required', 'preferred']),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((constraint, ctx) => {
    const count = constraint.subjects.length
    if (
      new Set(constraint.subjects).size !== count ||
      (constraint.type === 'form_enclosure' &&
        (![1, 2, 3].includes(count) ||
          constraint.parameters.shape !== (count === 2 ? 'partial' : 'u'))) ||
      (['align_edges', 'corner_angle'].includes(constraint.type) && count !== 2) ||
      (constraint.type === 'corner_angle' && constraint.parameters.angleDegrees !== 90) ||
      (['leave_opening', 'preserve_path'].includes(constraint.type) &&
        (!constraint.parameters.minimumWidthMeters || !constraint.parameters.widthSource)) ||
      (constraint.type === 'preserve_path' &&
        (!constraint.target || !constraint.parameters.targetRegion))
    )
      ctx.addIssue({ code: 'custom', message: '空间约束对象或几何参数不完整' })
  })
export type StageSpatialConstraint = z.infer<typeof StageSpatialConstraintSchema>

export const SpatialFoldConfigurationSchema = z.strictObject({
  subject: id,
  controls: z.strictObject({
    fold_angle_1_deg: z.union([z.literal(90), z.literal(270)]),
    fold_angle_2_deg: z.union([z.literal(90), z.literal(270)]),
  }),
})
export type SpatialFoldConfiguration = z.infer<typeof SpatialFoldConfigurationSchema>
export const SpatialCandidateSchema = z.strictObject({
  candidateId: id,
  actions: z.array(z.strictObject({ type: z.enum(['move', 'rotate', 'fold']), subject: id })),
  folds: z.array(SpatialFoldConfigurationSchema).default([]),
  resolvedTransforms: z.array(z.strictObject({ subject: id, transform: StageTransformSchema })),
  constraintsSatisfied: z.array(z.number().int().nonnegative()),
  constraintsUnsatisfied: z.array(z.number().int().nonnegative()),
  warnings: z.array(z.string()),
  feasibility: z.literal('feasible'),
  movementCost: z.number().finite().nonnegative(),
  clearanceRegions: z.array(
    z.strictObject({
      type: z.enum(['opening', 'path']),
      widthMeters: z.number().positive(),
      polygon: z.array(z.tuple([z.number().finite(), z.number().finite()])).length(4),
    }),
  ),
  plan: StagePlanSchema,
})
export type SpatialCandidate = z.infer<typeof SpatialCandidateSchema>
export const SpatialSolutionSchema = z.strictObject({
  constraints: z.array(StageSpatialConstraintSchema).min(1).max(20),
  candidates: z.array(SpatialCandidateSchema).max(SPATIAL_RUNTIME_CONFIG.maxCandidates),
  selectedCandidateId: id.nullable(),
  warnings: z.array(z.string()),
})
export type SpatialSolution = z.infer<typeof SpatialSolutionSchema>

/** Only semantic IDs and dimensions cross this boundary; positions come from the runtime. */
export function spatialConstraintsForProposal(input: DiaStageProposal): StageSpatialConstraint[] {
  const proposal = DiaStageProposalSchema.parse(input)
  const constraints: StageSpatialConstraint[] = []
  const add = (
    type: StageSpatialConstraint['type'],
    subjects: string[],
    concepts: string[],
    sourceIntent: string,
    parameters: StageSpatialConstraint['parameters'],
    target?: string,
  ) => {
    constraints.push(
      StageSpatialConstraintSchema.parse({
        type,
        subjects,
        target,
        parameters,
        sourceIntent,
        knowledgeConceptIds: concepts,
        requirement: 'required',
        confidence: proposal.confidence,
      }),
    )
  }
  const enclosure = proposal.actions.filter((action) =>
    ['enclosure', 'partial'].includes(action.parameters?.layout ?? ''),
  )
  const folds = proposal.actions.filter(
    (action) => action.type === 'fold_hinge' && action.parameters?.layout === 'u',
  )
  if (folds.length === 2 && folds[0]!.subject === folds[1]!.subject)
    add(
      'form_enclosure',
      [folds[0]!.subject],
      [...new Set(folds.flatMap((action) => action.knowledgeConceptIds))],
      'fold_hinge',
      { shape: 'u' },
    )
  const enclosureSubjects = [
    ...new Set(enclosure.flatMap((action) => [action.target!, action.subject])),
  ]
  if (enclosure.length)
    add(
      'form_enclosure',
      enclosureSubjects,
      [...new Set(enclosure.flatMap((action) => action.knowledgeConceptIds))],
      enclosure[0]!.sourceIntent,
      { shape: enclosureSubjects.length === 2 ? 'partial' : 'u' },
    )
  for (const action of proposal.actions) {
    if (action.type !== 'connect_edge' || enclosure.includes(action)) continue
    add(
      action.parameters?.angleDegrees === 90 ? 'corner_angle' : 'align_edges',
      [action.target!, action.subject],
      action.knowledgeConceptIds,
      action.sourceIntent,
      action.parameters?.angleDegrees === 90 ? { angleDegrees: 90 } : {},
    )
  }
  for (const constraint of proposal.constraints) {
    const path = constraint.type === 'preserve_path'
    add(
      constraint.type,
      path ? [constraint.target!] : enclosureSubjects,
      constraint.knowledgeConceptIds,
      constraint.sourceIntent,
      {
        minimumWidthMeters:
          constraint.widthMeters ??
          (path
            ? SPATIAL_RUNTIME_CONFIG.minimumPathMeters
            : SPATIAL_RUNTIME_CONFIG.minimumOpeningMeters),
        widthSource: constraint.widthMeters === undefined ? 'runtime_default' : 'user',
        ...(path ? { targetRegion: SPATIAL_RUNTIME_CONFIG.pathTarget } : {}),
      },
      constraint.target,
    )
  }
  return constraints
}
