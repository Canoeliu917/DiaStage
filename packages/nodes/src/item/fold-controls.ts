import { type ItemFoldControls, ItemFoldControlsSchema } from '@pascal-app/core'
import { Box3, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from 'three'

type Vec3 = [number, number, number]
export type ItemFoldBounds = { dimensions: Vec3; boundsCenter: Vec3 }

// These authored flats use centred 40 mm frames. A double-acting hinge folds
// around the contacting surface edge, never through the thickness centre.
export function itemFoldJointFrame(joint: Object3D, angle: number) {
  const authored = joint.children.some((child) =>
    (child.userData.source_parts as string[] | undefined)?.some((name) =>
      name.startsWith('Stile_'),
    ),
  )
  const origin = new Vector3(...(joint.userData.foldAuthoredOrigin ?? joint.position.toArray()))
  let halfDepth = 0
  if (authored) {
    joint.userData.foldAuthoredOrigin ??= origin.toArray()
    for (const child of joint.children) {
      const mesh = child as Mesh
      if (!mesh.isMesh) continue
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix)
      halfDepth = Math.max(halfDepth, Math.abs(box.min.z), Math.abs(box.max.z))
    }
  }
  const offset = new Vector3(0, 0, -Math.sign(180 - angle) * halfDepth)
  const quaternion = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    ((180 - angle) * Math.PI) / 180,
  )
  return {
    pivot: origin.clone().add(offset),
    position: origin.clone().add(offset).sub(offset.clone().applyQuaternion(quaternion)),
    quaternion,
  }
}

export function applyItemFoldControls(
  root: Object3D,
  controls?: Partial<ItemFoldControls>,
): boolean {
  const values = ItemFoldControlsSchema.parse(controls ?? {})
  let changed = false
  for (const [name, key] of [
    ['Hinge_02', 'fold_angle_1_deg'],
    ['Hinge_03', 'fold_angle_2_deg'],
  ] as const) {
    const joint = root.getObjectByName(name)
    if (!joint) continue
    const target = itemFoldJointFrame(joint, values[key])
    if (joint.quaternion.equals(target.quaternion) && joint.position.equals(target.position))
      continue
    joint.quaternion.copy(target.quaternion)
    joint.position.copy(target.position)
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
