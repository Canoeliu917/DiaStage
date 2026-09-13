import { type AnyNode, getNodeLock, useScene } from '@pascal-app/core'
import { inverseRotatePoint, subtract } from '@pascal-app/core/remount'
import {
  type StagePlan,
  stageLayoutObjects,
  stageToWorldPosition,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { installPlacementPolicy } from '@pascal-app/editor'
import type { PlacementSnap } from '@/components/stage-entry/placement-math'
import { worldPose } from '../remount-scene'
import { readStageDocument } from '../theatre/simulation-store'
import { stageContactIds } from './contacts'
import { currentStageContext, stageContextObject, stageFrame, stageRevision } from './context'
import { snapStageObject } from './placement-snap'

let cachedContext: ReturnType<typeof currentStageContext> | null = null

export function nativeStagePlacementFeedback(node: AnyNode, preview: StagePlan | null = null) {
  if (!readStageDocument()) return null
  // Hosted architectural items keep their host-specific validation.
  if (node.type === 'item' && (node.asset.attachTo || node.wallId || node.blockFaceId)) return null
  const state = useScene.getState()
  const candidate = stageContextObject(node, { ...state.nodes, [node.id]: node }, stageFrame())
  if (!candidate) return null
  if (cachedContext?.documentVersion !== stageRevision())
    cachedContext = currentStageContext([], true)
  const context = cachedContext
  const proposal = {
    proposalId: candidate.id,
    existingNodeId: candidate.id,
    kind: candidate.kind,
    displayName: candidate.name,
    dimensionsMeters: candidate.dimensionsMeters,
    collisionGeometry: candidate.collisionGeometry,
    stepCount: candidate.stepCount,
    transform: candidate.transform,
    libraryAssetId: null,
    certainty: 'stated' as const,
    assumptionIds: [],
    evidenceIds: [],
  }
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'manual',
    venue: null,
    items: [proposal],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  // Contacts cannot block a drop. Validate this object's bounds separately so
  // a drag does not parse or prepare all the other geometries twice per frame.
  const valid =
    !state.readOnly &&
    !getNodeLock(state.nodes, node.id, true) &&
    validateStagePlan(plan, { ...context, objects: [candidate] }).valid
  const layout = preview
    ? {
        ...preview,
        items: preview.items.filter((item) => item.existingNodeId !== node.id),
      }
    : null
  const objects = stageLayoutObjects(
    {
      ...context,
      objects: [...context.objects.filter((item) => item.id !== node.id), candidate],
    },
    layout,
  )
  return { valid, contact: stageContactIds(objects).has(candidate.id) }
}

export function installNativeStagePlacement(
  getPreview: () => StagePlan | null,
  getSnap?: () => PlacementSnap,
) {
  return installPlacementPolicy({
    enabled: () => readStageDocument() !== null,
    evaluate: (node) => nativeStagePlacementFeedback(node, getPreview()),
    snap: (source, position) => {
      if (
        !getSnap ||
        source.type !== 'item' ||
        source.asset.attachTo ||
        source.wallId ||
        source.blockFaceId
      )
        return null
      const node = { ...source, position }
      const nodes = useScene.getState().nodes
      const frame = stageFrame()
      const candidate = stageContextObject(node, { ...nodes, [node.id]: node }, frame)
      if (!candidate) return null
      if (cachedContext?.documentVersion !== stageRevision())
        cachedContext = currentStageContext([], true)
      const snapped = snapStageObject(
        candidate.transform.position,
        candidate,
        cachedContext,
        getSnap(),
      )
      const delta = inverseRotatePoint(
        subtract(
          stageToWorldPosition(snapped.position, frame),
          stageToWorldPosition(candidate.transform.position, frame),
        ),
        worldPose(node.parentId, nodes).rotation,
      )
      return position.map((value, axis) => value + delta[axis]!) as [number, number, number]
    },
  })
}
