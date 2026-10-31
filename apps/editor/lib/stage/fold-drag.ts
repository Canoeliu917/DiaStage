import { snapFoldStop } from './rehearsal-measure'

export const FOLD_ANGLE_STEP = 45
export type FoldAngleDrag = { startAngle: number; pointerRadians: number; turnRadians: number }

export function advanceFoldAngle(drag: FoldAngleDrag, pointerRadians: number, _free = false) {
  const difference = pointerRadians - drag.pointerRadians
  const turnRadians = drag.turnRadians + Math.atan2(Math.sin(difference), Math.cos(difference))
  const degrees = drag.startAngle - (turnRadians * 180) / Math.PI
  return {
    drag: { ...drag, pointerRadians, turnRadians },
    // Fold flats only stop every 45°. Shift does not open a free angle.
    angle: snapFoldStop(degrees),
  }
}

// Recover the angle in the projected fold plane, including a tilted or nonuniformly scaled prop.
export function foldPointerRadians(
  point: [number, number],
  pivot: [number, number],
  x: [number, number],
  z: [number, number],
): number | null {
  const dx = point[0] - pivot[0],
    dz = point[1] - pivot[1]
  const determinant = x[0] * z[1] - x[1] * z[0]
  if (Math.abs(determinant) < 1e-10 || Math.hypot(dx, dz) < 1e-8) return null
  const localX = (dx * z[1] - dz * z[0]) / determinant
  const localZ = (x[0] * dz - x[1] * dx) / determinant
  return Math.atan2(-localZ, localX)
}
