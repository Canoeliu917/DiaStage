import { DIA_KNOWLEDGE_CATALOG } from './catalog'
import {
  type DiaKnowledgeCatalog,
  DiaKnowledgeCatalogSchema,
  type DiaKnowledgeConcept,
  type DiaSceneExample,
  type KnowledgeDomain,
  type KnowledgeRelation,
  type KnowledgeSource,
  type KnowledgeStatus,
} from './schema'

export type AliasLookupResult =
  | { kind: 'match'; query: string; concept: DiaKnowledgeConcept }
  | {
      kind: 'ambiguous'
      query: string
      clarificationRequired: true
      clarification: string
      candidates: DiaKnowledgeConcept[]
    }
  | { kind: 'not_found'; query: string; candidates: [] }

export type KnowledgeExplanation = {
  concept: DiaKnowledgeConcept
  definitionStatus: DiaKnowledgeConcept['definitionStatus']
  qualification: 'none' | 'heuristic_not_universal' | 'tradition_specific' | 'contested'
  universal: false | null
  disputedNotes: string[]
  statement: string
}

export type RelationLookupResult = {
  relation: KnowledgeRelation
  target: DiaKnowledgeConcept
}

export type SourceLookupResult = {
  source: KnowledgeSource
  concepts: DiaKnowledgeConcept[]
  examples: DiaSceneExample[]
}

