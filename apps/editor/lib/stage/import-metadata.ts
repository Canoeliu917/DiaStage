import { PlanAssumptionSchema, ScriptEvidenceSchema, type StagePlan } from '@pascal-app/core/stage'
import { z } from 'zod'

export const ScriptFileSchema = z.strictObject({
  name: z.string().min(1).max(255),
  type: z.enum(['pdf', 'docx']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  pageCount: z.number().int().positive().max(300).nullable(),
  paragraphCount: z.number().int().nonnegative().nullable(),
})
export type ScriptFile = z.infer<typeof ScriptFileSchema>
export const ScriptImportSchema = z.strictObject({
  id: z.string().min(1).max(160),
  source: z.literal('script'),
  file: ScriptFileSchema,
  importedAt: z.iso.datetime(),
  evidence: z.array(ScriptEvidenceSchema).max(400),
  assumptions: z.array(PlanAssumptionSchema).max(200),
})
export type ScriptImport = z.infer<typeof ScriptImportSchema>

/** Keep only excerpts used by the confirmed selection, never the uploaded document. */
export function confirmedScriptImport(plan: StagePlan, file: ScriptFile, id: string): ScriptImport {
  const evidence = new Set(plan.items.flatMap((item) => item.evidenceIds))
  const assumptions = new Set(plan.items.flatMap((item) => item.assumptionIds))
  return ScriptImportSchema.parse({
    id,
    source: 'script',
    file,
    importedAt: new Date().toISOString(),
    evidence: plan.evidence.filter((item) => evidence.has(item.id)),
    assumptions: plan.assumptions.filter((item) => assumptions.has(item.id)),
  })
}
