import { expect, mock, test } from 'bun:test'
import { tmpdir } from 'node:os'

if (process.env.DIASTAGE_KNOWLEDGE_TEST_CHILD !== '1') {
  test('knowledge reaches the production model caller in an isolated offline process', () => {
    const result = Bun.spawnSync([process.execPath, '--no-env-file', 'test', import.meta.path], {
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        TEMP: tmpdir(),
        TMP: tmpdir(),
        DIASTAGE_KNOWLEDGE_TEST_CHILD: '1',
      },
      timeout: 20_000,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0)
  }, 25_000)
} else {
  const network = mock(() => Promise.reject(new Error('Live network is disabled in this test')))
  globalThis.fetch = network as unknown as typeof fetch
  mock.module('server-only', () => ({}))
  const { emptyGrounding, OPEN_CONCEPTS } = await import('../open-language')
  let inventAction = false
  const requestOutput = mock(async (request: { inputText: string; instructions: string }) => {
    const payload = JSON.parse(request.inputText)
    return {
      status: 'completed',
      output_parsed: {
        grounding: {
          ...emptyGrounding(payload.rawUtterance),
          requiresClarification: !inventAction,
          ...(inventAction
            ? { intents: ['stage-left'], knowledgeConceptIds: ['given-circumstances'] }
            : {}),
        },
        reply: '舞台调度与场面调度相关，但不是同一个概念。',
      },
      provider: 'aliyun',
      model: 'mock-offline-not-a-live-model',
    }
  })
  mock.module('../../ai/structured-server', () => ({ requestStructuredOutput: requestOutput }))
  const { groundOpenLanguageWithModel } = await import('../open-language-server')
  const context = {
    sceneVersion: 'v1',
    objects: [],
    selectedObjectIds: [],
    lastReferencedIds: [],
    proposal: null,
    app: {
      page: 'stage-editor',
      route: '/scene/test',
      capabilities: [],
      settings: {
        viewMode: '3d',
        activePanel: 'items',
        workspaceMode: 'edit',
        transformMode: 'select',
        rotationAxis: 'y',
        cameraLocked: false,
        placementMode: 'grid',
        gridStepCentimeters: 10,
        gridVisible: true,
        guidesVisible: true,
        displayMode: 'white_model',
        stableMode: true,
        immersiveMode: 'none',
        readOnly: false,
      },
    },
  }

  test('production payload includes catalog evidence while theoretical replies remain action-free', async () => {
    const result = await groundOpenLanguageWithModel(
      { rawUtterance: '舞台调度是什么意思？', context },
      new AbortController().signal,
    )
    expect(requestOutput).toHaveBeenCalledTimes(1)
    const request = requestOutput.mock.calls[0]![0]
    const payload = JSON.parse(request.inputText)
    expect(payload.canonicalKnowledge).toEqual(OPEN_CONCEPTS)
    expect(payload.theatreKnowledge.truncated).toBe(false)
    expect(payload.theatreKnowledge.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'blocking', executionEligibility: 'proposal_only' }),
        expect.objectContaining({ id: 'mise-en-scene' }),
      ]),
    )
    const blocking = payload.theatreKnowledge.concepts.find(
      (item: { id: string }) => item.id === 'blocking',
    )
    expect(blocking.authorityRefs[0].url).toBe(
      'https://www.uaf.edu/theatrefilm/student-handbook.php',
    )
    expect(blocking.sourceRefs.every((source: { title: string }) => source.title.length > 0)).toBe(
      true,
    )
    expect(request.instructions).toContain('grounding 不含 URL')
    expect(request.instructions).toContain(
      'reply 只可引用 theatreKnowledge 中真实提供的来源名称和 URL',
    )
    expect(request.instructions).toContain('exam_notes 是笔记线索，不称为官方定义')
    expect(request.instructions).toContain('现有21件标准道具')
    expect(request.instructions).toContain('theatreKnowledge.truncated=true')
    expect(request.instructions).toContain('不得声称全部术语已覆盖')
    expect(result.grounding.requiresClarification).toBe(true)
    expect(result.grounding.intents).toEqual([])
    expect(result.grounding.constraints).toEqual([])
    expect(result.grounding.knowledgeConceptIds).toEqual([])
    await groundOpenLanguageWithModel(
      {
        rawUtterance: '侧幕、台左、《黑奴吁天录》、舞台调度、场面调度、间离效果分别是什么意思？',
        context,
      },
      new AbortController().signal,
    )
    expect(JSON.parse(requestOutput.mock.calls[1]![0].inputText).theatreKnowledge.truncated).toBe(
      true,
    )
    expect(network).not.toHaveBeenCalled()
  })

  test('retrieved theory cannot be promoted into executable knowledge IDs', async () => {
    inventAction = true
    await expect(
      groundOpenLanguageWithModel(
        { rawUtterance: '解释一下规定情境', context },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Knowledge concept 与 canonical intent 不一致')
    expect(network).not.toHaveBeenCalled()
  })
}