export function validateKnowledgeCatalog(input: unknown = DIA_KNOWLEDGE_CATALOG) {
  const catalog = DiaKnowledgeCatalogSchema.parse(input)
  const errors: string[] = []
  const sources = new Map(catalog.sources.map((source) => [source.sourceId, source]))
  const concepts = new Map(catalog.concepts.map((concept) => [concept.id, concept]))

  if (sources.size !== catalog.sources.length) errors.push('sourceId 必须唯一')
  if (concepts.size !== catalog.concepts.length) errors.push('concept id 必须唯一')
  if (
    new Set(catalog.sceneExamples.map((example) => example.id)).size !==
    catalog.sceneExamples.length
  )
    errors.push('scene example id 必须唯一')
  if (catalog.sceneExamples.some((example) => concepts.has(example.id)))
    errors.push('concept 与 scene example id 不得跨集合重复')

  for (const concept of catalog.concepts) {
    if (
      concept.status === 'ACTIVE' &&
      !['stage_assets', 'scenic_flats', 'spatial_directing'].includes(concept.domain)
    )
      errors.push(`${concept.id}: ACTIVE domain 超出 V0.1 范围`)
    if (concept.status !== 'ACTIVE' && concept.executableIntents.length > 0)
      errors.push(`${concept.id}: OBSERVE/FUTURE 不得有 executableIntents`)
    if (concept.executionEligibility === 'allowed' && concept.status !== 'ACTIVE')
      errors.push(`${concept.id}: allowed 只适用于 ACTIVE concept`)
    if (concept.executionEligibility === 'allowed' && concept.executableIntents.length === 0)
      errors.push(`${concept.id}: allowed 必须有确定性的 executableIntents`)
    if (concept.executionEligibility !== 'allowed' && concept.executableIntents.length > 0)
      errors.push(`${concept.id}: 非 allowed concept 不得携带 executableIntents`)
    if (concept.conceptKind === 'theory_concept' && concept.executionEligibility === 'allowed')
      errors.push(`${concept.id}: theory_concept 不得获得 allowed executionEligibility`)
    if (
      concept.definitionStatus === 'heuristic' &&
      (concept.conceptKind !== 'theory_concept' || concept.disputedNotes.length === 0)
    )
      errors.push(`${concept.id}: heuristic 只用于有说明的理论分析规则`)
    if (
      concept.conceptKind === 'historical_entity' &&
      (concept.definitionStatus !== 'descriptive' ||
        concept.executionEligibility !== 'knowledge_only')
    )
      errors.push(`${concept.id}: historical_entity 必须 descriptive + knowledge_only`)
    if (concept.definitionStatus === 'canonical' && concept.authorityTier === 'exam_notes')
      errors.push(`${concept.id}: exam_notes 不得单独提升为 canonical`)
    if (concept.authorityTier !== 'exam_notes' && concept.authorityRefs.length === 0)
      errors.push(`${concept.id}: 高于 exam_notes 的 authorityTier 必须有 authorityRefs`)
    if (
      concept.definitionStatus === 'contested' &&
      new Set(concept.authorityRefs.map((ref) => ref.url)).size < 2
    )
      errors.push(`${concept.id}: contested concept 必须保留至少两个 authorityRefs`)
    for (const ref of concept.sourceRefs) {
      const source = sources.get(ref.sourceId)
      if (!source) errors.push(`${concept.id}: sourceRef ${ref.sourceId} 不存在`)
      if (source?.sourceType === 'example_source')
        errors.push(`${concept.id}: example_source 不得定义 canonical concept`)
      if (source?.sourceType === 'knowledge_source' && ref.role === 'example')
        errors.push(`${concept.id}: knowledge_source 不得使用 example role`)
    }
    for (const item of concept.relations)
      if (!concepts.has(item.targetId))
        errors.push(`${concept.id}: relation target ${item.targetId} 不存在`)
  }

  for (const example of catalog.sceneExamples) {
    const source = sources.get(example.sourceRef.sourceId)
    if (!source) errors.push(`${example.id}: sourceRef ${example.sourceRef.sourceId} 不存在`)
    if (source?.sourceType !== 'example_source' || example.sourceRef.role !== 'example')
      errors.push(`${example.id}: scene example 必须引用 example_source`)
  }

  const requireConcept = (id: string) => {
    const concept = concepts.get(id)
    if (!concept) errors.push(`authority review concept ${id} 不存在`)
    return concept
  }
  const givenCircumstances = requireConcept('given-circumstances')
  const dramaticSituation = requireConcept('dramatic-situation')
  if (givenCircumstances?.id === dramaticSituation?.id) errors.push('规定情境与戏剧情境不得合并')
  const throughAction = requireConcept('through-action')
  for (const alias of ['贯串行动', '贯穿动作', '贯串动作'])
    if (!throughAction?.aliases.includes(alias)) errors.push(`through-action 缺少术语变体 ${alias}`)
  if (requireConcept('super-objective')?.tradition !== 'stanislavski_system')
    errors.push('最高任务必须标注 Stanislavski tradition')
  if (
    requireConcept('physical-action')?.relations.some(
      (item) => item.type === 'distinct_from' && item.targetId === 'psychological-action',
    )
  )
    errors.push('形体行动与心理行动不得建成完全分离的二元关系')
  for (const id of ['experiencing-school', 'representation-school'])
    if (
      requireConcept(id)?.relations.some(
        (item) => item.type === 'broader_than' && item.targetId === 'acting-method',
      )
    )
      errors.push(`${id} 不得成为所有表演方法的顶层分类`)
  const alienation = requireConcept('alienation-effect')
  if (!alienation?.aliases.includes('陌生化效果')) errors.push('间离效果必须归一“陌生化效果”译名')
  if (requireConcept('blocking')?.relations.every((item) => item.targetId !== 'mise-en-scene'))
    errors.push('blocking 必须与 mise-en-scène 保持显式关系')
  if (requireConcept('stage-zone')?.definitionStatus !== 'heuristic')
    errors.push('舞台区位九区规则必须标记为 heuristic')
  if (requireConcept('stage-event')?.tradition !== 'director_analysis_pedagogy')
    errors.push('舞台事件必须标记为导演分析框架')
  if (requireConcept('dramaticity')?.tradition !== 'chinese_theatre_studies')
    errors.push('戏剧性定义必须标注中国戏剧理论传统')
  if (
    (requireConcept('black-slaves-cry-to-heaven')?.historicalAttributions.adapters.length ?? 0) ===
    0
  )
    errors.push('《黑奴吁天录》必须记录 adaptation / re-creation attribution')
  if (
    requireConcept('black-slaves-cry-to-heaven')?.conceptKind !== 'historical_entity' ||
    requireConcept('black-slaves-cry-to-heaven')?.definitionStatus !== 'descriptive'
  )
    errors.push('《黑奴吁天录》必须是 descriptive historical_entity')

  const counts = {
    ACTIVE: catalog.concepts.filter((concept) => concept.status === 'ACTIVE').length,
    OBSERVE: catalog.concepts.filter((concept) => concept.status === 'OBSERVE').length,
    FUTURE: catalog.concepts.filter((concept) => concept.status === 'FUTURE').length,
  }
  if (catalog.extraction.candidateConceptCount !== catalog.concepts.length)
    errors.push('candidateConceptCount 与 concepts 数量不一致')
  if (catalog.extraction.activeCount !== counts.ACTIVE) errors.push('activeCount 不一致')
  if (catalog.extraction.observeCount !== counts.OBSERVE) errors.push('observeCount 不一致')
  if (catalog.extraction.futureCount !== counts.FUTURE) errors.push('futureCount 不一致')
  if (
    catalog.extraction.rawCandidateCount !==
    catalog.extraction.candidateConceptCount + catalog.extraction.duplicateCount
  )
    errors.push('raw candidate、canonical concept 与 duplicate 数量不守恒')
  if (
    new Set(catalog.extraction.coveredSourceIds).size !== catalog.sources.length ||
    catalog.extraction.coveredSourceIds.some((sourceId) => !sources.has(sourceId))
  )
    errors.push('source coverage 必须为 registry 中完整的 6 个来源')
  if (catalog.extraction.conflictCount !== catalog.extraction.conflictConceptIds.length)
    errors.push('conflictCount 与 conflictConceptIds 数量不一致')

  if (errors.length > 0)
    throw new Error(`Dia Knowledge catalog semantic validation failed:\n${errors.join('\n')}`)
  return catalog
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freezeDeep(child)
  }
  return value
}

