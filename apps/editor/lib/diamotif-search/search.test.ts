import { expect, test } from 'bun:test'
import resources from '../../../../DiaMotif/knowledge/theatre-resources.json'
import { DIA_KNOWLEDGE } from '../rehearsal-intelligence/knowledge/retrieval'
import {
  isEntertainmentQuery,
  isProfessionalResource,
  SEARCH_CATEGORIES,
  SEARCH_CATEGORY_GROUPS,
  SearchResourceSchema,
} from './catalog'
import { SEARCH_RESOURCES, searchDiaMotif } from './search'
import { sourceRegion } from './source-scope'

test('public catalog exposes regional sources without foreign links or private paths', () => {
  const conceptIds = new Set(DIA_KNOWLEDGE.concepts.map(({ id }) => `concept:${id}`))
  const sourceIds = new Set(DIA_KNOWLEDGE.sources.map(({ sourceId }) => `source:${sourceId}`))
  expect(new Set(SEARCH_RESOURCES.map(({ id }) => id)).size).toBe(SEARCH_RESOURCES.length)
  expect(JSON.stringify(SEARCH_RESOURCES)).not.toMatch(/D:\/Obsidian|localFileRef|apiKey|SecretKey/)
  for (const resource of resources) {
    expect(SEARCH_RESOURCES.some(({ id }) => id === resource.id)).toBe(
      sourceRegion(resource.url) !== null,
    )
  }
  for (const item of SEARCH_RESOURCES) {
    if (item.url) expect(sourceRegion(item.url)).not.toBeNull()
    else expect(item.status).toBe('registered')
    for (const ref of item.sourceRefs ?? [])
      if (ref.url) expect(sourceRegion(ref.url)).not.toBeNull()
  }
  for (const item of SEARCH_RESOURCES.filter((entry) => entry.status === 'registered')) {
    expect((item.recordType === 'concept' ? conceptIds : sourceIds).has(item.id)).toBe(true)
    expect(item.verifiedAt).toBeNull()
    expect(item.rights).toBe('metadata-only')
  }
  expect(SEARCH_RESOURCES.some(({ status, url }) => status === 'registered' && url === null)).toBe(
    true,
  )
  expect(DIA_KNOWLEDGE.concepts).toHaveLength(145)
  expect(DIA_KNOWLEDGE.sources).toHaveLength(12)
})

test('specific theatre terms outrank broad keyword overlap and retain source qualifications', () => {
  const result = searchDiaMotif({ query: '二道幕和二联景片有什么区别', category: 'knowledge' })
  expect(result.results.slice(0, 4).some((item) => item.title === '二道幕')).toBe(true)
  expect(result.results.every((item) => item.category === 'knowledge')).toBe(true)
  expect(result.answer).toBeNull()
  expect(result.aiStatus).toBe('disabled')
  expect(result.notice).toBeNull()
  const theory = searchDiaMotif({ query: '舞台区位', category: 'knowledge' })
  expect(theory.results.find((item) => item.id === 'concept:stage-zone')?.summary).toContain(
    '非普遍规律',
  )
})

test('all categories browse curated records; random input does not become invented recommendations', () => {
  for (const { id } of SEARCH_CATEGORIES) {
    const result = searchDiaMotif({ query: '', category: id })
    expect(result.results.every((item) => id === 'all' || item.category === id)).toBe(true)
  }
  expect(searchDiaMotif({ query: 'zzzzqqqq999999' }).results).toHaveLength(0)
  expect(() => searchDiaMotif({ query: '字'.repeat(501) })).toThrow()
  expect(() => searchDiaMotif({ query: '导演', category: 'gossip' })).toThrow()
})

test('specific topics do not return generic directories on a shared theatre fragment', () => {
  for (const query of ['沉浸式戏剧', '沉浸式戏剧录像']) {
    const result = searchDiaMotif({ query, category: 'videos' })
    expect(result.results.map(({ id }) => id)).not.toContain('dm-resource-ncpa-opera-highlights')
    expect(result.results.map(({ id }) => id)).not.toContain('dm-resource-nt-collection-schools')
  }
  expect(searchDiaMotif({ query: '戏剧', category: 'videos' }).results.length).toBeGreaterThan(0)
})

test('named plays constrain sources instead of matching only the word script', () => {
  const named = searchDiaMotif({ query: '《雷雨》剧本', category: 'scripts' })
  expect(named.results.map(({ id }) => id)).not.toContain('dm-resource-folger-plays')
  expect(named.results.map(({ id }) => id)).not.toContain('dm-resource-gutenberg-dolls-house')
  expect(
    searchDiaMotif({ query: '《未收录的星际雨夜》剧本', category: 'scripts' }).results,
  ).toHaveLength(0)
  expect(
    searchDiaMotif({ query: '未收录的星际雨夜剧本', category: 'scripts' }).results,
  ).toHaveLength(0)
})

