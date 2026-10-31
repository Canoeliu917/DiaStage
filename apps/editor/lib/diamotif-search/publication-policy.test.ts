import { expect, test } from 'bun:test'
import { isExcludedMedia, type SearchResource, SearchResourceSchema } from './catalog'
import { isPublishableResource, selectPublicationResources } from './publication-policy'
import { SEARCH_RESOURCES, searchDiaMotif } from './search'

const complete: SearchResource = {
  id: 'synthetic-complete-script',
  title: '《测试作品》完整剧本',
  category: 'scripts',
  topics: ['测试作品'],
  summary: '合成测试元数据，不是实际已收录剧本。',
  organization: '合成测试机构',
  url: 'https://www.chntheatre.edu.cn/synthetic-complete',
  access: 'public',
  rights: 'metadata-only',
  recordType: 'resource',
  theatreEvidence: '合成测试中的戏剧文本完整版本，仅用于程序校验。',
  status: 'verified',
  verifiedAt: '2026-10-31',
  publicationReview: {
    status: 'approved',
    reviewedAt: '2026-10-31',
    evidenceUrl: 'https://www.chntheatre.edu.cn/synthetic-complete',
    locator: '合成核验定位：人物表、第一幕至末幕与版本说明',
  },
  sourceRefs: [
    {
      title: '合成完整版本',
      url: 'https://www.chntheatre.edu.cn/synthetic-complete',
      locator: '合成人物表及第一幕至末幕',
    },
  ],
  completeVersion: {
    workKey: 'synthetic-work',
    versionKey: 'original',
    author: '合成作者',
    language: 'zh',
    edition: '测试原本',
    coverage: 'full',
  },
}

test('full scripts require explicit complete-version and matched original review evidence', () => {
  expect(isPublishableResource(SearchResourceSchema.parse(complete))).toBe(true)
  for (const patch of [
    { completeVersion: undefined },
    { publicationReview: undefined },
    { recordType: 'directory' as const },
    { sourceRefs: [] },
    { publicationReview: { ...complete.publicationReview!, status: 'pending-user' as const } },
    {
      publicationReview: {
        ...complete.publicationReview!,
        evidenceUrl: 'https://www.chntheatre.edu.cn/different',
      },
    },
  ])
    expect(isPublishableResource({ ...complete, ...patch })).toBe(false)
  expect(
    SearchResourceSchema.safeParse({
      ...complete,
      completeVersion: { ...complete.completeVersion, coverage: 'excerpt' },
    }).success,
  ).toBe(false)
})

test('same work retains at most three distinct verified versions, including duplicate mirrors', () => {
  const versions = Array.from({ length: 4 }, (_, index) => ({
    ...complete,
    id: `version-${index}`,
    url: `${complete.url}/${index}`,
    completeVersion: { ...complete.completeVersion!, versionKey: `v${index}` },
  }))
  const mirror = { ...versions[0]!, id: 'mirror', url: `${complete.url}/mirror` }
  const pending = {
    ...versions[1]!,
    id: 'pending',
    publicationReview: { ...complete.publicationReview!, status: 'pending-user' as const },
  }
  expect(
    selectPublicationResources([pending, versions[0]!, mirror, ...versions.slice(1)]).map(
      ({ id }) => id,
    ),
  ).toEqual(['version-0', 'version-1', 'version-2'])
  expect(
    selectPublicationResources([
      ...versions,
      {
        ...complete,
        id: 'other-work',
        url: `${complete.url}/other`,
        completeVersion: { ...complete.completeVersion!, workKey: 'other-work' },
      },
    ]),
  ).toHaveLength(4)
})

