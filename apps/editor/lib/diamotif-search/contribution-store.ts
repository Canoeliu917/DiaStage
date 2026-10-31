import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { type ContributionDraft, ContributionError, type StoredContribution } from './contributions'

const StoredContributionSchema = z
  .object({
    id: z.string().regex(/^c[a-f0-9]{16}$/),
    status: z.enum(['pending-review', 'marked-reviewed', 'rejected']),
    publicSearch: z.literal(false),
    submittedAt: z.string().datetime(),
    markedAt: z.string().datetime().optional(),
    title: z.string().min(1),
    author: z.string().min(1),
    category: z.enum(['script', 'stage-video', 'knowledge', 'other']),
    completeness: z.enum([
      'full-original',
      'verified-translation',
      'volume-checked-collection',
      'metadata-only',
      'unknown',
    ]),
    rights: z.enum(['owner', 'authorized', 'public-domain', 'unclear']),
    externalUrl: z.string().nullable(),
    contactEmail: z.string().nullable(),
    contactWechat: z.string().nullable(),
    notes: z.string(),
    mainlandConfirmed: z.literal(true),
    file: z
      .object({
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        contentType: z.string().min(1),
        originalName: z.string().min(1),
      })
      .nullable(),
  })
  .strict()

export function assertContributionId(id: string) {
  if (!/^c[a-f0-9]{16}$/.test(id)) throw new ContributionError('投稿编号无效。')
}

function sceneDatabasePath(env: NodeJS.ProcessEnv) {
  if (env.PASCAL_DB_PATH) return env.PASCAL_DB_PATH
  if (env.PASCAL_DATA_DIR) return join(env.PASCAL_DATA_DIR, 'pascal.db')
  if (process.platform === 'win32' && env.APPDATA)
    return join(env.APPDATA, 'Pascal', 'data', 'pascal.db')
  if (env.XDG_DATA_HOME) return join(env.XDG_DATA_HOME, 'pascal', 'data', 'pascal.db')
  return join(homedir(), '.pascal', 'data', 'pascal.db')
}

export function contributionDirectory(env: NodeJS.ProcessEnv = process.env) {
  const database = sceneDatabasePath(env)
  if (database === ':memory:') throw new ContributionError('投稿需要可写入的数据目录。', 500)
  return join(dirname(resolve(database)), 'motif-contributions')
}

async function privateFile(path: string, bytes: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
  try {
    await chmod(temporary, 0o600)
  } catch {
    // Windows may reject POSIX modes; the file stays outside the public web root.
  }
  await rename(temporary, path)
}

export async function savePendingContribution(draft: ContributionDraft, directory: string) {
  const id = `c${randomBytes(8).toString('hex')}`
  assertContributionId(id)
  const record: StoredContribution = {
    id,
    status: 'pending-review',
    publicSearch: false,
    submittedAt: new Date().toISOString(),
    title: draft.title,
    author: draft.author,
    category: draft.category,
    completeness: draft.completeness,
    rights: draft.rights,
    externalUrl: draft.externalUrl,
    contactEmail: draft.contactEmail,
    contactWechat: draft.contactWechat,
    notes: draft.notes ?? '',
    mainlandConfirmed: true,
    file: draft.file
      ? {
          bytes: draft.file.bytes.byteLength,
          sha256: createHash('sha256').update(draft.file.bytes).digest('hex'),
          contentType: draft.file.contentType,
          originalName: draft.file.originalName,
        }
      : null,
  }
  const parsed = StoredContributionSchema.parse(record)
  const filePath = join(directory, 'files', id)
  if (draft.file) await privateFile(filePath, draft.file.bytes)
  try {
    await privateFile(
      join(directory, 'records', `${id}.json`),
      `${JSON.stringify(parsed, null, 2)}\n`,
    )
  } catch (error) {
    if (draft.file) await rm(filePath, { force: true })
    throw error
  }
  return parsed
}

async function readStoredContribution(directory: string, id: string) {
  assertContributionId(id)
  const raw = JSON.parse(await readFile(join(directory, 'records', `${id}.json`), 'utf8'))
  return StoredContributionSchema.parse(raw)
}

export async function readPendingContribution(directory: string, id: string) {
  const record = await readStoredContribution(directory, id)
  if (record.status !== 'pending-review') throw new ContributionError('这条记录不在待审状态。')
  return record
}

export type ContributionQueueRow = {
  id: string
  title: string
  author: string
  status: StoredContribution['status']
  submittedAt: string
  rights: StoredContribution['rights']
  publicSearch: false
}

export async function listContributionQueue(directory: string): Promise<ContributionQueueRow[]> {
  let names: string[] = []
  try {
    names = await readdir(join(directory, 'records'))
  } catch {
    return []
  }
  const rows: ContributionQueueRow[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const record = await readStoredContribution(directory, name.slice(0, -'.json'.length))
    rows.push({
      id: record.id,
      title: record.title,
      author: record.author,
      status: record.status,
      submittedAt: record.submittedAt,
      rights: record.rights,
      publicSearch: false,
    })
  }
  return rows.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
}

export async function setContributionQueueStatus(
  directory: string,
  id: string,
  status: Exclude<StoredContribution['status'], 'pending-review'> | 'pending-review',
) {
  const record = await readStoredContribution(directory, id)
  const next = StoredContributionSchema.parse({
    ...record,
    status,
    publicSearch: false,
    markedAt: new Date().toISOString(),
  })
  await privateFile(join(directory, 'records', `${id}.json`), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export function contributionPublicIndexPlan(rows: ContributionQueueRow[], writePublic = false) {
  return {
    dryRun: !writePublic,
    wrotePublicIndex: false,
    considered: rows.length,
    message: writePublic
      ? '已拒绝写入公开检索。标记已审或拒绝只改投稿状态，不进入正式目录。'
      : '未写入公开检索。这是待审队列的只读核对。',
  }
}
