import type { SceneContextSummary } from '@pascal-app/core/stage'
import type { SpatialSolution } from '../stage/spatial-constraints'
import { SPATIAL_RUNTIME_CONFIG } from '../stage/spatial-constraints'
import { createUUID } from '../uuid'
import type { DiaBuildProposal } from './dia-backbone'
import { DiaStageProposalSchema } from './knowledge/stage-proposal'
import {
  OPEN_CONCEPTS,
  type OpenLanguageContext,
  openGroundingPlacement,
  type ValidatedOpenGrounding,
} from './open-language'

/** Product increment, not a definition of “一点” and not a model-selected distance. */
export const OPEN_LANGUAGE_RUNTIME_CONFIG = Object.freeze({ widenStepMeters: 0.1 })

export function openLanguageContext(
  snapshot: SceneContextSummary,
  sceneVersion: string,
  lastReferencedIds: string[],
  proposal: DiaBuildProposal | null,
  ghostVisible: boolean,
): OpenLanguageContext {
  const solution = proposal?.spatialSolution
  const constraints = solution?.constraints ?? []
  return {
    sceneVersion,
    objects: snapshot.objects.map(({ id, name, kind }) => ({ id, name, kind })),
    selectedObjectIds: snapshot.selectedObjectIds.filter((id) =>
      snapshot.objects.some((o) => o.id === id),
    ),
    lastReferencedIds,
    proposal: proposal
      ? {
          id: proposal.id,
          subjectIds: [
            ...new Set(
              proposal.knowledgeProposal?.actions.flatMap((a) => [
                a.subject,
                ...(a.target ? [a.target] : []),
              ]) ?? [],
            ),
          ]
            .filter((id) => snapshot.objects.some((o) => o.id === id))
            .slice(0, 3),
          candidateIds: solution?.candidates.map((c) => c.candidateId) ?? [],
          selectedCandidateId: solution?.selectedCandidateId ?? null,
          ghostCandidateId: ghostVisible ? (solution?.selectedCandidateId ?? null) : null,
          hasEnclosure: constraints.some(
            (c) => c.type === 'form_enclosure' && c.subjects.length === 3,
          ),
          minimumWidthMeters:
            constraints.find((c) => c.type === 'leave_opening' || c.type === 'preserve_path')
              ?.parameters.minimumWidthMeters ?? null,
        }
      : null,
  }
}

/** Revisions regenerate semantic authority and use the same formal snapshot, never a Ghost transform. */
export function reviseOpenProposal(
  value: ValidatedOpenGrounding,
  parent: DiaBuildProposal,
  snapshot: SceneContextSummary,
) {
  const original = DiaStageProposalSchema.parse(parent.knowledgeProposal)
  const g = value.grounding
  if (g.modifiers.includes('wider')) {
    if (original.constraints.length !== 1) throw new Error('请明确要加宽哪个入口或通道。')
    const constraint = original.constraints[0]!
    const defaultWidth =
      constraint.type === 'leave_opening'
        ? SPATIAL_RUNTIME_CONFIG.minimumOpeningMeters
        : SPATIAL_RUNTIME_CONFIG.minimumPathMeters
    const widthMeters = Number(
      (
        (constraint.widthMeters ?? defaultWidth) + OPEN_LANGUAGE_RUNTIME_CONFIG.widenStepMeters
      ).toFixed(3),
    )
    return DiaStageProposalSchema.parse({
      ...original,
      proposalId: createUUID(),
      userRequest: g.rawUtterance,
      constraints: [{ ...constraint, widthMeters }],
      rationale: `按产品步长加宽 ${OPEN_LANGUAGE_RUNTIME_CONFIG.widenStepMeters} m；最小净宽 ${widthMeters} m。重新检查全部空间约束。`,
    })
  }
  if (g.constraints.length === 1 && g.constraints[0] === 'leave-opening') {
    const ids =
      parent.spatialSolution?.constraints.find((c) => c.type === 'form_enclosure')?.subjects ?? []
    if (ids.length !== 3) throw new Error('当前不是三块独立景片围合方案。')
    const placement = openGroundingPlacement(
      {
        ...value,
        subjectIds: ids,
        targetIds: [],
        grounding: {
          ...g,
          constraints: ['form-enclosure', 'leave-opening'],
          knowledgeConceptIds: [
            ...OPEN_CONCEPTS['form-enclosure']!,
            ...OPEN_CONCEPTS['leave-opening']!,
          ],
        },
      },
      snapshot,
    )
    if ('type' in placement || !placement.knowledgeProposal)
      throw new Error('入口修订没有合法来源。')
    return placement.knowledgeProposal
  }
  throw new Error('这条口令不是已支持的空间修订。')
}

/** "左边" in this explicit revision means stage-left (+X) in the current candidate. */
export function keepCurrentStageLeftFixed(
  solution: SpatialSolution,
  parent: DiaBuildProposal,
  snapshot: SceneContextSummary,
): SpatialSolution {
  const previous = parent.spatialSolution?.candidates.find(
    (candidate) => candidate.candidateId === parent.spatialSolution?.selectedCandidateId,
  )
  if (previous?.resolvedTransforms.length !== 2) throw new Error('当前方案没有唯一的左右两块景片。')
  const ordered = [...previous.resolvedTransforms].sort(
    (a, b) => b.transform.position.x - a.transform.position.x,
  )
  if (Math.abs(ordered[0]!.transform.position.x - ordered[1]!.transform.position.x) < 1e-6)
    throw new Error('当前两块景片无法确定台左一片，请先选择候选方案。')
  const fixed = ordered[0]!
  const source = snapshot.objects.find((item) => item.id === fixed.subject)
  if (!source) throw new Error('要保持不动的景片已不存在。')
  const expected = parent.status === 'applied' ? source.transform : fixed.transform
  const candidates = solution.candidates.filter((candidate) => {
    const transform = candidate.resolvedTransforms.find((item) => item.subject === fixed.subject)
    return transform && JSON.stringify(transform.transform) === JSON.stringify(expected)
  })
  if (!candidates.length) throw new Error('入口加宽后没有能保持台左景片不动的合法候选。')
  return {
    ...solution,
    candidates,
    selectedCandidateId: candidates[0]!.candidateId,
    warnings: [...solution.warnings, '入口加宽时保持当前台左景片不动。'],
  }
}
