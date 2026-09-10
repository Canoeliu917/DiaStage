import { z } from 'zod'

const IdSchema = z.string().min(1).max(160)
const NameSchema = z.string().trim().min(1).max(120)
const DimensionSchema = z.number().finite().min(0.01).max(1000)
export const InputSourceSchema = z.enum(['voice', 'typed-command', 'manual', 'script'])
export type InputSource = z.infer<typeof InputSourceSchema>
export const StageItemKindSchema = z.enum([
  'scenic-flat',
  'door-flat',
  'window-flat',
  'platform',
  'stairs',
  'rail-or-divider',
  'screen',
  'curtain',
  'table',
  'chair',
  'sofa',
  'counter',
  'shelf',
  'bed',
  'neutral-block',
  'camera',
  'performer-marker',
])
export type StageItemKind = z.infer<typeof StageItemKindSchema>
export const StagePointSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
})
export type StagePoint = z.infer<typeof StagePointSchema>
export const StageDimensionsSchema = z.strictObject({
  width: DimensionSchema,
  height: DimensionSchema,
  depth: DimensionSchema,
})
export type StageDimensions = z.infer<typeof StageDimensionsSchema>
export const StageTransformSchema = z.strictObject({
  position: StagePointSchema,
  rotationDegrees: StagePointSchema,
})
export type StageTransform = z.infer<typeof StageTransformSchema>
export const VenueProposalSchema = z.strictObject({
  type: z.enum(['proscenium', 'black-box', 'thrust', 'classroom', 'other']),
  widthMeters: DimensionSchema,
  depthMeters: DimensionSchema,
  heightMeters: DimensionSchema.nullable(),
})
export type VenueProposal = z.infer<typeof VenueProposalSchema>
export const CertaintySchema = z.enum(['stated', 'inferred'])
export const StageItemProposalSchema = z.strictObject({
  proposalId: IdSchema,
  existingNodeId: IdSchema.nullable(),
  kind: StageItemKindSchema,
  displayName: NameSchema,
  libraryAssetId: IdSchema.nullable(),
  dimensionsMeters: StageDimensionsSchema,
  stepCount: z.number().int().min(1).max(200).nullable().optional(),
  transform: StageTransformSchema,
  certainty: CertaintySchema,
  assumptionIds: z.array(IdSchema).max(100),
  evidenceIds: z.array(IdSchema).max(100),
})
export type StageItemProposal = z.infer<typeof StageItemProposalSchema>
export const SpatialRelationSchema = z.strictObject({
  id: IdSchema,
  subjectId: IdSchema,
  referenceId: IdSchema.nullable(),
  direction: z.enum(['stage-left', 'stage-right', 'upstage', 'downstage', 'center']),
  gapMeters: z.number().finite().nonnegative().max(1000),
})
export type SpatialRelation = z.infer<typeof SpatialRelationSchema>
export const PlanAssumptionSchema = z.strictObject({
  id: IdSchema,
  message: z.string().min(1).max(500),
})
export const ClarificationQuestionSchema = z.strictObject({
  id: IdSchema,
  message: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).max(6),
})
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>
export const ClarificationAnswerSchema = z.strictObject({
  questionId: IdSchema,
  answer: z.string().trim().min(1).max(1000),
})
export type ClarificationAnswer = z.infer<typeof ClarificationAnswerSchema>
export const ScriptEvidenceSchema = z.strictObject({
  id: IdSchema,
  page: z.number().int().positive().nullable(),
  paragraph: z.number().int().positive().nullable(),
  excerpt: z.string().min(1).max(600),
  certainty: CertaintySchema,
})
export type ScriptEvidence = z.infer<typeof ScriptEvidenceSchema>
export const PlanWarningSchema = z.strictObject({
  code: z.enum([
    'out-of-bounds',
    'collision',
    'clearance',
    'missing-reference',
    'invalid-relation',
    'missing-venue',
    'invalid-plan',
  ]),
  message: z.string().min(1).max(500),
  itemIds: z.array(IdSchema).max(100),
  blocking: z.boolean(),
})
export type PlanWarning = z.infer<typeof PlanWarningSchema>
export const StagePlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: InputSourceSchema,
  venue: VenueProposalSchema.nullable(),
  items: z.array(StageItemProposalSchema).max(200),
  relations: z.array(SpatialRelationSchema).max(400),
  assumptions: z.array(PlanAssumptionSchema).max(200),
  questions: z.array(ClarificationQuestionSchema).max(30),
  evidence: z.array(ScriptEvidenceSchema).max(400),
  warnings: z.array(PlanWarningSchema).max(400),
})
export type StagePlan = z.infer<typeof StagePlanSchema>
export const SceneContextObjectSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  kind: StageItemKindSchema,
  transform: StageTransformSchema,
  dimensionsMeters: StageDimensionsSchema,
  stepCount: z.number().int().min(1).max(200).optional(),
})
export type SceneContextObject = z.infer<typeof SceneContextObjectSchema>
export const SceneContextSummarySchema = z.strictObject({
  doorClearanceMeters: z.number().finite().min(0.6).max(10).optional(),
  documentVersion: z.number().int().nonnegative(),
  venue: VenueProposalSchema.nullable(),
  objects: z.array(SceneContextObjectSchema).max(1000),
  selectedObjectIds: z.array(IdSchema).max(1000),
})
export type SceneContextSummary = z.infer<typeof SceneContextSummarySchema>
export const CommandMetaSchema = z.strictObject({
  commandId: IdSchema,
  transactionId: IdSchema,
  source: InputSourceSchema,
  issuedAt: z.iso.datetime(),
  expectedDocumentVersion: z.number().int().nonnegative(),
})
export type CommandMeta = z.infer<typeof CommandMetaSchema>
const meta = { meta: CommandMetaSchema }
const node = { ...meta, nodeId: IdSchema }
const camera = {
  ...node,
  transform: StageTransformSchema,
  target: StagePointSchema,
  fieldOfViewDegrees: z.number().finite().min(5).max(120),
}
export const StageCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('SetDoorClearance'),
    ...meta,
    meters: z.number().finite().min(0.6).max(10),
  }),
  z.strictObject({
    type: z.literal('GroupObjects'),
    ...meta,
    nodeIds: z.array(IdSchema).min(2).max(200),
    name: NameSchema,
  }),
  z.strictObject({ type: z.literal('ReplaceScenery'), ...node, libraryAssetId: IdSchema }),
  z.strictObject({ type: z.literal('CreateStage'), ...meta, venue: VenueProposalSchema }),
  z.strictObject({
    type: z.literal('AddScenery'),
    ...node,
    name: NameSchema,
    kind: StageItemKindSchema.exclude(['camera', 'performer-marker']),
    libraryAssetId: IdSchema.nullable(),
    dimensionsMeters: StageDimensionsSchema,
    stepCount: z.number().int().min(1).max(200).optional(),
    transform: StageTransformSchema,
  }),
  z.strictObject({ type: z.literal('MoveObject'), ...node, position: StagePointSchema }),
  z.strictObject({ type: z.literal('RotateObject'), ...node, rotationDegrees: StagePointSchema }),
  z.strictObject({
    type: z.literal('ResizeObject'),
    ...node,
    dimensionsMeters: StageDimensionsSchema,
    stepCount: z.number().int().min(1).max(200).optional(),
  }),
  z.strictObject({
    type: z.literal('DuplicateObject'),
    ...meta,
    sourceNodeId: IdSchema,
    newNodeId: IdSchema,
    name: NameSchema,
    position: StagePointSchema,
  }),
  z.strictObject({ type: z.literal('RemoveObject'), ...node }),
  z.strictObject({ type: z.literal('RenameObject'), ...node, name: NameSchema }),
  z.strictObject({ type: z.literal('SetObjectLock'), ...node, locked: z.boolean() }),
  z.strictObject({ type: z.literal('SetObjectVisibility'), ...node, visible: z.boolean() }),
  z.strictObject({
    type: z.literal('SetScenicFinish'),
    ...node,
    finish: z.enum(['neutral', 'white', 'dark']),
  }),
  z.strictObject({ type: z.literal('AddCamera'), ...camera, name: NameSchema }),
  z.strictObject({ type: z.literal('SetCamera'), ...camera }),
  z.strictObject({
    type: z.literal('AddPerformerMarker'),
    ...node,
    name: NameSchema,
    position: StagePointSchema,
    facingDegrees: z.number().finite(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  z.strictObject({
    type: z.literal('SetPerformerPosition'),
    ...node,
    position: StagePointSchema,
    facingDegrees: z.number().finite(),
  }),
])
export type StageCommand = z.infer<typeof StageCommandSchema>
