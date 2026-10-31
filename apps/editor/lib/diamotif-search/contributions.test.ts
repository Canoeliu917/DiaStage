import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import checklist from '../../../../DiaMotif/knowledge/hundred-play-cards.json'
import { readPendingContribution, savePendingContribution } from './contribution-store'
import { ContributionError, contributionFromFields, contributionFromRequest } from './contributions'
import {
  HundredPlayChecklistSchema,
  intakeCommandRefusal,
  PRIORITY_MAINLAND_PLAYWRIGHTS,
  summarizeHundredCards,
} from './hundred-cards'
import { motifClosedBetaEnabled } from './motif-beta'
import { SEARCH_RESOURCES, searchDiaMotif } from './search'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function tempDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'motif-contribution-'))
  directories.push(directory)
  return directory
}

const linkOnly = {
  title: 'ZZ待审投稿隔离作品九九',
  author: '测试作者',
  category: 'script',
  completeness: 'metadata-only',
  rights: 'unclear',
  externalUrl: 'https://www.chntheatre.edu.cn/example-play',
  contactEmail: '',
  contactWechat: '',
  notes: '只留短摘要，不含正文。',
  mainlandConfirmed: true,
}

test('link-only submissions stay pending and out of public search', async () => {
  const directory = await tempDirectory()
  const draft = contributionFromFields(linkOnly, null)
  const saved = await savePendingContribution(draft, directory)
  expect(saved.status).toBe('pending-review')
  expect(saved.publicSearch).toBe(false)
  expect(saved.file).toBeNull()
  const stored = await readPendingContribution(directory, saved.id)
  expect(stored).toEqual(saved)
  const raw = await readFile(join(directory, 'records', `${saved.id}.json`), 'utf8')
  expect(raw).not.toContain('全文')
  const found = searchDiaMotif({ query: saved.title, category: 'scripts' })
  expect(found.total).toBe(0)
  expect(found.results.some((item) => item.id === saved.id || item.title === saved.title)).toBe(
    false,
  )
  expect(SEARCH_RESOURCES.some((item) => item.id === saved.id)).toBe(false)
})

test('unclear rights reject files and missing sources', () => {
  expect(() => contributionFromFields({ ...linkOnly, externalUrl: '' }, null)).toThrow(
    ContributionError,
  )
  expect(() =>
    contributionFromFields(linkOnly, {
      bytes: new TextEncoder().encode('%PDF-1.4\n'),
      type: 'application/pdf',
      name: 'play.pdf',
    }),
  ).toThrow(/不接收文件/)
  expect(() => contributionFromFields({ ...linkOnly, notes: '摘'.repeat(181) }, null)).toThrow(
    /短摘要/,
  )
})

test('an authorized pdf can be stored without entering search', async () => {
  const directory = await tempDirectory()
  const bytes = new TextEncoder().encode('%PDF-1.4\n% test\n')
  const draft = contributionFromFields(
    {
      ...linkOnly,
      rights: 'owner',
      completeness: 'full-original',
      externalUrl: '',
      notes: '权利人提交的测试文件，不是公开语料。',
    },
    { bytes, type: '', name: 'play.pdf' },
  )
  const saved = await savePendingContribution(draft, directory)
  expect(saved.file?.contentType).toBe('application/pdf')
  expect(saved.file?.bytes).toBe(bytes.byteLength)
  const body = await readFile(join(directory, 'files', saved.id))
  expect(body.byteLength).toBe(bytes.byteLength)
  expect(searchDiaMotif({ query: saved.title }).results.map(({ id }) => id)).not.toContain(saved.id)
})

test('json requests do not fetch the supplied link', async () => {
  const request = new Request('http://127.0.0.1/api/diamotif/contributions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(linkOnly),
  })
  const draft = await contributionFromRequest(request)
  expect(draft.externalUrl).toBe(linkOnly.externalUrl)
  expect(draft.file).toBeNull()
  expect(draft.contactEmail).toBeNull()
})

test('closed beta badge follows the existing env flag', () => {
  expect(motifClosedBetaEnabled({})).toBe(true)
  expect(motifClosedBetaEnabled({ DIASTAGE_MOTIF_BETA: '1' })).toBe(true)
  expect(motifClosedBetaEnabled({ DIASTAGE_MOTIF_BETA: '0' })).toBe(false)
  expect(motifClosedBetaEnabled({ DIASTAGE_MOTIF_BETA: 'false' })).toBe(false)
})

test('hundred-play cards are metadata candidates, not a padded corpus', () => {
  const doc = HundredPlayChecklistSchema.parse(checklist)
  const summary = summarizeHundredCards(doc)
  expect(summary.listedCards).toBe(doc.cards.length)
  expect(summary.listedCards).toBeLessThan(40)
  expect(summary.reviewedFullTexts).toBe(0)
  expect(summary.publicSearchCards).toBe(0)
  for (const playwright of PRIORITY_MAINLAND_PLAYWRIGHTS)
    expect(doc.cards.some((card) => card.playwright === playwright)).toBe(true)
  for (const card of doc.cards) {
    expect(card.fullText).toBeNull()
    expect(card.publicSearch).toBe(false)
    expect(SEARCH_RESOURCES.some((item) => item.id === card.id)).toBe(false)
    const found = searchDiaMotif({ query: `${card.playwright}${card.title}` })
    expect(
      found.results.some((item) => item.id === card.id || item.id.startsWith('hundred-')),
    ).toBe(false)
  }
  expect(intakeCommandRefusal(['--list'])).toBeNull()
  expect(intakeCommandRefusal(['--scrape'])).toContain('拒绝')
  expect(intakeCommandRefusal(['--promote'])).toContain('公开检索')
})
