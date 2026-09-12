import { expect, test } from 'bun:test'
import { createStageSceneDocument } from '../theatre/simulation'
import { buildRehearsalContext } from './context'
import {
  conversationContext,
  createRehearsalThread,
  proposalActionSignature,
  RehearsalThreadSchema,
  sceneFactsVersion,
  type ThreadMessage,
} from './conversation'
import { PROMPT_VERSION } from './dimensions'
import { compileProposal } from './proposal-compiler'
import { createInteraction } from './proposal-generator'
import { validateContext, validateInteraction, validateProposal } from './proposal-validator'
import {
  FeedbackSchema,
  InteractionSchema,
  ProposalContentSchema,
  type RehearsalContext,
} from './schema'

function setup() {
  const document = createStageSceneDocument('对话结构测试，非真实模型')
  document.rehearsalSimulation.performers = [
    { id: 'a', name: 'A', color: '#888888', position: [-2, 0, 0], facing: 0, visible: true },
    { id: 'b', name: 'B', color: '#aaaaaa', position: [2, 0, 0], facing: 0, visible: true },
  ]
  const context = buildRehearsalContext(
    'scene-test',
    document,
    {},
    {
      script: 'A想离开，B想让他留下。',
      intention: '给我两个排法',
      directorIntention: '',
      selectedPerformerId: null,
    },
  )
  const content = ProposalContentSchema.parse({
    title: '让距离说话',
    intention: '试探是否愿意留下',
    rationale: '可以先让距离变化，是否奏效需要一起试。',
    suggestions: [
      {
        id: 'a-action',
        performerId: 'a',
        intention: '试着拉开距离',
        movement: 'withdraw',
        targetPerformerId: 'b',
        zone: null,
        extent: 'small',
        pace: 'slow',
      },
      {
        id: 'b-action',
        performerId: 'b',
        intention: '暂时保持位置',
        movement: 'hold',
        targetPerformerId: null,
        zone: null,
        extent: 'small',
        pace: 'slow',
      },
    ],
    alternatives: ['也可以先停住，等对方回应'],
    evidence: [{ source: 'script', quote: context.script }],
    confidence: 0.5,
  })
  const second = structuredClone(content)
  second.title = '沿相反方向试探'
  second.suggestions[0] = {
    ...second.suggestions[0]!,
    movement: 'toward-zone',
    targetPerformerId: null,
    zone: 'upstage',
  }
  second.suggestions[1] = { ...second.suggestions[1]!, movement: 'toward-zone', zone: 'downstage' }
  const interaction = createInteraction(
    context,
    { dramaticState: [], proposals: [content, second] },
    'synthetic-test-fixture',
  )
  const thread = createRehearsalThread(context.sceneId, context.sceneVersion!)
  const message = (text: string): ThreadMessage => ({
    messageId: crypto.randomUUID(),
    role: 'user',
    content: text,
    createdAt: new Date().toISOString(),
    sceneVersion: thread.sceneVersion,
  })
  return { document, context, content, second, interaction, thread, message }
}

test('private versioned threads and legacy records never become training-eligible from consent or rights status', () => {
  const { thread, interaction } = setup()
  expect(thread).toMatchObject({
    schemaVersion: 1,
    status: 'idle',
    privateProjectData: true,
    trainingAuthorized: false,
    rightsStatus: 'unknown',
    trainingEligible: false,
  })
  expect(
    RehearsalThreadSchema.parse({ ...thread, trainingAuthorized: true, rightsStatus: 'cleared' })
      .trainingEligible,
  ).toBe(false)
  expect(() => RehearsalThreadSchema.parse({ ...thread, trainingEligible: true })).toThrow()
  expect(() => RehearsalThreadSchema.parse({ ...thread, privateProjectData: false })).toThrow()
  const legacy = structuredClone(interaction)
  delete legacy.sceneVersion
  delete legacy.inputContext.sceneVersion
  legacy.promptVersion = 'rehearsal-partner-0.1'
  for (const proposal of legacy.proposals) {
    delete proposal.sceneVersion
    proposal.promptVersion = 'rehearsal-partner-0.1'
  }
  const { rightsStatus: _rights, trainingEligible: _eligible, ...oldRecord } = legacy
  expect(validateInteraction(oldRecord)).toMatchObject({
    rightsStatus: 'unknown',
    trainingEligible: false,
    promptVersion: 'rehearsal-partner-0.1',
  })
  expect(interaction.promptVersion).toBe(PROMPT_VERSION)
  expect(() => InteractionSchema.parse({ ...interaction, trainingEligible: true })).toThrow()
  const feedback = FeedbackSchema.parse({
    eventId: 'event',
    interactionId: interaction.interactionId,
    proposalId: interaction.proposals[0]!.proposalId,
    sceneId: interaction.sceneId,
    createdAt: new Date().toISOString(),
    previewed: false,
    decision: 'reject',
    originalProposal: interaction.proposals[0],
    humanEdit: null,
    finalResult: null,
    reasonTags: [],
    optionalUserNote: '',
    status: 'recorded',
  })
  expect(feedback).toMatchObject({
    privateProjectData: true,
    trainingAuthorized: false,
    rightsStatus: 'unknown',
    trainingEligible: false,
  })
})

