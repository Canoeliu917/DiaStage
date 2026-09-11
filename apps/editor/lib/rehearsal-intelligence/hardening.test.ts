import 'fake-indexeddb/auto'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import {
  editStageDocument,
  moveSimulationPerformer,
  readStageDocument,
} from '../theatre/simulation-store'
import {
  applyHumanDecision,
  bindRehearsalScene,
  clearProposalGhost,
  makeFeedback,
  observeRehearsalFeedback,
  previewProposal,
  useProposalGhost,
} from './authority'
import { buildRehearsalContext } from './context'
import { readFeedbackLog, saveFeedback, saveInteraction, saveTrainingConsent } from './feedback'
import { requestProposal } from './proposal-client'
import { compileProposal } from './proposal-compiler'
import { createInteraction } from './proposal-generator'
import { FeedbackSchema, type Interaction } from './schema'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  clearProposalGhost()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

async function setup() {
  const graph = createTheatreSceneGraph('合成加固测试')
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  editStageDocument((d) => {
    d.rehearsalSimulation.performers = [
      { id: 'a', name: '甲', color: '#888888', position: [-2, 0, 0], facing: 0, visible: true },
      { id: 'b', name: '乙', color: '#aaaaaa', position: [2, 0, 0], facing: 0, visible: true },
    ]
  })
  const context = buildRehearsalContext(
    crypto.randomUUID(),
    readStageDocument()!,
    useScene.getState().nodes,
    {
      script: '甲等待乙回应。',
      intention: '尝试靠近',
      directorIntention: '',
      selectedPerformerId: 'a',
    },
  )
  const interaction = createInteraction(
    context,
    {
      dramaticState: [],
      proposals: [
        {
          title: '可以靠近试试',
          intention: '尝试邀请回应',
          rationale: '距离变化可以作为一次尝试。',
          suggestions: ['a', 'b'].map((performerId, i) => ({
            id: `s${i}`,
            performerId,
            intention: '尝试回应',
            movement: i === 0 ? 'approach' : 'hold',
            targetPerformerId: i === 0 ? 'b' : null,
            zone: null,
            extent: 'small',
            pace: 'slow',
          })),
          alternatives: ['也可以停留'],
          evidence: [{ source: 'script', quote: '甲等待乙回应。' }],
          confidence: 0.5,
        },
      ],
    },
    'synthetic-hardening-not-real-model',
  )
  const journal = new SceneJournal(context.sceneId)
  await journal.recover(useScene.getState(), 1)
  disposers.push(bindRehearsalScene(context.sceneId, () => journal.assertCurrent()))
  clearSceneHistory()
  return { context, interaction, proposal: interaction.proposals[0]!, journal }
}

async function manualStillWorks(journal: SceneJournal) {
  clearSceneHistory()
  const before = useScene.getState().nodes
  moveSimulationPerformer('a', [-2, 0, 0.5])
  const after = useScene.getState().nodes
  await journal.append(useScene.getState())
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes).toEqual(before)
  await journal.append(useScene.getState())
  useScene.temporal.getState().redo()
  expect(useScene.getState().nodes).toEqual(after)
  await journal.append(useScene.getState())
  const recovered = await new SceneJournal(journal.id).recover(useScene.getState(), 1)
  expect(recovered.graph.nodes).toEqual(after)
}

for (const status of [400, 401, 403, 422, 429, 500, 503])
  test(`synthetic HTTP ${status}: no official writes; manual move/save/undo/redo remain available`, async () => {
    const { context, journal } = await setup()
    const before = useScene.getState().nodes
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: { message: `synthetic ${status}` } }, { status }),
    )
    try {
      await expect(requestProposal(context, new AbortController().signal)).rejects.toThrow(
        `synthetic ${status}`,
      )
    } finally {
      fetch.mockRestore()
    }
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    await manualStillWorks(journal)
  })

