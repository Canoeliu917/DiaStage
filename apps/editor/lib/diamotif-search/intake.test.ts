import { expect, test } from 'bun:test'
import cases from '../../../../DiaMotif/evals/search-intake-20261030.json'
import batch3Cases from '../../../../DiaMotif/evals/search-intake-20261030-batch3.json'
import { searchDiaMotif } from './search'

test.each([...cases, ...batch3Cases])('verified source is discoverable: $query', ({
  query,
  category,
  expectedId,
  url,
}) => {
  const result = searchDiaMotif({ query, category })
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
