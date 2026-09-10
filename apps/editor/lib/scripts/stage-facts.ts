import {
  type StageItemKind,
  type StageItemProposal,
  type StagePlan,
  StagePlanSchema,
} from '@pascal-app/core/stage'
import { AiError } from '../ai/api'

export interface Passage {
  id: string
  page: number | null
  paragraph: number | null
  text: string
}

export const SCRIPT_FACT_LIMITS = {
  maxCharacters: 300_000,
  chunkCharacters: 8000,
  maxModelCalls: 12,
} as const

const sceneryWords: Partial<Record<StageItemKind, RegExp>> = {
  'scenic-flat': /景片|景墙|布景墙/,
  'door-flat': /门景片|门框|出入口|门/,
  'window-flat': /窗景片|窗框|窗/,
  platform: /平台|台块/,
  stairs: /台阶|楼梯/,
  'rail-or-divider': /栏杆|隔断|围栏/,
  screen: /屏风/,
  curtain: /幕布|帷幕|侧幕|天幕/,
  table: /圆桌|餐桌|桌子|桌/,
  chair: /椅子|餐椅|椅/,
  sofa: /沙发/,
  counter: /柜台/,
  shelf: /书架|搁板|架子/,
  bed: /床/,
  'neutral-block': /体块|方块|中性块/,
}
const physical =
  /舞台|台口|中心线|中区|台左|台右|台前|台后|台面|镜框式|黑匣子|伸出式|教室|宽\s*[\d一二三四五六七八九十半]|深\s*[\d一二三四五六七八九十半]/
const excluded =
  /灯|照明|光束|明暗|音效|音乐|旁白|台词|心理|情绪|悲伤|愤怒|目标|阻力|用意|阐释|场次|节拍|幕间|cue|屋顶|厨房|卫浴|机电|暖通|家电|住宅|地形|装修|信封|信件|酒杯|杯子|钥匙|手机|手持道具/iu

export function namesScenery(text: string, item: StageItemProposal): boolean {
  return text.includes(item.displayName) || sceneryWords[item.kind]?.test(text) === true
}

export function permitsSceneryName(name: string): boolean {
  return !excluded.test(name)
}

export function sceneryEvidenceExcerpt(text: string, item: StageItemProposal): string {
  const exact = text.indexOf(item.displayName)
  const index = exact >= 0 ? exact : text.search(sceneryWords[item.kind] ?? /$^/u)
  const start = Math.max(0, index - 80)
  return text.slice(start, start + 600)
}

/** Keep source substrings so evidence remains verifiable after removing unrelated clauses. */
export function selectStagePassages(passages: Passage[]): Passage[] {
  let characters = 0
  const ids = new Set<string>()
  const selected: Passage[] = []
  for (const passage of passages) {
    characters += passage.text.length
    if (characters > SCRIPT_FACT_LIMITS.maxCharacters)
      throw new AiError(
        'FILE_TOO_LARGE',
        '剧本文本超过 300,000 字符，请只上传需要搭台的部分。',
        413,
      )
    if (!passage.id || passage.id.length > 120 || ids.has(passage.id))
      throw new AiError('CORRUPT_DOCUMENT', '剧本文本的位置索引无效，请重新导出文件。')
    ids.add(passage.id)
    // A decimal point is not a sentence boundary. Keep enumeration commas in dimensions.
    const clauses = passage.text.split(
      /[。！？!?；;，,\n]|(?<!\d)\.(?!\d)|(?=而且|但是|随后|同时)|(?=(?:并且|且|并|和|与|以及)(?:灯|照明|光束|音效|音乐|信封|信件|酒杯|杯子|心理|情绪))/u,
    )
    for (const [index, text] of clauses.entries()) {
      const trimmed = text.trim()
      if (!trimmed || excluded.test(trimmed)) continue
      if (physical.test(trimmed) || Object.values(sceneryWords).some((word) => word.test(trimmed)))
        selected.push({ ...passage, id: `${passage.id}:${index}`, text: trimmed })
    }
  }
  return selected
}

/** One complete passage overlaps adjacent chunks; no candidate is silently truncated. */
export function chunkStagePassages(passages: Passage[]): Passage[][] {
  const chunks: Passage[][] = []
  let current: Passage[] = []
  let length = 0
  for (const passage of passages) {
    const size = JSON.stringify(passage).length
    if (size > SCRIPT_FACT_LIMITS.chunkCharacters)
      throw new AiError('FILE_TOO_LARGE', '一个舞台描述段落过长，请分成较短段落后重新上传。', 413)
    if (current.length && length + size > SCRIPT_FACT_LIMITS.chunkCharacters) {
      chunks.push(current)
      const overlap = current.at(-1)
      current =
        overlap && JSON.stringify(overlap).length + size <= SCRIPT_FACT_LIMITS.chunkCharacters
          ? [overlap]
          : []
      length = current.reduce((total, item) => total + JSON.stringify(item).length, 0)
    }
    current.push(passage)
    length += size
  }
  if (current.length) chunks.push(current)
  if (chunks.length > SCRIPT_FACT_LIMITS.maxModelCalls)
    throw new AiError(
      'FILE_TOO_LARGE',
      '舞台描述较多，已超出本次解析范围。请按需要置景的部分拆分上传；系统没有删去后文。',
      413,
    )
  return chunks
}

function hash(text: string): string {
  let value = 2166136261
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  return (value >>> 0).toString(36)
}

