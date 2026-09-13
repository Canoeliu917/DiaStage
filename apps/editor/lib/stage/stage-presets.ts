import { type SceneContextSummary, type StagePlan, validateStagePlan } from '@pascal-app/core/stage'
import { AVAILABLE_STAGE_SCENERY, stagePropCollisionGeometry } from './prop-assets'

export const STAGE_PRESETS = [
  {
    name: '空桌 · 会面',
    description: '圆桌、两把硬椅与单门，留下台前表演区。',
    items: [
      ['SCN-TABLE-090', 0, 0.5, 0],
      ['SCN-CHAIR-045', -0.18, 0.5, 90],
      ['SCN-CHAIR-045', 0.18, 0.5, -90],
      ['SCN-DOOR-130', -0.32, 0.84, 0],
    ],
  },
  {
    name: '客厅 · 等候',
    description: '长沙发、圆桌、软椅与窗景片，围成紧凑会客区。',
    items: [
      ['SCN-SOFA-175', 0, 0.7, 0],
      ['SCN-TABLE-090', 0, 0.42, 0],
      ['SCN-CHAIR-050', -0.28, 0.45, 90],
      ['SCN-WIN-130', 0.3, 0.87, 0],
    ],
  },
  {
    name: '书房 · 来访',
    description: '三屉桌、硬椅、长凳与单门，形成工作与来访两区。',
    items: [
      ['SCN-DESK-120', -0.12, 0.64, 0],
      ['SCN-CHAIR-045', -0.12, 0.84, 180],
      ['SCN-BENCH-100', 0.28, 0.38, -90],
      ['SCN-DOOR-130', 0.3, 0.86, 0],
    ],
  },
] as const

export function createStagePreset(index: number, context: SceneContextSummary): StagePlan {
  const preset = STAGE_PRESETS[index]
  if (!preset || !context.venue) throw new Error('请先设置场地，再查看搭景预设。')
  const venue = context.venue
  const items = preset.items.map(([id, x, z, yaw]) => {
    const source = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === id)!
    const [width, height, depth] = source.asset.dimensions!
    const dimensionsMeters = { width, height, depth }
    return {
      proposalId: crypto.randomUUID(),
      existingNodeId: null,
      kind: source.kind,
      displayName: source.asset.name,
      libraryAssetId: id,
      dimensionsMeters,
      collisionGeometry: stagePropCollisionGeometry(id, dimensionsMeters),
      transform: {
        position: {
          x: Math.round(x * venue.widthMeters * 10) / 10,
          y: 0,
          z: Math.round(z * venue.depthMeters * 10) / 10,
        },
        rotationDegrees: { x: 0, y: yaw, z: 0 },
      },
      certainty: 'stated' as const,
      assumptionIds: [],
      evidenceIds: [],
    }
  })
  return validateStagePlan(
    {
      schemaVersion: 1,
      source: 'manual',
      venue: null,
      items,
      relations: [],
      assumptions: [],
      questions: [],
      evidence: [],
      warnings: [],
    },
    context,
  ).plan
}
