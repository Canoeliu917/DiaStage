import { expect, test } from 'bun:test'
import discoveries from '../../../../DiaMotif/knowledge/domestic-discovery.json'
import reviews from '../../../../DiaMotif/knowledge/search-publication-reviews.json'
import { isProfessionalResource, SearchResourceSchema } from './catalog'
import { isPublishableResource } from './publication-policy'
import { SEARCH_RESOURCES, searchDiaMotif } from './search'
import { SEARCH_TOPICS, topicFitsCategory, topicMatches } from './search-topics'
import { sourceRegion } from './source-scope'

test('canonical discovery records have unique IDs and links and are admitted once', () => {
  expect(new Set(discoveries.map(({ id }) => id)).size).toBe(discoveries.length)
  expect(new Set(discoveries.map(({ url }) => url)).size).toBe(discoveries.length)
  expect(new Set(SEARCH_RESOURCES.map(({ id }) => id)).size).toBe(SEARCH_RESOURCES.length)
  for (const raw of discoveries)
    expect(SEARCH_RESOURCES.filter((resource) => resource.id === raw.id)).toHaveLength(
      isPublishableResource(
        SearchResourceSchema.parse({
          ...raw,
          publicationReview: (reviews as Record<string, unknown>)[raw.id],
        }),
      )
        ? 1
        : 0,
    )
})

test.each(
  discoveries,
)('canonical metadata is valid; publication review controls search eligibility: $id', (raw) => {
  const resource = SearchResourceSchema.parse({
    ...raw,
    publicationReview: (reviews as Record<string, unknown>)[raw.id],
  })
  expect(isProfessionalResource(resource)).toBe(true)
  expect(resource.url).not.toBeNull()
  expect(sourceRegion(resource.url!)).not.toBeNull()
  expect(resource.rights).toBe('metadata-only')
  expect(resource.verifiedAt).not.toBeNull()
  expect(['verified', 'source-directory']).toContain(resource.status)
  expect(resource.sourceRefs?.length ?? 0).toBeGreaterThan(0)
  for (const ref of resource.sourceRefs ?? []) {
    expect(ref.locator?.length ?? 0).toBeGreaterThan(0)
    if (ref.url) expect(sourceRegion(ref.url)).not.toBeNull()
  }
  if (!isPublishableResource(resource)) {
    expect(SEARCH_RESOURCES.some(({ id }) => id === resource.id)).toBe(false)
    return
  }
  if (!resource.subtopics?.length) {
    expect(resource.recordType).toBe('directory')
    for (const topic of SEARCH_TOPICS.filter((item) => item.category === resource.category))
      expect(topicMatches(resource, topic.id)).toBe(false)
  }
  for (const topic of resource.subtopics?.length ? resource.subtopics : (['all'] as const)) {
    expect(topicFitsCategory(resource.category!, topic)).toBe(true)
    expect(topicMatches(resource, topic)).toBe(true)
    const result = searchDiaMotif({ query: resource.title, category: resource.category, topic })
    expect(result.results.map(({ id }) => id)).toContain(resource.id)
    expect(result.answer).toBeNull()
    expect(result.aiStatus).toBe('disabled')
  }
  if (resource.category === 'ai-screen') {
    expect(resource.aiInvolvement).toBeDefined()
    expect(resource.aiEvidence?.length ?? 0).toBeGreaterThanOrEqual(8)
    expect(resource.theatreEvidence).toBeUndefined()
  }
})
