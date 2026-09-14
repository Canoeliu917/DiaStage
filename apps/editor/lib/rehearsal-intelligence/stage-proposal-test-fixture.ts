import { readFileSync } from 'node:fs'
import type { SceneContextSummary } from '@pascal-app/core/stage'

export type StageProposalEvalRow = {
  id: string
  input: string
  selectedIds: string[]
  expected: {
    intent: string
    placementStatus: 'proposal' | 'clarify'
    stageActions: string[]
    conceptIds: string[]
    proposalActions: string[]
    constraints: string[]
    runtime: 'plan' | 'no_preview'
  }
}

export const STAGE_PROPOSAL_CASES = readFileSync(
  new URL(
    '../../../../.agents/skills/dia-language-trainer/evals/stage-proposal-integration.jsonl',
    import.meta.url,
  ),
  'utf8',
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as StageProposalEvalRow)

const transform = (x: number, z: number, y = 0) => ({
  position: { x, y, z },
  rotationDegrees: { x: 0, y: 0, z: 0 },
})

export function stageProposalEvalContext(row: StageProposalEvalRow): SceneContextSummary {
  const objects: SceneContextSummary['objects'] = [
    {
      id: 'platform-1',
      name: '一号台块',
      kind: 'platform',
      dimensionsMeters: { width: 1, height: 0.3, depth: 1 },
      transform: transform(-1.5, 2),
    },
    {
      id: 'platform-2',
      name: '二号台块',
      kind: 'platform',
      dimensionsMeters: { width: 1, height: 0.3, depth: 1 },
      transform: transform(1.5, 2),
    },
    {
      id: 'flat-a',
      name: '景片甲',
      kind: 'scenic-flat',
      dimensionsMeters: { width: 2, height: 2.4, depth: 0.12 },
      transform: transform(-2, 4),
    },
    {
      id: 'flat-b',
      name: '景片乙',
      kind: 'scenic-flat',
      dimensionsMeters: { width: 2, height: 2.4, depth: 0.12 },
      transform: transform(1.2, 3.2),
    },
    {
      id: 'flat-c',
      name: '景片丙',
      kind: 'scenic-flat',
      dimensionsMeters: { width: 2, height: 2.4, depth: 0.12 },
      transform: transform(0, 1.4),
    },
    {
      id: 'triple-flat',
      name: '三联景片',
      kind: 'scenic-flat',
      dimensionsMeters: { width: 3, height: 2.4, depth: 0.12 },
      transform: transform(0, 4.8),
    },
    {
      id: 'door',
      name: '门',
      kind: 'door-flat',
      dimensionsMeters: { width: 1.2, height: 2.4, depth: 0.12 },
      transform: transform(0, 5.5),
    },
    {
      id: 'chair',
      name: '椅子',
      kind: 'chair',
      dimensionsMeters: { width: 0.5, height: 0.9, depth: 0.5 },
      transform: transform(0, 3),
    },
  ]
  return {
    documentVersion: 7,
    venue: { type: 'black-box', widthMeters: 10, depthMeters: 8, heightMeters: 4 },
    objects,
    selectedObjectIds: row.selectedIds,
  }
}
