import { z } from 'zod'
import { type StagePoint, StagePointSchema } from './schema'

const WorldVectorSchema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
export const StageCoordinateFrameSchema = z.strictObject({
  origin: WorldVectorSchema,
  depthMeters: z.number().finite().positive(),
})
export type StageCoordinateFrame = z.infer<typeof StageCoordinateFrameSchema>
export type WorldVector = z.infer<typeof WorldVectorSchema>
const radians = Math.PI / 180

// Existing graphs keep their centre origin; only the domain boundary changes basis.
export function stageToWorldPosition(point: StagePoint, frame: StageCoordinateFrame): WorldVector {
  const p = StagePointSchema.parse(point)
  const { origin, depthMeters } = StageCoordinateFrameSchema.parse(frame)
  return [origin[0] - p.x, origin[1] + p.y, origin[2] + depthMeters / 2 - p.z]
}

export function worldToStagePosition(point: WorldVector, frame: StageCoordinateFrame): StagePoint {
  const p = WorldVectorSchema.parse(point)
  const { origin, depthMeters } = StageCoordinateFrameSchema.parse(frame)
  return { x: origin[0] - p[0], y: p[1] - origin[1], z: origin[2] + depthMeters / 2 - p[2] }
}

export function stageToWorldRotation(rotationDegrees: StagePoint): WorldVector {
  const p = StagePointSchema.parse(rotationDegrees)
  // Ry(PI) * Rx(x) * Ry(y) * Rz(z) = Rx(-x) * Ry(y + PI) * Rz(z).
  return [-p.x * radians, (p.y + 180) * radians, p.z * radians]
}

export function worldToStageRotation(rotation: WorldVector): StagePoint {
  const p = WorldVectorSchema.parse(rotation)
  return { x: -p[0] / radians, y: p[1] / radians - 180, z: p[2] / radians }
}

export function stagePositionLabel(position: StagePoint, depthMeters: number): string {
  const x = Math.abs(position.x) < 0.05 ? '中心线' : position.x > 0 ? '台右' : '台左'
  const z =
    position.z < depthMeters / 3 ? '台前' : position.z > (depthMeters * 2) / 3 ? '台后' : '中区'
  return `${x} · ${z}`
}
