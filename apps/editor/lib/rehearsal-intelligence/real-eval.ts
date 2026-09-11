import { mkdir, rename, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'
import { type EvalResult, EvalResultSchema, evalContext, validateEvalOutput } from './eval'
import { EVAL_CASES } from './eval-cases'

export function realEvalCases(count: number) {
  if (!Number.isInteger(count) || count < 10 || count > 20)
    throw new RangeError('真实模型首轮只允许 10–20 个 Candidate Cases')
  const categories = [...new Set(EVAL_CASES.map((item) => item.category))]
  return [0, 1]
    .flatMap((index) =>
      categories.map((category) => EVAL_CASES.filter((item) => item.category === category)[index]!),
    )
    .slice(0, count)
}

export async function runRealEval(count = 10) {
  const candidates = realEvalCases(count)
  if (!process.env.OPENAI_API_KEY?.trim())
    return { REAL_MODEL_EVAL: 'NOT_RUN', reason: 'OPENAI_API_KEY_NOT_CONFIGURED', attempted: 0 }

  // Match the app's working directory so evaluation shares its existing budget ledger.
  process.chdir(fileURLToPath(new URL('../../', import.meta.url)))
  const { AI_LIMITS, AiError, takeAiRateLimit, withAbort } = await import('../ai/api')
  const { ModelBudgetError } = await import('../ai/model-budget')
  const { aiRequestContext, readAiUsage } = await import('../ai/usage')
  const { rehearsalModelVersion, requestRehearsalOutput } = await import('./openai-server')
  const runId = crypto.randomUUID()
  const directory = new URL(`../../../../.local/rehearsal-real-eval/${runId}/`, import.meta.url)
  await mkdir(directory, { recursive: true })
  const file = new URL('results.json', directory)
  const pendingFile = new URL('results.tmp', directory)
  await writeFile(file, '[]\n', { flag: 'wx', mode: 0o600 })
  const rows: EvalResult[] = []
  const providerStatuses: { caseId: string; status: string | null }[] = []
  const transportErrors: { caseId: string; code: string }[] = []
  for (const candidate of candidates) {
    let retryAfter = takeAiRateLimit('rehearsal-real-eval')
    while (retryAfter !== null) {
      await delay(retryAfter * 1000)
      retryAfter = takeAiRateLimit('rehearsal-real-eval')
    }
    const input = evalContext(candidate.caseId)
    const requestId = `${runId}:${candidate.caseId}`
    const started = performance.now()
    let rawStructuredOutput: unknown = null
    let modelVersion = rehearsalModelVersion()
    try {
      const signal = AbortSignal.timeout(AI_LIMITS.requestTimeoutMs)
      const result = await aiRequestContext.run({ requestId }, () =>
        withAbort(requestRehearsalOutput(input, signal), signal),
      )
      rawStructuredOutput = result.rawStructuredOutput
      modelVersion = result.modelVersion
      providerStatuses.push({ caseId: candidate.caseId, status: result.status ?? null })
    } catch (error) {
      transportErrors.push({
        caseId: candidate.caseId,
        code:
          error instanceof AiError || error instanceof ModelBudgetError
            ? error.code
            : error instanceof Error && error.name === 'TimeoutError'
              ? 'TIMEOUT'
              : 'REQUEST_FAILED',
      })
    }
    const usage = readAiUsage().find((record) => record.requestId === requestId)
    rows.push(
      EvalResultSchema.parse({
        provenance: 'real-model',
        caseId: candidate.caseId,
        modelVersion,
        promptVersion: PROMPT_VERSION,
        ontologyVersion: ONTOLOGY_VERSION,
        input,
        rawStructuredOutput,
        latency: usage?.latencyMs ?? Math.round(performance.now() - started),
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        estimatedCostCNY: usage?.estimatedCostCny ?? null,
        validationResult: validateEvalOutput(input, rawStructuredOutput, modelVersion),
        humanReview: null,
      }),
    )
    await writeFile(pendingFile, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 })
    await rename(pendingFile, file)
    if (transportErrors.length) break
  }
  const report = {
    REAL_MODEL_EVAL: providerStatuses.length ? 'RUN' : 'NOT_RUN',
    runId,
    requested: count,
    attempted: rows.length,
    responses: providerStatuses.length,
    humanReviewed: 0,
    resultFile: `.local/rehearsal-real-eval/${runId}/results.json`,
    providerStatuses,
    transportErrors,
  }
  await writeFile(new URL('summary.json', directory), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  })
  return report
}
