import { isProfessionalResource, type SearchResource } from './catalog'
import { sourceRegion } from './source-scope'

export function isPublishableResource(resource: SearchResource) {
  if (!isProfessionalResource(resource) || resource.status === 'web-candidate') return false
  if (resource.publicationReview?.status === 'pending-user') return false
  const needsComplete =
    resource.category === 'scripts' ||
    resource.category === 'videos' ||
    (resource.category === 'ai-screen' && resource.aiInvolvement !== 'reference')
  if (needsComplete && (!resource.completeVersion || resource.recordType !== 'resource'))
    return false
  if (needsComplete || resource.category === 'knowledge') {
    const review = resource.publicationReview
    if (
      review?.status !== 'approved' ||
      !sourceRegion(review.evidenceUrl) ||
      !resource.sourceRefs?.some((ref) => ref.url === review.evidenceUrl && Boolean(ref.locator))
    )
      return false
  }
  return true
}

export function selectPublicationResources(resources: SearchResource[]) {
  const urls = new Set<string>()
  const versions = new Set<string>()
  const works = new Map<string, number>()
  return resources.filter((resource) => {
    if (!isPublishableResource(resource)) return false
    if (resource.recordType !== 'concept' && resource.url && urls.has(resource.url)) return false
    if (resource.category === 'scripts') {
      const version = resource.completeVersion!
      const key = `${version.workKey.normalize('NFKC').trim().toLowerCase()}\0${version.versionKey.normalize('NFKC').trim().toLowerCase()}`
      const work = version.workKey.normalize('NFKC').trim().toLowerCase()
      if (versions.has(key) || (works.get(work) ?? 0) >= 3) return false
      versions.add(key)
      works.set(work, (works.get(work) ?? 0) + 1)
    }
    if (resource.recordType !== 'concept' && resource.url) urls.add(resource.url)
    return true
  })
}