for (const failure of [
  'invalid-json',
  'invalid-structure',
  'actor',
  'evidence',
  'space',
  'collision',
  'stale-context',
  'timeout',
  'abort',
] as const)
  test(`synthetic ${failure}: rejects response and preserves manual rehearsal`, async () => {
    const { context, interaction, journal } = await setup()
    const before = useScene.getState().nodes
    const response = structuredClone(interaction)
    if (failure === 'actor') response.proposals[0]!.suggestions[0]!.performerId = 'absent'
    if (failure === 'evidence') response.proposals[0]!.evidence[0]!.quote = '虚构台词'
    if (failure === 'space') response.inputContext.venue.width = 1
    if (failure === 'collision')
      response.inputContext.obstacles = [
        { id: 'flat', name: '景片', min: [-1.8, 0, -1], max: [-1.7, 2, 1] },
      ]
    if (failure === 'stale-context') response.inputContext.performers[0]!.position[0] = -3
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (failure === 'timeout' || failure === 'abort')
        throw new DOMException(
          'synthetic cancellation',
          failure === 'timeout' ? 'TimeoutError' : 'AbortError',
        )
      return failure === 'invalid-json'
        ? new Response('{broken')
        : Response.json({ interaction: failure === 'invalid-structure' ? {} : response })
    })
    try {
      await expect(requestProposal(context, new AbortController().signal)).rejects.toThrow()
    } finally {
      fetch.mockRestore()
    }
    expect(useScene.getState().nodes).toBe(before)
    await manualStillWorks(journal)
  })

for (const change of ['move', 'delete', 'scene', 'foreign-tab'] as const)
  test(`stale ${change}: clears preview, refuses adoption and never overwrites changes`, async () => {
    const { interaction, proposal, journal } = await setup()
    await previewProposal(interaction, proposal)
    if (change === 'move') moveSimulationPerformer('a', [-3, 0, 0])
    if (change === 'delete')
      editStageDocument((d) => {
        d.rehearsalSimulation.performers.shift()
      })
    if (change === 'scene') disposers.push(bindRehearsalScene('another-scene', async () => {}))
    if (change === 'foreign-tab') {
      const other = new SceneJournal(journal.id)
      const loaded = await other.recover(useScene.getState(), 1)
      // Separate journal instance models another tab writing the shared IndexedDB head.
      await other.append({
        ...loaded.graph,
        collections: { ...loaded.graph.collections, otherWindow: { name: '合成修改' } },
      })
    }
    const before = useScene.getState().nodes
    await expect(
      applyHumanDecision(
        interaction,
        proposal,
        'adopt',
        proposal.suggestions,
        '',
        new AbortController().signal,
      ),
    ).rejects.toThrow()
    expect(useScene.getState().nodes).toBe(before)
    expect(useProposalGhost.getState().simulation).toBeNull()
    if (change === 'foreign-tab')
      await expect(journal.assertCurrent()).rejects.toThrow('另一个窗口')
  })

test('partial and edit need a new compiled preview, with exact original/preview/edit facts', async () => {
  const { interaction, proposal, journal } = await setup()
  await previewProposal(interaction, proposal)
  const partial = [proposal.suggestions[0]!]
  await expect(
    applyHumanDecision(interaction, proposal, 'partial', partial, '', new AbortController().signal),
  ).rejects.toThrow('预览')
  const edited = [{ ...partial[0]!, extent: 'medium' as const }]
  await expect(
    applyHumanDecision(interaction, proposal, 'edit', edited, '', new AbortController().signal),
  ).rejects.toThrow('预览')
  await previewProposal(interaction, { ...proposal, suggestions: edited })
  const event = makeFeedback(interaction, proposal, 'reject')
  expect(event.originalProposal).toEqual(proposal)
  expect(event.previewedProposal?.suggestions).toEqual(edited)
  expect(event.humanEdit).toEqual(edited)
  expect(event.trainingAuthorized).toBe(false)
  expect(event.privateProjectData).toBe(true)
  await saveFeedback(event)
  const failed = { ...proposal, suggestions: [{ ...edited[0]!, performerId: 'missing' }] }
  await expect(previewProposal(interaction, failed)).rejects.toThrow()
  expect(useProposalGhost.getState().simulation).toBeNull()
  await manualStillWorks(journal)
})

