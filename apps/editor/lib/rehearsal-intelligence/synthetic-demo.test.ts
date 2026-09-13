import { expect, test } from 'bun:test'
import { apiGraphSchema } from '../graph-schema'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { StageSceneDocumentSchema } from '../theatre/simulation'
import { buildRehearsalContext } from './context'
import {
  conversationContext,
  createRehearsalThread,
  proposalActionSignature,
  sceneFactsVersion,
} from './conversation'
import { compileProposal } from './proposal-compiler'
import { createInteraction } from './proposal-generator'
import type { Interaction, RehearsalContext } from './schema'
import {
  createSyntheticDemoScene,
  isSyntheticDemoScene,
  readSyntheticDemoIntention,
  SYNTHETIC_DEMO_METADATA_KEY,
  SYNTHETIC_DEMO_MODEL_VERSION,
  SYNTHETIC_DEMO_SCRIPT,
  syntheticConversationOutput,
  syntheticDemoIntentionKey,
} from './synthetic-demo'
import {
  finishSyntheticDemoIntention,
  pendingSyntheticDemoIntention,
  prepareSyntheticDemo,
  SYNTHETIC_DEMO_PENDING_KEY,
} from './synthetic-demo-intention'

test('private demo input stays in tab storage, never the navigation URL, and moves only to its new scene', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
  try {
    const privateText = '只在本页保留：A想走？B不动 & 排练笔记'
    const href = prepareSyntheticDemo(privateText)
    expect(href).toBe('/demo')
    expect(new URL(href, 'https://stage.example').search).toBe('')
    expect(href).not.toContain(privateText)
    expect(href).not.toContain(encodeURIComponent(privateText))
    expect(pendingSyntheticDemoIntention()).toBe(privateText)
    expect(JSON.stringify(createSyntheticDemoScene())).not.toContain(privateText)
    finishSyntheticDemoIntention('created-demo', privateText)
    expect(values.has(SYNTHETIC_DEMO_PENDING_KEY)).toBe(false)
    expect(readSyntheticDemoIntention('unrelated-scene')).toBe('')
    expect(readSyntheticDemoIntention('created-demo')).toBe(privateText)
    expect(readSyntheticDemoIntention('created-demo')).toBe('')
    prepareSyntheticDemo('new draft')
    finishSyntheticDemoIntention('late-scene', privateText)
    expect(pendingSyntheticDemoIntention()).toBe('new draft')
    prepareSyntheticDemo('')
    expect(pendingSyntheticDemoIntention()).toBe('')
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})

test('unavailable or blocked session storage does not prevent opening Dia', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  try {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('Storage blocked')
      },
    })
    expect(readSyntheticDemoIntention('synthetic')).toBe('')
    const navigations: string[] = []
    expect(() => navigations.push(prepareSyntheticDemo('keep this input'))).toThrow('输入仍在这里')
    expect(navigations).toEqual([])
    Reflect.deleteProperty(globalThis, 'sessionStorage')
    expect(readSyntheticDemoIntention('synthetic')).toBe('')
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
  }
})

function context(): RehearsalContext {
  const graph = createSyntheticDemoScene()
  const document = StageSceneDocumentSchema.parse(
    graph.nodes[graph.rootNodeIds[0]!]!.metadata[THEATRE_METADATA_KEY],
  )
  return buildRehearsalContext(crypto.randomUUID(), document, graph.nodes, {
    intention: '他们现在太近了，我想让关系更克制。',
    script: SYNTHETIC_DEMO_SCRIPT,
    directorIntention: '',
    selectedPerformerId: null,
  })
}

function continueWith(
  input: RehearsalContext,
  interaction: Interaction,
  intention: string,
  reject = false,
) {
  const next = { ...input, intention, sceneVersion: sceneFactsVersion(input) }
  const thread = createRehearsalThread(input.sceneId, next.sceneVersion)
  if (reject) thread.rejectedProposalSignatures = interaction.proposals.map(proposalActionSignature)
  const message = {
    messageId: crypto.randomUUID(),
    role: 'user' as const,
    content: intention,
    createdAt: new Date().toISOString(),
    sceneVersion: next.sceneVersion,
  }
  return { ...next, conversation: conversationContext(thread, interaction, null, message) }
}

