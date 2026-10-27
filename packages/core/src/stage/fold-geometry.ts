import { add, rotatePoint } from '../remount/geometry'
import type { Vec3 } from '../remount/schema'
import type { StageCollisionGeometry } from './schema'

export function stageFoldGeometry(
  assetId: string,
  controls: { fold_angle_1_deg?: number; fold_angle_2_deg?: number } = {},
  scale: Vec3 = [1, 1, 1],
) {
  const count = assetId === 'SCN-FOLD-02' ? 2 : assetId === 'SCN-FOLD-03' ? 3 : 0
  if (!count) return undefined
  const angles = [controls.fold_angle_1_deg ?? 90, controls.fold_angle_2_deg ?? 90]
  const width = 0.9,
    height = 2.4,
    halfDepth = 0.02
  const collisionGeometry: StageCollisionGeometry = []
  let origin: Vec3 = [0, 0, 0],
    yaw = 0
  for (let panel = 0; panel < count; panel++) {
    if (panel) {
      const angle = angles[panel - 1]!
      const rotation = ((180 - angle) * Math.PI) / 180
      // Match the authored 40 mm leaf's surface-edge pivot in itemFoldJointFrame.
      const offset = -Math.sign(180 - angle) * halfDepth
      origin = add(
        origin,
        rotatePoint(
          [width - offset * Math.sin(rotation), 0, offset * (1 - Math.cos(rotation))],
          [0, yaw, 0],
        ),
      )
      yaw += rotation
    }
    collisionGeometry.push({
      vertices: [0, width].flatMap((x) =>
        [0, height].flatMap((y) =>
          [-halfDepth, halfDepth].map((z) => {
            const point = add(origin, rotatePoint([x, y, z], [0, yaw, 0]))
            return point.map((value, axis) => value * scale[axis]!) as Vec3
          }),
        ),
      ),
      faces: [
        [0, 1, 3, 2],
        [4, 6, 7, 5],
        [0, 4, 5, 1],
        [2, 3, 7, 6],
        [0, 2, 6, 4],
        [1, 5, 7, 3],
      ],
    })
  }
  const vertices = collisionGeometry.flatMap((part) => part.vertices)
  const bounds = [0, 1, 2].map((axis) => [
    Math.min(...vertices.map((point) => point[axis]!)),
    Math.max(...vertices.map((point) => point[axis]!)),
  ])
  const rounded = (value: number) => Math.round(value * 1e12) / 1e12
  return {
    collisionGeometry,
    dimensions: bounds.map(([min, max]) => rounded(max! - min!)) as Vec3,
    boundsCenter: bounds.map(([min, max]) => rounded((max! + min!) / 2)) as Vec3,
  }
}
