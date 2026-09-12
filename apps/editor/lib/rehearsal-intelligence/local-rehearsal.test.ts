import 'fake-indexeddb/auto'
import { afterEach, expect, test } from 'bun:test'
import {
  BlockNode,
  clearSceneHistory,
  createBoxBlockTopology,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { createStageSceneDocument } from '../theatre/simulation'
import { editStageDocument, readStageDocument } from '../theatre/simulation-store'
import {
  applyHumanDecision,
  bindRehearsalScene,
  clearProposalGhost,
  previewProposal,
  useProposalGhost,
} from './authority'
import { buildRehearsalContext } from './context'
import {
  conversationContext,
  createRehearsalThread,
  proposalActionSignature,
  sceneFactsVersion,
} from './conversation'
import { discussStage } from './dia-backbone'
import { ACTIVE_DIMENSIONS } from './dimensions'
import { LOCAL_REHEARSAL_MODEL_VERSION, localRehearsalOutput } from './local-rehearsal'
import { compileProposal } from './proposal-compiler'
import { createInteraction } from './proposal-generator'
import { type RehearsalContext, SuggestionSchema } from './schema'

function context(intention = 'A站门边，B靠桌子'): RehearsalContext {
  const document = createStageSceneDocument('人与布景 · 合成测试')
  return {
    sceneId: 'local-rehearsal-test',
    productionId: document.production.id,
    script: '',
    intention,
    directorIntention: '',
    selectedPerformerId: null,
    venue: document.venue,
    performers: [
      { id: 'a', name: 'A', color: '#888888', position: [-2, 0, 1], facing: 0.3, visible: true },
      { id: 'b', name: 'B', color: '#aaaaaa', position: [2, 0, 1], facing: -0.3, visible: true },
    ],
    paths: [
      {
        id: 'old-a',
        performerId: 'a',
        points: [
          [-2, 0, 1],
          [-2, 0, 2],
        ],
        durationSeconds: 4,
        visible: true,
      },
    ],
    durationSeconds: 20,
    obstacles: [
      { id: 'door', name: '右后门', min: [-2.4, 0, -0.05], max: [-1.6, 2.1, 0.05] },
      { id: 'table', name: '圆桌', min: [1.4, 0, -0.6], max: [2.6, 0.75, 0.6] },
    ],
    activeDimensions: [...ACTIVE_DIMENSIONS],
  }
}
const interaction = (input: RehearsalContext) =>
  createInteraction(input, localRehearsalOutput(input), LOCAL_REHEARSAL_MODEL_VERSION)

test('a discussion direction becomes a fresh validated preview, without a fabricated parent proposal', () => {
  const input = { ...context('第二个方向试试'), obstacles: [], paths: [] }
  input.sceneVersion = sceneFactsVersion(input)
  const thread = createRehearsalThread(input.sceneId, input.sceneVersion)
  thread.messages.push({
    messageId: 'discussion',
    role: 'dia',
    content: discussStage(['A', 'B'], 0),
    createdAt: new Date().toISOString(),
    sceneVersion: input.sceneVersion,
  })
  const message = {
    messageId: 'choice',
    role: 'user' as const,
    content: input.intention,
    createdAt: new Date().toISOString(),
    sceneVersion: input.sceneVersion,
  }
  const conversation = conversationContext(thread, null, null, message)
  const next = { ...input, conversation }
  const proposal = interaction(next).proposals[0]!
  expect(conversation.selectedProposalId).toBeNull()
  expect(proposal.suggestions.every((s) => s.movement === 'withdraw')).toBe(true)
  expect(compileProposal(next, proposal).paths).toHaveLength(2)
  expect(input.paths).toEqual([])
  thread.messages[0]!.sceneVersion = 'old'
  expect(() => conversationContext(thread, null, null, message)).toThrow('没有这个方案')
})

test('local object references change Ghost initial standing without coordinates, routes or source writes', () => {
  const input = context(),
    before = structuredClone(input)
  const output = localRehearsalOutput(input)!
  expect(output.proposals[0]!.suggestions.map((s) => s.targetObjectId)).toEqual(['door', 'table'])
  expect(output.proposals[0]!.rationale).toContain('净距 0.5 米')
  for (const suggestion of output.proposals[0]!.suggestions)
    expect(SuggestionSchema.safeParse({ ...suggestion, position: [9, 9, 9] }).success).toBe(false)
  const proposal = interaction(input).proposals[0]!
  const result = compileProposal(input, proposal)
  expect(result).toEqual(compileProposal(input, proposal))
  expect(result.performers[0]!.position).toEqual([-2, 0, 0.8])
  expect(result.performers[1]!.position[2] - 0.6 - 0.25).toBeCloseTo(0.5)
  expect(result.performers.map((p) => p.facing)).toEqual([0.3, -0.3])
  expect(result.paths).toEqual([])
  expect(input).toEqual(before)
})

test('B distance revision preserves A and exact object IDs with the existing proposal lineage', () => {
  const input = context(),
    first = interaction(input),
    version = sceneFactsVersion(input)
  const thread = createRehearsalThread(input.sceneId, version)
  const intention = 'B别那么近'
  const message = {
    messageId: 'revision-message',
    role: 'user' as const,
    content: intention,
    createdAt: new Date().toISOString(),
    sceneVersion: version,
  }
  const next = {
    ...input,
    intention,
    conversation: conversationContext(thread, first, first.proposals[0]!.proposalId, message),
  }
  const revised = interaction(next).proposals[0]!
  expect(revised.suggestions[0]).toEqual(first.proposals[0]!.suggestions[0])
  expect(revised.suggestions[1]).toMatchObject({ targetObjectId: 'table', extent: 'medium' })
  expect(revised.revision).toMatchObject({
    parentProposalId: first.proposals[0]!.proposalId,
    revisionNumber: 1,
  })
  expect(compileProposal(next, revised).performers[1]!.position[2] - 0.6 - 0.25).toBeCloseTo(1)
  const other = {
    ...revised,
    suggestions: revised.suggestions.map((s) => ({ ...s, targetObjectId: 'door' })),
  }
  expect(proposalActionSignature(other)).not.toBe(proposalActionSignature(revised))
  const changed = { ...input, obstacles: input.obstacles.filter((o) => o.id !== 'table') }
  expect(() => localRehearsalOutput({ ...changed, intention: 'B靠桌子' })).toThrow('无法唯一确定')
})

test('ambiguous missing and mixed instructions ask for clarification instead of guessing', () => {
  const input = context()
  expect(localRehearsalOutput({ ...input, intention: '可以试试另一种关系吗' })).toBeNull()
  expect(localRehearsalOutput({ ...input, intention: '现在呢' })).toBeNull()
  for (const intention of [
    'A站门边，另一个动作不知道',
    'A站门边然后走到桌子',
    'A绕过桌子走到门边',
    'A靠近桌子',
  ])
    expect(() => localRehearsalOutput({ ...input, intention })).toThrow()
  expect(() => localRehearsalOutput({ ...input, intention: 'B别那么近' })).toThrow('上一轮方案')
  expect(() => localRehearsalOutput({ ...input, intention: 'C站门边' })).toThrow('人物')
  expect(() =>
    localRehearsalOutput({
      ...input,
      obstacles: [...input.obstacles, { ...input.obstacles[0]!, id: 'other-door', name: '左后门' }],
    }),
  ).toThrow('无法唯一确定')
  expect(() =>
    localRehearsalOutput({ ...input, obstacles: [input.obstacles[0]!, input.obstacles[0]!] }),
  ).toThrow('编号重复')
})

test('standing still uses venue scenery and actor collision gates, with no fallback teleport or shrink', () => {
  const input = context('A站门边'),
    output = localRehearsalOutput(input)!
  const before = structuredClone(input)
  for (const changed of [
    { ...input, venue: { ...input.venue, width: 3 } },
    {
      ...input,
      obstacles: [
        ...input.obstacles,
        { id: 'blocker', name: '挡板', min: [-2.5, 0, 0.7], max: [-1.5, 2, 0.9] },
      ],
    },
    {
      ...input,
      performers: [input.performers[0]!, { ...input.performers[1]!, position: [-2, 0, 0.8] }],
    },
    { ...input, obstacles: [{ ...input.obstacles[0]!, min: [NaN, 0, 0] }] },
  ])
    expect(() => createInteraction(changed, output, LOCAL_REHEARSAL_MODEL_VERSION)).toThrow()
  expect(input).toEqual(before)
  const proposal = interaction(input).proposals[0]!
  expect(() =>
    compileProposal(input, {
      ...proposal,
      suggestions: [{ ...proposal.suggestions[0]!, targetObjectId: 'missing' }],
    }),
  ).toThrow('明确')
  expect(() =>
    compileProposal(input, {
      ...proposal,
      suggestions: [{ ...proposal.suggestions[0]!, movement: 'hold' }],
    }),
  ).toThrow('不支持布景目标')
})

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
afterEach(() => {
  clearProposalGhost()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('real scene Ghost and explicit adoption keep object placement unchanged and undo once', async () => {
  const graph = createTheatreSceneGraph('物件站位权限测试')
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const parent = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const input = context()
  for (const obstacle of input.obstacles) {
    const size = obstacle.max.map((value, axis) => value - obstacle.min[axis]!) as [
      number,
      number,
      number,
    ]
    const node = BlockNode.parse({
      name: obstacle.name,
      parentId: parent.id,
      position: [
        (obstacle.min[0] + obstacle.max[0]) / 2,
        0,
        (obstacle.min[2] + obstacle.max[2]) / 2,
      ],
      supportSlabId: 'ground',
      topology: createBoxBlockTopology(...size),
    })
    useScene.getState().createNode(node, parent.id)
  }
  editStageDocument((document) => {
    document.rehearsalSimulation.performers = input.performers
    document.rehearsalSimulation.paths = input.paths
  })
  const current = buildRehearsalContext(
    crypto.randomUUID(),
    readStageDocument()!,
    useScene.getState().nodes,
    input,
  )
  const record = interaction(current),
    proposal = record.proposals[0]!
  clearSceneHistory()
  const before = useScene.getState().nodes
  const unbind = bindRehearsalScene(current.sceneId, async () => {})
  const journal = new SceneJournal(current.sceneId)
  await journal.recover(useScene.getState(), 1)
  let writes = Promise.resolve()
  const stop = subscribeSceneCommits((commit) => {
    writes = writes.then(() => journal.append(commit.current))
  })
  try {
    await previewProposal(record, proposal)
    expect(useScene.getState().nodes).toBe(before)
    expect(useProposalGhost.getState().simulation!.performers[0]!.position).toEqual([-2, 0, 0.8])
    await applyHumanDecision(
      record,
      proposal,
      'adopt',
      proposal.suggestions,
      '',
      new AbortController().signal,
    )
    expect(readStageDocument()!.rehearsalSimulation.paths).toEqual([])
    for (const node of Object.values(before).filter((node) => node.type === 'block'))
      expect(useScene.getState().nodes[node.id]).toEqual(node)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).toEqual(before)
    await writes
  } finally {
    stop()
    unbind()
  }
})
