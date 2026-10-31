import { expect, test } from 'bun:test'
import cases from '../../../../DiaMotif/evals/search-intake-20261030.json'
import batch3Cases from '../../../../DiaMotif/evals/search-intake-20261030-batch3.json'
import regionalResources from '../../../../DiaMotif/knowledge/theatre-regional-intake-20261030.json'
import { SEARCH_RESOURCES, searchDiaMotif } from './search'
import { sourceRegion } from './source-scope'

const historicalCases = [...cases, ...batch3Cases]

test.each(
  historicalCases.filter(({ url }) => sourceRegion(url)),
)('historical regional fixture respects the current publication decision: $query', ({
  query,
  category,
  expectedId,
  url,
}) => {
  const result = searchDiaMotif({ query, category })
  if (!SEARCH_RESOURCES.some(({ id }) => id === expectedId)) {
    expect(result.results.some(({ id }) => id === expectedId)).toBe(false)
    return
  }
  const source = result.results.slice(0, 3).find(({ id }) => id === expectedId)
  expect(source).toBeDefined()
  expect(source?.url).toBe(url)
  expect(source?.category).toBe(category)
  expect(source?.status).toBe('verified')
  expect(source?.rights).toBe('metadata-only')
  expect(source?.sourceRefs?.some((ref) => ref.url === url && ref.locator)).toBe(true)
  expect(result.answer).toBeNull()
  expect(result.aiStatus).toBe('disabled')
})

test.each([
  ['北京2027艺考 表导演统考', 'dm-resource-bjeea-arts-exam-2027-faq'],
  ['上海艺考 考试说明', 'dm-resource-shmeea-arts-exam-2027-guide'],
  ['广东艺考 校考', 'dm-resource-guangdong-arts-exam-2027-policy'],
  ['香港話劇團 黑盒劇場', 'dm-resource-hkrep-company-profile'],
  ['澳門文化中心 小劇院', 'dm-resource-macao-ccm-venue-profile'],
  ['香港演藝學院 入學申請', 'dm-resource-hkapa-drama-admissions'],
  ['香港中国戏曲节2026', 'dm-resource-hk-chinese-opera-festival-2026'],
  ['香港编剧工作坊', 'dm-resource-hk-theatre-workshops-2026'],
])('new regional source is discoverable: %s', (query, expectedId) => {
  const original = regionalResources.find(({ id }) => id === expectedId)!
  expect(original).toBeDefined()
  const result = searchDiaMotif({ query, category: original.category })
  const source = result.results.slice(0, 3).find(({ id }) => id === expectedId)
  expect(source).toMatchObject({
    id: original.id,
    url: original.url,
    category: original.category,
    status: original.status,
    rights: 'metadata-only',
    verifiedAt: '2026-10-30',
  })
  expect(source?.sourceRefs?.some((ref) => ref.url === original.url && ref.locator)).toBe(true)
  expect(sourceRegion(original.url)).not.toBeNull()
  expect(result.answer).toBeNull()
  expect(result.aiStatus).toBe('disabled')
})

test.each(
  historicalCases.filter(({ url }) => !sourceRegion(url)),
)('historical foreign-source fixture is deferred by current scope: $query', ({
  query,
  category,
  expectedId,
  url,
}) => {
  const result = searchDiaMotif({ query, category })
  expect(result.results.map(({ id }) => id)).not.toContain(expectedId)
  expect(result.results.map((resource) => resource.url)).not.toContain(url)
  expect(result.answer).toBeNull()
  expect(result.aiStatus).toBe('disabled')
})
