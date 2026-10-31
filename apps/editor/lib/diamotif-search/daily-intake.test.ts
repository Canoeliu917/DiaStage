import { expect, test } from 'bun:test'
import round1031 from '../../../../DiaMotif/knowledge/daily-intake-20261031.json'
import round1101 from '../../../../DiaMotif/knowledge/daily-intake-20261101.json'
import { DailyIntakeRoundSchema, publicIntakePlan } from './daily-intake'
import { SEARCH_RESOURCES } from './search'

test('the 10-31 intake round stays out of public search', () => {
  const round = DailyIntakeRoundSchema.parse(round1031)
  expect(round.counts).toMatchObject({
    discovered: 13,
    openedAndRead: 11,
    pending: 1,
    formalAdded: 0,
  })
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

test('the 11-01 intake round uses the same four cells and adds no public script', () => {
  const round = DailyIntakeRoundSchema.parse(round1101)
  expect(round.counts).toMatchObject({
    discovered: 10,
    openedAndRead: 9,
    pending: 1,
    formalAdded: 0,
    fullTextsHosted: 0,
  })
  expect(round.items.every((item) => item.fullTextHosted === false)).toBe(true)
  expect(round.items.some((item) => item.url?.includes('hkrep.com'))).toBe(false)
  expect(round.items.some((item) => item.url?.includes('gov.mo'))).toBe(false)
  for (const item of round.items)
    expect(SEARCH_RESOURCES.some((resource) => resource.id === item.id)).toBe(false)
  expect(publicIntakePlan(round, true).wrotePublicIndex).toBe(false)
})
