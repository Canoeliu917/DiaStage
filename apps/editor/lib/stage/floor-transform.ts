import { type ItemNode, useScene } from '@pascal-app/core'
import { inverseRotatePoint } from '@pascal-app/core/remount'
import { prepareStageCollision } from '@pascal-app/core/stage'
import { worldPose } from '../remount-scene'
import { readStageDocument } from '../theatre/simulation-store'
import { stageContextObject, stageFrame } from './context'
import { stageModelBottom } from './model-contact'

export function floorSafeItemPatch(node: ItemNode, patch: Partial<ItemNode>): Partial<ItemNode> {
  if (!readStageDocument()?.venue) return patch
  const next = { ...node, ...patch }
  const item = stageContextObject(
    next,
    { ...useScene.getState().nodes, [node.id]: next },
    stageFrame(),
  )
  if (!item) return patch
  const bottom =
    stageModelBottom(item) ?? prepareStageCollision(item).bounds[1]![0] - item.transform.position.y
  const lift = Math.max(0, -bottom - item.transform.position.y)
  if (lift < 1e-7) return patch
  const localLift = inverseRotatePoint(
    [0, lift, 0],
    worldPose(node.parentId, useScene.getState().nodes).rotation,
  )
  return {
    ...patch,
    position: next.position.map((value, axis) => value + localLift[axis]!) as [
      number,
      number,
      number,
    ],
  }
}
