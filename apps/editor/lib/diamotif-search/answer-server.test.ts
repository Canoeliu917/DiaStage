import { expect, mock, test } from 'bun:test'
import { tmpdir } from 'node:os'
import type { SearchResource } from './catalog'

if (process.env.DIAMOTIF_SEARCH_TEST_CHILD !== '1') {
  test('search API and Qwen answer boundaries run offline in an isolated process', () => {
    const child = Bun.spawnSync([process.execPath, '--no-env-file', 'test', import.meta.path], {
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        TEMP: tmpdir(),
        TMP: tmpdir(),
        DIAMOTIF_SEARCH_TEST_CHILD: '1',
      },
      timeout: 20_000,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
  }, 25_000)
} else {
  globalThis.fetch = mock(() => Promise.reject(new Error('Network prohibited'))) as typeof fetch
  process.env.DIASTAGE_AI_PROVIDER = 'aliyun'
  process.env.DASHSCOPE_API_KEY = 'synthetic-not-a-real-key'
  process.env.DIASTAGE_AI_BETA_USER_IDS = 'invited-user'
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  let user: string | null = 'invited-user'
  let exhausted = false
  let providerCalls = 0
  let modelAnswer: unknown
  let captured = ''
  const reservations: unknown[][] = []
  const security = await import('../scene-api-security')
  mock.module('../scene-api-security', () => ({
    ...security,
    requireSceneSession: async () =>
      user ? { user: { id: user } } : new Response(null, { status: 401 }),
  }))
  mock.module('../ai/usage-ledger', () => ({
    usageLedger: () => ({
      reserve: async (...args: unknown[]) => {
        if (exhausted) throw new Error('BUDGET_EXCEEDED')
        reservations.push(args)
      },
      reconcile: async () => {},
    }),
  }))
  mock.module('server-only', () => ({}))
  const { trackAiCall } = await import('../ai/usage')
  mock.module('../ai/structured-server', () => ({
    requestStructuredOutput: async (request: {
      feature: 'diamotif-search'
      inputText: string
      signal: AbortSignal
    }) => {
      captured = request.inputText
      return trackAiCall(
        request.feature,
        'qwen3.7-flash-2026-07-15',
        request.signal,
        async () => {
          providerCalls++
          if (modelAnswer instanceof Error) throw modelAnswer
          return {
            status: 'completed',
            output_parsed: modelAnswer,
            provider: 'aliyun',
            model: 'mock-not-live',
          }
        },
        () => null,
        null,
        request.inputText,
      )
    },
  }))
  const { GET, POST } = await import('../../app/api/diamotif/search/route')
  const { topicMatches } = await import('./search-topics')
  const { searchDiaMotif } = await import('./search')
  const query = '二道幕'
  const citation = searchDiaMotif({ query }).results[0]!.id
  const request = (body: unknown, method = 'POST', headers: Record<string, string> = {}) =>
    new Request(`http://127.0.0.1/api/diamotif/search?q=${encodeURIComponent(query)}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-real-ip': crypto.randomUUID(), ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    })

  test('public GET and explicit non-AI POST never call a provider or reserve money', async () => {
    user = null
    const before = providerCalls
    for (const response of [
      GET(request(null, 'GET')),
      await POST(request({ query, useAi: false })),
    ]) {
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.results.length).toBeGreaterThan(0)
      expect(data.answer).toBeNull()
    }
    expect(providerCalls).toBe(before)
    expect(reservations).toHaveLength(0)
  })

  test('anonymous, uninvited and exhausted users retain results without a provider call', async () => {
    for (const account of [null, 'not-invited', 'invited-user']) {
      user = account
      exhausted = account === 'invited-user'
      const before = providerCalls
      const response = await POST(
        request({ query, useAi: true }, 'POST', { 'x-user-id': 'invited-user' }),
      )
      const data = await response.json()
      expect(data.aiStatus).toBe('unavailable')
      expect(data.answer).toBeNull()
      expect(data.results.length).toBeGreaterThan(0)
      expect(providerCalls).toBe(before)
    }
    exhausted = false
  })

  test('public GET and POST apply the same knowledge facet without a provider call', async () => {
    const before = providerCalls
    const input = { category: 'knowledge', topic: 'voice' }
    const expected = searchDiaMotif(input)
    expect(expected.total).toBeGreaterThan(0)
    for (const response of [
      GET(new Request('http://127.0.0.1/api/diamotif/search?category=knowledge&topic=voice')),
      await POST(request(input)),
    ]) {
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.topic).toBe('voice')
      expect(data.results.map((item: { id: string }) => item.id)).toEqual(
        expected.results.map(({ id }) => id),
      )
      expect(data.answer).toBeNull()
    }
    expect(
      GET(new Request('http://127.0.0.1/api/diamotif/search?category=knowledge&topic=invalid'))
        .status,
    ).toBe(400)
    expect((await POST(request({ category: 'scripts', topic: 'voice' }))).status).toBe(400)
    expect(providerCalls).toBe(before)
  })

  test('nonknowledge facets are identical across public GET and POST', async () => {
    const before = providerCalls
    for (const [category, topic] of [
      ['venues', 'venue-space'],
      ['arts-exams', 'exam-policy'],
      ['festivals', 'workshop'],
    ]) {
      const expected = searchDiaMotif({ category, topic })
      expect(expected.total).toBeGreaterThan(0)
      for (const response of [
        GET(
          new Request(`http://127.0.0.1/api/diamotif/search?category=${category}&topic=${topic}`),
        ),
        await POST(request({ category, topic })),
      ]) {
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data.topic).toBe(topic)
        expect(data.results.map((item: { id: string }) => item.id)).toEqual(
          expected.results.map(({ id }) => id),
        )
      }
    }
    expect(providerCalls).toBe(before)
  })

  test('an invited explicit AI request uses only retrieved evidence and valid IDs', async () => {
    user = 'invited-user'
    modelAnswer = {
      text: '资料将二道幕与二联景片区分；二道幕是舞台幕布。',
      citationIds: [citation],
    }
    const before = providerCalls
    const response = await POST(request({ query, useAi: true }))
    const data = await response.json()
    expect(data.aiStatus).toBe('answered')
    expect(data.answer.citationIds).toEqual([citation])
    expect(data.answer.provider).toBe('aliyun')
    expect(providerCalls).toBe(before + 1)
    expect(JSON.parse(captured).evidence.map((item: { id: string }) => item.id)).toEqual(
      data.results.slice(0, 8).map((item: { id: string }) => item.id),
    )
    expect(reservations.at(-1)?.[2]).toBe('invited-user')
  })

  test('unknown citations, arbitrary links and provider errors never become successful AI answers', async () => {
    for (const answer of [
      { text: '没有依据的回答', citationIds: ['invented-source'] },
      { text: '请看 https://untrusted.invalid/', citationIds: [citation] },
      new Error('PRIVATE PROVIDER DETAIL'),
    ]) {
      modelAnswer = answer
      const data = await (await POST(request({ query, useAi: true }))).json()
      expect(data.aiStatus).toBe('unavailable')
      expect(data.answer).toBeNull()
      expect(data.results.length).toBeGreaterThan(0)
      expect(JSON.stringify(data)).not.toContain('PRIVATE PROVIDER DETAIL')
    }
  })

  test('AI answers retain the selected knowledge facet and use only matching evidence', async () => {
    user = 'invited-user'
    const input = {
      query: '舞台',
      category: 'knowledge',
      topic: 'stage-design',
      useAi: true,
    }
    const expected = searchDiaMotif(input)
    expect(expected.results.length).toBeGreaterThan(0)
    modelAnswer = { text: '以下解读仅采用所选舞美资料。', citationIds: [expected.results[0]!.id] }
    const data = await (await POST(request(input))).json()
    expect(data.aiStatus).toBe('answered')
    expect(data.topic).toBe('stage-design')
    const context = JSON.parse(captured)
    expect(context.topic).toBe('stage-design')
    expect(context.evidence.map((item: { id: string }) => item.id)).toEqual(
      expected.results.slice(0, 8).map(({ id }) => id),
    )
    expect(
      context.evidence.every((item: SearchResource) => topicMatches(item, 'stage-design')),
    ).toBe(true)
  })

  test('missing credentials, blocked topics and injected resources do not call the provider', async () => {
    const before = providerCalls
    delete process.env.DASHSCOPE_API_KEY
    const unavailable = await (await POST(request({ query, useAi: true }))).json()
    expect(unavailable.aiStatus).toBe('unavailable')
    process.env.DASHSCOPE_API_KEY = 'synthetic-not-a-real-key'
    const gossip = await (await POST(request({ query: '演员八卦绯闻', useAi: true }))).json()
    expect(gossip.results).toHaveLength(0)
    expect(
      (
        await POST(
          request({ query, useAi: true, resources: [{ url: 'https://untrusted.invalid' }] }),
        )
      ).status,
    ).toBe(400)
    expect(providerCalls).toBe(before)
  })

  test('pagination returns distinct pages, rejects invalid offsets and never charges for later pages', async () => {
    const first = await GET(new Request('http://127.0.0.1/api/diamotif/search')).json()
    const second = await GET(new Request('http://127.0.0.1/api/diamotif/search?offset=24')).json()
    expect(first.total).toBe(searchDiaMotif({}).total)
    expect(second.total).toBe(first.total)
    expect(second.offset).toBe(24)
    expect(second.results).toHaveLength(24)
    const firstIds = new Set(first.results.map((item: { id: string }) => item.id))
    expect(second.results.some((item: { id: string }) => firstIds.has(item.id))).toBe(false)
    for (const offset of [-1, 0.5, 10001, '24'])
      expect((await POST(request({ query, offset }))).status).toBe(400)
    expect(GET(new Request('http://127.0.0.1/api/diamotif/search?offset=nope')).status).toBe(400)
    const before = providerCalls
    const later = await (await POST(request({ query: '舞台', offset: 24, useAi: true }))).json()
    expect(later.answer).toBeNull()
    expect(later.aiStatus).toBe('disabled')
    expect(providerCalls).toBe(before)
  })
}
