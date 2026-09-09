import { z } from 'zod'
import {
  createStageFrame,
  GEOMETRY_EPSILON,
  getObjectCorners,
  objectSeparation,
  subtract,
  toFrameCoordinates,
  transformPoint,
  transformRotation,
} from './geometry'
import {
  type DeploymentConflict,
  type DeploymentPlan,
  DeploymentPlanSchema,
  ProductionLayoutSchema,
  RemountModeSchema,
  type RemountObject,
  RemountObjectSchema,
  type StageFrame,
  type Vec3,
  type VenueProfile,
  VenueProfileSchema,
} from './schema'

const DeploymentInputSchema = z.object({
  sourceVenue: VenueProfileSchema,
  targetVenue: VenueProfileSchema,
  layout: ProductionLayoutSchema,
  objects: z.array(RemountObjectSchema),
  obstacles: z.array(RemountObjectSchema).default([]),
  clearance: z.number().finite().nonnegative(),
  tolerance: z.number().finite().nonnegative(),
  mode: RemountModeSchema.default('one-to-one'),
  scale: z.literal(1).default(1),
})
export type CreateDeploymentPlanInput = z.input<typeof DeploymentInputSchema>

// One micrometer absorbs baked mesh rounding without changing any object coordinates.
const BOUNDS_TOLERANCE_METERS = 1e-6

function validateFrame(venue: VenueProfile): StageFrame {
  const derived = createStageFrame(venue.anchors)
  for (const key of ['origin', 'stageRight', 'upstage', 'up'] as const) {
    if (Math.hypot(...subtract(derived[key], venue.frame[key])) > 1e-6) {
      throw new Error(`场地 ${venue.name} 的坐标系与三个标定点不一致。`)
    }
  }
  return derived
}

export function createDeploymentPlan(input: CreateDeploymentPlanInput): DeploymentPlan {
  const value = DeploymentInputSchema.parse(input)
  const { sourceVenue, targetVenue, layout, objects, obstacles, clearance, tolerance, mode } = value
  if (mode !== 'one-to-one') throw new Error('第一阶段仅支持 1:1 刚体迁移。')
  if (layout.sourceVenueId !== sourceVenue.id) throw new Error('布局不属于所选源场地。')
  const sourceFrame = validateFrame(sourceVenue)
  const targetFrame = validateFrame(targetVenue)
  const errors = sourceVenue.anchors.map((anchor, index) =>
    Math.hypot(
      ...subtract(
        transformPoint(anchor.position, sourceFrame, targetFrame),
        targetVenue.anchors[index]!.position,
      ),
    ),
  )
  const maxError = Math.max(...errors)
  const rmsError = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length)
  const selected = new Set(layout.objectNodeIds)
  const byId = new Map(objects.map((object) => [object.nodeId, object]))
  if (selected.size !== layout.objectNodeIds.length || byId.size !== objects.length) {
    throw new Error('迁移对象 ID 不能重复。')
  }
  for (const id of selected) if (!byId.has(id)) throw new Error(`布局对象 ${id} 已删除或未加载。`)
  const placements = objects
    .filter((object) => selected.has(object.nodeId))
    .map((object) => {
      const { position, rotation, ...properties } = object
      return {
        ...properties,
        sourcePosition: position,
        sourceRotation: rotation,
        targetPosition: transformPoint(position, sourceFrame, targetFrame),
        targetRotation: transformRotation(rotation, sourceFrame, targetFrame),
      }
    })
  const moved: RemountObject[] = placements.map((placement) => ({
    ...placement,
    position: placement.targetPosition,
    rotation: placement.targetRotation,
  }))
  const paths = layout.paths.map((path) => ({
    id: path.id,
    name: path.name,
    sourcePoints: path.points,
    targetPoints: path.points.map((point) => transformPoint(point, sourceFrame, targetFrame)),
  }))
  const conflicts: DeploymentConflict[] = []
  const { width, depth, height } = targetVenue.bounds
  const outside = (point: Vec3): boolean => {
    const [right, up, back] = toFrameCoordinates(point, targetFrame)
    return (
      Math.abs(right) > width / 2 + BOUNDS_TOLERANCE_METERS ||
      back < -BOUNDS_TOLERANCE_METERS ||
      back > depth + BOUNDS_TOLERANCE_METERS ||
      up < -BOUNDS_TOLERANCE_METERS ||
      up > height + BOUNDS_TOLERANCE_METERS
    )
  }
  for (const object of moved) {
    if (getObjectCorners(object).some(outside))
      conflicts.push({
        type: 'out-of-bounds',
        severity: 'error',
        nodeId: object.nodeId,
        message: `${object.name} 超出目标场地可用范围。`,
      })
  }
  for (const path of paths) {
    if (path.targetPoints.some(outside))
      conflicts.push({
        type: 'out-of-bounds',
        severity: 'error',
        nodeId: path.id,
        message: `走位线 ${path.name} 超出目标场地可用范围。`,
      })
  }
  const checkPair = (a: RemountObject, b: RemountObject) => {
    if (
      a.nodeId === b.nodeId ||
      a.representation === 'virtual' ||
      b.representation === 'virtual' ||
      (a.assemblyId && a.assemblyId === b.assemblyId)
    )
      return
    const separation = objectSeparation(a, b)
    if (separation.intersects)
      conflicts.push({
        type: 'collision',
        severity: 'error',
        nodeId: a.nodeId,
        otherNodeId: b.nodeId,
        message: `${a.name} 与 ${b.name} 的声明包围体相交。`,
      })
    else if (separation.distance < clearance - GEOMETRY_EPSILON)
      conflicts.push({
        type: 'clearance',
        severity: 'warning',
        nodeId: a.nodeId,
        otherNodeId: b.nodeId,
        message: `${a.name} 与 ${b.name} 的净距 ${separation.distance.toFixed(3)} 米，小于 ${clearance} 米。`,
      })
  }
  // ponytail: quadratic pair checks; add a spatial index if large layouts make preview slow.
  moved.forEach((object, index) => {
    for (const other of moved.slice(index + 1)) checkPair(object, other)
    for (const obstacle of obstacles) checkPair(object, obstacle)
  })
  return DeploymentPlanSchema.parse({
    sourceVenueId: sourceVenue.id,
    targetVenueId: targetVenue.id,
    layoutId: layout.id,
    mode,
    scale: 1,
    calibration: { rmsError, maxError, tolerance, valid: maxError <= tolerance + GEOMETRY_EPSILON },
    placements,
    paths,
    conflicts,
  })
}
