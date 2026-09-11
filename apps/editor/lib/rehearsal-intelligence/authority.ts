import { subscribeSceneCommits, useScene } from '@pascal-app/core'
import { create } from 'zustand'
import {
  observeForeignSceneCommits,
  readLocalDecisionReceipt,
  subscribeLocalScene,
  waitForLocalScene,
} from '../scene-journal'
import { assertTheatreWritable, THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { type RehearsalSimulation, StageSceneDocumentSchema } from '../theatre/simulation'
import { readStageDocument } from '../theatre/simulation-store'
import { buildRehearsalContext } from './context'
import { saveProductEvent } from './conversation-storage'
import { readFeedback, readFeedbackLog, saveFeedback } from './feedback'
import { compileProposal } from './proposal-compiler'
import { validateProposal } from './proposal-validator'
import { type Feedback, type Interaction, type RehearsalProposal, SuggestionSchema } from './schema'

export const DECISION_KEY = 'diastageRehearsalDecision'
export const useProposalGhost = create<{
  sceneId: string | null
  proposalId: string | null
  simulation: RehearsalSimulation | null
  proposal: RehearsalProposal | null
  time: number
  visible: boolean
  playing: boolean
  feedbackError: string
}>(() => ({
  sceneId: null,
  proposalId: null,
  simulation: null,
  proposal: null,
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
    proposal: null,
    time: 0,
    visible: false,
    playing: false,
  })

let activeScene: { id: string; check: () => Promise<void> } | null = null
export function bindRehearsalScene(id: string, check: () => Promise<void>) {
  const session = { id, check }
  activeScene = session
  clearProposalGhost()
  const stop = observeForeignSceneCommits(id, clearProposalGhost)
  const stopScene = useScene.subscribe((next, previous) => {
    if (next.nodes !== previous.nodes) clearProposalGhost()
  })
  return () => {
    stop()
    stopScene()
    if (activeScene === session) {
      activeScene = null
      clearProposalGhost()
    }
  }
}

async function checkCurrentScene(id: string) {
  const session = activeScene
  if (!session || session.id !== id) throw new Error('当前场景已变化，请重新生成建议')
  await session.check()
  if (activeScene !== session) throw new Error('当前场景已变化，请重新生成建议')
}

export async function isCommittedRehearsalDecision(sceneId: string, event: Feedback) {
  if (event.sceneId !== sceneId || !['adopt', 'partial', 'edit'].includes(event.decision))
    return false
  if (event.status === 'applied') return true
  if (event.status !== 'prepared') return false
  const receipt = await readLocalDecisionReceipt(sceneId, event.eventId)
  return (
    receipt?.eventId === event.eventId &&
    receipt.proposalId === event.proposalId &&
    receipt.interactionId === event.interactionId
  )
}

/** Receipts reconcile interrupted feedback writes; preferences observe only durable scene commits. */
export function observeRehearsalFeedback(sceneId: string) {
  let queue = Promise.resolve()
  let previousEventId: string | null = null
  let initialized = false
  function recordUserChange(
    before: ReturnType<typeof useScene.getState>['nodes'],
    after: ReturnType<typeof useScene.getState>['nodes'],
    name: 'post_adopt_undo' | 'post_adopt_manual_edit',
  ) {
    if (activeScene?.id !== sceneId) return
    const site = Object.values(before).find((node) => node?.type === 'site')
    if (!site) return
    const next = after[site.id]
    if (next?.type !== 'site') return
    const receipt = site.metadata[DECISION_KEY]
    if (
      !receipt ||
      typeof receipt !== 'object' ||
      !('eventId' in receipt) ||
      typeof receipt.eventId !== 'string' ||
      !('proposalId' in receipt) ||
      !('interactionId' in receipt)
    )
      return
    const sameReceipt = JSON.stringify(receipt) === JSON.stringify(next.metadata[DECISION_KEY])
    if (name === 'post_adopt_manual_edit' && !sameReceipt) return
    const previousDocument = StageSceneDocumentSchema.safeParse(site.metadata[THEATRE_METADATA_KEY])
    const nextDocument = StageSceneDocumentSchema.safeParse(next.metadata[THEATRE_METADATA_KEY])
    if (
      !previousDocument.success ||
      !nextDocument.success ||
      (sameReceipt &&
        JSON.stringify(previousDocument.data.rehearsalSimulation) ===
          JSON.stringify(nextDocument.data.rehearsalSimulation))
    )
      return
    const eventId = receipt.eventId
    const createdAt = new Date().toISOString()
    queue = queue
      .then(async () => {
        const event = await readFeedback(eventId)
        if (
          !event ||
          event.proposalId !== receipt.proposalId ||
          event.interactionId !== receipt.interactionId ||
          !(await isCommittedRehearsalDecision(sceneId, event))
        )
          return
        await saveProductEvent({
          eventId: crypto.randomUUID(),
          sceneId,
          threadId: null,
          interactionId: event.interactionId,
          proposalId: event.proposalId,
          sceneVersion: '',
          createdAt,
          name,
          privateProjectData: true,
          trainingAuthorized: false,
          trainingEligible: false,
        })
      })
      .catch(() => {
        useProposalGhost.setState({
          feedbackError: '排演操作已保留，但产品事件未能保存；请检查浏览器存储空间。',
        })
      })
  }
  const stopChanges = subscribeSceneCommits((commit) => {
    if (commit.origin === 'local')
      recordUserChange(commit.before.nodes, commit.current.nodes, 'post_adopt_manual_edit')
  })
  let futureLength = useScene.temporal.getState().futureStates.length
  const stopHistory = useScene.temporal.subscribe((history) => {
    // Zundo moves the pre-Undo snapshot into futureStates; Redo and normal commits do not grow it.
    if (history.futureStates.length > futureLength) {
      const before = history.futureStates[futureLength]
      if (before?.nodes)
        recordUserChange(before.nodes, useScene.getState().nodes, 'post_adopt_undo')
    }
    futureLength = history.futureStates.length
  })
  const stopLocal = subscribeLocalScene(sceneId, (nodes) => {
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
          const receiptEventId =
            receipt &&
            typeof receipt === 'object' &&
            'eventId' in receipt &&
            typeof receipt.eventId === 'string'
              ? receipt.eventId
              : null
          // A refresh can restore an older receipt after Undo; find the last committed decision once.
          if (!initialized) {
            for (const event of (await readFeedbackLog(sceneId)).events.reverse()) {
              if (await isCommittedRehearsalDecision(sceneId, event)) {
                previousEventId = event.eventId
                break
              }
            }
            initialized = true
          }
          if (!previousEventId && !receiptEventId) continue
          const eventIds = new Set([previousEventId, receiptEventId])
          previousEventId = receiptEventId ?? previousEventId
          const result = StageSceneDocumentSchema.parse(
            metadata[THEATRE_METADATA_KEY],
          ).rehearsalSimulation
          // Update the outgoing adoption too when Undo restores a previous adoption's receipt.
          for (const eventId of eventIds) {
            if (!eventId) continue
            const event = await readFeedback(eventId)
            if (!event || !(await isCommittedRehearsalDecision(sceneId, event))) continue
            if (event.status === 'prepared') await saveFeedback({ ...event, status: 'applied' })
            const manual = await readFeedback(`${event.eventId}:manual`)
            if (
              JSON.stringify(manual?.finalResult ?? event.finalResult) !== JSON.stringify(result)
            ) {
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
        }
        useProposalGhost.setState({ feedbackError: '' })
      })
      .catch(() => {
        useProposalGhost.setState({
          feedbackError: '排演已保存，但反馈记录未能更新；请检查浏览器存储空间。',
        })
      })
  })
  return () => {
    stopChanges()
    stopHistory()
    stopLocal()
  }
}

function currentContext(interaction: Interaction) {
  if (activeScene?.id !== interaction.sceneId) throw new Error('当前场景已变化，请重新生成建议')
  const document = readStageDocument()
  if (!document || document.production.id !== interaction.inputContext.productionId)
    throw new Error('当前剧目已变化，请重新生成建议')
  const context = buildRehearsalContext(
    interaction.sceneId,
    document,
    useScene.getState().nodes,
    interaction.inputContext,
  )
  const comparable = { ...context }
  if (interaction.inputContext.sceneVersion === undefined) delete comparable.sceneVersion
  if (JSON.stringify(comparable) !== JSON.stringify(interaction.inputContext))
    throw new Error('人物、路线或布景已变化，请重新生成建议，避免覆盖你的调整')
  return { document, context }
}
export function makeFeedback(
  interaction: Interaction,
  proposal: RehearsalProposal,
  decision: Feedback['decision'],
): Feedback {
  const ghost = useProposalGhost.getState()
  const previewed =
    ghost.sceneId === interaction.sceneId && ghost.proposalId === proposal.proposalId
  const previewedProposal = previewed ? ghost.proposal : null
  return {
    eventId: crypto.randomUUID(),
    interactionId: interaction.interactionId,
    sceneId: interaction.sceneId,
    proposalId: proposal.proposalId,
    createdAt: new Date().toISOString(),
    previewed,
    decision,
    originalProposal: proposal,
    previewedProposal,
    privateProjectData: true,
    trainingAuthorized: false,
    rightsStatus: interaction.rightsStatus,
    trainingEligible: false,
    humanEdit:
      previewedProposal &&
      JSON.stringify(previewedProposal.suggestions) !== JSON.stringify(proposal.suggestions)
        ? previewedProposal.suggestions
        : null,
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
  clearProposalGhost()
  signal?.throwIfAborted()
  await checkCurrentScene(interaction.sceneId)
  const { context } = currentContext(interaction)
  const simulation = compileProposal(context, validateProposal(context, proposal))
  const original = interaction.proposals.find((p) => p.proposalId === proposal.proposalId)
  if (!original) throw new Error('未找到原始建议')
  const event = makeFeedback(interaction, original, 'preview')
  await saveFeedback({
    ...event,
    previewed: true,
    previewedProposal: proposal,
    humanEdit:
      JSON.stringify(original.suggestions) === JSON.stringify(proposal.suggestions)
        ? null
        : proposal.suggestions,
    finalResult: simulation,
  })
  signal?.throwIfAborted()
  await checkCurrentScene(interaction.sceneId)
  signal?.throwIfAborted()
  currentContext(interaction)
  useProposalGhost.setState({
    sceneId: interaction.sceneId,
    proposalId: proposal.proposalId,
    simulation,
    proposal,
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
  try {
    return await commitHumanDecision(interaction, original, decision, suggestions, note, signal)
  } catch (error) {
    clearProposalGhost()
    throw error
  }
}

async function commitHumanDecision(
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
    JSON.stringify(ghost.proposal) !== JSON.stringify(changed) ||
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
  await checkCurrentScene(interaction.sceneId)
  signal.throwIfAborted()
  assertTheatreWritable()
  if (useScene.getState().nodes !== nodes) throw new Error('场景已经变化，请重新预览')
  const liveGhost = useProposalGhost.getState()
  if (liveGhost.simulation !== ghost.simulation || liveGhost.proposal !== ghost.proposal)
    throw new Error('建议预览已经停止，请重新预览再采用')
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
