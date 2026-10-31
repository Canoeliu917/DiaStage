import { expect, test } from 'bun:test'
import {
  AI_INVOLVEMENT_LABELS,
  isProfessionalResource,
  SEARCH_CATEGORIES,
  SearchResourceSchema,
} from './catalog'
import { SEARCH_RESOURCES, SearchInputSchema, searchDiaMotif } from './search'
import {
  SEARCH_RESOURCE_TOPICS,
  SEARCH_TOPICS,
  SearchTopicSchema,
  topicFitsCategory,
  topicMatches,
} from './search-topics'

test('every professional category has distinct topic metadata and rejects foreign category facets', () => {
  expect(new Set(SEARCH_TOPICS.map(({ id }) => id)).size).toBe(SEARCH_TOPICS.length)
  for (const category of SEARCH_CATEGORIES.filter(({ id }) => id !== 'all')) {
    const topics = SEARCH_TOPICS.filter((topic) => topic.category === category.id)
    expect(topics.length).toBeGreaterThan(0)
    for (const topic of topics) {
      expect(topic.description.length).toBeGreaterThan(8)
      expect(SearchTopicSchema.parse(topic.id)).toBe(topic.id)
      expect(topicFitsCategory(category.id, topic.id)).toBe(true)
      expect(topicFitsCategory('all', topic.id)).toBe(false)
      expect(SearchInputSchema.safeParse({ category: category.id, topic: topic.id }).success).toBe(
        true,
      )
    }
    expect(topicFitsCategory(category.id, 'all')).toBe(true)
  }
  expect(SearchInputSchema.safeParse({ category: 'videos', topic: 'script-play' }).success).toBe(
    false,
  )
  expect(SearchInputSchema.safeParse({ category: 'ai-screen', topic: 'voice' }).success).toBe(false)
})

test('explicit nonknowledge memberships match the actual resource category without duplicate IDs', () => {
  for (const [topic, ids] of Object.entries(SEARCH_RESOURCE_TOPICS)) {
    expect(new Set(ids).size).toBe(ids.length)
    const metadata = SEARCH_TOPICS.find((item) => item.id === topic)!
    expect(metadata).toBeDefined()
    for (const id of ids) {
      const resource = SEARCH_RESOURCES.find((item) => item.id === id)!
      expect(resource).toBeDefined()
      expect(resource.category).toBe(metadata.category)
      expect(topicMatches(resource, metadata.id)).toBe(true)
    }
  }
})

test.each([
  ['people', 'person-actor', 'dm-resource-ncpa-opera-artists'],
  ['venues', 'venue-organization', 'dm-resource-hkrep-company-profile'],
  ['admissions', 'admission-hk-macao', 'dm-resource-hkapa-drama-admissions'],
  ['arts-exams', 'exam-unified', 'dm-resource-bjeea-arts-exam-2027-faq'],
  ['festivals', 'workshop', 'dm-resource-hk-theatre-workshops-2026'],
] as const)('category %s filters its selected topic %s', (category, topic, expected) => {
  const result = searchDiaMotif({ category, topic })
  expect(result.topic).toBe(topic)
  expect(result.results.map(({ id }) => id)).toContain(expected)
  expect(result.results.every((resource) => topicMatches(resource, topic))).toBe(true)
})

test('removed media facets cannot be requested or displayed', () => {
  for (const topic of [
    'video-excerpt',
    'video-documentary',
    'video-lecture',
    'video-live-replay',
    'video-interview',
    'video-rehearsal',
    'script-excerpt',
    'script-monologue',
    'ai-tools',
  ])
    expect(SearchTopicSchema.safeParse(topic).success).toBe(false)
  expect(searchDiaMotif({ category: 'videos' }).results).toHaveLength(0)
})

test('AI screen records require actual AI creative evidence without a fabricated theatre association', () => {
  const base = SEARCH_RESOURCES.find(({ category }) => category === 'events')!
  const resource = {
    ...base,
    id: 'synthetic-ai-animation',
    title: 'AI动画制作公开资料',
    category: 'ai-screen',
    subtopics: ['ai-animation', 'ai-techniques'],
    sourceTier: 'creator',
    aiInvolvement: 'assisted',
    theatreEvidence: undefined,
    aiEvidence: '创作者公开介绍其AI动画的分镜与视频制作方法。',
  }
  const parsed = SearchResourceSchema.parse(resource)
  expect(isProfessionalResource(parsed)).toBe(true)
  expect(parsed.theatreEvidence).toBeUndefined()
  expect(topicMatches(parsed, 'ai-animation')).toBe(true)
  expect(topicMatches(parsed, 'ai-tv')).toBe(false)
  expect(topicMatches(parsed, 'video-full')).toBe(false)
  for (const invalid of [
    { ...resource, aiEvidence: undefined },
    { ...resource, aiInvolvement: undefined },
    { ...resource, subtopics: ['video-full'] },
    { ...resource, sourceTier: 'endorsed-by-platform' },
    { ...resource, category: null, status: 'web-candidate' },
  ])
    expect(SearchResourceSchema.safeParse(invalid).success).toBe(false)
  expect(
    isProfessionalResource({
      ...parsed,
      aiEvidence: '普通电视剧的演员与服装介绍，没有制作技术信息。',
    }),
  ).toBe(false)
  expect(
    isProfessionalResource({ ...parsed, aiEvidence: '人工智能手机芯片与硬件配置专业资料。' }),
  ).toBe(false)
  const aboutAi = SearchResourceSchema.parse({
    ...resource,
    aiInvolvement: 'about-ai',
    aiEvidence: '该电影明确以人工智能为主题，来源未声称AI生成制作。',
    publishedAt: null,
    applicableYear: '2026/27',
    contentRegion: 'hong-kong',
    sourceKind: 'creator-experience',
  })
  expect(isProfessionalResource(aboutAi)).toBe(true)
  expect(aboutAi.aiInvolvement).toBe('about-ai')
  expect(aboutAi.publishedAt).toBeNull()
  expect(aboutAi.contentRegion).toBe('hong-kong')
  const reference = SearchResourceSchema.parse({
    ...resource,
    aiInvolvement: 'reference',
    subtopics: ['ai-techniques'],
    aiEvidence: '技术文档介绍AI视频生成接口与调用方法，不属于具体影视作品。',
  })
  expect(isProfessionalResource(reference)).toBe(true)
  expect(reference.aiInvolvement).toBe('reference')
  expect(AI_INVOLVEMENT_LABELS[reference.aiInvolvement!]).toBe('AI创作资料')
  expect(topicMatches(reference, 'ai-techniques')).toBe(true)
  expect(topicMatches(reference, 'ai-film')).toBe(false)
  expect(SearchResourceSchema.safeParse({ ...aboutAi, publishedAt: '20261030' }).success).toBe(
    false,
  )
  expect(SearchResourceSchema.safeParse({ ...aboutAi, sourceKind: 'proven-fact' }).success).toBe(
    false,
  )
})