const unique = <T>(values: T[]): T[] => [...new Set(values)]
const samePlacement = (a: StageItemProposal, b: StageItemProposal) =>
  JSON.stringify(a.dimensionsMeters) === JSON.stringify(b.dimensionsMeters) &&
  JSON.stringify(a.transform) === JSON.stringify(b.transform)

export function emptyScriptPlan(): StagePlan {
  return {
    schemaVersion: 1,
    source: 'script',
    venue: null,
    items: [],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
}

/** Exact facts are merged. Conflicting descriptions remain visible until a person chooses. */
export function mergeStageFacts(inputs: StagePlan[]): StagePlan {
  const result = emptyScriptPlan()
  const evidenceByContent = new Map<string, string>()
  const assumptionByText = new Map<string, string>()
  for (const [index, input] of inputs.entries()) {
    const plan = StagePlanSchema.parse(input)
    const prefix = `s${hash(plan.evidence[0]?.id ?? String(index))}-${index}`
    const map = new Map<string, string>()
    for (const evidence of plan.evidence) {
      const key = JSON.stringify([
        evidence.page,
        evidence.paragraph,
        evidence.excerpt,
        evidence.certainty,
      ])
      const id = evidenceByContent.get(key) ?? `${prefix}:e${result.evidence.length}`
      if (!evidenceByContent.has(key)) {
        result.evidence.push({ ...evidence, id })
        evidenceByContent.set(key, id)
      }
      map.set(evidence.id, id)
    }
    for (const assumption of plan.assumptions) {
      const id =
        assumptionByText.get(assumption.message) ?? `${prefix}:a${result.assumptions.length}`
      if (!assumptionByText.has(assumption.message)) {
        result.assumptions.push({ ...assumption, id })
        assumptionByText.set(assumption.message, id)
      }
      map.set(assumption.id, id)
    }
    if (plan.venue) {
      if (!result.venue) result.venue = plan.venue
      else if (JSON.stringify(result.venue) !== JSON.stringify(plan.venue))
        result.questions.push({
          id: `${prefix}:venue-conflict`,
          message: `舞台尺寸描述不一致：${result.venue.widthMeters} × ${result.venue.depthMeters} 米与 ${plan.venue.widthMeters} × ${plan.venue.depthMeters} 米。请明确本次搭建的宽度与深度。`,
          options: [],
        })
    }
    for (const item of plan.items) {
      const candidate: StageItemProposal = {
        ...item,
        proposalId: `${prefix}:i${result.items.length}`,
        assumptionIds: unique(item.assumptionIds.map((id) => map.get(id) ?? id)),
        evidenceIds: unique(item.evidenceIds.map((id) => map.get(id) ?? id)),
      }
      const same = result.items.filter(
        (other) => other.displayName.trim() === item.displayName.trim() && other.kind === item.kind,
      )
      const duplicate = same.find((other) => samePlacement(other, candidate))
      if (duplicate) {
        map.set(item.proposalId, duplicate.proposalId)
        duplicate.assumptionIds = unique([...duplicate.assumptionIds, ...candidate.assumptionIds])
        duplicate.evidenceIds = unique([...duplicate.evidenceIds, ...candidate.evidenceIds])
        if (candidate.certainty === 'stated') duplicate.certainty = 'stated'
      } else {
        map.set(item.proposalId, candidate.proposalId)
        result.items.push(candidate)
        const previous = same[0]
        if (previous)
          result.questions.push({
            id: `script-item-conflict|${previous.proposalId}|${candidate.proposalId}`,
            message: `“${item.displayName}”出现不同尺寸或台位。请选择本次舞台需要的状态。`,
            options: ['采用前一处描述', '采用后一处描述', '作为两件布景保留'],
          })
      }
    }
    for (const relation of plan.relations) {
      const mapped = {
        ...relation,
        id: `${prefix}:r${result.relations.length}`,
        subjectId: map.get(relation.subjectId) ?? relation.subjectId,
        referenceId:
          relation.referenceId === null
            ? null
            : (map.get(relation.referenceId) ?? relation.referenceId),
      }
      if (
        !result.relations.some(
          (other) =>
            other.subjectId === mapped.subjectId &&
            other.referenceId === mapped.referenceId &&
            other.direction === mapped.direction &&
            other.gapMeters === mapped.gapMeters,
        )
      )
        result.relations.push(mapped)
    }
    for (const question of plan.questions)
      if (
        !result.questions.some(
          (other) => other.id === question.id && other.message === question.message,
        )
      )
        result.questions.push({
          ...question,
          id: result.questions.some((other) => other.id === question.id)
            ? `${prefix}:q${result.questions.length}`
            : question.id,
        })
    for (const warning of plan.warnings)
      result.warnings.push({ ...warning, itemIds: warning.itemIds.map((id) => map.get(id) ?? id) })
  }
  if (result.venue) {
    result.questions = result.questions.filter(
      (question) => !['venue-宽', 'venue-深'].includes(question.id),
    )
    result.warnings = result.warnings.filter((warning) => warning.code !== 'missing-venue')
  }
  const parsed = StagePlanSchema.safeParse(result)
  if (!parsed.success)
    throw new AiError('PLAN_INVALID', '布景或待确认信息过多，请缩小导入范围后重试。', 422)
  return parsed.data
}

export { resolveScriptQuestions } from '../stage/script-questions'