export const DIA_KNOWLEDGE: DiaKnowledgeCatalog = freezeDeep(validateKnowledgeCatalog())

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s，。、“”‘’'"（）()·•:_-]+/g, '')

const byId = new Map(DIA_KNOWLEDGE.concepts.map((concept) => [normalize(concept.id), concept]))
const byAlias = new Map<string, DiaKnowledgeConcept[]>()
for (const concept of DIA_KNOWLEDGE.concepts) {
  for (const term of new Set([concept.label, concept.canonicalLabel, ...concept.aliases])) {
    const key = normalize(term)
    const matches = byAlias.get(key) ?? []
    if (!matches.some((match) => match.id === concept.id)) matches.push(concept)
    byAlias.set(key, matches)
  }
}

export function lookupCanonical(id: string) {
  return byId.get(normalize(id))
}

export function lookupAlias(query: string): AliasLookupResult {
  const candidates = [...(byAlias.get(normalize(query)) ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  if (candidates.length === 0) return { kind: 'not_found', query, candidates: [] }
  if (candidates.length > 1)
    return {
      kind: 'ambiguous',
      query,
      clarificationRequired: true,
      clarification: `“${query}”可能指：${candidates.map((item) => item.label).join('、')}。请明确所指概念。`,
      candidates,
    }
  return { kind: 'match', query, concept: candidates[0]! }
}

export function filterByDomain(domain: KnowledgeDomain, status?: KnowledgeStatus) {
  return DIA_KNOWLEDGE.concepts
    .filter((concept) => concept.domain === domain && (!status || concept.status === status))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function lookupRelations(
  id: string,
  type?: KnowledgeRelation['type'],
): RelationLookupResult[] {
  const concept = lookupCanonical(id)
  if (!concept) return []
  return concept.relations
    .filter((item) => !type || item.type === type)
    .map((item) => ({ relation: item, target: lookupCanonical(item.targetId)! }))
    .sort((a, b) => a.target.id.localeCompare(b.target.id))
}

export function lookupSource(sourceId: string): SourceLookupResult | undefined {
  const source = DIA_KNOWLEDGE.sources.find((item) => item.sourceId === sourceId)
  if (!source) return undefined
  return {
    source,
    concepts: DIA_KNOWLEDGE.concepts.filter((concept) =>
      concept.sourceRefs.some((ref) => ref.sourceId === sourceId),
    ),
    examples: DIA_KNOWLEDGE.sceneExamples.filter(
      (example) => example.sourceRef.sourceId === sourceId,
    ),
  }
}

export function getExecutableIntents(id: string) {
  const concept = lookupCanonical(id)
  return concept?.executionEligibility === 'allowed' ? [...concept.executableIntents] : []
}

export function explainConcept(id: string): KnowledgeExplanation | undefined {
  const concept = lookupCanonical(id)
  if (!concept) return undefined
  if (concept.definitionStatus === 'heuristic')
    return {
      concept,
      definitionStatus: concept.definitionStatus,
      qualification: 'heuristic_not_universal',
      universal: false,
      disputedNotes: [...concept.disputedNotes],
      statement: `启发式提示（非普遍规律）：${concept.definition} ${concept.disputedNotes.join(' ')}`,
    }
  if (concept.definitionStatus === 'tradition_specific')
    return {
      concept,
      definitionStatus: concept.definitionStatus,
      qualification: 'tradition_specific',
      universal: false,
      disputedNotes: [...concept.disputedNotes],
      statement: `在 ${concept.tradition} 传统中：${concept.definition}`,
    }
  if (concept.definitionStatus === 'contested')
    return {
      concept,
      definitionStatus: concept.definitionStatus,
      qualification: 'contested',
      universal: null,
      disputedNotes: [...concept.disputedNotes],
      statement: `存在定义争议：${concept.definition} ${concept.disputedNotes.join(' ')}`,
    }
  return {
    concept,
    definitionStatus: concept.definitionStatus,
    qualification: 'none',
    universal: null,
    disputedNotes: [...concept.disputedNotes],
    statement: concept.definition,
  }
}