test.each([
  ['《玩偶之家》英文剧本', 'dm-resource-gutenberg-dolls-house'],
  ['娜拉 英文剧本', 'dm-resource-gutenberg-dolls-house'],
  ["A Doll's House", 'dm-resource-gutenberg-dolls-house'],
  ['HAMLET', 'dm-resource-folger-plays'],
])('foreign source remains deferred for Chinese and English queries: %s', (query, expectedId) => {
  const result = searchDiaMotif({ query, category: 'scripts' })
  expect(result.results.map(({ id }) => id)).not.toContain(expectedId)
  expect(result.total).toBe(0)
})

test('arts-exam news is a distinct category from school admissions', () => {
  expect(SEARCH_CATEGORIES.map(({ label }) => label)).toEqual([
    '全部',
    '剧本',
    '戏剧知识',
    '演出影像',
    'AI影视',
    '演职人员',
    '剧场剧团',
    '演出票讯',
    '院校招生',
    '招募招聘',
    '艺考资讯',
    '戏剧节与工作坊',
  ])
  const exams = searchDiaMotif({ category: 'arts-exams' })
  const admissions = searchDiaMotif({ category: 'admissions' })
  expect(exams.total).toBeGreaterThan(0)
  expect(admissions.total).toBeGreaterThan(0)
  expect(exams.results.every(({ category }) => category === 'arts-exams')).toBe(true)
  expect(admissions.results.every(({ category }) => category === 'admissions')).toBe(true)
  const examIds = new Set(exams.results.map(({ id }) => id))
  expect(admissions.results.some(({ id }) => examIds.has(id))).toBe(false)
})

test('eight navigation groups cover every search category exactly once', () => {
  expect(SEARCH_CATEGORY_GROUPS.map(({ id, label }) => [id, label])).toEqual([
    ['all', '全部'],
    ['works', '剧本影像'],
    ['ai-screen', 'AI影视'],
    ['knowledge', '戏剧知识'],
    ['people-venues', '演职与剧场'],
    ['events-activities', '演出活动'],
    ['study', '艺考咨询'],
    ['opportunities', '招募招聘'],
  ])
  expect(SEARCH_CATEGORY_GROUPS.flatMap(({ categories }) => [...categories]).sort()).toEqual(
    SEARCH_CATEGORIES.map(({ id }) => id).sort(),
  )
})

test('gossip stays out while relationship analysis and acting terminology remain searchable', () => {
  for (const query of ['演员私生活爆料', '明星绯闻', '八卦热搜', '演员恋情']) {
    expect(isEntertainmentQuery(query)).toBe(true)
    expect(searchDiaMotif({ query }).results).toHaveLength(0)
  }
  for (const query of [
    '演员情感记忆训练',
    '角色恋情与人物行动分析',
    '《八卦》剧本中的冲突',
    '亲密戏的舞台调度',
  ]) {
    expect(isEntertainmentQuery(query)).toBe(false)
  }
})

test.each([
  '娱乐新闻',
  '花邊新聞',
])('explicit excluded category %s cannot reach AI evidence', (query) => {
  expect(isEntertainmentQuery(query)).toBe(true)
  const result = searchDiaMotif({ query })
  expect(result.results).toHaveLength(0)
  expect(result.notice).toContain('专业资料')
})

test('people need a verified professional link and resource links cannot execute scripts', () => {
  const base = SEARCH_RESOURCES[0]!
  expect(
    isProfessionalResource({
      ...base,
      recordType: 'person',
      status: 'verified',
      theatreEvidence: '演员在话剧剧目中的角色与剧团履历',
    }),
  ).toBe(true)
  expect(
    isProfessionalResource({
      ...base,
      recordType: 'person',
      status: 'registered',
      theatreEvidence: '声称曾经参加话剧剧目与剧团演出',
    }),
  ).toBe(false)
  expect(
    isProfessionalResource({
      ...base,
      recordType: 'person',
      status: 'verified',
      theatreEvidence: '影视热搜人物的网络传播与流行排名',
    }),
  ).toBe(false)
  expect(SearchResourceSchema.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(
    false,
  )
})

test('only unverified web candidates may omit a resource category', () => {
  const base = SEARCH_RESOURCES[0]!
  for (const status of ['source-directory', 'verified', 'registered'])
    expect(SearchResourceSchema.safeParse({ ...base, status, category: null }).success).toBe(false)
  expect(
    SearchResourceSchema.safeParse({ ...base, status: 'web-candidate', category: null }).success,
  ).toBe(true)
})