test('knowledge is not authenticated by a verified label or an institutional domain alone', () => {
  const knowledge = { ...complete, category: 'knowledge' as const, completeVersion: undefined }
  expect(isPublishableResource(knowledge)).toBe(true)
  expect(isPublishableResource({ ...knowledge, publicationReview: undefined })).toBe(false)
  expect(isPublishableResource({ ...knowledge, status: 'web-candidate' })).toBe(false)
  expect(
    isPublishableResource({
      ...knowledge,
      publicationReview: { ...complete.publicationReview!, status: 'pending-user' },
    }),
  ).toBe(false)
  expect(
    searchDiaMotif({ query: '情感记忆', category: 'knowledge' }).results.some(
      ({ id }) => id === 'concept:emotion-memory',
    ),
  ).toBe(false)
})

test('only the two approved NCL original scans enter search, with pending records still blocked', () => {
  for (const [id, query, edition] of [
    ['dm-script-ncl-xiongfoxi-luoti-1933', '裸体', '1933年3月初版'],
    ['dm-script-ncl-dingxilin-sankuai-1946', '三块钱国币', '1946年4月沪一版'],
  ]) {
    const record = SEARCH_RESOURCES.find((resource) => resource.id === id)!
    expect(record).toBeDefined()
    expect(record.contentRegion).toBe('mainland')
    expect(record.rights).toBe('metadata-only')
    expect(record.completeVersion?.edition).toContain(edition)
    expect(
      searchDiaMotif({ query, category: 'scripts' }).results.some((resource) => resource.id === id),
    ).toBe(true)
    expect(
      isPublishableResource({
        ...record,
        publicationReview: { ...record.publicationReview!, status: 'pending-user' },
      }),
    ).toBe(false)
    expect(isPublishableResource({ ...record, publicationReview: undefined })).toBe(false)
    expect(isPublishableResource({ ...record, completeVersion: undefined })).toBe(false)
  }
  expect(
    SEARCH_RESOURCES.filter((resource) => resource.url?.includes('taiwanebook.ncl.edu.tw/'))
      .map(({ id }) => id)
      .sort(),
  ).toEqual(['dm-script-ncl-dingxilin-sankuai-1946', 'dm-script-ncl-xiongfoxi-luoti-1933'])
})

test('AI and stage films require full-version review; technical reference records stay distinct', () => {
  const ai = {
    ...complete,
    category: 'ai-screen' as const,
    aiInvolvement: 'generated' as const,
    aiEvidence: '合成测试中的AI生成电影正片，非实际资源。',
  }
  expect(isPublishableResource(ai)).toBe(true)
  expect(isPublishableResource({ ...ai, completeVersion: undefined })).toBe(false)
  expect(
    isPublishableResource({ ...complete, category: 'videos', completeVersion: undefined }),
  ).toBe(false)
  expect(
    isPublishableResource({ ...ai, aiInvolvement: 'reference', completeVersion: undefined }),
  ).toBe(true)
  for (const category of ['scripts', 'videos'] as const)
    for (const resource of searchDiaMotif({ category }).results) {
      expect(resource.completeVersion?.coverage).toBe('full')
      expect(resource.publicationReview?.status).toBe('approved')
      expect(resource.recordType).toBe('resource')
    }
})

test('interview and promotional records are rejected before publication, while formal notices remain valid', () => {
  for (const title of [
    '话剧演员专访',
    '舞台采访报道',
    '话剧探班花絮',
    'AI电影预告片',
    '舞台宣传视频',
    '排练现场视频',
    'Theatre interview',
  ]) {
    expect(isExcludedMedia(title)).toBe(true)
    expect(SearchResourceSchema.safeParse({ ...complete, title }).success).toBe(false)
    expect(searchDiaMotif({ query: title }).results).toHaveLength(0)
  }
  for (const title of ['话剧正式开票公告', '戏剧节报名预告', '舞台排练方法'])
    expect(isExcludedMedia(title)).toBe(false)
  for (const resource of SEARCH_RESOURCES) expect(isPublishableResource(resource)).toBe(true)
  const corrected = SEARCH_RESOURCES.find(
    ({ id }) => id === 'dm-knowledge-ncpa-chang-nianbai-20200629',
  )!
  expect(corrected.title).toContain('谐白')
  expect(corrected.title).not.toContain('方言')
})
