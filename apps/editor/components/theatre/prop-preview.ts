import {
  type AnyNodeId,
  GROUND_SUPPORT_ID,
  getFloorPlacedElevation,
  sceneRegistry,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { Euler, Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import type { PropPose } from '@/lib/theatre/blocking'
import type { Vec3 } from '@/lib/theatre/schema'
import { cameraFloorplanMatrix } from '../camera-studio/camera-stage-floorplan'

type Nodes = ReturnType<typeof useScene.getState>['nodes']
const FIELDS = ['theatrePreview', 'position', 'supportSlabId']

export function theatreParentMatrix(
  nodes: Nodes,
  id: string | null,
  seen = new Set<string>(),
): Matrix4 {
  if (id === null) return new Matrix4()
  if (seen.has(id)) throw new Error('道具层级包含循环')
  seen.add(id)
  const node = nodes[id as AnyNodeId]
  if (!node) throw new Error('道具父节点不存在')
  if (node.type === 'site') return new Matrix4()
  if (node.type === 'level') {
    const frame = cameraFloorplanMatrix(nodes, id)
    if (!frame) throw new Error('道具所在表演区无法定位')
    return frame
  }
  if (node.type !== 'building' && node.type !== 'block' && node.type !== 'item')
    throw new Error('请将道具放在表演区或可移动物件上再预演')
  const parent = theatreParentMatrix(nodes, node.parentId, seen)
  const position: Vec3 = [...node.position]
  const rotation: Vec3 = typeof node.rotation === 'number' ? [0, node.rotation, 0] : node.rotation
  if (node.type !== 'building')
    position[1] += getFloorPlacedElevation({ node, nodes, position, rotation })
  return parent.multiply(
    new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(1, 1, 1),
    ),
  )
}

export function createTheatrePropPreview() {
  const owned = new Map<string, { object: Object3D | undefined; position: Vector3 | undefined }>()
  const restore = () => {
    for (const [id, original] of owned) {
      if (original.object && original.position && sceneRegistry.nodes.get(id) === original.object) {
        original.object.position.copy(original.position)
        original.object.updateWorldMatrix(true, true)
      }
      useLiveNodeOverrides.getState().clearFields(id, FIELDS)
      if (useScene.getState().nodes[id as AnyNodeId]) useScene.getState().markDirty(id as AnyNodeId)
    }
    owned.clear()
  }
  const apply = (props: PropPose[]) => {
    const nodes = useScene.getState().nodes
    for (const prop of props) {
      if (!prop.nodeId) continue
      if (!prop.position.every(Number.isFinite)) throw new Error('道具位置包含非法数值')
      const node = nodes[prop.nodeId as AnyNodeId]
      if (!node || (node.type !== 'block' && node.type !== 'item'))
        throw new Error('关联道具已不存在或不支持移动')
      const object = sceneRegistry.nodes.get(prop.nodeId)
      if (!owned.has(prop.nodeId)) {
        if (useLiveNodeOverrides.getState().get(prop.nodeId))
          throw new Error('道具正在被其他操作预览')
        owned.set(prop.nodeId, { object, position: object?.position.clone() })
      }
      const original = owned.get(prop.nodeId)!
      if (object && object !== original.object) {
        original.object = object
        original.position = object.position.clone()
      }
      let frame: Matrix4
      if (object?.parent) {
        object.parent.updateWorldMatrix(true, false)
        frame = object.parent.matrixWorld.clone()
      } else frame = theatreParentMatrix(nodes, node.parentId)
      if (!frame.elements.every(Number.isFinite) || Math.abs(frame.determinant()) < 1e-10)
        throw new Error('道具父节点的空间变换无效')
      const local = new Vector3(...prop.position).applyMatrix4(frame.invert()).toArray() as Vec3
      const effective = { ...node, supportSlabId: GROUND_SUPPORT_ID, position: local }
      const position: Vec3 = [...local]
      position[1] -= getFloorPlacedElevation({ node: effective, nodes, position: local })
      const previous = useLiveNodeOverrides.getState().get(prop.nodeId)?.position
      if (!Array.isArray(previous) || position.some((value, axis) => value !== previous[axis])) {
        useLiveNodeOverrides
          .getState()
          .set(prop.nodeId, { theatrePreview: true, position, supportSlabId: GROUND_SUPPORT_ID })
      }
      if (object) {
        object.position.set(...local)
        object.updateWorldMatrix(false, true)
      }
    }
  }
  return { apply, restore }
}
