import {
  type AnyNodeId,
  type ItemNode,
  getNodeLock,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import {
  type SceneContextSummary,
  stageObjectsTouch,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { computeItemFoldBounds, limitItemFoldControls } from '@pascal-app/nodes/item-fold'
import type { DiaStageProposal } from '../rehearsal-intelligence/knowledge/stage-proposal'
import { STAGE_PROP_MENU } from './prop-assets'
import {
  SpatialFoldConfigurationSchema,
  type SpatialFoldConfiguration,
  type SpatialSolution,
  spatialConstraintsForProposal,
} from './spatial-constraints'
import { solveSpatialConstraints, spatialCandidatePlan } from './spatial-solver'

/** Existing Folding Runtime works on a clone; the formal model hierarchy is never touched. */
export function prepareSpatialFold(node: ItemNode, input: SpatialFoldConfiguration) {
  const configuration = SpatialFoldConfigurationSchema.parse(input)
  const root = sceneRegistry.nodes.get(node.id)
  const articulation = STAGE_PROP_MENU.assets.find(
    (asset) => asset.id === node.asset.id,
  )?.articulation
  if (
    configuration.subject !== node.id ||
    node.asset.id !== 'SCN-FOLD-03' ||
    root?.userData.itemModelSettled !== true ||
    !root?.getObjectByName('Hinge_03') ||
    !articulation ||
    node.asset.attachTo ||
    node.wallId ||
    node.blockFaceId
  )
    return null
  const angles = Object.values(configuration.controls)
  if (
    angles[0] !== angles[1] ||
    articulation.joints.some(
      (joint, index) =>
        angles[index]! < joint.included_angle_range_deg[0]! ||
        angles[index]! > joint.included_angle_range_deg[1]!,
    )
  )
    return null
  const clone = root.clone(true)
  const limited = limitItemFoldControls(clone, node.controls ?? {}, configuration.controls)
  if (
    limited.limited ||
    JSON.stringify(limited.controls) !== JSON.stringify(configuration.controls)
  )
    return null
  const bounds = computeItemFoldBounds(clone, node.scale)
  return bounds ? { controls: configuration.controls, asset: { ...node.asset, ...bounds } } : null
}

export function solveStageSpatialProposal(
  proposal: DiaStageProposal,
  snapshot: SceneContextSummary,
): SpatialSolution {
  const constraints = spatialConstraintsForProposal(proposal)
  const nodes = useScene.getState().nodes
  const writable = (subject: string) => {
    const node = nodes[subject as AnyNodeId]
    return (
      node &&
      !getNodeLock(nodes, node.id, true) &&
      (node.type !== 'item' ||
        (sceneRegistry.nodes.get(node.id)?.userData.itemModelSettled === true &&
          !node.asset.attachTo &&
          !node.wallId &&
          !node.blockFaceId))
    )
  }
  const constraint = constraints[0]
  if (constraint?.sourceIntent !== 'fold_hinge') {
    const result = solveSpatialConstraints({
      snapshot,
      proposal,
      assets: snapshot.objects,
      constraints,
    })
    const beforeFilter = result.candidates.length
    result.candidates = result.candidates.filter((candidate) =>
      candidate.plan.items.every((item) => writable(item.existingNodeId!)),
    )
    result.selectedCandidateId = result.candidates[0]?.candidateId ?? null
    if (result.candidates.length !== beforeFilter)
      result.warnings.push('已排除模型未就绪、锁定或宿主附着对象的候选。')
    return result
  }
  const solution: SpatialSolution = {
    constraints,
    candidates: [],
    selectedCandidateId: null,
    warnings: [
      '三联景片使用现有铰链运行时，保持整件位置和旋转；只保留资产 manifest 允许的 U 型角度。',
    ],
  }
  const original = snapshot.objects.find((item) => item.id === constraint.subjects[0])
  const node = original && useScene.getState().nodes[original.id as AnyNodeId]
  if (
    original &&
    node?.type === 'item' &&
    writable(node.id) &&
    Math.abs(node.rotation[0]) < 1e-7 &&
    Math.abs(node.rotation[2]) < 1e-7
  )
    for (const angle of [90, 270] as const) {
      const fold = {
        subject: node.id,
        controls: { fold_angle_1_deg: angle, fold_angle_2_deg: angle },
      }
      const patch = prepareSpatialFold(node, fold)
      if (!patch) continue
      const dimensions = patch.asset.dimensions.map(
        (value, index) => value * Math.abs(node.scale[index]!),
      )
      const center = patch.asset.boundsCenter!.map((value, index) => value * node.scale[index]!)
      const [w, h, d] = dimensions
      if (original.transform.position.y + center[1]! - h! / 2 < -1e-6) continue
      const vertices = [-1, 1].flatMap((x) =>
        [-1, 1].flatMap((y) =>
          [-1, 1].map((z): [number, number, number] => [
            center[0]! + (x * w!) / 2,
            center[1]! + (y * h!) / 2,
            center[2]! + (z * d!) / 2,
          ]),
        ),
      )
      const folded = {
        ...original,
        dimensionsMeters: { width: w!, height: h!, depth: d! },
        collisionGeometry: [
          {
            vertices,
            faces: [
              [0, 1, 3, 2],
              [4, 6, 7, 5],
              [0, 4, 5, 1],
              [2, 3, 7, 6],
              [0, 2, 6, 4],
              [1, 5, 7, 3],
            ],
          },
        ],
      }
      // V0.1 fails closed on anything within the folded envelope, including its hollow interior.
      if (
        snapshot.objects.some((other) => other.id !== folded.id && stageObjectsTouch(folded, other))
      )
        continue
      const checked = validateStagePlan(spatialCandidatePlan([folded], solution.warnings), snapshot)
      if (!checked.valid) continue
      solution.candidates.push({
        candidateId: `${proposal.proposalId}:fold-${angle}`,
        actions: [{ type: 'fold', subject: node.id }],
        folds: [fold],
        resolvedTransforms: [{ subject: node.id, transform: structuredClone(original.transform) }],
        constraintsSatisfied: [0],
        constraintsUnsatisfied: [],
        warnings: solution.warnings,
        feasibility: 'feasible',
        movementCost:
          Math.abs(angle - (node.controls?.fold_angle_1_deg ?? 90)) / 180 +
          Math.abs(angle - (node.controls?.fold_angle_2_deg ?? 90)) / 180,
        clearanceRegions: [],
        plan: checked.plan,
      })
    }
  solution.candidates.sort((a, b) => a.movementCost - b.movementCost)
  solution.selectedCandidateId = solution.candidates[0]?.candidateId ?? null
  if (!solution.candidates.length)
    solution.warnings.push('模型未就绪或折叠包围范围未通过碰撞和边界检查，不可采用。')
  return solution
}
