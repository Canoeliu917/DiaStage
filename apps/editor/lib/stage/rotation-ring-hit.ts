import { type Camera, type Object3D, Vector3 } from 'three'
import type { TransformAxis } from './axis-transform'

export function rotationPointerMetrics(pointerType: string) {
  if (pointerType === 'touch') return { radius: 145, hitRadius: 14 }
  if (pointerType === 'pen') return { radius: 120, hitRadius: 8 }
  return { radius: 100, hitRadius: 22 }
}

type Point = { x: number; y: number }
type Viewport = { left: number; top: number; width: number; height: number }

/** Screen-space distance to the visible torus centreline, not the overlapping hit meshes. */
export function nearestRotationRing(
  pointer: Point,
  rings: ReadonlyMap<TransformAxis, { group: Object3D }>,
  camera: Camera,
  viewport: Viewport,
  hitRadius: number,
): TransformAxis | null {
  let winner: TransformAxis | null = null
  let nearest = hitRadius * hitRadius
  for (const axis of [0, 1, 2] as const) {
    const ring = rings.get(axis)
    if (!ring) continue
    ring.group.updateWorldMatrix(true, false)
    const project = (angle: number) => {
      const point = new Vector3(Math.cos(angle), Math.sin(angle), 0)
        .applyMatrix4(ring.group.matrixWorld)
        .project(camera)
      return {
        x: viewport.left + ((point.x + 1) * viewport.width) / 2,
        y: viewport.top + ((1 - point.y) * viewport.height) / 2,
        z: point.z,
      }
    }
    let previous = project(0)
    for (let step = 1; step <= 128; step++) {
      const next = project((step * Math.PI * 2) / 128)
      if (Math.abs(previous.z) <= 1 && Math.abs(next.z) <= 1) {
        const dx = next.x - previous.x
        const dy = next.y - previous.y
        const length = dx * dx + dy * dy
        const t = length
          ? Math.max(
              0,
              Math.min(1, ((pointer.x - previous.x) * dx + (pointer.y - previous.y) * dy) / length),
            )
          : 0
        const distance =
          (pointer.x - previous.x - t * dx) ** 2 + (pointer.y - previous.y - t * dy) ** 2
        // Equal-distance crossings use stable X/Y/Z order, never raycast/depth order.
        if (distance <= hitRadius * hitRadius && (winner === null || distance < nearest - 1e-6)) {
          nearest = distance
          winner = axis
        }
      }
      previous = next
    }
  }
  return winner
}
