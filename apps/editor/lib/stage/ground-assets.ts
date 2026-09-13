import {
  resolveStageObjectSpecs,
  STAGE_OBJECT_REGISTRY,
  type StagePlan,
} from '@pascal-app/core/stage'
import {
  AVAILABLE_STAGE_ASSET_IDS,
  AVAILABLE_STAGE_SCENERY,
  stagePropCollisionGeometry,
} from './prop-assets'

export function groundStageAssets(
  plan: StagePlan,
  availableAssetIds: readonly string[] = AVAILABLE_STAGE_ASSET_IDS,
): StagePlan {
  const result = structuredClone(plan)
  const removed = new Set<string>()
  for (const item of result.items) {
    if (item.existingNodeId) continue
    const specs = resolveStageObjectSpecs(item.libraryAssetId ?? item.displayName)
    if (!specs.length) {
      removed.add(item.proposalId)
      result.questions.push({
        id: `object-type-${item.proposalId}`,
        message: `“${item.displayName}”没有唯一规范物品，请明确物品名称。`,
        options: STAGE_OBJECT_REGISTRY.filter((spec) => spec.kind === item.kind)
          .map((spec) => spec.displayName)
          .slice(0, 6),
      })
      continue
    }
    const spec = specs.length === 1 ? specs[0]! : null
    const installed =
      spec && AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === spec.canonicalId)
    if (spec && installed && availableAssetIds.includes(spec.canonicalId)) {
      const [width, height, depth] = installed.asset.dimensions!
      const requested = item.dimensionsMeters
      if (
        Math.max(
          Math.abs(requested.width - width),
          Math.abs(requested.height - height),
          Math.abs(requested.depth - depth),
        ) > 1e-6
      ) {
        removed.add(item.proposalId)
        const format = (values: number[]) =>
          values.map((value) => Number(value.toFixed(6))).join(' × ')
        result.questions.push({
          id: `asset-size-${item.proposalId}`,
          message: `${spec.displayName}的标准模型宽×高×深为${format([width, height, depth])}米，方案要求${format([requested.width, requested.height, requested.depth])}米，尺寸不一致。请确认是否先按标准模型放置；需要改变大小时，可放置后整体缩放。`,
          options: ['按标准尺寸添加', '取消本次添加'],
        })
        continue
      }
      item.libraryAssetId = spec.canonicalId
      item.displayName = spec.displayName
      item.kind = installed.kind
      item.dimensionsMeters = { width, height, depth }
      item.collisionGeometry = stagePropCollisionGeometry(spec.canonicalId, item.dimensionsMeters)
      continue
    }
    removed.add(item.proposalId)
    const id = `asset-${spec?.canonicalId ?? item.proposalId}`
    if (!result.questions.some((question) => question.id === id))
      result.questions.push({
        id,
        message: spec
          ? `${spec.displayName}的规范模型尚未接入，请先接入资源包。`
          : `“${item.displayName}”对应多个规范物品，请明确类型。`,
        options: spec ? [] : specs.map((candidate) => candidate.displayName).slice(0, 6),
      })
  }
  result.items = result.items.filter((item) => !removed.has(item.proposalId))
  result.relations = result.relations.filter(
    (relation) =>
      !removed.has(relation.subjectId) &&
      (!relation.referenceId || !removed.has(relation.referenceId)),
  )
  return result
}
