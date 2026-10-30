import { expect, mock, test } from 'bun:test'
import { tmpdir } from 'node:os'

if (process.env.DIA_DIALOGUE_TEST_CHILD !== '1') {
  test('unified dialogue server validates model requests and proposals offline', () => {
    const child = Bun.spawnSync([process.execPath, '--no-env-file', 'test', import.meta.path], {
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        TEMP: tmpdir(),
        TMP: tmpdir(),
        DIA_DIALOGUE_TEST_CHILD: '1',
      },
      timeout: 20_000,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
  }, 25_000)
} else {
  globalThis.fetch = mock(() => Promise.reject(new Error('Network disabled'))) as typeof fetch
  mock.module('server-only', () => ({}))
  let answer: unknown
  const requests: { inputText: string; instructions: string }[] = []
  const call = mock(async (request: { inputText: string; instructions: string }) => {
    requests.push(request)
    if (answer instanceof Error) throw answer
    return {
      status: 'completed',
      output_parsed: answer,
      provider: 'aliyun',
      model: 'mock-not-live',
    }
  })
  mock.module('../ai/structured-server', () => ({ requestStructuredOutput: call }))
  const { respondDiaDialogue, validateDialoguePlan } = await import('./dialogue-server')
  const { buildLiveFixture } = await import('../../../../scripts/diamotif-live-fixtures')
  const { buildDialogueStagePlan } = await import('./dialogue-stage-actions')
  const fixture = (name = 'empty-12x8', ids: string[] = []) =>
    buildLiveFixture({
      id: 'offline',
      context: {
        fixture: name,
        stage: { width: 12, depth: 8 },
        selectedIds: ids,
        previousTurns: [],
      },
    })
  const input = (text: string, name = 'empty-12x8', ids: string[] = []) => {
    const f = fixture(name, ids)
    return {
      rawUtterance: text,
      sceneVersion: f.open.sceneVersion,
      sceneContext: f.scene,
      openContext: f.open,
      history: [],
      historyTruncated: false,
      pendingPlan: null,
    }
  }
  const reply = {
    candidateAccepted: false,
    proposalAction: null,
    reply: '这是待确认的预览，尚未采用。',
    stageAction: null,
    grounding: null,
  }
  const signal = () => new AbortController().signal

  test('even a deterministic creation goes to Qwen with DiaMotif before proposing', async () => {
    answer = { ...reply, candidateAccepted: true }
    const beforeCalls = requests.length
    const result = await respondDiaDialogue(input('请在舞台中前区生成一组桌椅'), signal())
    expect(requests.length).toBe(beforeCalls + 1)
    expect(result.plan?.items.map((item) => item.libraryAssetId)).toEqual([
      'SCN-TABLE-090',
      'SCN-CHAIR-045',
      'SCN-CHAIR-045',
    ])
    expect(result.provider).toBe('aliyun')
    const payload = JSON.parse(requests.at(-1)!.inputText)
    expect(payload.diaMotif.version).toBe('diamotif-dialogue-v4')
    expect(payload.availableSceneryLibrary).toHaveLength(21)
  })

  test('model receives current physical scene, bounded history and actual term evidence', async () => {
    answer = reply
    const request = {
      ...input('二道幕和二联景片有什么区别？', 'table-chair-group'),
      history: [{ role: 'user', content: '上一轮讨论桌椅', sceneVersion: 'old-version' }],
      historyTruncated: true,
    }
    await respondDiaDialogue(request, signal())
    const payload = JSON.parse(requests.at(-1)!.inputText)
    expect(payload.history).toEqual(request.history)
    expect(payload.historyTruncated).toBe(true)
    expect(payload.sceneContext.venue.widthMeters).toBe(12)
    expect(payload.sceneContext.objects[0].transform).toEqual(
      request.sceneContext.objects[0]!.transform,
    )
    expect(payload.sceneContext.objects[0].dimensionsMeters).toEqual(
      request.sceneContext.objects[0]!.dimensionsMeters,
    )
    expect(payload.sceneContext.objects[0].collisionGeometry).toBeUndefined()
    expect(payload.theatreKnowledge.concepts.length).toBeGreaterThan(0)
  })

  test('model group translation preserves all object IDs and distances without scene mutation', async () => {
    const request = input('整组向观众右侧挪0.5米，桌椅之间距离不变', 'table-chair-group', [
      'table-a',
      'chair-a',
      'chair-b',
    ])
    const before = JSON.stringify(request.sceneContext)
    answer = {
      ...reply,
      stageAction: {
        mode: 'translate',
        assetIds: [],
        objectIds: ['table-a', 'chair-a', 'chair-b'],
        region: null,
        wall: null,
        direction: 'audience-right',
        distanceMeters: 0.5,
      },
    }
    const result = await respondDiaDialogue(request, signal())
    expect(result.plan?.items).toHaveLength(3)
    for (const item of result.plan!.items) {
      const original = request.sceneContext.objects.find(
        (object) => object.id === item.existingNodeId,
      )!
      expect(item.transform.position.x).toBeCloseTo(original.transform.position.x - 0.5)
      expect(item.transform.position.z).toBe(original.transform.position.z)
    }
    expect(JSON.stringify(request.sceneContext)).toBe(before)
  })

  test('plain explanation never acquires an executable action', async () => {
    answer = { ...reply, reply: '没有该页正文，无法核对内容。' }
    const result = await respondDiaDialogue(input('没有正文能知道书的83页吗？'), signal())
    expect(result.plan).toBeNull()
    expect(result.grounding).toBeNull()
    expect(result.localView).toBe(false)
  })

  test('view changes do not claim a saved stage or require adopting props', async () => {
    answer = { ...reply, candidateAccepted: true, reply: '已采用并保存。' }
    const result = await respondDiaDialogue(input('正上方视图'), signal())
    expect(result.localView).toBe(true)
    expect(result.reply).toBe('调整观察视角，正式舞台布景不变。')
  })

  test('a reply claiming a generated preview cannot replace an actual proposal', async () => {
    answer = { ...reply, reply: '已为您生成桌椅预览。' }
    await expect(respondDiaDialogue(input('生成一组桌椅'), signal())).rejects.toThrow(
      '没有提交对应动作',
    )
  })

  test('explaining a quoted status message does not claim a new action', async () => {
    answer = { ...reply, reply: '“已生成预览”不等于已保存，你仍需要采用方案。' }
    const result = await respondDiaDialogue(input('“已生成预览”是什么意思？'), signal())
    expect(result.reply).toBe((answer as typeof reply).reply)
    expect(result.plan).toBeNull()
  })

  test('translation requires a distance supplied by the user', async () => {
    answer = {
      ...reply,
      stageAction: {
        mode: 'translate',
        assetIds: [],
        objectIds: ['table-a'],
        region: null,
        wall: null,
        direction: 'upstage',
        distanceMeters: 2,
      },
    }
    await expect(
      respondDiaDialogue(input('桌子往后挪一点', 'table-chair-group'), signal()),
    ).rejects.toThrow('数值依据')
  })

  test('revising an unadopted group preserves its proposed identities without duplicate creation', async () => {
    const request = input('当前预览整组向观众右移动0.5米')
    const pending = buildDialogueStagePlan(
      {
        mode: 'create',
        assetIds: ['SCN-TABLE-090', 'SCN-CHAIR-045', 'SCN-CHAIR-045'],
        objectIds: [],
        region: 'front-center',
        wall: null,
        direction: null,
        distanceMeters: null,
      },
      request.sceneContext,
    )
    const before = JSON.stringify(pending)
    answer = {
      ...reply,
      stageAction: {
        mode: 'translate',
        assetIds: [],
        objectIds: pending.items.map((item) => item.proposalId),
        region: null,
        wall: null,
        direction: 'audience-right',
        distanceMeters: 0.5,
      },
    }
    const result = await respondDiaDialogue({ ...request, pendingPlan: pending }, signal())
    expect(result.plan!.items).toHaveLength(3)
    for (const item of result.plan!.items) {
      const original = pending.items.find((previous) => previous.proposalId === item.proposalId)!
      expect(item.existingNodeId).toBeNull()
      expect(item.libraryAssetId).toBe(original.libraryAssetId)
      expect(item.transform.position.x).toBeCloseTo(original.transform.position.x - 0.5)
    }
    expect(JSON.stringify(pending)).toBe(before)
    expect(request.sceneContext.objects).toHaveLength(0)
  })

  test('model semantics can understand cancellation paraphrases without granting new capabilities', async () => {
    const request = input('这个方案不要了', 'enclosure-proposal')
    answer = {
      ...reply,
      proposalAction: 'reject',
    }
    const result = await respondDiaDialogue(request, signal())
    expect(result.grounding?.modifiers).toEqual(['reject'])
    expect(result.plan).toBeNull()
  })

  test.each([
    false,
    true,
  ])('a pending native wall remains an anchor for the new sofa (candidate=%s)', async (candidateAccepted) => {
    const request = input('在舞台中后靠后墙位置生成沙发')
    const pending = buildDialogueStagePlan(
      {
        mode: 'create',
        assetIds: ['SCN-WIN-130'],
        objectIds: [],
        region: 'rear-center',
        wall: null,
        direction: null,
        distanceMeters: null,
      },
      request.sceneContext,
    )
    pending.items[0]!.transform.position.z = 7.5
    const before = JSON.stringify(pending)
    answer = {
      ...reply,
      candidateAccepted,
      stageAction: candidateAccepted
        ? null
        : {
            mode: 'create',
            assetIds: ['SCN-SOFA-175'],
            objectIds: [],
            region: 'rear-center',
            wall: null,
            direction: null,
            distanceMeters: null,
          },
    }
    const result = await respondDiaDialogue({ ...request, pendingPlan: pending }, signal())
    expect(result.plan?.items).toHaveLength(2)
    expect(result.plan!.items[0]!.transform).toEqual(pending.items[0]!.transform)
    expect(result.plan!.items.map((item) => item.libraryAssetId)).toEqual([
      'SCN-WIN-130',
      'SCN-SOFA-175',
    ])
    expect(result.plan!.items.every((item) => item.existingNodeId === null)).toBe(true)
    expect(JSON.stringify(pending)).toBe(before)
    expect(request.sceneContext.objects).toHaveLength(0)
  })

  test.each([
    '不是台右，是观众右侧',
    '入口再宽一点',
    '入口再宽一点，但台左景片不要动',
    '不要取消这个方案',
    '取消靠墙要求',
    '不要这个方向，改成观众右',
  ])('negation is not cancellation: %s', async (text) => {
    answer = { ...reply, proposalAction: 'reject' }
    await expect(respondDiaDialogue(input(text, 'enclosure-proposal'), signal())).rejects.toThrow(
      '不能取消预览',
    )
    expect(JSON.parse(requests.at(-1)!.inputText).cancellationAllowed).toBe(false)
  })

  test('canonical revision candidates remain revisions and do not require an exact old phrase', async () => {
    answer = { ...reply, candidateAccepted: true }
    const result = await respondDiaDialogue(input('入口再宽一点', 'enclosure-proposal'), signal())
    expect(result.grounding?.modifiers).toEqual(['wider'])
    expect(result.reply).toContain('建议加宽')
    expect(result.reply).not.toContain('已完成')
  })

  test('grounding cannot bypass cancellation scope', async () => {
    const { emptyGrounding } = await import('./open-language')
    const {
      rawUtterance: _,
      groundingVersion: __,
      knowledgeConceptIds: ___,
      ...grounding
    } = emptyGrounding('不是台右，是观众右侧')
    answer = { ...reply, grounding: { ...grounding, modifiers: ['reject'] } }
    await expect(
      respondDiaDialogue(input('不是台右，是观众右侧', 'enclosure-proposal'), signal()),
    ).rejects.toThrow('不能取消预览')
  })

  test('all group members are required even when the model forgets one', async () => {
    answer = {
      ...reply,
      stageAction: {
        mode: 'translate',
        assetIds: [],
        objectIds: ['table-a', 'chair-a'],
        region: null,
        wall: null,
        direction: 'audience-right',
        distanceMeters: 0.5,
      },
    }
    await expect(
      respondDiaDialogue(
        input('整组向观众右移0.5米，间距不变', 'table-chair-group', [
          'table-a',
          'chair-a',
          'chair-b',
        ]),
        signal(),
      ),
    ).rejects.toThrow('整组')
  })

  test('candidate acceptance cannot silently omit a passage requirement', async () => {
    answer = {
      ...reply,
      stageAction: {
        mode: 'create',
        assetIds: ['SCN-TABLE-090'],
        objectIds: [],
        region: 'front-center',
        wall: null,
        direction: null,
        distanceMeters: null,
      },
    }
    await expect(respondDiaDialogue(input('台前放桌子，保留通道'), signal())).rejects.toThrow(
      '保留通道',
    )
  })

  test('a passage-only grounding cannot replace a compound creation or move', async () => {
    const { parseOpenLanguage } = await import('./open-language')
    const {
      rawUtterance: _,
      groundingVersion: __,
      knowledgeConceptIds: ___,
      ...grounding
    } = parseOpenLanguage('门口留1米通道')!
    answer = { ...reply, grounding }
    for (const text of [
      '在台前生成一组桌椅，但门口保留1米通道',
      '把桌子移到台后，同时门口留1米通道',
    ]) {
      const request = input(text, 'front-door')
      const before = JSON.stringify(request)
      await expect(respondDiaDialogue(request, signal())).rejects.toThrow('通道')
      expect(JSON.stringify(request)).toBe(before)
    }
    const result = await respondDiaDialogue(input('门口留1米通道', 'front-door'), signal())
    expect(result.grounding?.constraints).toEqual(['preserve-path'])
    expect(result.grounding?.minimumWidthMeters).toBe(1)
    expect(result.plan).toBeNull()
  })

  test('proposal replies describe actual native assets and do not repeat invented model IDs or completion claims', async () => {
    answer = { ...reply, candidateAccepted: true, reply: '已经摆好SCN-FAKE-999并保存了。' }
    const result = await respondDiaDialogue(input('请在舞台中前区生成一组桌椅'), signal())
    expect(result.reply).not.toContain('SCN-FAKE')
    expect(result.reply).not.toContain('已经')
    expect(result.reply).toContain('采用后生效')
    expect(result.plan?.items).toHaveLength(3)
  })

  test('mixed decisions, unknown references and absent candidates fail explicitly', async () => {
    answer = {
      ...reply,
      candidateAccepted: true,
      stageAction: {
        mode: 'translate',
        assetIds: [],
        objectIds: ['invented'],
        region: null,
        wall: null,
        direction: 'upstage',
        distanceMeters: 1,
      },
    }
    await expect(respondDiaDialogue(input('移动椅子'), signal())).rejects.toThrow('混合')
    answer = { ...(answer as object), candidateAccepted: false }
    await expect(respondDiaDialogue(input('移动椅子1米'), signal())).rejects.toThrow('唯一')
    answer = { ...reply, candidateAccepted: true }
    await expect(respondDiaDialogue(input('你好'), signal())).rejects.toThrow('候选不存在')
  })

  test('scene mismatch is rejected before paying for a model call', async () => {
    const count = requests.length
    await expect(
      respondDiaDialogue({ ...input('你好'), sceneVersion: 'other-version' }, signal()),
    ).rejects.toThrow('快照不一致')
    expect(requests.length).toBe(count)
  })

  test('invalid canonical authority is a semantic error, never a generic network failure', async () => {
    answer = {
      ...reply,
      grounding: {
        subjects: [{ kind: 'named', text: '不存在的对象', count: 1, index: null }],
        references: [],
        intents: ['stage-left'],
        constraints: [],
        modifiers: [],
        ambiguities: [],
        confidence: 1,
        requiresClarification: false,
        minimumWidthMeters: null,
        angleDegrees: null,
      },
    }
    await expect(respondDiaDialogue(input('把椅子移到台左'), signal())).rejects.toMatchObject({
      code: 'AMBIGUOUS_COMMAND',
    })
  })

  test('model outage does not silently turn a local candidate into a model success', async () => {
    answer = new Error('offline synthetic outage')
    await expect(respondDiaDialogue(input('请在舞台中前区生成一组桌椅'), signal())).rejects.toThrow(
      'offline synthetic outage',
    )
  })

  test('existing object resizing is rejected even if the core compiler permits it', () => {
    const f = fixture('table-chair-group')
    const plan = buildDialogueStagePlan(
      {
        mode: 'translate',
        assetIds: [],
        objectIds: ['table-a'],
        region: null,
        wall: null,
        direction: 'upstage',
        distanceMeters: 1,
      },
      f.scene,
    )
    plan.items[0]!.dimensionsMeters = { ...plan.items[0]!.dimensionsMeters, width: 3 }
    expect(() => validateDialoguePlan(plan, f.scene)).toThrow('身份、形状和尺寸')
  })
}
