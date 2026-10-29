import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const suitePath = join(root, 'DiaMotif/evals/live-model-acceptance.jsonl')
const imagePaths = {
  'reference-stage': 'apps/editor/public/photo-stage/reference-stage.jpg',
  'synthetic-table-chairs': 'DiaMotif/evals/fixtures/synthetic-table-chairs.png',
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function safeError(error) {
  const code = typeof error?.code === 'string' && /^[A-Z_]{1,80}$/.test(error.code)
    ? error.code
    : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'TIMEOUT' : 'REQUEST_FAILED'
  return { code, class: /^[A-Za-z]{1,80}$/.test(error?.name ?? '') ? error.name : 'Error',
    ...(['AiError', 'ZodError'].includes(error?.name) && typeof error.message === 'string'
      ? { message: sanitize(error.message).slice(0, 600) } : {}) }
}

export function sanitize(value) {
  if (typeof value === 'string') return value
    .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[image omitted]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[credential omitted]')
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(authorization|apiKey|api_key|secret|headers)$/i.test(key))
    .map(([key, item]) => [key, sanitize(item)]))
  return value
}

export function requestEvidence(body) {
  const user = body.messages?.find((message) => message.role === 'user')?.content
  const text = typeof user === 'string' ? user : user?.find((part) => part.type === 'text')?.text
  let payload = null
  try { payload = JSON.parse(text) } catch { /* Raw text is not stored in transport evidence. */ }
  return {
    model: body.model ?? null,
    requestBodySha256: sha256(JSON.stringify(body)),
    instructionsSha256: sha256(body.messages?.find((message) => message.role === 'system')?.content ?? ''),
    imageIncluded: Array.isArray(user) && user.some((part) => part.type === 'image_url'),
    knowledgeIds: payload?.theatreKnowledge?.concepts?.map((concept) => concept.id) ?? [],
    knowledgeTruncated: payload?.theatreKnowledge?.truncated ?? null,
    diaMotifVersion: payload?.diaMotif?.version ?? null,
    sceneVersion: payload?.sceneVersion ?? null,
    sceneContextIncluded: payload?.sceneContext != null,
    sceneVenueIncluded: payload?.sceneContext?.venue != null,
    sceneObjectCount: payload?.sceneContext?.objects?.length ?? null,
    sceneTransformCount: payload?.sceneContext?.objects?.filter((object) => object.transform != null).length ?? null,
    historyEntryCount: payload?.history?.length ?? null,
    historyRoles: payload?.history?.map((entry) => entry.role) ?? [],
    historyTruncated: payload?.historyTruncated ?? null,
    pendingPlanIncluded: payload?.pendingPlan != null,
    localCandidateIncluded: payload?.localCandidate != null,
    canonicalCandidateIncluded: payload?.canonicalCandidate != null,
    deterministicCandidateIncluded: payload?.deterministicCandidate != null,
    inputKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
  }
}

export function dialogueInput(candidate, fixture) {
  return {
    rawUtterance: candidate.input.utterance,
    sceneVersion: fixture.open.sceneVersion,
    sceneContext: fixture.scene,
    openContext: fixture.open,
    history: candidate.context.previousTurns.map((entry) => ({
      role: entry.role === 'assistant' ? 'dia' : entry.role,
      content: entry.text,
      sceneVersion: fixture.open.sceneVersion,
    })),
    historyTruncated: false,
    pendingPlan: null,
  }
}

export function summarize(rows, requested, providerRequests, stopReason) {
  const usage = rows.flatMap((row) => row.usage)
  return {
    requested, attempted: rows.length, providerRequests,
    productionReturned: rows.filter((row) => row.productionResult === 'returned').length,
    productionRejected: rows.filter((row) => row.productionResult === 'rejected').length,
    modelRouteCases: rows.filter((row) => row.transport.length > 0).length,
    localRouteCases: rows.filter((row) => row.usage.some((item) => item.path === 'local-parser')).length,
    sceneMutationDetected: rows.some((row) => !row.sceneUnchanged),
    inputTokens: usage.reduce((total, row) => total + (row.inputTokens ?? 0), 0),
    outputTokens: usage.reduce((total, row) => total + (row.outputTokens ?? 0), 0),
    estimatedCostCny: usage.reduce((total, row) => total + (row.estimatedCostCny ?? 0), 0),
    costBasis: 'Application estimates/reservations; not a provider billing statement.',
    semanticPassCount: null, humanReviewed: 0, stopReason,
  }
}

