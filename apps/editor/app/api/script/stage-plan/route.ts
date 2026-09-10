import { aiPreflight, handleAiRequest } from '@/lib/ai/api'
import { extractDocument, readScriptUpload } from '@/lib/scripts/extract'
import { planFromPassages } from '@/lib/scripts/script-planner'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, async ({ signal }) => {
    const upload = await readScriptUpload(request, signal)
    const document = await extractDocument(upload.file, signal)
    const plan = await planFromPassages(document.passages, signal, upload.options)
    return { file: document.file, plan }
  })
}
