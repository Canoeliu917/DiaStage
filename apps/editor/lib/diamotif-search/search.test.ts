import { expect, test } from 'bun:test'
import resources from '../../../../DiaMotif/knowledge/theatre-resources.json'
import { DIA_KNOWLEDGE } from '../rehearsal-intelligence/knowledge/retrieval'
import {
  isEntertainmentQuery,
  isTheatreResource,
  SEARCH_CATEGORIES,
  SearchResourceSchema,
} from './catalog'
import { SEARCH_RESOURCES, searchDiaMotif } from './search'

test('catalog exposes all current concepts and registered sources without private paths', () => {
  expect(
    SEARCH_RESOURCES.filter(
      (item) => item.status === 'registered' && item.recordType === 'concept',
    ),
  ).toHaveLength(DIA_KNOWLEDGE.concepts.length)
  expect(
    SEARCH_RESOURCES.filter(
      (item) => item.status === 'registered' && item.recordType === 'bibliography',
    ),
  ).toHaveLength(DIA_KNOWLEDGE.sources.length)
  expect(SEARCH_RESOURCES.filter((item) => item.status !== 'registered')).toHaveLength(
    resources.length,
  )
  expect(new Set(SEARCH_RESOURCES.map(({ id }) => id)).size).toBe(SEARCH_RESOURCES.length)
  expect(JSON.stringify(SEARCH_RESOURCES)).not.toMatch(/D:\/Obsidian|localFileRef|apiKey|SecretKey/)
  for (const item of SEARCH_RESOURCES.filter((entry) => entry.status === 'registered')) {
    expect(item.verifiedAt).toBeNull()
    expect(item.rights).toBe('metadata-only')
  }
})

test('specific theatre terms outrank broad keyword overlap and retain source qualifications', () => {
  const result = searchDiaMotif({ query: '二道幕和二联景片有什么区别', category: 'knowledge' })
  expect(result.results.slice(0, 4).some((item) => item.title === '二道幕')).toBe(true)
  expect(result.results.every((item) => item.category === 'knowledge')).toBe(true)
  expect(result.answer).toBeNull()
  expect(result.aiStatus).toBe('disabled')
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
])('Chinese and English work names remain discoverable: %s', (query, expectedId) => {
  const result = searchDiaMotif({ query, category: 'scripts' })
  expect(result.results.slice(0, 3).map(({ id }) => id)).toContain(expectedId)
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
  expect(result.notice).toContain('戏剧专业资料')
})

test('people need a verified professional link and resource links cannot execute scripts', () => {
  const base = SEARCH_RESOURCES[0]!
  expect(
    isTheatreResource({
      ...base,
      recordType: 'person',
      status: 'verified',
      theatreEvidence: '演员在话剧剧目中的角色与剧团履历',
    }),
  ).toBe(true)
  expect(
    isTheatreResource({
      ...base,
      recordType: 'person',
      status: 'registered',
      theatreEvidence: '声称曾经参加话剧剧目与剧团演出',
    }),
  ).toBe(false)
  expect(
    isTheatreResource({
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
