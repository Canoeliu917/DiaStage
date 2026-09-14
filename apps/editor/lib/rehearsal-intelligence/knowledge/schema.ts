import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const text = z.string().trim().min(1).max(1200)

export const KnowledgeSourceTypeSchema = z.enum(['knowledge_source', 'example_source'])
export const KnowledgeDomainSchema = z.enum([
  'stage_assets',
  'scenic_flats',
  'spatial_directing',
  'directing',
  'dramaturgy',
  'performance',
  'voice',
])
export const KnowledgeStatusSchema = z.enum(['ACTIVE', 'OBSERVE', 'FUTURE'])
export const KnowledgeAuthorityTierSchema = z.enum([
  'primary_source',
  'authoritative_reference',
  'peer_reviewed',
  'institutional_teaching',
  'exam_notes',
])
export const KnowledgeDefinitionStatusSchema = z.enum([
  'canonical',
  'tradition_specific',
  'translation_variant',
  'contested',
  'heuristic',
  'operational',
  'descriptive',
])
export const KnowledgeConceptKindSchema = z.enum([
  'stage_term',
  'asset',
  'spatial_relation',
  'operation',
  'theory_concept',
  'historical_entity',
  'example_pattern',
])
export const KnowledgeExecutionEligibilitySchema = z.enum([
  'allowed',
  'proposal_only',
  'knowledge_only',
])
export const KnowledgeRelationTypeSchema = z.enum([
  'broader_than',
  'narrower_than',
  'part_of',
  'related_to',
  'opposite_of',
  'distinct_from',
  'same_spatial_side_as',
  'supports',
])

export const KnowledgeSourceSchema = z.strictObject({
  sourceId: id,
  title: text,
  sourceType: KnowledgeSourceTypeSchema,
  domains: z.array(KnowledgeDomainSchema).min(1),
  localFileRef: z.string().trim().min(1).max(500),
  ingestionStatus: z.enum(['verified', 'partial', 'unreadable']),
  version: id,
  notes: text,
})

export const KnowledgeSourceRefSchema = z.strictObject({
  sourceId: id,
  locator: z.string().trim().min(1).max(240),
  role: z.enum(['candidate_definition', 'alias', 'historical_terminology', 'example']),
})

export const KnowledgeRelationSchema = z.strictObject({
  type: KnowledgeRelationTypeSchema,
  targetId: id,
})

export const DiaKnowledgeConceptSchema = z.strictObject({
  id,
  label: text,
  canonicalLabel: text,
  conceptKind: KnowledgeConceptKindSchema.exclude(['example_pattern']),
  domain: KnowledgeDomainSchema,
  status: KnowledgeStatusSchema,
  executionEligibility: KnowledgeExecutionEligibilitySchema,
  authorityTier: KnowledgeAuthorityTierSchema,
  definitionStatus: KnowledgeDefinitionStatusSchema,
  tradition: id,
  authorityRefs: z.array(
    z.strictObject({
      title: text,
      url: z.url(),
      authorityTier: KnowledgeAuthorityTierSchema.exclude(['exam_notes']),
    }),
  ),
  definition: text,
  aliases: z.array(text),
  disputedNotes: z.array(text),
  historicalAttributions: z.strictObject({
    founders: z.array(text),
    proposers: z.array(text),
    participants: z.array(text),
    adapters: z.array(text),
  }),
  relations: z.array(KnowledgeRelationSchema),
  positiveExamples: z.array(text),
  contrastExamples: z.array(text),
  executableIntents: z.array(id),
  sourceRefs: z.array(KnowledgeSourceRefSchema).min(1),
  confidence: z.number().min(0).max(1),
  version: id,
})

export const DiaSceneExampleSchema = z.strictObject({
  id,
  title: text,
  conceptKind: z.literal('example_pattern'),
  definitionStatus: z.literal('descriptive'),
  executionEligibility: z.literal('knowledge_only'),
  sourceRef: KnowledgeSourceRefSchema,
  sceneDescription: text,
  stageObjects: z.array(text),
  entrances: z.array(text),
  exits: z.array(text),
  directions: z.array(text),
  spatialRelationships: z.array(text),
  backgroundForeground: z.array(text),
  audienceStageRelation: z.array(text),
  objectLayout: z.array(text),
  version: id,
})

export const KnowledgeExtractionReportSchema = z.strictObject({
  pipeline: z
    .array(
      z.enum([
        'extract',
        'normalize',
        'deduplicate',
        'alias_merge',
        'relations',
        'source_refs',
        'confidence',
        'status',
      ]),
    )
    .length(8),
  rawCandidateCount: z.number().int().nonnegative(),
  candidateConceptCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  observeCount: z.number().int().nonnegative(),
  futureCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  duplicateGroups: z.array(z.array(text).min(2)),
  conflictCount: z.number().int().nonnegative(),
  conflictConceptIds: z.array(id),
  coveredSourceIds: z.array(id),
})

export const DiaKnowledgeCatalogSchema = z.strictObject({
  version: id,
  sources: z.array(KnowledgeSourceSchema).length(6),
  concepts: z.array(DiaKnowledgeConceptSchema).min(80).max(150),
  sceneExamples: z.array(DiaSceneExampleSchema),
  extraction: KnowledgeExtractionReportSchema,
})

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>
export type KnowledgeDomain = z.infer<typeof KnowledgeDomainSchema>
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>
export type KnowledgeAuthorityTier = z.infer<typeof KnowledgeAuthorityTierSchema>
export type KnowledgeDefinitionStatus = z.infer<typeof KnowledgeDefinitionStatusSchema>
export type KnowledgeConceptKind = z.infer<typeof KnowledgeConceptKindSchema>
export type KnowledgeExecutionEligibility = z.infer<typeof KnowledgeExecutionEligibilitySchema>
export type KnowledgeSourceRef = z.infer<typeof KnowledgeSourceRefSchema>
export type KnowledgeRelation = z.infer<typeof KnowledgeRelationSchema>
export type DiaKnowledgeConcept = z.infer<typeof DiaKnowledgeConceptSchema>
export type DiaSceneExample = z.infer<typeof DiaSceneExampleSchema>
export type DiaKnowledgeCatalog = z.infer<typeof DiaKnowledgeCatalogSchema>
