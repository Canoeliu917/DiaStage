import {
  type AnyNodeId,
  type FloorplanAffordance,
  type StairNode,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { isAngleSnapActive } from '@pascal-app/editor'
import { rotateAffordanceDelta } from '../shared/rotate-affordance'

export const stairRotateAffordance: FloorplanAffordance<StairNode> = {
  start({ node, initialPlanPoint }) {
    const stairId = node.id as AnyNodeId
    const initialRotation = node.rotation ?? 0
    const cx = node.position[0]
    const cz = node.position[2]
    const initialAngle = Math.atan2(initialPlanPoint[1] - cz, initialPlanPoint[0] - cx)
    let lastRotation = initialRotation

    return {
      affectedIds: [stairId],
      apply({ planPoint }) {
        const delta = rotateAffordanceDelta({
          center: [cx, cz],
          initialAngle,
          planPoint,
          free: !isAngleSnapActive(),
        })
        const newRotation = initialRotation - delta
        lastRotation = newRotation
        useLiveNodeOverrides.getState().set(stairId, { rotation: newRotation })
        useScene.getState().markDirty(stairId)
      },
      canCommit() {
        return true
      },
      commit() {
        useLiveNodeOverrides.getState().clear(stairId)
        useScene.getState().updateNode(stairId, { rotation: lastRotation })
      },
    }
  },
}
