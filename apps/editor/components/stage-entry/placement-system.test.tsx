import { expect, test } from 'bun:test'
import type { SceneContextSummary, StageItemProposal } from '@pascal-app/core/stage'
import { DIA_COLORS } from '@/lib/visual-system'
import { stagePlacementPreview } from './placement-system'

test('manual previews turn red on contact without disabling placement', () => {
  const item: StageItemProposal = {
    proposalId: 'manual',
    existingNodeId: null,
    libraryAssetId: null,
    kind: 'neutral-block',
    displayName: '方块',
    dimensionsMeters: { width: 1, height: 1, depth: 1 },
    transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    certainty: 'stated',
    assumptionIds: [],
    evidenceIds: [],
  }
  const context: SceneContextSummary = {
    documentVersion: 0,
    selectedObjectIds: [],
    venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
    objects: [
      {
        id: 'original',
        name: '已有方块',
        kind: item.kind,
        dimensionsMeters: item.dimensionsMeters,
        transform: item.transform,
      },
    ],
  }
  for (const x of [0, 1, 1.001]) {
    const draft = {
      version: 0,
      item: { ...item, transform: { ...item.transform, position: { x, y: 0, z: 3 } } },
    }
    const result = stagePlacementPreview(draft, context)!
    expect(result.valid).toBe(true)
    expect(result.color).toBe(x <= 1 ? DIA_COLORS.error : DIA_COLORS.blue)
  }
  const blocked = stagePlacementPreview(
    {
      version: 0,
      item: { ...item, transform: { ...item.transform, position: { x: 99, y: 0, z: 3 } } },
    },
    context,
  )!
  expect(blocked.valid).toBe(false)
  expect(blocked.color).toBe(DIA_COLORS.error)
})
