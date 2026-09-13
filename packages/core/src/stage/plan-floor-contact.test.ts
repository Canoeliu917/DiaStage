import { expect, test } from 'bun:test'
import { rotatePoint } from '../remount/geometry'
import { compileStagePlan, validateStagePlan } from './plan'
import type { SceneContextSummary, StagePlan } from './schema'

const venue = { type: 'proscenium' as const, widthMeters: 8, depthMeters: 6, heightMeters: 4 }
const context: SceneContextSummary = {
  documentVersion: 1,
  venue,
  objects: [],
  selectedObjectIds: [],
}
const plan = (): StagePlan => ({
  schemaVersion: 1,
  source: 'manual',
  venue: null,
  items: [
    {
      proposalId: 'box',
      existingNodeId: null,
      kind: 'neutral-block',
      displayName: '方块',
      libraryAssetId: null,
      dimensionsMeters: { width: 1, height: 1, depth: 1 },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      certainty: 'stated',
      assumptionIds: [],
      evidenceIds: [],
    },
  ],
  relations: [],
  assumptions: [],
  questions: [],
  evidence: [],
  warnings: [],
})

test('center-preserving floor tilts compile with an advisory; zero floor contact stays clear', () => {
  expect(validateStagePlan(plan(), context).warnings).toEqual([])
  for (const angle of [15, 30]) {
    const input = plan()
    const item = input.items[0]!
    const center = rotatePoint([0, 0.5, 0], [(angle * Math.PI) / 180, 0, 0])
    item.transform = {
      position: { x: -center[0], y: 0.5 - center[1], z: 3 - center[2] },
      rotationDegrees: { x: angle, y: 0, z: 0 },
    }
    const result = compileStagePlan(input, context, {
      transactionId: `tilt-${angle}`,
      issuedAt: '2026-09-13T00:00:00Z',
    })
    expect(result.ok).toBe(true)
    expect(result.commands).toHaveLength(1)
    expect(result.warnings).toContainEqual({
      code: 'collision',
      message: '方块 与舞台地面穿插。',
      itemIds: ['box'],
      blocking: false,
    })
  }
})

test('floor overlap does not bypass side, front, back or ceiling boundaries', () => {
  for (const position of [
    { x: 4, y: -0.1, z: 3 },
    { x: 0, y: -0.1, z: 0 },
    { x: 0, y: -0.1, z: 6 },
    { x: 0, y: 3.5, z: 3 },
  ]) {
    const input = plan()
    input.items[0]!.transform.position = position
    const result = validateStagePlan(input, context)
    expect(result.valid).toBe(false)
    expect(
      result.warnings.some((warning) => warning.code === 'out-of-bounds' && warning.blocking),
    ).toBe(true)
  }
})
