import { z } from 'zod'

export const Vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
export type Vec3 = z.infer<typeof Vec3Schema>

export const StageFrameSchema = z
  .object({
    origin: Vec3Schema,
    stageRight: Vec3Schema,
    upstage: Vec3Schema,
    up: Vec3Schema,
  })
  .refine((frame) => {
    const [right, back, up] = [frame.stageRight, frame.upstage, frame.up]
    const perpendicular = Math.abs(right.reduce((sum, n, i) => sum + n * back[i]!, 0)) < 1e-6
    const upright = Math.hypot(up[0], up[1] - 1, up[2]) < 1e-6
    const horizontal = Math.abs(right[1]) < 1e-6 && Math.abs(back[1]) < 1e-6
    const unit = [right, back, up].every((axis) => Math.abs(Math.hypot(...axis) - 1) < 1e-6)
    const handed = right[2] * back[0] - right[0] * back[2] > 1 - 1e-6
    return perpendicular && upright && horizontal && unit && handed
  }, '舞台坐标轴必须为正交单位轴，舞台上方为 +Y。')
export type StageFrame = z.infer<typeof StageFrameSchema>

export const VenueAnchorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: Vec3Schema,
})
export type VenueAnchor = z.infer<typeof VenueAnchorSchema>

export const VenueProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scanNodeId: z.string().min(1).optional(),
  frame: StageFrameSchema,
  bounds: z.object({
    width: z.number().finite().positive(),
    depth: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }),
  anchors: z.tuple([VenueAnchorSchema, VenueAnchorSchema, VenueAnchorSchema]),
})
export type VenueProfile = z.infer<typeof VenueProfileSchema>

export const ProductionLayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceVenueId: z.string().min(1),
  objectNodeIds: z.array(z.string().min(1)),
  paths: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        points: z.array(Vec3Schema).min(2),
      }),
    )
    .default([]),
})
export type ProductionLayout = z.infer<typeof ProductionLayoutSchema>

export const RemountModeSchema = z.enum(['one-to-one', 'focus-zone', 'teaching-scale'])
export type RemountMode = z.infer<typeof RemountModeSchema>
export const RepresentationSchema = z.enum(['physical', 'proxy', 'virtual'])

const objectFields = {
  nodeId: z.string().min(1),
  name: z.string().min(1),
  representation: RepresentationSchema,
  dimensions: Vec3Schema.refine((v) => v.every((n) => n > 0), 'Dimensions must be positive.'),
  boundsCenter: Vec3Schema,
  assemblyId: z.string().min(1).optional(),
}

export const RemountObjectSchema = z.object({
  ...objectFields,
  position: Vec3Schema,
  rotation: Vec3Schema,
})
export type RemountObject = z.infer<typeof RemountObjectSchema>

export const DeploymentPlacementSchema = z.object({
  ...objectFields,
  sourcePosition: Vec3Schema,
  targetPosition: Vec3Schema,
  sourceRotation: Vec3Schema,
  targetRotation: Vec3Schema,
})
export type DeploymentPlacement = z.infer<typeof DeploymentPlacementSchema>

export const DeploymentConflictSchema = z.object({
  type: z.enum(['out-of-bounds', 'collision', 'clearance']),
  severity: z.enum(['error', 'warning']),
  nodeId: z.string().min(1),
  otherNodeId: z.string().min(1).optional(),
  message: z.string(),
})
export type DeploymentConflict = z.infer<typeof DeploymentConflictSchema>

export const DeploymentPlanSchema = z.object({
  sourceVenueId: z.string().min(1),
  targetVenueId: z.string().min(1),
  layoutId: z.string().min(1),
  mode: RemountModeSchema,
  scale: z.literal(1),
  calibration: z.object({
    rmsError: z.number().finite().nonnegative(),
    maxError: z.number().finite().nonnegative(),
    tolerance: z.number().finite().nonnegative(),
    valid: z.boolean(),
  }),
  placements: z.array(DeploymentPlacementSchema),
  paths: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      sourcePoints: z.array(Vec3Schema).min(2),
      targetPoints: z.array(Vec3Schema).min(2),
    }),
  ),
  conflicts: z.array(DeploymentConflictSchema),
})
export type DeploymentPlan = z.infer<typeof DeploymentPlanSchema>

export interface VenueCaptureAdapter {
  loadVenueProfile(source: unknown): Promise<VenueProfile>
}
