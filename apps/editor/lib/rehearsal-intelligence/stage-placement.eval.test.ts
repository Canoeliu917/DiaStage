import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SceneContextSummary } from '@pascal-app/core/stage'
import { groundLanguage } from './language-grounding'

export const placementContext: SceneContextSummary = {
  documentVersion: 7,
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 3 },
  selectedObjectIds: ['chair'],
  objects: [
    ['chair', '椅子', 'chair'],
    ['table', '桌子', 'table'],
    ['flat', '景片', 'scenic-flat'],
    ['riser', '台块', 'platform'],
    ['door', '门', 'door-flat'],
  ].map(([id, name, kind]) => ({
    id: id!,
    name: name!,
    kind: kind as SceneContextSummary['objects'][number]['kind'],
    transform: { position: { x: 0, y: 0, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    dimensionsMeters: { width: 1, depth: 1, height: 1 },
  })),
}
const cases = readFileSync(
  resolve(
    import.meta.dir,
    '../../../../.agents/skills/dia-language-trainer/evals/stage-placement-intents.jsonl',
  ),
  'utf8',
)
  .trim()
  .split('\n')
  .map(
    (line) =>
      JSON.parse(line) as { id: string; utterance: string; expected: Record<string, unknown> },
  )

// The baseline adapter reads only existing parser output, never the utterance.
function prediction(result: ReturnType<typeof groundLanguage>) {
  if (!result) return null
  if ('placement' in result) return (result.placement as { intent: unknown }).intent
  if (result.clarificationRequired) return { kind: 'ambiguous', clarify: true }
  const relation = result.plan?.relations[0]
  if (relation?.direction === 'center' && !relation.referenceId) {
    const item = result.plan?.items.find((item) => item.proposalId === relation.subjectId)
    return {
      kind: 'center_on_stage',
      subject: item?.displayName,
      frame: 'stage',
      motion: 'region',
      clarify: false,
    }
  }
  return { kind: result.intent, clarify: false }
}

test('placement canonical inventory has 66 distinct cases', () => {
  expect(cases).toHaveLength(66)
  expect(new Set(cases.map((row) => row.id)).size).toBe(66)
})
for (const row of cases)
  test(`${row.id}: ${row.utterance}`, () => {
    expect(prediction(groundLanguage(row.utterance, placementContext))).toEqual(
      expect.objectContaining(row.expected),
    )
  })