test('scene versions follow current spatial facts, independent of chat, intention and array ordering', () => {
  const { context, document, message, thread, interaction } = setup()
  expect(sceneFactsVersion({ ...context, performers: [...context.performers].reverse() })).toBe(
    context.sceneVersion!,
  )
  const conversation = conversationContext(thread, interaction, null, message('这次请慢一点'))
  const next = buildRehearsalContext(
    context.sceneId,
    document,
    {},
    { ...context, intention: '这次请慢一点', conversation },
  )
  expect(next.sceneVersion).toBe(context.sceneVersion)
  expect(next.conversation).toEqual(conversation)
  const edits: ((facts: RehearsalContext) => void)[] = [
    (facts) => {
      facts.performers[0]!.position[0] -= 0.1
    },
    (facts) => {
      facts.venue.width += 1
    },
    (facts) => {
      facts.durationSeconds += 1
    },
    (facts) => {
      facts.paths.push({
        id: 'route',
        performerId: 'a',
        points: [
          [-2, 0, 0],
          [-1, 0, 0],
        ],
        durationSeconds: 3,
        visible: true,
      })
    },
    (facts) => {
      facts.obstacles.push({ id: 'flat', name: '景片', min: [4, 0, 0], max: [4.1, 2, 1] })
    },
  ]
  for (const edit of edits) {
    const changed = structuredClone(context)
    edit(changed)
    expect(sceneFactsVersion(changed)).not.toBe(context.sceneVersion!)
    expect(() => validateContext(changed)).toThrow('舞台版本')
  }
  document.rehearsalSimulation.performers[0]!.position[0] = -3
  expect(() =>
    buildRehearsalContext(
      context.sceneId,
      document,
      {},
      { ...context, intention: '这次请慢一点', conversation },
    ),
  ).toThrow('舞台已经变化')
  const moved = buildRehearsalContext(context.sceneId, document, {}, context)
  expect(moved.performers[0]!.position).toEqual([-3, 0, 0])
  expect(() => validateProposal(moved, interaction.proposals[0])).toThrow('舞台已经变化')
})

test('model context includes bounded recent turns and prior proposal options without prior scene or script payloads', () => {
  const { thread, message, interaction } = setup()
  thread.messages = Array.from({ length: 12 }, (_, i) => ({
    ...message(`${i}:${'旧'.repeat(999)}`),
    role: 'dia' as const,
  }))
  thread.messages.push({ ...message('这条过期回复不能当本轮依据'), role: 'dia', status: 'stale' })
  const current = message('继续试试')
  thread.messages.push(current)
  const context = conversationContext(thread, interaction, null, current)
  expect(context.recentMessages.length).toBeLessThanOrEqual(8)
  expect(
    context.recentMessages.reduce((sum, item) => sum + item.content.length, 0),
  ).toBeLessThanOrEqual(6000)
  expect(
    context.recentMessages.filter((item) => item.messageId === current.messageId),
  ).toHaveLength(1)
  expect(context.recentMessages.at(-1)).toEqual(current)
  expect(context.recentMessages.some((item) => item.status === 'stale')).toBe(false)
  expect(Object.keys(context.previousInteraction!)).toEqual([
    'interactionId',
    'sceneVersion',
    'proposals',
  ])
  expect('inputContext' in context.previousInteraction!).toBe(false)
  expect(() =>
    conversationContext({ ...thread, sceneId: 'other' }, interaction, null, current),
  ).toThrow('其他场景')
  expect(() =>
    conversationContext(thread, interaction, null, { ...current, sceneVersion: 'old' }),
  ).toThrow('舞台已经变化')
})

