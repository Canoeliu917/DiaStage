import { z } from 'zod'
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_COMPLETENESS,
  CONTRIBUTION_FILE_LIMIT_BYTES,
  CONTRIBUTION_NOTES_MAX,
  CONTRIBUTION_RIGHTS,
  CONTRIBUTION_UNCLEAR_NOTES_MAX,
  type ContributionCategory,
  type ContributionCompleteness,
  type ContributionRights,
} from './contribution-fields'

export class ContributionError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ContributionError'
    this.status = status
  }
}

const categoryIds = CONTRIBUTION_CATEGORIES.map(([id]) => id) as [
  ContributionCategory,
  ...ContributionCategory[],
]
const completenessIds = CONTRIBUTION_COMPLETENESS.map(([id]) => id) as [
  ContributionCompleteness,
  ...ContributionCompleteness[],
]
const rightsIds = CONTRIBUTION_RIGHTS.map(([id]) => id) as [
  ContributionRights,
  ...ContributionRights[],
]

const emptyToNull = (value: unknown) => {
  if (value == null) return null
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value)
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
    } catch {
      return false
    }
  }, '请填写可公开打开的 http 或 https 链接，不要附带账号。')

export const ContributionDraftSchema = z
  .object({
    title: z.string().trim().min(1, '请填写作品题名。').max(120, '题名请控制在 120 字以内。'),
    author: z.string().trim().min(1, '请填写作者。').max(80, '作者请控制在 80 字以内。'),
    category: z.enum(categoryIds, '请选择资料类别。'),
    completeness: z.enum(completenessIds, '请声明资料完整程度。'),
    rights: z.enum(rightsIds, '请声明权利情况。'),
    externalUrl: z.preprocess(emptyToNull, httpUrl.nullable()),
    contactEmail: z.preprocess(
      emptyToNull,
      z
        .string()
        .max(120)
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u, '邮箱格式无法识别。')
        .nullable(),
    ),
    contactWechat: z.preprocess(
      emptyToNull,
      z.string().max(40, '微信号请控制在 40 字以内。').nullable(),
    ),
    notes: z.preprocess(emptyToNull, z.string().max(CONTRIBUTION_NOTES_MAX).nullable()),
    mainlandConfirmed: z.literal(
      true,
      '请确认这是中国大陆作者的作品或大陆正式出版的资料。港澳资料暂不征集。',
    ),
  })
  .strict()

export type ContributionDraft = z.infer<typeof ContributionDraftSchema> & {
  file: null | {
    bytes: Uint8Array
    contentType: string
    originalName: string
  }
}

export type StoredContributionFile = {
  bytes: number
  sha256: string
  contentType: string
  originalName: string
}

export type StoredContribution = Omit<ContributionDraft, 'file' | 'notes' | 'externalUrl'> & {
  id: string
  status: 'pending-review'
  publicSearch: false
  submittedAt: string
  externalUrl: string | null
  notes: string
  file: StoredContributionFile | null
}

const extensions: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  if (!match) return ''
  const ext = `.${match[1]!.toLowerCase()}`
  return ext === '.jpeg' ? '.jpg' : ext
}

function matchesMagic(contentType: string, bytes: Uint8Array) {
  if (contentType === 'application/pdf')
    return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3
  if (contentType === 'image/png')
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
  if (contentType === 'image/jpeg')
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (contentType === 'image/webp')
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
  return contentType === 'text/plain' && !bytes.includes(0)
}

function declaredType(type: string, name: string) {
  const normalized = type.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (extensions[normalized]) return normalized
  const ext = extensionOf(name)
  return Object.entries(extensions).find(([, value]) => value === ext)?.[0] ?? normalized
}

