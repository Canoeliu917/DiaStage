import { z } from 'zod'
import { Vec3Schema } from './schema'

const id = z.string().trim().min(1).max(160)
const distance = z.number().finite().nonnegative()
const subject = z.strictObject({ type: z.enum(['performer', 'object']), id })
const common = {
  id,
  label: z.string().trim().min(1).max(300),
  priority: z.enum(['must', 'prefer']),
}

export const TheatreConstraintSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...common,
    type: z.literal('near-object'),
    subject,
    objectId: id,
    maximumDistanceMeters: distance,
  }),
  z.strictObject({
    ...common,
    type: z.literal('distance-preference'),
    subjects: z.tuple([subject, subject]),
    distanceMeters: distance,
    toleranceMeters: distance,
  }),
  z.strictObject({
    ...common,
    type: z.literal('keep-out-zone'),
    subject,
    zone: z
      .strictObject({ min: Vec3Schema, max: Vec3Schema })
      .refine((zone) => zone.min.every((value, axis) => value < zone.max[axis]!), '区域边界无效'),
  }),
  z.strictObject({
    ...common,
    type: z.literal('preserve-relation'),
    subjects: z.tuple([subject, subject]),
    relation: z.string().trim().min(1).max(600),
    sourceVersionId: id,
  }),
  z.strictObject({
    ...common,
    type: z.literal('must-use-entrance'),
    performerId: id,
    entranceNodeId: id,
  }),
])

// P1 data contract only: no model-maintained memory or constraint solver is mounted.
export const DiaProjectStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    sceneId: id,
    sceneVersion: id,
    currentExcerpt: z.string().max(12000),
    directorIntent: z.string().max(2000),
    selectedCharacterIds: z.array(id).max(24),
    importantConstraints: z.array(TheatreConstraintSchema).max(128),
    baselineVersionId: id.nullable(),
    targetVenueId: id.nullable(),
    currentQuestion: z.string().max(2000),
  })
  .superRefine((state, context) => {
    if (
      new Set(state.selectedCharacterIds).size !== state.selectedCharacterIds.length ||
      new Set(state.importantConstraints.map((constraint) => constraint.id)).size !==
        state.importantConstraints.length
    )
      context.addIssue({ code: 'custom', message: '人物或约束编号不可重复' })
  })

export type TheatreConstraint = z.infer<typeof TheatreConstraintSchema>
export type DiaProjectState = z.infer<typeof DiaProjectStateSchema>
