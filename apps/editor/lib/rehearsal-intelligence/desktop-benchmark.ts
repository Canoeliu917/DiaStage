import { clearSceneHistory, type SceneGraph, useScene } from '@pascal-app/core'
import { SceneJournal } from '../scene-journal'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { runtimeTheatreDocument, StageSceneDocumentSchema } from '../theatre/simulation'
import { clearProposalGhost, makeFeedback, useProposalGhost } from './authority'
import { buildRehearsalContext } from './context'
import { EVAL_CASES } from './eval-cases'
import { readFeedbackLog, saveFeedback, saveInteraction } from './feedback'
import { compileProposal } from './proposal-compiler'
import { createInteraction } from './proposal-generator'
import { validateProposal } from './proposal-validator'

/** Run only in a disposable browser context on an empty loopback page. */
export async function runDesktopBenchmark() {
  if (
    !['127.0.0.1', 'localhost'].includes(location.hostname) ||
    !location.pathname.startsWith('/__diastage_synthetic_benchmark__/')
  )
    throw new Error('Benchmark requires an isolated loopback page')
  const sceneId = `synthetic-desktop-benchmark-${crypto.randomUUID()}`
  const graph = createTheatreSceneGraph('Synthetic desktop benchmark')
  const site = graph.nodes[graph.rootNodeIds[0]!]!
  const document = StageSceneDocumentSchema.parse({
    ...StageSceneDocumentSchema.parse(site.metadata[THEATRE_METADATA_KEY]),
    rehearsalSimulation: {
      version: 1,
      performers: [
        { id: 'a', name: '甲', position: [-2, 0, 0], facing: 0, color: '#888888', visible: true },
        { id: 'b', name: '乙', position: [2, 0, 0], facing: 0, color: '#aaaaaa', visible: true },
      ],
      paths: [],
      durationSeconds: 20,
    },
  })
  site.metadata[THEATRE_METADATA_KEY] = document
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const input = buildRehearsalContext(sceneId, document, graph.nodes, {
    intention: EVAL_CASES[0]!.intention,
    script: '',
    directorIntention: '',
    selectedPerformerId: 'a',
  })
  const interaction = createInteraction(
    input,
    {
      dramaticState: [],
      proposals: [
        {
          title: 'Synthetic benchmark proposal',
          intention: input.intention,
          rationale: '仅用于合成桌面计时，不是真实模型结果。',
          suggestions: input.performers.map((performer, index) => ({
            id: `synthetic-suggestion-${index}`,
            performerId: performer.id,
            intention: index ? '保持位置' : '尝试靠近',
            movement: index ? 'hold' : 'approach',
            targetPerformerId: index ? null : input.performers[1]!.id,
            zone: null,
            extent: 'small',
            pace: 'slow',
          })),
          alternatives: ['也可以保持距离，由人决定。'],
          evidence: [{ source: 'intention', quote: input.intention }],
          confidence: 0.5,
        },
      ],
    },
    'synthetic-desktop-benchmark-not-real-model',
  )
  const proposal = interaction.proposals[0]!
  const journal = new SceneJournal(sceneId)
  await journal.recover(graph, 1)
  await saveInteraction(interaction)
  const samples: Record<string, number[]> = {}
  const batches: Record<string, number> = {}
  const iterations = 25
  const warmup = 5
  let collecting = false
  function sample<T>(name: string, operation: () => T, batch = 50): T {
    const started = performance.now()
    let result!: T
    for (let i = 0; i < batch; i++) result = operation()
    samples[name] ??= []
    if (collecting) samples[name].push((performance.now() - started) / batch)
    batches[name] = batch
    return result
  }
  async function persist(name: string, operation: () => Promise<void>) {
    const started = performance.now()
    await operation()
    samples[name] ??= []
    if (collecting) samples[name].push(performance.now() - started)
    batches[name] = 1
  }
  let lastGraph: SceneGraph = graph
  for (let iteration = -warmup; iteration < iterations; iteration++) {
    collecting = iteration >= 0
    const context = sample('contextCollection', () =>
      buildRehearsalContext(sceneId, document, graph.nodes, input),
    )
    sample('proposalValidationIncludingCompile', () => validateProposal(context, proposal))
    const simulation = sample('proposalCompile', () => compileProposal(context, proposal))
    const projection = sample('ghostDisplayDataCreationExcludingGPU', () =>
      runtimeTheatreDocument({ ...document, rehearsalSimulation: simulation }),
    )
    if (projection.scenes[0]?.roles.length !== 2)
      throw new Error('Synthetic Ghost projection failed')
    clearProposalGhost()
    sample(
      'ghostStoreActivationExcludingReactAndGPU',
      () =>
        useProposalGhost.setState({
          sceneId,
          proposalId: proposal.proposalId,
          proposal,
          simulation,
          time: 0,
          visible: true,
          playing: false,
        }),
      5000,
    )
    if (!useProposalGhost.getState().visible) throw new Error('Synthetic Ghost activation failed')
    const next = {
      ...document,
      production: { ...document.production, name: `Synthetic desktop benchmark ${iteration}` },
      rehearsalSimulation: simulation,
    }
    sample(
      'adoptSceneTransactionExcludingAuthorityAndPersistence',
      () =>
        useScene.getState().applyNodeChanges({
          update: [{ id: site.id, data: { metadata: { [THEATRE_METADATA_KEY]: next } } }],
        }),
      1,
    )
    lastGraph = { ...graph, nodes: useScene.getState().nodes }
    await persist('journalPersistenceStrictIndexedDB', () => journal.append(lastGraph))
    const event = {
      ...makeFeedback(interaction, proposal, 'adopt'),
      finalResult: simulation,
      status: 'applied' as const,
    }
    await persist('feedbackPersistenceStrictIndexedDB', () => saveFeedback(event))
    clearProposalGhost()
    clearSceneHistory()
  }
  const recovered = await new SceneJournal(sceneId).recover(graph, 1)
  if (JSON.stringify(recovered.graph.nodes) !== JSON.stringify(lastGraph.nodes))
    throw new Error('Synthetic journal recovery mismatch')
  const feedback = await readFeedbackLog(sceneId)
  if (feedback.events.length !== iterations + warmup)
    throw new Error('Synthetic feedback count mismatch')
  useScene.getState().unloadScene()
  clearSceneHistory()
  return {
    provenance: 'synthetic',
    classification: 'Desktop Baseline; isolated empty-page microbenchmark',
    physicalMobileDevice: false,
    realModelEval: 'NOT_RUN',
    aiNetworkLatency: { status: 'NOT_RUN', milliseconds: null },
    fixture: { performers: 2, sceneNodes: Object.keys(graph.nodes).length, proposals: 1, paths: 1 },
    iterations,
    warmupIterations: warmup,
    storage: 'Real Chromium IndexedDB, strict durability; isolated temporary browser context',
    verification: { journalRecoveryMatches: true, savedFeedbackEvents: feedback.events.length },
    units:
      'milliseconds per operation; synchronous samples use batches to reduce clock quantization',
    measurements: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => {
        const sorted = [...values].sort((a, b) => a - b)
        return [
          name,
          {
            samples: values.length,
            operationsPerSample: batches[name],
            median: sorted[Math.floor(sorted.length / 2)],
            p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
            min: sorted[0],
            max: sorted.at(-1),
            rawSamples: values,
          },
        ]
      }),
    ),
    limitations: [
      'No WebGL draw, GPU, React render or full human-decision latency is measured.',
      'No physical-device, low-end Windows, thermal or 1000-object/30-minute result is established.',
      'Small fixture and batched sub-millisecond timings are not end-to-end user latency.',
    ],
  }
}

Object.assign(globalThis, { runDiaStageDesktopBenchmark: runDesktopBenchmark })
