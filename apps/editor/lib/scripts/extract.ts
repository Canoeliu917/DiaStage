import { Worker } from 'node:worker_threads'
import { ClarificationAnswerSchema, SceneContextSummarySchema } from '@pascal-app/core/stage'
import { z } from 'zod'
import { AiError, readBoundedBody, withAbort } from '../ai/api'
import { SCRIPT_LIMITS } from './limits'
import type { Passage } from './stage-facts'

export interface ExtractedScript {
  file: {
    name: string
    type: 'pdf' | 'docx'
    pageCount: number | null
    paragraphCount: number
  }
  passages: Passage[]
}

const optionsSchema = z.strictObject({
  sceneContext: SceneContextSummarySchema.optional(),
  priorAnswers: z.array(ClarificationAnswerSchema).max(30).optional(),
})
const extractionSchema = z.strictObject({
  pageCount: z.number().int().min(1).max(SCRIPT_LIMITS.maxPages).nullable(),
  paragraphCount: z.number().int().nonnegative(),
  passages: z.array(
    z.strictObject({
      id: z.string(),
      page: z.number().int().positive().nullable(),
      paragraph: z.number().int().positive().nullable(),
      text: z.string().max(SCRIPT_LIMITS.maxExtractedCharacters),
    }),
  ),
})
let activeWorkers = 0

export async function readScriptUpload(
  request: Request,
  signal: AbortSignal,
): Promise<{
  file: File
  options: z.infer<typeof optionsSchema>
}> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType))
    throw new AiError('UNSUPPORTED_FILE', '请通过文件选择器上传 PDF 或 .docx。', 415)
  const bytes = await readBoundedBody(
    request,
    SCRIPT_LIMITS.maxBytes + SCRIPT_LIMITS.multipartOverheadBytes,
    signal,
  )
  let form: FormData
  try {
    form = await withAbort(
      new Response(bytes, { headers: { 'content-type': contentType } }).formData(),
      signal,
    )
  } catch {
    signal.throwIfAborted()
    throw new AiError('CORRUPT_DOCUMENT', '上传未完成，请重新选择文档。')
  }
  if (
    [...form.keys()].some((name) => !['file', 'sceneContext', 'priorAnswers'].includes(name)) ||
    ['file', 'sceneContext', 'priorAnswers'].some((name) => form.getAll(name).length > 1)
  )
    throw new AiError('UNSUPPORTED_FILE', '每次只能上传一份剧本文档。')
  const file = form.get('file')
  if (!(file instanceof File))
    throw new AiError('UNSUPPORTED_FILE', '请选择 PDF 或 .docx 剧本文档。')
  try {
    const options = optionsSchema.parse(
      Object.fromEntries(
        ['sceneContext', 'priorAnswers'].flatMap((name) => {
          const value = form.get(name)
          if (value === null) return []
          if (typeof value !== 'string') throw new Error('invalid field')
          return [[name, JSON.parse(value)]]
        }),
      ),
    )
    return { file, options }
  } catch {
    throw new AiError('PLAN_INVALID', '舞台摘要或确认答案格式有误，请重新打开上传窗口。')
  }
}

export async function extractDocument(file: File, signal: AbortSignal): Promise<ExtractedScript> {
  signal.throwIfAborted()
  if (file.size > SCRIPT_LIMITS.maxBytes)
    throw new AiError('FILE_TOO_LARGE', '单份剧本不能超过 20 MB，请拆分后上传。', 413)
  const bytes = new Uint8Array(await withAbort(file.arrayBuffer(), signal))
  const name = [...(file.name.split(/[\\/]/).at(-1) ?? '剧本')]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .slice(0, 200)
  const extension = name.split('.').at(-1)?.toLowerCase()
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
    (value, i) => bytes[i] === value,
  )
  if (extension === 'doc' || ole)
    throw new AiError('UNSUPPORTED_FILE', '请在 Word/WPS 中另存为 .docx 后上传。', 415)
  const type = extension === 'pdf' ? 'pdf' : extension === 'docx' ? 'docx' : null
  if (!type)
    throw new AiError('UNSUPPORTED_FILE', '当前支持文本 PDF 和 Word .docx，请选择这两种格式。', 415)
  const validHeader =
    type === 'pdf'
      ? new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-'
      : bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
  if (!validHeader)
    throw new AiError('CORRUPT_DOCUMENT', '文件内容与扩展名不符，或文件已损坏，请重新导出。', 422)
  if (activeWorkers >= SCRIPT_LIMITS.maxConcurrentExtractions)
    throw new AiError('RATE_LIMITED', '正在读取其他文档，请稍候重试。', 429, true)
  const worker = new Worker(new URL('./document-worker.mjs', import.meta.url), {
    workerData: { type, bytes, limits: SCRIPT_LIMITS },
    transferList: [bytes.buffer],
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    stdout: true,
    stderr: true,
  })
  activeWorkers++
  worker.stdout?.resume()
  worker.stderr?.resume()
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), SCRIPT_LIMITS.requestTimeoutMs)
  const combinedSignal = AbortSignal.any([signal, timeout.signal])
  try {
    const raw = await withAbort(
      new Promise<unknown>((resolve, reject) => {
        worker.once('message', resolve)
        worker.once('error', () =>
          reject(
            new AiError('CORRUPT_DOCUMENT', '文档解析失败或超出内存限制，请精简后重新上传。', 422),
          ),
        )
        worker.once('exit', (code) => {
          if (code !== 0) reject(new AiError('CORRUPT_DOCUMENT', '文档读取中断，请重新上传。', 422))
        })
      }),
      combinedSignal,
    )
    const response = z
      .discriminatedUnion('ok', [
        z.strictObject({ ok: z.literal(true), result: extractionSchema }),
        z.strictObject({
          ok: z.literal(false),
          code: z.enum(['UNSUPPORTED_FILE', 'FILE_TOO_LARGE', 'SCANNED_PDF', 'CORRUPT_DOCUMENT']),
          message: z.string().max(500),
        }),
      ])
      .safeParse(raw)
    if (!response.success)
      throw new AiError('CORRUPT_DOCUMENT', '文档未能提取为有效文字，请重新导出。', 422)
    if (!response.data.ok)
      throw new AiError(
        response.data.code,
        response.data.message,
        response.data.code === 'FILE_TOO_LARGE' ? 413 : 422,
      )
    return {
      file: {
        name,
        type,
        pageCount: response.data.result.pageCount,
        paragraphCount: response.data.result.paragraphCount,
      },
      passages: response.data.result.passages,
    }
  } catch (error) {
    signal.throwIfAborted()
    if (timeout.signal.aborted)
      throw new AiError(
        'CORRUPT_DOCUMENT',
        '文档读取超过 60 秒，请拆分为较小部分后重试。',
        504,
        true,
      )
    throw error
  } finally {
    clearTimeout(timer)
    await worker.terminate()
    activeWorkers--
  }
}