test('the second option and A hold produce a new immutable revision with repeatable parent lineage', () => {
  const { context, document, interaction, thread, message, second } = setup()
  const original = JSON.stringify(interaction)
  const request = message('第二个好，但A不要动')
  const conversation = conversationContext(
    thread,
    interaction,
    interaction.proposals[0]!.proposalId,
    request,
  )
  expect(conversation.selectedProposalId).toBe(interaction.proposals[1]!.proposalId)
  expect(conversation.heldPerformerIds).toEqual(['a'])
  const revisedContent = structuredClone(second)
  revisedContent.suggestions[0] = {
    ...revisedContent.suggestions[0]!,
    movement: 'hold',
    zone: null,
  }
  const input = buildRehearsalContext(
    context.sceneId,
    document,
    {},
    { ...context, intention: request.content, conversation },
  )
  const revised = createInteraction(
    input,
    { dramaticState: [], proposals: [revisedContent] },
    'synthetic-test-fixture',
  )
  const proposal = revised.proposals[0]!
  expect(proposal.proposalId).not.toBe(interaction.proposals[1]!.proposalId)
  expect(proposal.revision).toMatchObject({
    schemaVersion: 1,
    proposalId: proposal.proposalId,
    parentProposalId: interaction.proposals[1]!.proposalId,
    rootProposalId: interaction.proposals[1]!.proposalId,
    parentInteractionId: interaction.interactionId,
    revisionNumber: 1,
    humanMessageId: request.messageId,
    instruction: request.content,
    heldPerformerIds: ['a'],
    sceneVersion: context.sceneVersion,
  })
  expect(compileProposal(input, proposal).paths.map((path) => path.performerId)).toEqual(['b'])
  expect(JSON.stringify(interaction)).toBe(original)
  const followup = message('第一个继续，A保持位置')
  const nextConversation = conversationContext(thread, revised, null, followup)
  const nextInput = buildRehearsalContext(
    context.sceneId,
    document,
    {},
    { ...context, intention: followup.content, conversation: nextConversation },
  )
  const next = createInteraction(
    nextInput,
    { dramaticState: [], proposals: [revisedContent] },
    'synthetic-test-fixture',
  )
  expect(next.proposals[0]!.revision).toMatchObject({
    parentProposalId: proposal.proposalId,
    rootProposalId: interaction.proposals[1]!.proposalId,
    revisionNumber: 2,
  })
  expect(() => validateInteraction(revised)).not.toThrow()
  const forged = structuredClone(revised)
  forged.proposals[0]!.revision!.parentProposalId = interaction.proposals[0]!.proposalId
  expect(() => validateInteraction(forged)).toThrow('血缘')
})

test('model output must explicitly hold the requested actor; human edits remain separately valid', () => {
  const { context, document, interaction, thread, message, second } = setup()
  const request = message('第2个好，A不要动')
  const conversation = conversationContext(thread, interaction, null, request)
  const input = buildRehearsalContext(
    context.sceneId,
    document,
    {},
    { ...context, intention: request.content, conversation },
  )
  expect(() =>
    createInteraction(input, { dramaticState: [], proposals: [second] }, 'synthetic-test-fixture'),
  ).toThrow('不动')
  const omitted = { ...second, suggestions: second.suggestions.slice(1) }
  expect(() =>
    createInteraction(input, { dramaticState: [], proposals: [omitted] }, 'synthetic-test-fixture'),
  ).toThrow('不动')
  expect(() => validateProposal(input, interaction.proposals[1])).not.toThrow()
})

test('first-turn hold constraints use current performers without a previous interaction', () => {
  const { context, thread, message, content } = setup()
  const request = message('A不要动，看看B还能怎么做')
  const conversation = conversationContext(
    thread,
    null,
    null,
    request,
    undefined,
    context.performers,
  )
  expect(conversation.previousInteraction).toBeNull()
  expect(conversation.heldPerformerIds).toEqual(['a'])
  expect(() =>
    createInteraction(
      { ...context, intention: request.content, conversation },
      { dramaticState: [], proposals: [content] },
      'synthetic-test-fixture',
    ),
  ).toThrow('不动')
})