export function inspectContributionFile(file: { bytes: Uint8Array; type: string; name: string }) {
  if (file.bytes.byteLength > CONTRIBUTION_FILE_LIMIT_BYTES)
    throw new ContributionError('文件请小于 20MB。更大的材料请改为可公开访问的链接。', 413)
  if (!file.bytes.byteLength) throw new ContributionError('文件是空的。请改传文件或填写链接。')
  const contentType = declaredType(file.type, file.name)
  const originalName = file.name.replace(/\\/g, '/').split('/').pop()?.trim() ?? ''
  const cleaned = originalName.replace(/[^\w.\-\u0080-\uffff]+/gu, '_').slice(0, 80)
  const expected = extensions[contentType]
  const allowed =
    Boolean(expected) &&
    Boolean(cleaned) &&
    extensionOf(cleaned) === expected &&
    matchesMagic(contentType, file.bytes)
  if (!allowed)
    throw new ContributionError(
      '目前只接收 PDF、DOCX、TXT、PNG、JPEG 或 WebP。请改用这些格式，或只提交链接。',
    )
  return { bytes: file.bytes, contentType, originalName: cleaned }
}

function confirmed(value: unknown) {
  return value === true || value === 'true' || value === 'on' || value === '1'
}

export function contributionFromFields(
  fields: Record<string, unknown>,
  file: { bytes: Uint8Array; type: string; name: string } | null,
): ContributionDraft {
  const parsed = ContributionDraftSchema.safeParse({
    ...fields,
    mainlandConfirmed: confirmed(fields.mainlandConfirmed) ? true : fields.mainlandConfirmed,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ContributionError(issue?.message || '投稿内容无法核对，请检查必填项。')
  }
  const notes = parsed.data.notes ?? ''
  if (parsed.data.rights === 'unclear' && notes.length > CONTRIBUTION_UNCLEAR_NOTES_MAX)
    throw new ContributionError('权利尚不明确时，说明请写成短摘要，不要粘贴全文。')
  if (parsed.data.rights === 'unclear' && file && file.bytes.byteLength > 0)
    throw new ContributionError('权利尚不明确时不接收文件。请只填写可公开访问的链接和短摘要。')
  const storedFile = file && file.bytes.byteLength > 0 ? inspectContributionFile(file) : null
  if (!parsed.data.externalUrl && !storedFile)
    throw new ContributionError(
      '请填写可公开访问的链接，或上传一份文件。我们不会代为登录或绕过付费墙。',
    )
  return { ...parsed.data, notes, file: storedFile }
}

async function readJsonBytes(request: Request) {
  const limit = 16_384
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit)
    throw new ContributionError('提交内容超过大小限制，请缩短说明或改为链接。', 413)
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit)
        throw new ContributionError('提交内容超过大小限制，请缩短说明或改为链接。', 413)
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function contributionFromRequest(request: Request): Promise<ContributionDraft> {
  const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  try {
    if (type === 'application/json') {
      const bytes = await readJsonBytes(request)
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new ContributionError('请提交一条投稿记录。')
      return contributionFromFields(body as Record<string, unknown>, null)
    }
    if (type === 'multipart/form-data') {
      const form = await request.formData()
      const fields: Record<string, unknown> = {}
      for (const key of [
        'title',
        'author',
        'category',
        'completeness',
        'rights',
        'externalUrl',
        'contactEmail',
        'contactWechat',
        'notes',
        'mainlandConfirmed',
      ])
        fields[key] = form.get(key)
      const uploaded = form.get('file')
      const file =
        uploaded instanceof File && uploaded.size > 0
          ? {
              bytes: new Uint8Array(await uploaded.arrayBuffer()),
              type: uploaded.type,
              name: uploaded.name,
            }
          : null
      return contributionFromFields(fields, file)
    }
  } catch (error) {
    if (error instanceof ContributionError) throw error
    if (error instanceof SyntaxError) throw new ContributionError('投稿内容不是有效的 JSON。')
    throw new ContributionError('投稿内容无法读取。请缩短说明，或改为提交链接。')
  }
  throw new ContributionError('请使用页面表单提交。')
}
