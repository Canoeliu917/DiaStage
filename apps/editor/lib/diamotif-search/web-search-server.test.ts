import { expect, mock, test } from 'bun:test'
import { tmpdir } from 'node:os'

if (process.env.DIAMOTIF_WEB_TEST_CHILD !== '1') {
  test('native web search boundaries and costs run offline in an isolated process', () => {
    const child = Bun.spawnSync([process.execPath, '--no-env-file', 'test', import.meta.path], {
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        TEMP: tmpdir(),
        TMP: tmpdir(),
        DIAMOTIF_WEB_TEST_CHILD: '1',
      },
      timeout: 20_000,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
  }, 25_000)
} else {
  process.env.DIASTAGE_AI_PROVIDER = 'aliyun'
  process.env.DASHSCOPE_API_KEY = 'synthetic-web-key'
  process.env.DIASTAGE_AI_BETA_USER_IDS = 'invited-user'
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  let user: string | null = 'invited-user'
  let exhausted = false
  let frames: unknown[] = []
  let fetchFailure = false
  let calls = 0
  let body: any
  const reservations: unknown[][] = []
  const reconciliations: unknown[][] = []
  const security = await import('../scene-api-security')
  mock.module('../scene-api-security', () => ({
    ...security,
    requireSceneSession: async () =>
      user ? { user: { id: user } } : new Response(null, { status: 401 }),
  }))
  mock.module('server-only', () => ({}))
  mock.module('../ai/usage-ledger', () => ({
    usageLedger: () => ({
      reserve: async (...args: unknown[]) => {
        if (exhausted) throw new Error('BUDGET_EXCEEDED')
        reservations.push(args)
      },
      reconcile: async (...args: unknown[]) => {
        reconciliations.push(args)
      },
    }),
  }))
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    expect(url).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    )
    expect(init?.redirect).toBe('error')
    expect(new Headers(init?.headers).get('X-DashScope-SSE')).toBe('enable')
    body = JSON.parse(String(init?.body))
    calls++
    if (fetchFailure) throw new Error('PRIVATE PROVIDER ERROR')
    const bytes = new TextEncoder().encode(
      frames.map((frame) => `data: ${JSON.stringify(frame)}\r\n\r\n`).join(''),
    )
    return new Response(
      new ReadableStream({
        start(controller) {
          // Split UTF-8 and event delimiters to exercise actual streamed decoding.
          for (let start = 0; start < bytes.length; start += 7)
            controller.enqueue(bytes.slice(start, start + 7))
          controller.close()
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }) as typeof fetch
  const { POST } = await import('../../app/api/diamotif/search/route')
  const { SEARCH_CATEGORIES } = await import('./catalog')
  const { KNOWLEDGE_TOPICS } = await import('./knowledge-topics')
  const { estimateCall, WEB_SEARCH_TOOL_RESERVE_CNY } = await import('../ai/model-budget')
  const { estimateTextCostCny, QWEN_TRIAL_MODEL } = await import('../ai/model-pricing')
  const request = (values: Record<string, unknown> = {}) =>
    new Request('http://127.0.0.1/api/diamotif/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': crypto.randomUUID() },
      body: JSON.stringify({ query: '话剧舞台资料', useAi: true, useWeb: true, ...values }),
    })
  const finish = {
    output: {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: [{ text: '模型猜测 https://invented.example/ 票价1000元' }] },
        },
      ],
    },
    usage: { input_tokens: 5000, output_tokens: 80, plugins: { search: { count: 1 } } },
  }

  test('only provider source metadata survives, sources accumulate and token costs retain tool reserve', async () => {
    frames = [
      {
        output: {
          search_info: {
            search_results: [
              {
                title: '戏剧专业教学资料',
                url: 'https://www.chntheatre.edu.cn/synthetic-test',
                site_name: '戏剧学院',
              },
              { title: '演员八卦恋情', url: 'https://www.chntheatre.edu.cn/gossip' },
              { title: '舞台资料', url: 'http://127.0.0.1/secret' },
              { title: '购物促销', url: 'https://www.chntheatre.edu.cn/shop' },
              { title: '戏剧资料', url: 'https://www.folger.edu/explore/' },
              { title: '戏剧资料', url: 'https://theatre.example.cn/book' },
              { title: '戏剧资料', url: 'https://www.chntheatre.edu.cn.attacker.invalid/book' },
              { title: '戏剧资料', url: 'https://github.com/theatre/book' },
              { title: '戏剧资料', url: 'https://web.arte.gov.tw/childrendrama/02.html' },
            ],
          },
        },
      },
      {
        output: {
          search_info: {
            search_results: [
              {
                title: '戏剧专业教学资料',
                url: 'https://www.chntheatre.edu.cn/synthetic-test',
                site_name: '戏剧学院',
              },
            ],
          },
        },
      },
      { ...finish, output: { ...finish.output, search_info: { search_results: [] } } },
    ]
    const response = await POST(request())
    const result = await response.json()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(result.webStatus).toBe('searched')
    expect(result.answer).toBeNull()
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      status: 'web-candidate',
      category: null,
      verifiedAt: null,
      rights: 'metadata-only',
      url: 'https://www.chntheatre.edu.cn/synthetic-test',
    })
    expect(JSON.stringify(result)).not.toMatch(
      /1000元|invented\.example|synthetic-web-key|folger\.edu|example\.cn|attacker\.invalid|github\.com|arte\.gov\.tw/,
    )
    expect(body.model).toBe(QWEN_TRIAL_MODEL)
    expect(body.input.messages[0].role).toBe('system')
    const instructions = JSON.stringify(body.input.messages[0])
    for (const region of ['中国大陆', '香港', '澳门']) expect(instructions).toContain(region)
    expect(instructions).toMatch(/国外|境外/)
    expect(body.input.messages[1]).toEqual({ role: 'user', content: [{ text: '话剧舞台资料' }] })
    expect(body.parameters).toMatchObject({
      max_tokens: 800,
      enable_thinking: false,
      enable_search: true,
      incremental_output: true,
      search_options: { search_strategy: 'turbo', forced_search: true, enable_source: true },
    })
    const reserved = reservations.at(-1)!
    expect(reserved[3]).toBeGreaterThan(WEB_SEARCH_TOOL_RESERVE_CNY)
    expect(reserved[4]).toEqual({
      siteMonthlyCny: 100,
      userMonthlyCny: 5,
      userDailyCny: 1,
      taskCny: 1,
    })
    const reconciled = reconciliations.at(-1)!
    expect(reconciled[1]).toBeCloseTo(estimateTextCostCny(QWEN_TRIAL_MODEL, 5000, 0, 80) + 0.03, 10)
    expect(JSON.parse(String(reconciled[2]))).toMatchObject({
      feature: 'diamotif-web-search',
      actualCostCny: null,
      inputTokens: 5000,
      outputTokens: 80,
    })
  })

  test('the selected arts-exam scope constrains retrieval without classifying unverified candidates', async () => {
    frames = [
      {
        output: {
          search_info: {
            search_results: [
              {
                title: '戏剧表演艺考资讯',
                url: 'https://www.chntheatre.edu.cn/synthetic-arts-exam',
                site_name: '戏剧学院',
              },
            ],
          },
        },
      },
      finish,
    ]
    const result = await (await POST(request({ category: 'arts-exams' }))).json()
    expect(result.webStatus).toBe('searched')
    expect(result.results).toHaveLength(1)
    expect(result.results[0].category).toBeNull()
    expect(result.results[0].status).toBe('web-candidate')
    expect(result.answer).toBeNull()
    const scope = SEARCH_CATEGORIES.find(({ id }) => id === 'arts-exams')!
    const instructions = JSON.stringify(body.input.messages[0])
    expect(instructions).toContain(scope.label)
    expect(instructions).toContain(scope.description)
    expect(body.input.messages[1]).toEqual({ role: 'user', content: [{ text: '话剧舞台资料' }] })
  })

  test('empty structure never falls back to generated URLs and no local hit is required', async () => {
    frames = [finish]
    const result = await (await POST(request({ query: '独立戏剧演出新资料zzzz' }))).json()
    expect(result.webStatus).toBe('searched')
    expect(result.results).toHaveLength(0)
    expect(result.notice).toContain('未返回')
    expect(result.answer).toBeNull()
  })

  test('a selected knowledge topic reaches web retrieval without assigning candidate categories', async () => {
    frames = [
      {
        output: {
          search_info: {
            search_results: [
              {
                title: '戏剧演员声音训练',
                url: 'https://www.chntheatre.edu.cn/synthetic-voice',
                site_name: '戏剧学院',
              },
            ],
          },
        },
      },
      finish,
    ]
    const result = await (
      await POST(request({ query: '演员声音训练', category: 'knowledge', topic: 'voice' }))
    ).json()
    expect(result.webStatus).toBe('searched')
    expect(result.topic).toBe('voice')
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ category: null, status: 'web-candidate' })
    const topic = KNOWLEDGE_TOPICS.find(({ id }) => id === 'voice')!
    const instructions = JSON.stringify(body.input.messages[0])
    expect(instructions).toContain(topic.label)
    expect(instructions).toContain(topic.description)
    expect(body.input.messages[1]).toEqual({ role: 'user', content: [{ text: '演员声音训练' }] })
  })

  test('AI screen discovery retains only AI creative hints as unclassified candidates', async () => {
    frames = [
      {
        output: {
          search_info: {
            search_results: [
              {
                title: 'AI动画分镜与视频制作方法',
                url: 'https://www.chntheatre.edu.cn/synthetic-ai-animation',
              },
              {
                title: '普通电视剧演员与角色介绍',
                url: 'https://www.chntheatre.edu.cn/synthetic-tv-cast',
              },
              {
                title: '人工智能手机芯片参数',
                url: 'https://www.chntheatre.edu.cn/synthetic-ai-phone',
              },
              { title: 'AI影视演员绯闻', url: 'https://www.chntheatre.edu.cn/synthetic-ai-gossip' },
            ],
          },
        },
      },
      finish,
    ]
    const result = await (
      await POST(request({ query: 'AI动画制作', category: 'ai-screen', topic: 'ai-animation' }))
    ).json()
    expect(result.webStatus).toBe('searched')
    expect(result.topic).toBe('ai-animation')
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      category: null,
      status: 'web-candidate',
      verifiedAt: null,
    })
    expect(result.results[0].aiEvidence).toContain('未核验正文')
    expect(result.results[0].aiInvolvement).toBe('unverified')
    expect(result.results[0].theatreEvidence).toBeUndefined()
    expect(result.results[0].subtopics).toBeUndefined()
    expect(result.results[0].sourceTier).toBeUndefined()
    const instructions = JSON.stringify(body.input.messages[0])
    expect(instructions).toContain('AI动画')
    expect(instructions).toContain('小红书')
    expect(instructions).toContain('不绕过登录')
    expect(result.answer).toBeNull()
  })

  test.each([
    'all',
    'knowledge',
    'ai-screen',
  ] as const)('ordinary screen entertainment cannot borrow theatre or AI relevance from site names: %s', async (category) => {
    frames = [
      {
        output: {
          search_info: {
            search_results: [
              {
                title: '普通电视剧演员与角色介绍',
                site_name: '中央戏剧学院',
                url: 'https://www.chntheatre.edu.cn/synthetic-ordinary-tv',
              },
              {
                title: 'TV drama cast and characters',
                site_name: 'Theatre Academy',
                url: 'https://www.chntheatre.edu.cn/synthetic-tv-drama',
              },
              {
                title: '普通电视剧演员与角色介绍',
                site_name: 'AI影视研究资料站',
                url: 'https://tv.cctv.com/synthetic-non-ai-tv',
              },
              {
                title: '话剧《雷雨》舞台演出资料',
                url: 'https://tv.cctv.com/synthetic-stage-play',
              },
              {
                title: '戏剧影视表演专业艺考说明',
                url: 'https://www.chntheatre.edu.cn/synthetic-stage-exam',
              },
              { title: 'AI电视剧分镜与视频制作方法', url: 'https://tv.cctv.com/synthetic-ai-tv' },
            ],
          },
        },
      },
      finish,
    ]
    const result = await (await POST(request({ query: '舞台与AI影视资料', category }))).json()
    expect(result.webStatus).toBe('searched')
    expect(result.results.map((item: { title: string }) => item.title)).toEqual(
      category === 'ai-screen'
        ? ['AI电视剧分镜与视频制作方法']
        : category === 'knowledge'
          ? ['话剧《雷雨》舞台演出资料', '戏剧影视表演专业艺考说明']
          : ['话剧《雷雨》舞台演出资料', '戏剧影视表演专业艺考说明', 'AI电视剧分镜与视频制作方法'],
    )
    for (const candidate of result.results) {
      expect(candidate.category).toBeNull()
      expect(candidate.status).toBe('web-candidate')
    }
    const ai = result.results.find(
      (item: { title: string }) => item.title === 'AI电视剧分镜与视频制作方法',
    )
    if (ai) {
      expect(ai.aiInvolvement).toBe('unverified')
      expect(ai.theatreEvidence).toBeUndefined()
    }
  })

  test('missing usage, interrupted streams and provider errors retain the full estimate without retry', async () => {
    for (const kind of ['usage', 'stop', 'transport']) {
      fetchFailure = kind === 'transport'
      frames = kind === 'usage' ? [{ output: finish.output }] : [{ usage: finish.usage }]
      const before = calls
      const result = await (await POST(request())).json()
      expect(calls).toBe(before + 1)
      expect(result.webStatus).toBe('unavailable')
      expect(JSON.stringify(result)).not.toContain('PRIVATE PROVIDER ERROR')
      expect(reconciliations.at(-1)?.[1]).toBe(reservations.at(-1)?.[3])
      expect(reconciliations.at(-1)?.[1]).toBe(
        estimateCall('diamotif-web-search', QWEN_TRIAL_MODEL, JSON.stringify(body), null),
      )
    }
    fetchFailure = false
  })

  test('web search shares authentication and budget boundaries and requires explicit consent', async () => {
    const before = calls
    for (const account of [null, 'not-invited', 'invited-user']) {
      user = account
      exhausted = account === 'invited-user'
      expect((await (await POST(request())).json()).webStatus).toBe('unavailable')
    }
    exhausted = false
    user = 'invited-user'
    for (const values of [{ useAi: false }, { query: '' }, { offset: 24 }])
      expect((await POST(request(values))).status).toBe(400)
    const blocked = await (await POST(request({ query: '娱乐新闻' }))).json()
    expect(blocked.results).toHaveLength(0)
    expect(calls).toBe(before)
  })
}
