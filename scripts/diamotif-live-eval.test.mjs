import { describe, expect, test } from 'bun:test'
import { dialogueInput, requestEvidence, safeError, sanitize, summarize } from './diamotif-live-eval.mjs'

describe('live evaluation evidence boundaries', () => {
  test('does not expose provider credentials, headers or image bytes in saved evidence', () => {
    const saved = sanitize({
      headers: { Authorization: 'Bearer private-value' },
      apiKey: 'private-value',
      output: ['data:image/png;base64,YWJj', 'sk-12345678901234567890'],
    })
    expect(saved).toEqual({ output: ['[image omitted]', '[credential omitted]'] })
    expect(safeError(new Error('secret payload and credentials'))).toEqual({
      code: 'REQUEST_FAILED', class: 'Error',
    })
    expect(safeError(Object.assign(new Error('private'), { code: 'BUDGET_EXCEEDED' })).code)
      .toBe('BUDGET_EXCEEDED')
    expect(safeError(Object.assign(new Error('sk-12345678901234567890'), { name: 'AiError', code: 'PLAN_INVALID' })).message)
      .toBe('[credential omitted]')
    expect(safeError(Object.assign(new Error('private-auth-body'), { name: 'AuthenticationError' })).message)
      .toBeUndefined()
  })

  test('unified dialogue records actual context fields without treating seeded history as a live conversation', () => {
    const fixture = {
      scene: { venue: { widthMeters: 8 }, objects: [{ id: 'a', transform: { position: { x: 1 } } }] },
      open: { sceneVersion: 'fixture:v1', proposal: { id: 'seeded' } },
    }
    const input = dialogueInput({ input: { utterance: '往右一点' }, context: {
      previousTurns: [{ role: 'user', text: '移动桌子' }, { role: 'assistant', text: '待采用' }],
    } }, fixture)
    expect(input.history.map((item) => item.role)).toEqual(['user', 'dia'])
    expect(input.sceneContext).toBe(fixture.scene)
    expect(input.openContext).toBe(fixture.open)
    expect(input.pendingPlan).toBeNull()
    const evidence = requestEvidence({ messages: [{ role: 'user', content: JSON.stringify({
      ...input, diaMotif: { version: 'diamotif-dialogue-v1' },
      theatreKnowledge: { concepts: [{ id: 'audience-right' }], truncated: false },
    }) }] })
    expect(evidence.diaMotifVersion).toBe('diamotif-dialogue-v1')
    expect(evidence.sceneVersion).toBe('fixture:v1')
    expect(evidence.sceneContextIncluded).toBe(true)
    expect(evidence.sceneVenueIncluded).toBe(true)
    expect(evidence.sceneObjectCount).toBe(1)
    expect(evidence.sceneTransformCount).toBe(1)
    expect(evidence.historyEntryCount).toBe(2)
    expect(evidence.historyRoles).toEqual(['user', 'dia'])
    expect(evidence.historyTruncated).toBe(false)
    expect(evidence.pendingPlanIncluded).toBe(false)
    expect(evidence.knowledgeIds).toEqual(['audience-right'])
    expect(JSON.stringify(evidence)).not.toContain('往右一点')
    expect(JSON.stringify(evidence)).not.toContain('待采用')
  })

  test('captures actually sent knowledge and hashes rather than request content', () => {
    const body = { model: 'model-fixture', messages: [
      { role: 'system', content: 'instructions' },
      { role: 'user', content: [
        { type: 'text', text: JSON.stringify({
          theatreKnowledge: { concepts: [{ id: 'second-curtain' }], truncated: true },
          deterministicCandidate: null,
        }) },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJj' } },
      ] },
    ] }
    const evidence = requestEvidence(body)
    expect(evidence.knowledgeIds).toEqual(['second-curtain'])
    expect(evidence.knowledgeTruncated).toBe(true)
    expect(evidence.imageIncluded).toBe(true)
    expect(evidence.deterministicCandidateIncluded).toBe(false)
    expect(evidence.requestBodySha256).toHaveLength(64)
    expect(JSON.stringify(evidence)).not.toContain('YWJj')
    expect(JSON.stringify(evidence)).not.toContain('instructions"')
    expect(requestEvidence({ ...body, model: 'different' }).requestBodySha256)
      .not.toBe(evidence.requestBodySha256)
  })

  test('a valid service response is not counted as semantic acceptance or human review', () => {
    const report = summarize([
      { productionResult: 'returned', sceneUnchanged: true, transport: [{}], usage: [
        { path: 'model', inputTokens: 10, outputTokens: 4, estimatedCostCny: 0.001 },
      ] },
      { productionResult: 'rejected', sceneUnchanged: true, transport: [], usage: [
        { path: 'local-parser', inputTokens: null, outputTokens: null, estimatedCostCny: 0 },
      ] },
    ], 30, 1, 'BUDGET_EXCEEDED')
    expect(report.productionReturned).toBe(1)
    expect(report.modelRouteCases).toBe(1)
    expect(report.localRouteCases).toBe(1)
    expect(report.semanticPassCount).toBeNull()
    expect(report.humanReviewed).toBe(0)
    expect(report.inputTokens).toBe(10)
    expect(report.outputTokens).toBe(4)
    expect(report.stopReason).toBe('BUDGET_EXCEEDED')
  })
})
