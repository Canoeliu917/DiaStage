import type { SceneContextSummary } from '@pascal-app/core/stage'
import { SPATIAL_RUNTIME_CONFIG } from '../stage/spatial-constraints'
import { createUUID } from '../uuid'
import type { DiaBuildProposal } from './dia-backbone'
import { DiaStageProposalSchema } from './knowledge/stage-proposal'
import {
  OPEN_CONCEPTS,
  openGroundingPlacement,
  type OpenLanguageContext,
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
