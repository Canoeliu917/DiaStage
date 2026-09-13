import { type BlockNode, getItemBoundsCenter, type ItemNode } from '@pascal-app/core'
import { Euler, Quaternion, Vector3 } from 'three'

export type RotationAxis = 'x' | 'y' | 'z'

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
  const center = new Vector3(...getItemBoundsCenter(node))
  const before = new Quaternion().setFromEuler(new Euler(...node.rotation))
  const after = axis === 'y' ? before.clone().premultiply(turn) : before.clone().multiply(turn)
  const centerBefore = center.clone().applyQuaternion(before)
  const centerAfter = center.clone().applyQuaternion(after)
  const position = new Vector3(...node.position).add(centerBefore).sub(centerAfter)
  const euler = new Euler().setFromQuaternion(after)
  return {
    position: position.toArray() as [number, number, number],
    rotation: [euler.x, euler.y, euler.z] as [number, number, number],
  }
}
