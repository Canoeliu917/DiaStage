import { type ItemFoldControls, ItemFoldControlsSchema } from '@pascal-app/core'
import { Box3, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from 'three'

type Vec3 = [number, number, number]
export type ItemFoldBounds = { dimensions: Vec3; boundsCenter: Vec3 }

export function applyItemFoldControls(
  root: Object3D,
  controls?: Partial<ItemFoldControls>,
): boolean {
  const values = ItemFoldControlsSchema.parse(controls ?? {})
  const axis = new Vector3(0, 1, 0)
  let changed = false
  for (const [name, key] of [
    ['Hinge_02', 'fold_angle_1_deg'],
    ['Hinge_03', 'fold_angle_2_deg'],
  ] as const) {
    const joint = root.getObjectByName(name)
    if (!joint) continue
    const target = new Quaternion().setFromAxisAngle(axis, ((180 - values[key]) * Math.PI) / 180)
    if (joint.quaternion.equals(target)) continue
    joint.quaternion.copy(target)
    joint.updateMatrix()
    changed = true
  }
  if (changed) root.updateWorldMatrix(true, true)
  return changed
}

// Registry roots include a child group with the instance scale; remove that scale
// before storing these values on asset. A bare GLTF clone uses the default [1,1,1].
export function computeItemFoldBounds(
  root: Object3D,
  instanceScale: Vec3 = [1, 1, 1],
): ItemFoldBounds | null {
  if (instanceScale.some((value) => !Number.isFinite(value) || value === 0)) return null
  const panels = root.getObjectByName('Hinge_01')
  if (!panels) return null
  root.updateWorldMatrix(true, true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const box = new Box3()
  const matrix = new Matrix4()
  const point = new Vector3()
  panels.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible || mesh.name === 'cutout') return
    const positions = mesh.geometry.getAttribute('position')
    if (!positions) return
    matrix.multiplyMatrices(inverse, mesh.matrixWorld)
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(matrix)
      point.set(point.x / instanceScale[0], point.y / instanceScale[1], point.z / instanceScale[2])
      box.expandByPoint(point)
    }
  })
  if (box.isEmpty()) return null
  return {
    dimensions: box.getSize(new Vector3()).toArray() as Vec3,
    boundsCenter: box.getCenter(new Vector3()).toArray() as Vec3,
  }
}