for (const store of ['interactions', 'events', 'consent'] as const)
  test(`feedback ${store} write quota failure does not affect formal history`, async () => {
    const { interaction, proposal, journal } = await setup()
    await saveInteraction(interaction)
    const before = useScene.getState().nodes
    const original = IDBObjectStore.prototype.put
    const put = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === store) throw new DOMException('synthetic quota', 'QuotaExceededError')
      return original.call(this, value, key)
    })
    try {
      await expect(
        store === 'interactions'
          ? saveInteraction(interaction)
          : store === 'consent'
            ? saveTrainingConsent(interaction.sceneId, true)
            : saveFeedback(makeFeedback(interaction, proposal, 'reject')),
      ).rejects.toThrow('synthetic quota')
    } finally {
      put.mockRestore()
    }
    expect(useScene.getState().nodes).toBe(before)
    expect((await readFeedbackLog(interaction.sceneId)).interactions[0]!.trainingAuthorized).toBe(
      false,
    )
    await manualStillWorks(journal)
  })

test('unavailable IndexedDB, pre-aborted request and legacy feedback retain safe defaults', async () => {
  const { interaction, proposal, journal, context } = await setup()
  const open = spyOn(indexedDB, 'open').mockImplementation(() => {
    throw new DOMException('synthetic unavailable', 'SecurityError')
  })
  try {
    await expect(previewProposal(interaction, proposal)).rejects.toThrow('synthetic unavailable')
    expect(useProposalGhost.getState().simulation).toBeNull()
  } finally {
    open.mockRestore()
  }
  const abort = new AbortController()
  abort.abort()
  const fetch = spyOn(globalThis, 'fetch')
  try {
    await expect(requestProposal(context, abort.signal)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    fetch.mockRestore()
  }
  const {
    previewedProposal: _preview,
    trainingAuthorized: _consent,
    privateProjectData: _private,
    ...legacy
  } = makeFeedback(interaction, proposal, 'reject')
  expect(FeedbackSchema.parse(legacy)).toMatchObject({
    previewedProposal: null,
    privateProjectData: true,
    trainingAuthorized: false,
  })
  await manualStillWorks(journal)
})

async function pollEvent(
  interaction: Interaction,
  matches: (events: Awaited<ReturnType<typeof readFeedbackLog>>['events']) => boolean,
) {
  for (let i = 0; i < 80; i++) {
    const events = (await readFeedbackLog(interaction.sceneId)).events
    if (matches(events)) return events
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('feedback reconciliation did not finish')
}

test('late cancellation cannot reactivate Ghost and a stopped Ghost cannot be adopted after awaiting storage', async () => {
  const { interaction, proposal, journal } = await setup()
  let checkCount = 0
  const controller = new AbortController()
  disposers.push(
    bindRehearsalScene(journal.id, async () => {
      await journal.assertCurrent()
      if (++checkCount === 2) controller.abort()
    }),
  )
  await expect(previewProposal(interaction, proposal, controller.signal)).rejects.toThrow()
  expect(useProposalGhost.getState().simulation).toBeNull()
  disposers.push(bindRehearsalScene(journal.id, () => journal.assertCurrent()))
  await previewProposal(interaction, proposal)
  const before = useScene.getState().nodes
  const check = spyOn(journal, 'assertCurrent').mockImplementation(async () => {
    clearProposalGhost()
  })
  try {
    await expect(
      applyHumanDecision(
        interaction,
        proposal,
        'adopt',
        proposal.suggestions,
        '',
        new AbortController().signal,
      ),
    ).rejects.toThrow('预览已经停止')
  } finally {
    check.mockRestore()
  }
  expect(useScene.getState().nodes).toBe(before)
  await manualStillWorks(journal)
})

test('prepared refresh never applies a decision without a durable scene receipt', async () => {
  const { interaction, proposal, journal } = await setup()
  const event = {
    ...makeFeedback(interaction, proposal, 'adopt'),
    status: 'prepared' as const,
    finalResult: compileProposal(interaction.inputContext, proposal),
  }
  await saveFeedback(event)
  const before = useScene.getState().nodes
  disposers.push(observeRehearsalFeedback(interaction.sceneId))
  await new SceneJournal(journal.id).recover(useScene.getState(), 1)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(useScene.getState().nodes).toBe(before)
  expect((await readFeedbackLog(journal.id)).events[0]!.status).toBe('prepared')
})

test('post-scene feedback failure recovers, Undo/Redo journal and feedback agree without duplicate adoption', async () => {
  const { interaction, proposal, journal } = await setup()
  const before = useScene.getState().nodes
  let writes = Promise.resolve()
  disposers.push(
    subscribeSceneCommits((c) => {
      writes = writes.then(() => journal.append(c.current))
    }),
  )
  await previewProposal(interaction, proposal)
  const original = IDBObjectStore.prototype.put
  const put = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (
      this.name === 'events' &&
      value &&
      typeof value === 'object' &&
      'status' in value &&
      value.status === 'applied'
    )
      throw new DOMException('synthetic final feedback quota', 'QuotaExceededError')
    return original.call(this, value, key)
  })
  try {
    await expect(
      applyHumanDecision(
        interaction,
        proposal,
        'adopt',
        proposal.suggestions,
        '',
        new AbortController().signal,
      ),
    ).rejects.toThrow('synthetic final feedback quota')
  } finally {
    put.mockRestore()
  }
  await writes
  const after = useScene.getState().nodes
  expect(after).not.toEqual(before)
  expect(
    (await new SceneJournal(journal.id).recover({ ...useScene.getState(), nodes: before }, 1)).graph
      .nodes,
  ).toEqual(after)
  let stop = observeRehearsalFeedback(journal.id)
  const events = await pollEvent(interaction, (items) =>
    items.some((e) => e.decision === 'adopt' && e.status === 'applied'),
  )
  const adoption = events.find((e) => e.decision === 'adopt')!
  expect(adoption.previewedProposal).toEqual(proposal)
  stop()
  useScene.temporal.getState().undo()
  await journal.append(useScene.getState())
  expect(useScene.getState().nodes).toEqual(before)
  // Restart the observer after Undo: no in-memory previous receipt may be assumed.
  stop = observeRehearsalFeedback(journal.id)
  disposers.push(stop)
  await pollEvent(
    interaction,
    (items) =>
      JSON.stringify(items.find((e) => e.decision === 'manual-edit')?.finalResult) ===
      JSON.stringify(readStageDocument()!.rehearsalSimulation),
  )
  useScene.temporal.getState().redo()
  expect(useScene.getState().nodes).toEqual(after)
  await journal.append(useScene.getState())
  const redone = await pollEvent(
    interaction,
    (items) =>
      JSON.stringify(items.find((e) => e.decision === 'manual-edit')?.finalResult) ===
      JSON.stringify(readStageDocument()!.rehearsalSimulation),
  )
  expect(redone.filter((e) => e.decision === 'adopt')).toHaveLength(1)
  await expect(
    applyHumanDecision(
      interaction,
      proposal,
      'adopt',
      proposal.suggestions,
      '',
      new AbortController().signal,
    ),
  ).rejects.toThrow()
  expect(useScene.getState().nodes).toBe(after)
  expect(
    (await readFeedbackLog(journal.id)).events.filter((e) => e.decision === 'adopt'),
  ).toHaveLength(1)
})
