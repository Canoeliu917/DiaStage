import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { SEARCH_RESOURCES, searchDiaMotif } from './search'

type LanguageCase = {
  id: string
  source: 'synthetic'
  boundary: string
  kind: 'positive' | 'contrast' | 'ambiguous'
  query: string
  category: string
  expectedAnyIds?: string[]
  forbiddenIds?: string[]
  expectedTotal?: number
  minimumTotal?: number
  topK?: number
  noticeIncludes?: string
  noticeExcludes?: string
}

const cases: LanguageCase[] = readFileSync(
  new URL('../../../../DiaMotif/evals/search-language-20261030.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))

test('search-language cases keep their provenance and contrast coverage', () => {
  expect(cases).toHaveLength(30)
  expect(new Set(cases.map(({ id }) => id)).size).toBe(cases.length)
  expect(cases.every(({ source }) => source === 'synthetic')).toBe(true)
  const resourceIds = new Set(SEARCH_RESOURCES.map(({ id }) => id))
  for (const entry of cases)
    for (const id of [...(entry.expectedAnyIds ?? []), ...(entry.forbiddenIds ?? [])])
      expect(resourceIds.has(id)).toBe(true)
  for (const boundary of new Set(cases.map((entry) => entry.boundary))) {
    const group = cases.filter((entry) => entry.boundary === boundary)
    expect(group.filter(({ kind }) => kind === 'positive').length).toBeGreaterThanOrEqual(2)
    expect(group.filter(({ kind }) => kind === 'contrast').length).toBeGreaterThanOrEqual(2)
  }
})

test.each(cases)('search language $id: $query', (entry) => {
  const result = searchDiaMotif({ query: entry.query, category: entry.category })
  const ids = result.results.map(({ id }) => id)
  if (entry.expectedAnyIds)
    expect(entry.expectedAnyIds.some((id) => ids.slice(0, entry.topK ?? 3).includes(id))).toBe(true)
  for (const id of entry.forbiddenIds ?? []) expect(ids).not.toContain(id)
  if (entry.expectedTotal !== undefined) expect(result.total).toBe(entry.expectedTotal)
  if (entry.minimumTotal !== undefined)
    expect(result.total).toBeGreaterThanOrEqual(entry.minimumTotal)
  if (entry.noticeIncludes) expect(result.notice).toContain(entry.noticeIncludes)
  if (entry.noticeExcludes) expect(result.notice).not.toContain(entry.noticeExcludes)
  expect(result.answer).toBeNull()
  expect(result.aiStatus).toBe('disabled')
})

test.each([
  ['麻烦帮我找《哈姆雷特》的英文剧本', 'dm-resource-folger-hamlet-text'],
  ['請問能否提供《櫻桃園》的英文劇本', 'dm-resource-gutenberg-cherry-orchard-west'],
])('quoted work names survive unregistered polite wording: %s', (query, id) => {
  expect(
    searchDiaMotif({ query, category: 'scripts' })
      .results.slice(0, 3)
      .map((resource) => resource.id),
  ).toContain(id)
})