test('rejecting actions blocks the same suggestion under new text, identifiers, or ordering', () => {
  const { context, document, interaction, thread, message, content, second } = setup()
  thread.rejectedProposalSignatures = [proposalActionSignature(interaction.proposals[0]!)]
  const request = message('这个不合适，换一个方向')
  const conversation = conversationContext(thread, interaction, null, request)
  const input = buildRehearsalContext(
    context.sceneId,
    document,
    {},
    { ...context, intention: request.content, conversation },
  )
  const renamed = structuredClone(content)
  renamed.title = '换个名字的建议'
  renamed.suggestions.reverse()
  for (const suggestion of renamed.suggestions) {
    suggestion.id = crypto.randomUUID()
    suggestion.intention = '不同措辞'
    if (suggestion.movement === 'hold') {
      suggestion.extent = 'medium'
      suggestion.pace = 'natural'
    }
  }
  expect(proposalActionSignature(renamed)).toBe(thread.rejectedProposalSignatures[0]!)
  expect(() =>
    createInteraction(input, { dramaticState: [], proposals: [renamed] }, 'synthetic-test-fixture'),
  ).toThrow('已拒绝')
  expect(() =>
    createInteraction(input, { dramaticState: [], proposals: [second] }, 'synthetic-test-fixture'),
  ).not.toThrow()
})

test('ambiguous references fail explicitly and current requests cannot be replaced by stale conversation text', () => {
  const { context, interaction, thread, message } = setup()
  expect(() =>
    conversationContext(thread, interaction, null, message('第一个或第二个都行')),
  ).toThrow('明确')
  expect(() => conversationContext(thread, interaction, null, message('第三个好'))).toThrow(
    '没有这个方案',
  )
  const duplicateNames = structuredClone(interaction)
  duplicateNames.inputContext.performers.forEach((performer) => {
    performer.name = '甲'
  })
  expect(() => conversationContext(thread, duplicateNames, null, message('甲不要动'))).toThrow(
    '名称重复',
  )
  const conversation = conversationContext(thread, interaction, null, message('A不要动'))
  expect(() => validateContext({ ...context, conversation })).toThrow('意图不匹配')
  const request = conversation.recentMessages.at(-1)!
  const oldFacts = structuredClone(context)
  delete oldFacts.sceneVersion
  oldFacts.performers[0]!.position[0] -= 1
  expect(() => validateContext({ ...oldFacts, intention: request.content, conversation })).toThrow(
    '舞台已经变化',
  )
  expect(() =>
    validateContext({
      ...context,
      intention: request.content,
      conversation: { ...conversation, heldPerformerIds: ['missing'] },
    }),
  ).toThrow('人物已不存在')
  expect(
    conversationContext(thread, interaction, null, message('AA不要动')).heldPerformerIds,
  ).toEqual([])
})

test('2, 6, 12 and 24 performers with 64-point paths and 1 to 3 maximal proposals preserve spatial facts', () => {
  for (const count of [2, 6, 12, 24]) {
    const { document, context, content } = setup()
    document.rehearsalSimulation.performers = Array.from({ length: count }, (_, i) => ({
      id: `person-${i}`,
      name: `合成人物 ${i} ${'LongName'.repeat(8)}`,
      color: '#888888',
      position: [-2.5 + (i % 6), 0, -1.5 + Math.floor(i / 6)],
      facing: 0,
      visible: true,
    }))
    document.rehearsalSimulation.paths = document.rehearsalSimulation.performers.map((p) => ({
      id: `route-${p.id}`,
      performerId: p.id,
      points: Array.from({ length: 64 }, (_, i) => [
        p.position[0] + Math.sin(i / 10) * 0.1,
        0,
        p.position[2] + i * 0.002,
      ]),
      durationSeconds: 20,
      visible: true,
    }))
    const input = buildRehearsalContext(context.sceneId, document, {}, context)
    expect(input.performers).toHaveLength(count)
    expect(input.paths.every((p) => p.points.length === 64)).toBe(true)
    const before = structuredClone(document)
    for (const proposalCount of [1, 2, 3]) {
      const proposals = Array.from({ length: proposalCount }, (_, i) => ({
        ...content,
        title: `合成方向 ${i}`,
        suggestions: input.performers.slice(0, 12).map((p) => ({
          ...content.suggestions[1]!,
          id: `hold-${p.id}`,
          performerId: p.id,
          movement: 'hold' as const,
        })),
      }))
      const interaction = createInteraction(
        input,
        { dramaticState: [], proposals },
        'synthetic-stress',
      )
      expect(interaction.proposals).toHaveLength(proposalCount)
      const compiled = compileProposal(input, interaction.proposals[0]!)
      expect(compiled.performers.map((p) => p.position)).toEqual(
        input.performers.map((p) => p.position),
      )
      expect(document).toEqual(before)
    }
  }
})
