export const CONTRIBUTION_CATEGORIES = [
  ['script', '剧本'],
  ['stage-video', '舞台影像资料'],
  ['knowledge', '戏剧知识'],
  ['other', '其他'],
] as const

export const CONTRIBUTION_COMPLETENESS = [
  ['full-original', '完整原作'],
  ['verified-translation', '已核完整译本'],
  ['volume-checked-collection', '已逐卷核完的剧作集'],
  ['metadata-only', '仅元数据与短摘要'],
  ['unknown', '完整性尚不清楚'],
] as const

export const CONTRIBUTION_RIGHTS = [
  ['owner', '我是权利人'],
  ['authorized', '已获授权'],
  ['public-domain', '公有领域'],
  ['unclear', '权利尚不明确'],
] as const

export type ContributionCategory = (typeof CONTRIBUTION_CATEGORIES)[number][0]
export type ContributionCompleteness = (typeof CONTRIBUTION_COMPLETENESS)[number][0]
export type ContributionRights = (typeof CONTRIBUTION_RIGHTS)[number][0]

export const CONTRIBUTION_FILE_LIMIT_BYTES = 20 * 1024 * 1024
export const CONTRIBUTION_NOTES_MAX = 500
export const CONTRIBUTION_UNCLEAR_NOTES_MAX = 180