test('demo factory creates isolated original scenes without borrowing project IDs or granting training', () => {
  const real = createTheatreSceneGraph('Private project sentinel')
  const before = structuredClone(real)
  const first = createSyntheticDemoScene(),
    second = createSyntheticDemoScene()
  expect(real).toEqual(before)
  expect(isSyntheticDemoScene(real.nodes)).toBe(false)
  expect(isSyntheticDemoScene(first.nodes)).toBe(true)
  expect(apiGraphSchema.safeParse(first).success).toBe(true)
  expect(Object.keys(first.nodes).some((id) => id in second.nodes || id in real.nodes)).toBe(false)
  const site = first.nodes[first.rootNodeIds[0]!]!
  expect(site.metadata[SYNTHETIC_DEMO_METADATA_KEY]).toMatchObject({
    provenance: 'synthetic',
    originalContent: true,
    privateProjectData: true,
    trainingAuthorized: false,
    trainingEligible: false,
    rightsStatus: 'cleared',
  })
  const document = StageSceneDocumentSchema.parse(site.metadata[THEATRE_METADATA_KEY])
  const other = StageSceneDocumentSchema.parse(
    second.nodes[second.rootNodeIds[0]!]!.metadata[THEATRE_METADATA_KEY],
  )
  expect(document.production.id).not.toBe(other.production.id)
  expect(document.rehearsalSimulation.performers.map((p) => p.name)).toEqual(['A', 'B'])
  expect(
    document.rehearsalSimulation.performers.some((p) =>
      other.rehearsalSimulation.performers.some((q) => q.id === p.id),
    ),
  ).toBe(false)
  expect(syntheticDemoIntentionKey('first')).not.toBe(syntheticDemoIntentionKey('second'))
})

test('synthetic proposals compile distinct directions and respond to live positions without changing them', () => {
  const input = context(),
    before = structuredClone(input)
  const output = syntheticConversationOutput(input)
  expect(output.proposals).toHaveLength(2)
  expect(output.proposals[0]!.rationale).toContain('1.20米')
  expect(proposalActionSignature(output.proposals[0]!)).not.toBe(
    proposalActionSignature(output.proposals[1]!),
  )
  const interaction = createInteraction(input, output, SYNTHETIC_DEMO_MODEL_VERSION)
  for (const proposal of interaction.proposals)
    expect(compileProposal(input, proposal).paths.length).toBeGreaterThan(0)
  expect(interaction.trainingAuthorized).toBe(false)
  expect(interaction.trainingEligible).toBe(false)
  expect(input).toEqual(before)
  const moved = structuredClone(input)
  moved.performers[0]!.position = [-1.6, 0, 0]
  moved.sceneVersion = sceneFactsVersion(moved)
  const latest = syntheticConversationOutput(moved)
  expect(latest.proposals[0]!.rationale).toContain('2.20米')
  expect(latest.proposals[0]!.rationale).not.toBe(output.proposals[0]!.rationale)
  expect(
    createInteraction(moved, latest, SYNTHETIC_DEMO_MODEL_VERSION).inputContext.performers[0]!
      .position,
  ).toEqual([-1.6, 0, 0])
})

test('demo revision preserves the second direction, holds the requested actor, and keeps the original immutable', () => {
  const input = context()
  const original = createInteraction(
    input,
    syntheticConversationOutput(input),
    SYNTHETIC_DEMO_MODEL_VERSION,
  )
  const snapshot = structuredClone(original)
  for (const name of ['A', 'B']) {
    const next = continueWith(input, original, `第二个可以，但${name}不要动。`)
    const result = createInteraction(
      next,
      syntheticConversationOutput(next),
      SYNTHETIC_DEMO_MODEL_VERSION,
    )
    expect(result.proposals).toHaveLength(1)
    const proposal = result.proposals[0]!,
      actor = input.performers.find((p) => p.name === name)!
    expect(proposal.suggestions.find((s) => s.performerId === actor.id)!.movement).toBe('hold')
    expect(proposal.suggestions.find((s) => s.performerId !== actor.id)!.movement).toBe(
      'toward-zone',
    )
    expect(proposal.revision?.parentProposalId).toBe(original.proposals[1]!.proposalId)
    expect(compileProposal(next, proposal).paths).toHaveLength(1)
  }
  expect(original).toEqual(snapshot)
})

test('rejected directions are replaced and boundary positions retain safe alternatives', () => {
  const input = context()
  const original = createInteraction(
    input,
    syntheticConversationOutput(input),
    SYNTHETIC_DEMO_MODEL_VERSION,
  )
  const next = continueWith(input, original, '不成立，换几个方向。', true)
  const output = syntheticConversationOutput(next)
  expect(output.proposals).toHaveLength(2)
  const rejected = original.proposals.map(proposalActionSignature)
  for (const proposal of output.proposals)
    expect(rejected).not.toContain(proposalActionSignature(proposal))
  expect(output.proposals.some((p) => p.suggestions.every((s) => s.movement === 'hold'))).toBe(true)
  createInteraction(next, output, SYNTHETIC_DEMO_MODEL_VERSION)
  input.performers[0]!.position = [-3.7, 0, 0]
  input.performers[1]!.position = [3.7, 0, 0]
  input.sceneVersion = sceneFactsVersion(input)
  const boundary = createInteraction(
    input,
    syntheticConversationOutput(input),
    SYNTHETIC_DEMO_MODEL_VERSION,
  )
  expect(boundary.proposals).toHaveLength(2)
  for (const proposal of boundary.proposals)
    expect(() => compileProposal(input, proposal)).not.toThrow()
})
