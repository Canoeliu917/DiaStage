import { type SceneContextSummary, type StagePlan, validateStagePlan } from '@pascal-app/core/stage'
import { AVAILABLE_STAGE_SCENERY, stagePropCollisionGeometry } from '../stage/prop-assets'
import { createUUID } from '../uuid'

const COMPOUND_ASSETS = [
  ['SCN-FOLD-03', -0.28, 0.82, 0],
  ['SCN-FOLD-02', 0.28, 0.82, 0],
  ['SCN-TABLE-090', 0, 0.52, 0],
  ['SCN-CHAIR-045', -0.16, 0.28, 180],
  ['SCN-SOFA-175', 0.27, 0.27, 180],
] as const

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/\s|[，,。.!！?？、；;：:]/g, '')
    .replace(/^(?:请|麻烦|帮我|给我)/, '')

/** A deliberately narrow local grammar for the first five-asset stage template. */
export function isCompoundStageRequest(raw: string) {
  const text = normalize(raw)
  if (!/(?:生成|创建|搭(?:建|成)?|布置|摆|做)(?:一个|个|一套|套)?/.test(text)) return false
  if (/不要|别|删除|移除|替换/.test(text)) return false
  if (
    /(?:两|二|2|三|3|四|4|五|5)(?:张|把|个|套)?(?:桌|椅|沙发)/.test(text) ||
    /(?:两|二|2|三|3|四|4|五|5)(?:个|套|组)(?:三联|三帘|三折|二联|二帘|双联|两联)/.test(text)
  )
    return false
  if (/门|窗|台块|平台|枕木|方墩|长凳|板凳|床|柜|灯|演员|人物/.test(text)) return false
  return (
    /(?:三联|三帘|三折)(?:景片|组合)?/.test(text) &&
    /(?:二联|二帘|双联|两联|两帘|二折|双折)(?:景片|组合)?/.test(text) &&
    /桌(?:子)?/.test(text) &&
    /椅(?:子)?/.test(text) &&
    /沙发/.test(text)
  )
}

/** Creates one deterministic, editable Ghost candidate. It never writes the Scene. */
export function createCompoundStagePlan(context: SceneContextSummary): StagePlan {
  if (!context.venue) throw new Error('请先设置舞台尺寸，再生成整套布景。')
  const { widthMeters, depthMeters } = context.venue
  const round = (value: number) => Math.round(value * 100) / 100
  const items = COMPOUND_ASSETS.map(([assetId, x, z, yaw]) => {
    const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)
    if (!source?.asset.dimensions) throw new Error(`资产 ${assetId} 尚未完整接入。`)
    const [width, height, depth] = source.asset.dimensions
    const dimensionsMeters = { width, height, depth }
    return {
      proposalId: createUUID(),
      existingNodeId: null,
      kind: source.kind,
      displayName: source.asset.name,
      libraryAssetId: assetId,
      dimensionsMeters,
      collisionGeometry: stagePropCollisionGeometry(assetId, dimensionsMeters),
      transform: {
        position: { x: round(x * widthMeters), y: 0, z: round(z * depthMeters) },
        rotationDegrees: { x: 0, y: yaw, z: 0 },
      },
      certainty: 'inferred' as const,
      assumptionIds: ['compound-stage-default-assets', 'compound-stage-default-layout'],
      evidenceIds: [],
    }
  })
  const result = validateStagePlan(
    {
      schemaVersion: 1,
      source: 'typed-command',
      venue: null,
      items,
      relations: [],
      assumptions: [
        {
          id: 'compound-stage-default-assets',
          message: '未指定款式，Proposal 暂用圆桌、硬椅和长沙发；可在采用前调整。',
        },
        {
          id: 'compound-stage-default-layout',
          message:
            '三联与二联景片在同一布景中分开放置，不建立永久连接；折叠保持各自资产的默认姿态。',
        },
      ],
      questions: [],
      evidence: [],
      warnings: [],
    },
    context,
  )
  if (!result.valid)
    throw new Error(
      result.warnings.find((warning) => warning.blocking)?.message ?? '当前舞台没有合法布局。',
    )
  const collision = result.warnings.find((warning) => warning.code === 'collision')
  if (collision) throw new Error(`${collision.message} 请先移开现有物件，或使用空白舞台。`)
  return result.plan
}
