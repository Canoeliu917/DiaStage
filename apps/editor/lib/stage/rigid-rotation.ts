import { type BlockNode, getItemBoundsCenter, type ItemNode } from '@pascal-app/core'
import { Euler, Quaternion, Vector3 } from 'three'
import { STAGE_PROP_MENU } from './prop-assets'

export type RotationAxis = 'x' | 'y' | 'z'
export const STAGE_ROTATION_STEP = Math.PI / 6
export function stageManipulationCenter(node: ItemNode): [number, number, number] {
  const source = STAGE_PROP_MENU.assets.find((entry) => entry.id === node.asset.id)
  if (source?.articulation) {
    const width = source.dimensions_m.panel_width!
    return [
      width * node.scale[0],
      (source.dimensions_m.height! / 2) * node.scale[1],
      (source.articulation.panel_count === 3 ? -width / 2 : 0) * node.scale[2],
    ]
  }
  return getItemBoundsCenter(node)
}

export function itemEulerRotation(node: ItemNode, rotation: [number, number, number]) {
  const center = new Vector3(...stageManipulationCenter(node))
  const before = center.clone().applyEuler(new Euler(...node.rotation))
  const after = center.clone().applyEuler(new Euler(...rotation))
  return {
    position: new Vector3(...node.position).add(before).sub(after).toArray() as [
      number,
      number,
      number,
    ],
    rotation,
  }
}

// The guide requires a fixed rotation centre; floor contact is a separate placement action.
export function rigidRotation(node: BlockNode | ItemNode, axis: RotationAxis, degrees: number) {
  const direction = new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
  const turn = new Quaternion().setFromAxisAngle(direction, (degrees * Math.PI) / 180)
  if (node.type === 'block') {
    const points = node.topology.vertices.map((v) => new Vector3(...v.position))
    const min = points.reduce((a, b) => a.min(b), new Vector3(Infinity, Infinity, Infinity))
    const max = points.reduce((a, b) => a.max(b), new Vector3(-Infinity, -Infinity, -Infinity))
    const center = min.clone().add(max).multiplyScalar(0.5)
    if (axis === 'y') {
      const rotation = node.rotation + (degrees * Math.PI) / 180
      const pivot = new Vector3(center.x, 0, center.z)
      const before = pivot.clone().applyAxisAngle(direction, node.rotation)
      const after = pivot.clone().applyAxisAngle(direction, rotation)
      return {
        rotation,
        position: new Vector3(...node.position).add(before).sub(after).toArray() as [
          number,
          number,
          number,
        ],
      }
    }
    const rotated = points.map((p) => p.sub(center).applyQuaternion(turn).add(center))
    return {
      position: node.position,
      topology: {
        ...node.topology,
        vertices: node.topology.vertices.map((v, i) => ({
          ...v,
          position: rotated[i]!.toArray() as [number, number, number],
        })),
      },
    }
  }
  const rotation: [number, number, number] = [...node.rotation]
  rotation[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] += (degrees * Math.PI) / 180
  return itemEulerRotation(node, rotation)
}
