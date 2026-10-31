import { expect, test } from 'bun:test'
import roundFile from '../../../../DiaMotif/knowledge/daily-intake-20261031.json'
import { DailyIntakeRoundSchema, publicIntakePlan } from './daily-intake'
import { SEARCH_RESOURCES } from './search'

test('the night intake round stays out of public search', () => {
  const round = DailyIntakeRoundSchema.parse(roundFile)
  expect(round.counts.formalAdded).toBe(0)
  expect(round.counts.fullTextsHosted).toBe(0)
  expect(round.counts.openedAndRead).toBeLessThanOrEqual(20)
  expect(round.counts.discovered).toBeLessThanOrEqual(60)
  expect(round.items.every((item) => item.fullTextHosted === false)).toBe(true)
  expect(round.items.some((item) => item.decision === 'formal')).toBe(false)
  for (const item of round.items) {
    expect(SEARCH_RESOURCES.some((resource) => resource.id === item.id)).toBe(false)
  }
  expect(publicIntakePlan(round).wrotePublicIndex).toBe(false)
  expect(publicIntakePlan(round, true).wrotePublicIndex).toBe(false)
  expect(publicIntakePlan(round, true).message).toContain('没有可写入公开检索')
})