async function productionHashes() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    'apps/editor/lib/ai', 'apps/editor/lib/rehearsal-intelligence', 'apps/editor/lib/stage',
    'apps/editor/lib/photo-stage', 'apps/editor/lib/scripts', 'packages/core/src/stage',
    'apps/editor/components/dia', 'apps/editor/app/api/dia', 'apps/editor/app/api/photo-stage',
    'apps/editor/components/stage-entry', 'apps/editor/components/photo-stage-builder.tsx', 'apps/editor/app/api/stage',
    'apps/editor/app/api/script'], { cwd: root, encoding: 'utf8' }).split('\0')
    .filter((path) => path && !/\.(?:test|test-helpers)\.[cm]?[jt]sx?$/.test(path)).sort()
  return Object.fromEntries(await Promise.all(files.map(async (path) => [path, sha256(await readFile(join(root, path)))])))
}

async function main() {
  const { values } = parseArgs({ options: {
    split: { type: 'string', default: 'all' }, live: { type: 'boolean', default: false },
    dialogue: { type: 'boolean', default: false },
  } })
  if (!['development', 'holdout', 'all'].includes(values.split)) throw new Error('Invalid split')
  const { plugin } = await import('bun')
  const require = createRequire(import.meta.url)
  plugin({ name: 'diamotif-server-only-cli', setup(build) {
    build.module('server-only', () => ({ exports: require('next/dist/compiled/server-only/empty.js'), loader: 'object' }))
  } })
  const [
    { buildLiveFixture }, { groundOpenLanguageWithModel }, { parseOpenLanguage }, { groundLanguage },
    { planFromPassages }, { analyzePhotoStage }, { getAiProviderConfig }, { betaBudgetPolicy },
    { aiRequestContext, readAiUsage }, { AI_LIMITS, takeAiRateLimit, withAbort },
    { respondDiaDialogue },
  ] = await Promise.all([
    import('./diamotif-live-fixtures.ts'),
    import('../apps/editor/lib/rehearsal-intelligence/open-language-server.ts'),
    import('../apps/editor/lib/rehearsal-intelligence/open-language.ts'),
    import('../apps/editor/lib/rehearsal-intelligence/language-grounding.ts'),
    import('../apps/editor/lib/scripts/script-planner.ts'),
    import('../apps/editor/lib/photo-stage/analyze-server.ts'),
    import('../apps/editor/lib/ai/provider-config.ts'),
    import('../apps/editor/lib/ai/model-budget.ts'),
    import('../apps/editor/lib/ai/usage.ts'),
    import('../apps/editor/lib/ai/api.ts'),
    import('../apps/editor/lib/rehearsal-intelligence/dialogue-server.ts'),
  ])
  await import('../apps/editor/lib/ai/structured-server.ts')
  const suiteText = await readFile(suitePath, 'utf8')
  const suite = suiteText.trim().split(/\r?\n/).map((line) => JSON.parse(line))
  if (suite.length !== 30 || new Set(suite.map((row) => row.id)).size !== 30 ||
    suite.some((row) => !/^DM-LIVE-[A-Z]\d{2}$/.test(row.id) || !['open-language', 'script', 'photo'].includes(row.route)) ||
    suite.filter((row) => row.split === 'development').length !== 20 ||
    suite.filter((row) => row.split === 'holdout').length !== 10) throw new Error('Invalid frozen suite')
  for (const row of suite) buildLiveFixture(row)
  const images = Object.fromEntries(await Promise.all(Object.entries(imagePaths).map(async ([id, path]) => {
    const bytes = await readFile(join(root, path))
    if (bytes.length > 700 * 1024) throw new Error('Image exceeds production limit')
    return [id, { bytes, path, sha256: sha256(bytes) }]
  })))
  const candidates = suite.filter((row) => values.split === 'all' || row.split === values.split)
  const config = getAiProviderConfig()
  const userId = process.env.DIASTAGE_REAL_EVAL_USER_ID?.trim()
  const ledgerPath = process.env.DIASTAGE_AI_LEDGER_PATH
  const ledger = ledgerPath && isAbsolute(ledgerPath) ? await lstat(ledgerPath).catch(() => null) : null
  const ready = config?.provider === 'aliyun' && !!userId && betaBudgetPolicy().userIds.includes(userId) &&
    ledger?.isFile() && !ledger.isSymbolicLink()
  if (!values.live) {
    console.log(JSON.stringify({ status: 'PREFLIGHT_ONLY', cases: suite.length, selected: candidates.length,
      split: values.split, dialogue: values.dialogue, suiteSha256: sha256(suiteText), fixturesValid: true,
      liveReady: !!ready, liveRequires: 'Aliyun configuration, invited evaluation user, existing absolute shared ledger path.',
      providerRequests: 0 }))
    return
  }
  if (!ready) throw new Error('Live prerequisites unavailable')
  process.chdir(join(root, 'apps/editor'))
  const runId = crypto.randomUUID()
  const directory = join(root, 'DiaMotif/private/live-model', runId)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const manifest = {
    runId, startedAt: new Date().toISOString(), split: values.split, dialogue: values.dialogue,
    suiteSha256: sha256(suiteText),
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    productionHashes: await productionHashes(),
    fixtureBuilderSha256: sha256(await readFile(join(root, 'scripts/diamotif-live-fixtures.ts'))),
    runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    images: Object.fromEntries(Object.entries(images).map(([id, item]) => [id, { path: item.path, sha256: item.sha256 }])),
    caseIds: candidates.map((row) => row.id), provider: 'aliyun', approvedCny: 0,
    maxProviderRequests: 36, timeoutMs: AI_LIMITS.requestTimeoutMs,
    scope: 'Direct production service diagnostic; not browser routing or user acceptance. No scene persistence.',
  }
  const save = (name, data) => writeFile(join(directory, name), `${JSON.stringify(sanitize(data), null, 2)}\n`, { mode: 0o600 })
  await save('manifest.json', manifest)
  await writeFile(join(directory, 'suite.jsonl'), suiteText, { flag: 'wx', mode: 0o600 })
  const originalFetch = globalThis.fetch
  const rows = []
  let activeTransport = []
  let providerRequests = 0
  let consecutiveNetworkErrors = 0
  let stopReason = null
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url !== `${config.baseURL}/chat/completions` || method !== 'POST' || providerRequests >= 36)
      throw Object.assign(new Error('Evaluation transport blocked'), { code: 'EVAL_TRANSPORT_BLOCKED' })
    let retryAfter = takeAiRateLimit('diamotif-live-provider')
    while (retryAfter !== null) {
      await delay(Math.min(retryAfter * 1000, 60_000), undefined, { signal: init?.signal ?? undefined })
      retryAfter = takeAiRateLimit('diamotif-live-provider')
    }
    const text = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : ''
    const evidence = { ...requestEvidence(JSON.parse(text)), status: null, providerRequestId: null,
      returnedModel: null, finishReason: null, rawContent: null, providerUsage: null }
    activeTransport.push(evidence)
    providerRequests++
    let response
    try { response = await originalFetch(input, init) }
    catch (error) {
      evidence.transportFailure = {
        class: /^[A-Za-z]{1,80}$/.test(error?.name ?? '') ? error.name : 'Error',
        code: /^[A-Z_0-9]{1,80}$/.test(error?.code ?? '') ? error.code : null,
        causeCode: /^[A-Z_0-9]{1,80}$/.test(error?.cause?.code ?? '') ? error.cause.code : null,
      }
      throw error
    }
    evidence.status = response.status
    try {
      const data = await response.clone().json()
      evidence.providerRequestId = typeof data.id === 'string' ? data.id.slice(0, 200) : null
      evidence.returnedModel = typeof data.model === 'string' ? data.model : null
      evidence.finishReason = data.choices?.[0]?.finish_reason ?? null
      evidence.rawContent = sanitize(data.choices?.[0]?.message?.content ?? null)
      evidence.providerUsage = data.usage ?? null
      evidence.providerErrorCode = typeof data.error?.code === 'string' ? data.error.code : null
    } catch { evidence.responseCapture = 'UNREADABLE_JSON' }
    return response
  }
  console.log(JSON.stringify({ status: 'STARTED', runId, selected: candidates.length, split: values.split }))
  try {
    for (const candidate of candidates) {
      const fixture = buildLiveFixture(candidate)
      const before = JSON.stringify(fixture.scene)
      const requestId = `${runId}:${candidate.id}`
      const started = performance.now()
      activeTransport = []
      const row = { caseId: candidate.id, category: candidate.category, split: candidate.split, requestId,
        serviceRoute: candidate.route === 'open-language' && values.dialogue ? 'dia-dialogue' : candidate.route,
        productionResult: 'rejected', output: null, error: null, localDiagnostic: null,
        omittedContext: candidate.route !== 'open-language' ? [] : !values.dialogue ? fixture.omittedContext : [
          ...(candidate.context.previousTurns.length ? ['History is a seeded fixture, not a continuous live conversation.'] : []),
          ...(fixture.open.proposal ? ['Proposal metadata is seeded; prior proposal geometry is unavailable (pendingPlan=null).'] : []),
        ],
        sceneUnchanged: true, transport: activeTransport, usage: [], latencyMs: 0,
        acceptance: { status: 'PENDING_REVIEW', requiredChecks: candidate.expected.checks }, humanReview: null }
      if (candidate.route === 'open-language') row.localDiagnostic = {
        route: 'offline-comparison-only',
        parseOpenLanguage: parseOpenLanguage(candidate.input.utterance),
        groundLanguage: groundLanguage(candidate.input.utterance, structuredClone(fixture.scene)),
      }
      try {
        const signal = AbortSignal.timeout(AI_LIMITS.requestTimeoutMs)
        row.output = await aiRequestContext.run({ requestId, userId, approvedCny: 0 }, () => withAbort(
          candidate.route === 'open-language'
            ? values.dialogue
              ? respondDiaDialogue(dialogueInput(candidate, fixture), signal)
              : groundOpenLanguageWithModel({ rawUtterance: candidate.input.utterance, context: fixture.open }, signal)
            : candidate.route === 'script'
              ? planFromPassages(candidate.input.passages, signal, { sceneContext: fixture.scene, note: candidate.input.note,
                ...(values.dialogue ? { forceModel: true } : {}) })
              : analyzePhotoStage({ imageDataUrl: `data:image/${images[candidate.input.imageFixture].path.endsWith('.png') ? 'png' : 'jpeg'};base64,${images[candidate.input.imageFixture].bytes.toString('base64')}`,
                name: candidate.id, note: candidate.input.note }, signal), signal))
        row.productionResult = 'returned'
      } catch (error) { row.error = safeError(error) }
      row.latencyMs = Math.round(performance.now() - started)
      row.usage = readAiUsage().filter((record) => record.requestId === requestId)
      row.sceneUnchanged = before === JSON.stringify(fixture.scene)
      rows.push(row)
      await save(`${candidate.id}.json`, row)
      await save('results.json', rows)
      console.log(JSON.stringify({ caseId: candidate.id, result: row.productionResult,
        error: row.error?.code ?? null, providerRequests: row.transport.length,
        latencyMs: row.latencyMs, humanReview: 'pending' }))
      const networkFailure = row.error && (row.transport.some((call) => call.status === null || call.status >= 429) || row.error.code === 'TIMEOUT')
      consecutiveNetworkErrors = networkFailure ? consecutiveNetworkErrors + 1 : 0
      if (!row.sceneUnchanged) stopReason = 'FIXTURE_MUTATION'
      else if (['BUDGET_EXCEEDED', 'BUDGET_CONFIRMATION_REQUIRED', 'AI_INVITE_REQUIRED'].includes(row.error?.code)) stopReason = row.error.code
      else if (consecutiveNetworkErrors >= 3) stopReason = 'THREE_CONSECUTIVE_TRANSPORT_FAILURES'
      else if (providerRequests >= 36) stopReason = 'PROVIDER_REQUEST_CAP'
      if (stopReason) break
    }
  } finally {
    globalThis.fetch = originalFetch
    const finalHashes = await productionHashes()
    const report = { ...summarize(rows, candidates.length, providerRequests, stopReason), runId,
      completedAt: new Date().toISOString(), productionChangedDuringRun: JSON.stringify(manifest.productionHashes) !== JSON.stringify(finalHashes),
      pendingCaseIds: candidates.slice(rows.length).map((row) => row.id), resultDirectory: `DiaMotif/private/live-model/${runId}` }
    await save('summary.json', report)
    console.log(JSON.stringify(report))
    if (stopReason) process.exitCode = 1
  }
}

if (import.meta.main) main().catch((error) => {
  console.error(JSON.stringify({ status: 'STOPPED', ...safeError(error) }))
  process.exitCode = 1
})
