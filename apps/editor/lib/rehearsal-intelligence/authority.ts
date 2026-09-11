import { useScene } from '@pascal-app/core'
import { create } from 'zustand'
import { subscribeLocalScene, waitForLocalScene } from '../scene-journal'
import { assertTheatreWritable, THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { type RehearsalSimulation, StageSceneDocumentSchema } from '../theatre/simulation'
import { readStageDocument } from '../theatre/simulation-store'
import { buildRehearsalContext } from './context'
import { readFeedback, saveFeedback } from './feedback'
import { compileProposal } from './proposal-compiler'
import { validateProposal } from './proposal-validator'
import { type Feedback, type Interaction, type RehearsalProposal, SuggestionSchema } from './schema'

export const DECISION_KEY = 'diastageRehearsalDecision'
export const useProposalGhost = create<{
  sceneId: string | null
  proposalId: string | null
  simulation: RehearsalSimulation | null
  time: number
  visible: boolean
  playing: boolean
  feedbackError: string
}>(() => ({
  sceneId: null,
  proposalId: null,
  simulation: null,
  time: 0,
  visible: false,
  playing: false,
  feedbackError: '',
}))
export const clearProposalGhost = () =>
  useProposalGhost.setState({
    sceneId: null,
    proposalId: null,
    simulation: null,
    time: 0,
    visible: false,
    playing: false,
  })

/** Receipts reconcile interrupted feedback writes; preferences observe only durable scene commits. */
export function observeRehearsalFeedback(sceneId: string) {
  let queue = Promise.resolve()
  let previousEventId: string | null = null
  return subscribeLocalScene(sceneId, (nodes) => {
    queue = queue
      .then(async () => {
        for (const node of Object.values(nodes)) {
          if (
            !node ||
            typeof node !== 'object' ||
            !('type' in node) ||
            node.type !== 'site' ||
            !('metadata' in node)
          )
            continue
          const metadata = node.metadata as Record<string, unknown>
          const receipt = metadata[DECISION_KEY]
          const eventId =
            receipt &&
            typeof receipt === 'object' &&
            'eventId' in receipt &&
            typeof receipt.eventId === 'string'
              ? receipt.eventId
              : previousEventId
          if (!eventId) continue
          previousEventId = eventId
          const event = await readFeedback(eventId)
          if (!event || event.sceneId !== sceneId) continue
          const result = StageSceneDocumentSchema.parse(
            metadata[THEATRE_METADATA_KEY],
          ).rehearsalSimulation
          if (event.status === 'prepared') await saveFeedback({ ...event, status: 'applied' })
          const manual = await readFeedback(`${event.eventId}:manual`)
          if (JSON.stringify(manual?.finalResult ?? event.finalResult) !== JSON.stringify(result)) {
            // ponytail: keep the latest implicit final state per adoption, not a per-frame training history.
            await saveFeedback({
              ...event,
              eventId: `${event.eventId}:manual`,
              decision: 'manual-edit',
              createdAt: new Date().toISOString(),
              finalResult: result,
              humanEdit: null,
              status: 'applied',
            })
          }
        }
        useProposalGhost.setState({ feedbackError: '' })
      })
      .catch(() => {
        useProposalGhost.setState({
          feedbackError: '排演已保存，但反馈记录未能更新；请检查浏览器存储空间。',
        })
      })
  })
}

function currentContext(interaction: Interaction) {
  const document = readStageDocument()
  if (!document || document.production.id !== interaction.inputContext.productionId)
    throw new Error('当前剧目已变化，请重新生成建议')
  const context = buildRehearsalContext(
    interaction.sceneId,
    document,
    useScene.getState().nodes,
    interaction.inputContext,
  )
  if (JSON.stringify(context) !== JSON.stringify(interaction.inputContext))
    throw new Error('人物、路线或布景已变化，请重新生成建议，避免覆盖你的调整')
  return { document, context }
}
export function makeFeedback(
  interaction: Interaction,
  proposal: RehearsalProposal,
  decision: Feedback['decision'],
): Feedback {
  return {
    eventId: crypto.randomUUID(),
    interactionId: interaction.interactionId,
    sceneId: interaction.sceneId,
    proposalId: proposal.proposalId,
    createdAt: new Date().toISOString(),
    previewed: useProposalGhost.getState().proposalId === proposal.proposalId,
    decision,
    originalProposal: proposal,
    humanEdit: null,
    finalResult: null,
    reasonTags: [],
    optionalUserNote: '',
    status: 'recorded',
  }
}
export async function previewProposal(
  interaction: Interaction,
  proposal: RehearsalProposal,
  signal?: AbortSignal,
) {
  const { context } = currentContext(interaction)
  const simulation = compileProposal(context, validateProposal(context, proposal))
  const original = interaction.proposals.find((p) => p.proposalId === proposal.proposalId)
  if (!original) throw new Error('未找到原始建议')
  const event = makeFeedback(interaction, original, 'preview')
  await saveFeedback({
    ...event,
    previewed: true,
    humanEdit:
      JSON.stringify(original.suggestions) === JSON.stringify(proposal.suggestions)
        ? null
        : proposal.suggestions,
    finalResult: simulation,
  })
  signal?.throwIfAborted()
  currentContext(interaction)
  useProposalGhost.setState({
    sceneId: interaction.sceneId,
    proposalId: proposal.proposalId,
    simulation,
    visible: true,
    playing: false,
    time: 0,
  })
}

/** Only a user gesture calls this gate. Server generation has no dependency on the scene store. */
export async function applyHumanDecision(
  interaction: Interaction,
  original: RehearsalProposal,
  decision: 'adopt' | 'partial' | 'edit',
  suggestions: RehearsalProposal['suggestions'],
  note: string,
  signal: AbortSignal,
) {
  assertTheatreWritable()
  signal.throwIfAborted()
  if (!interaction.proposals.some((p) => JSON.stringify(p) === JSON.stringify(original)))
    throw new Error('原始建议与生成记录不一致')
  const ghost = useProposalGhost.getState()
  if (ghost.proposalId !== original.proposalId || !ghost.simulation)
    throw new Error('请先预览当前方案，再决定是否采用')
  if (!suggestions.length) throw new Error('请至少选择一条建议')
  if (decision === 'adopt' && JSON.stringify(suggestions) !== JSON.stringify(original.suggestions))
    throw new Error('完整采用不能修改建议')
  if (
    decision === 'partial' &&
    (suggestions.length >= original.suggestions.length ||
      suggestions.some(
        (s) => !original.suggestions.some((o) => JSON.stringify(o) === JSON.stringify(s)),
      ))
  )
    throw new Error('部分采用只允许选择原建议的子集')
  if (
    decision === 'edit' &&
    suggestions.some(
      (s) => !original.suggestions.some((o) => o.id === s.id && o.performerId === s.performerId),
    )
  )
    throw new Error('调整不能添加未提议的人物')
  const changed = { ...original, suggestions: suggestions.map((s) => SuggestionSchema.parse(s)) }
  const { document, context } = currentContext(interaction)
  const simulation = compileProposal(context, validateProposal(context, changed))
  if (
    ghost.sceneId !== interaction.sceneId ||
    JSON.stringify(ghost.simulation) !== JSON.stringify(simulation)
  )
    throw new Error('请先预览本次调整后的方案')
  const event = {
    ...makeFeedback(interaction, original, decision),
    humanEdit: decision === 'adopt' ? null : suggestions,
    finalResult: simulation,
    optionalUserNote: note,
    status: 'prepared' as const,
  }
  const nodes = useScene.getState().nodes
  await saveFeedback(event)
  signal.throwIfAborted()
  assertTheatreWritable()
  if (useScene.getState().nodes !== nodes) throw new Error('场景已经变化，请重新预览')
  currentContext(interaction)
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((n) => n?.type === 'site')
  if (!site) throw new Error('场地尚未载入')
  const previous = site.metadata[DECISION_KEY]
  if (
    previous &&
    typeof previous === 'object' &&
    'proposalId' in previous &&
    previous.proposalId === original.proposalId
  )
    throw new Error('该方案已经采用，请勿重复提交')
  const next = StageSceneDocumentSchema.parse({ ...document, rehearsalSimulation: simulation })
  const receipt = {
    eventId: event.eventId,
    proposalId: original.proposalId,
    interactionId: interaction.interactionId,
  }
  state.applyNodeChanges({
    update: [
      {
        id: site.id,
        data: {
          metadata: { ...site.metadata, [THEATRE_METADATA_KEY]: next, [DECISION_KEY]: receipt },
        },
      },
    ],
  })
  clearProposalGhost()
  // The prepared event and scene receipt survive interruption between these two independent stores.
  await waitForLocalScene(
    interaction.sceneId,
    (saved) => {
      const node = saved[site.id]
      if (!node || typeof node !== 'object' || !('metadata' in node)) return false
      const metadata = node.metadata as Record<string, unknown>
      return (
        JSON.stringify(metadata[DECISION_KEY]) === JSON.stringify(receipt) &&
        JSON.stringify(metadata[THEATRE_METADATA_KEY]) === JSON.stringify(next)
      )
    },
    signal,
  )
  await saveFeedback({ ...event, status: 'applied' })
  return event
}
