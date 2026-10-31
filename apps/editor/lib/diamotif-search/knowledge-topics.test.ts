import { expect, test } from 'bun:test'
import {
  KNOWLEDGE_TOPIC_RESOURCES,
  KNOWLEDGE_TOPICS,
  knowledgeTopicMatches,
} from './knowledge-topics'
import { SEARCH_RESOURCES, SearchInputSchema, searchDiaMotif } from './search'
import { topicMatches } from './search-topics'

test('knowledge topics cover the knowledge catalog with explicit, nonduplicated memberships', () => {
  expect(KNOWLEDGE_TOPICS.map(({ id }) => id)).toEqual([
    'all',
    'performance',
    'directing',
    'voice',
    'dramaturgy',
    'stage-design',
    'production',
    'history-theory',
  ])
  const knowledge = SEARCH_RESOURCES.filter(({ category }) => category === 'knowledge')
  const ids = new Set(knowledge.map(({ id }) => id))
  for (const entries of Object.values(KNOWLEDGE_TOPIC_RESOURCES))
    expect(new Set(entries).size).toBe(entries.length)
  const mapped = new Set(Object.values(KNOWLEDGE_TOPIC_RESOURCES).flat())
  expect(mapped.size).toBeGreaterThan(ids.size)
  for (const { id, recordType } of knowledge)
    if (recordType === 'concept' || id.startsWith('source:')) expect(mapped.has(id)).toBe(true)
})

test.each([
  ['performance', 'concept:emotion-memory', 'concept:hinge'],
  ['directing', 'concept:blocking', 'concept:breath'],
  ['voice', 'concept:line-training', 'concept:emotion-memory'],
  ['dramaturgy', 'concept:plot', 'concept:hinge'],
  ['stage-design', 'concept:window-flat', 'concept:emotion-memory'],
  ['production', 'concept:stage-manager', 'concept:character-motivation'],
  ['history-theory', 'concept:black-slaves-cry-to-heaven', 'concept:chair'],
] as const)('topic %s includes its subject and excludes a nearby contrast', (topic, positive, contrast) => {
  expect(knowledgeTopicMatches(positive, topic)).toBe(true)
  expect(knowledgeTopicMatches(contrast, topic)).toBe(false)
  expect(knowledgeTopicMatches('unknown-resource', topic)).toBe(false)
  const result = searchDiaMotif({ category: 'knowledge', topic: topic })
  expect(result.topic).toBe(topic)
  expect(
    result.results.every((resource) => resource.publicationReview?.status === 'approved'),
  ).toBe(true)
  expect(result.results.every((resource) => topicMatches(resource, topic))).toBe(true)
})

test('knowledge facets default to all and cannot be applied to other categories', () => {
  expect(SearchInputSchema.parse({}).topic).toBe('all')
  expect(SearchInputSchema.parse({ category: 'videos' }).topic).toBe('all')
  for (const input of [
    { category: 'knowledge', topic: 'invalid' },
    { category: 'all', topic: 'voice' },
    { category: 'videos', topic: 'voice' },
    { topic: 'voice' },
  ])
    expect(SearchInputSchema.safeParse(input).success).toBe(false)
})

test('query and pagination keep the selected knowledge facet', () => {
  const performance = searchDiaMotif({
    query: '情感记忆',
    category: 'knowledge',
    topic: 'performance',
  })
  expect(performance.results.map(({ id }) => id)).not.toContain('concept:emotion-memory')
  expect(searchDiaMotif({ query: '情感记忆', category: 'knowledge', topic: 'voice' }).total).toBe(0)
  const first = searchDiaMotif({ category: 'knowledge', topic: 'stage-design' })
  const second = searchDiaMotif({
    category: 'knowledge',
    topic: 'stage-design',
    offset: 24,
  })
  expect(second.topic).toBe('stage-design')
  expect(second.total).toBe(first.total)
  expect(second.results).toHaveLength(Math.max(0, Math.min(24, first.total - 24)))
  expect(second.results.every((resource) => topicMatches(resource, 'stage-design'))).toBe(true)
  const firstIds = new Set(first.results.map(({ id }) => id))
  expect(second.results.some(({ id }) => firstIds.has(id))).toBe(false)
})
