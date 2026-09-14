import { useScene } from '@pascal-app/core'
import {
  compileStagePlan,
  parseStageText,
  type StagePlan,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { createStore } from 'zustand/vanilla'
import { waitForLocalScene } from '../scene-journal'
import { sceneContentVersion } from '../scene-signature'
import { executeStageCommands } from '../stage/command-executor'
import { currentStageContext, stageSite } from '../stage/context'
import { draftContext, mergeDraftPlan } from '../stage/creation-policy'
import { groundStageAssets } from '../stage/ground-assets'
import { useStagePlanPreview } from '../stage/plan-preview'
import { SCENERY_LIBRARY } from '../stage/scenery'
import { assertTheatreWritable } from '../theatre/scene-adapter'
import { readStageDocument } from '../theatre/simulation-store'
import {
  applyHumanDecision,
  checkCurrentScene,
  clearProposalGhost,
  isCommittedRehearsalDecision,
  makeFeedback,
  previewProposal,
  useProposalGhost,
} from './authority'
import {
  buildFeedbackEvent,
  committedBuild,
  reconcileBuildFeedback,
  saveBuildFeedback,
} from './build-feedback'
import { buildDiaContext } from './context'
import {
  conversationContext,
  createRehearsalThread,
  type DiaStatus,
  proposalActionSignature,
  type RehearsalThread,
  sceneFactsVersion,
  type ThreadMessage,
} from './conversation'
import {
  ConversationDraftSchema,
  type ProductEvent,
  readConversation,
  saveConversation,
  saveProductEvent,
} from './conversation-storage'
import { type DiaBuildProposal, diaIntent, discussStage } from './dia-backbone'
import { readFeedbackLog, saveFeedback, saveInteraction } from './feedback'
import { type InteractionEnvelope, InteractionEnvelopeSchema } from './interaction-envelope'
import { groundLanguage, recordGroundingCorrection } from './language-grounding'
import { LOCAL_REHEARSAL_MODEL_VERSION, localRehearsalOutput } from './local-rehearsal'
import { requestProposal } from './proposal-client'
import { createInteraction } from './proposal-generator'
import type { Interaction, RehearsalProposal, Suggestion } from './schema'
import type { StagePlacementProposal } from './stage-placement-actions'
import {
  isSyntheticDemoScene,
  readSyntheticDemoIntention,
  SYNTHETIC_DEMO_MODEL_VERSION,
  SYNTHETIC_DEMO_SCRIPT,
  syntheticConversationOutput,
} from './synthetic-demo'

export type DiaView = {
  thread: RehearsalThread | null
  interaction: Interaction | null
  suggestions: Suggestion[]
  editing: boolean
  script: string
  directorIntention: string
  draft: string
  note: string
  busy: boolean
  ready: boolean
  notice: string
  synthetic: boolean
  builds: DiaBuildProposal[]
  activeBuildId: string | null
  placementProposal: StagePlacementProposal | null
}

/** One controller owns a scene's requests; the panel and paired remote share it. */
export class DiaConversation {
  readonly store = createStore<DiaView>(() => ({
    thread: null,
    interaction: null,
    suggestions: [],
    editing: false,
    script: '',
    directorIntention: '',
    draft: '',
    note: '',
    busy: false,
    ready: false,
    notice: '',
    synthetic: false,
    builds: [],
    activeBuildId: null,
    placementProposal: null,
  }))
  private revision = 0
  private queue = Promise.resolve()
  private request: AbortController | null = null
  private epoch = 0
  private disposed = false
  private draftTimer: ReturnType<typeof setTimeout> | undefined
  private unsubscribe: (() => void) | undefined
  private stopGhost: (() => void) | undefined
  private recentDecision: Parameters<typeof conversationContext>[4]

  constructor(
    readonly sceneId: string,
    private readonly selectedId: () => string | null,
    private readonly navigate?: (panel: 'versions' | 'remount' | 'items') => void,
    readonly rehearsalEnabled = true,
  ) {}

  currentContext() {
    const document = readStageDocument()
    if (!document) throw new Error('请先建立舞台。')
    const state = this.store.getState()
    return buildDiaContext(this.sceneId, document, useScene.getState().nodes, {
      intention: state.draft.trim() || '看看当前舞台',
      script: state.script,
      directorIntention: state.directorIntention,
      selectedPerformerId: this.selectedId(),
    })
  }

  async load() {
    const epoch = ++this.epoch
    this.disposed = false
    try {
      const synthetic = this.rehearsalEnabled && isSyntheticDemoScene(useScene.getState().nodes)
      this.store.setState({ synthetic, script: synthetic ? SYNTHETIC_DEMO_SCRIPT : '' })
      const [saved, log] = await Promise.all([
        readConversation(this.sceneId),
        readFeedbackLog(this.sceneId),
      ])
      if (this.disposed || epoch !== this.epoch) return
      const committedBuilds = await reconcileBuildFeedback(this.sceneId, useScene.getState().nodes)
      if (saved)
        saved.builds = saved.builds.map((proposal) => {
          const receipt = committedBuilds.find((event) => event.interactionId === proposal.id)
          return receipt
            ? {
                ...proposal,
                status: 'applied',
                finalSceneVersion: receipt.resultSceneVersion ?? proposal.finalSceneVersion,
                ...(proposal.envelope
                  ? { envelope: { ...proposal.envelope, status: 'applied' } }
                  : {}),
              }
            : proposal
        })
      let version = 'stage-not-ready'
      try {
        version = this.currentContext().sceneVersion ?? version
      } catch {
        /* Users can add their first performer after opening Dia. */
      }
      const interaction = saved
        ? (log.interactions.find((i) => i.interactionId === saved.thread.activeInteractionId) ??
          null)
        : null
      const build = saved?.builds.find((p) => p.id === saved.activeBuildId)
      this.revision = saved?.storageRevision ?? 0
      const thread = saved?.thread ?? createRehearsalThread(this.sceneId, version)
      const interrupted = ['understanding', 'proposing', 'compiling', 'applying'].includes(
        thread.status,
      )
      if (interrupted) thread.status = 'failed'
      else if (['ghost-ready', 'waiting-human'].includes(thread.status))
        thread.status = 'proposal-ready'
      if (build?.status === 'applied') thread.status = 'applied'
      const stale =
        !!(interaction || build) &&
        thread.status === 'proposal-ready' &&
        (build?.sceneVersion ??
          interaction?.inputContext.sceneVersion ??
          (interaction ? sceneFactsVersion(interaction.inputContext) : '')) !== version
      if (stale) thread.status = 'stale'
      this.recentDecision = undefined
      for (const event of [...log.events].reverse()) {
        const previous = log.interactions.find((i) => i.interactionId === event.interactionId)
        if (!previous) continue
        if (
          (event.decision === 'reject' && event.status === 'recorded') ||
          (await isCommittedRehearsalDecision(this.sceneId, event))
        ) {
          this.recentDecision = {
            decision: event.decision,
            proposalId: event.proposalId,
            sceneVersion:
              previous.inputContext.sceneVersion ?? sceneFactsVersion(previous.inputContext),
            note: event.optionalUserNote,
          }
          break
        }
      }
      if (this.disposed || epoch !== this.epoch) return
      this.store.setState({
        ...(saved
          ? {
              script: saved.script,
              directorIntention: saved.directorIntention,
              draft: saved.draft,
              suggestions: saved.suggestions,
              editing: saved.editing,
              note: saved.note,
              builds: saved.builds,
              activeBuildId: saved.activeBuildId,
            }
          : { draft: synthetic ? readSyntheticDemoIntention(this.sceneId) : '' }),
        thread,
        interaction,
        ready: true,
        notice: stale
          ? '舞台已经变化，旧方案已失效。已保存对话保留，请重新生成。'
          : interrupted
            ? '上次请求已中断，正式舞台以本机保存结果为准。请重新发送或预览。'
            : saved
              ? '已恢复这场对话。预览不会自动重放，采用前请重新在舞台上试试。'
              : '',
      })
      if (typeof sessionStorage !== 'undefined') {
        try {
          const raw = sessionStorage.getItem(this.draftKey)
          if (raw) this.store.setState(ConversationDraftSchema.parse(JSON.parse(raw)))
        } catch {
          this.store.setState({
            notice: '草稿未能恢复。已保存对话与正式舞台仍保留，请检查浏览器存储。',
          })
        }
      }
      await this.persist()
      if (this.disposed || epoch !== this.epoch) return
      this.unsubscribe = useScene.subscribe((next, previous) => {
        if (next.nodes === previous.nodes || this.disposed) return
        const state = this.store.getState()
        if (!state.interaction && !this.buildProposal() && !state.busy) return
        if (state.thread?.status === 'applying') return
        try {
          if (
            this.currentContext().sceneVersion ===
              (this.buildProposal()?.sceneVersion ??
                state.interaction?.inputContext.sceneVersion) &&
            !state.busy
          )
            return
        } catch {
          /* A deleted performer also invalidates a pending proposal. */
        }
        this.cancel('舞台已经变化，请重新生成。', 'stale')
      })
      this.stopGhost = useProposalGhost.subscribe((next, previous) => {
        const state = this.store.getState()
        if (
          previous.proposalId &&
          !next.proposalId &&
          !state.busy &&
          state.thread?.status === 'waiting-human'
        ) {
          this.status('failed', '预演已停止，不能采用。请重新预演，手动置景仍可使用。')
          void this.persist().catch((error) => this.fail(error))
        }
      })
    } catch (error) {
      this.fail(error)
    }
  }

  patch(patch: Partial<Pick<DiaView, 'draft' | 'script' | 'directorIntention' | 'note'>>) {
    this.store.setState(patch)
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(
          this.draftKey,
          JSON.stringify(ConversationDraftSchema.parse(this.store.getState())),
        )
      } catch {
        this.store.setState({
          notice: '草稿暂未保存在本机，请保留页面或复制文字后再刷新。舞台保存仍可使用。',
        })
      }
    }
    clearTimeout(this.draftTimer)
    this.draftTimer = setTimeout(() => {
      void this.persist().catch((error) => this.fail(error))
    }, 600)
  }

  private get draftKey() {
    return `diastage:dia-draft:${this.sceneId}`
  }

  async deleteMessage(messageId: string) {
    const { thread, ready } = this.store.getState()
    if (this.disposed || !ready || !thread) return
    const messages = thread.messages.filter((message) => message.messageId !== messageId)
    if (messages.length === thread.messages.length) return
    this.store.setState({
      thread: { ...thread, messages, updatedAt: new Date().toISOString() },
    })
    try {
      await this.persist()
    } catch {
      this.store.setState({
        notice: '对话删除暂未保存在本机，刷新可能恢复这条记录。请检查浏览器存储后继续。',
      })
    }
  }

  private status(status: DiaStatus, notice: string) {
    const thread = this.store.getState().thread
    this.store.setState({
      notice,
      ...(thread ? { thread: { ...thread, status, updatedAt: new Date().toISOString() } } : {}),
    })
  }

  private message(
    role: ThreadMessage['role'],
    content: string,
    sceneVersion: string,
    interaction?: Interaction,
  ) {
    const thread = this.store.getState().thread
    if (!thread) throw new Error('对话正在载入，请稍后发送。')
    const message: ThreadMessage = {
      messageId: crypto.randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
      sceneVersion,
      ...(interaction
        ? {
            interactionId: interaction.interactionId,
            proposalIds: interaction.proposals.map((p) => p.proposalId),
          }
        : {}),
    }
    this.store.setState({
      thread: { ...thread, updatedAt: message.createdAt, messages: [...thread.messages, message] },
    })
    return message
  }

  private persist() {
    const state = this.store.getState()
    if (!state.thread || this.disposed) return Promise.resolve()
    const record = structuredClone({
      sceneId: this.sceneId,
      thread: state.thread,
      draft: state.draft,
      script: state.script,
      directorIntention: state.directorIntention,
      suggestions: state.suggestions,
      editing: state.editing,
      note: state.note,
      builds: state.builds,
      activeBuildId: state.activeBuildId,
    })
    const task = this.queue.then(async () => {
      this.revision = await saveConversation({ ...record, storageRevision: this.revision })
      if (
        typeof sessionStorage !== 'undefined' &&
        JSON.stringify(ConversationDraftSchema.parse(this.store.getState())) ===
          JSON.stringify(ConversationDraftSchema.parse(record))
      ) {
        try {
          sessionStorage.removeItem(this.draftKey)
        } catch {
          /* The durable record already contains these inputs. */
        }
      }
    })
    this.queue = task.catch(() => {})
    return task
  }

  private async event(name: ProductEvent['name'], proposalId?: string) {
    const { thread, interaction } = this.store.getState()
    try {
      await saveProductEvent({
        eventId: crypto.randomUUID(),
        sceneId: this.sceneId,
        threadId: thread?.threadId ?? null,
        interactionId: this.buildProposal()?.id ?? interaction?.interactionId ?? null,
        proposalId: proposalId ?? thread?.selectedProposalId ?? null,
        sceneVersion: thread?.sceneVersion ?? '',
        createdAt: new Date().toISOString(),
        name,
        privateProjectData: true,
        trainingAuthorized: false,
        trainingEligible: false,
      })
    } catch {
      this.store.setState({
        notice: '舞台保持当前状态，但本机产品事件未能保存，请检查浏览器存储空间。',
      })
    }
  }

  private fail(error: unknown) {
    this.store.setState({ busy: false, placementProposal: null })
    this.status(
      'failed',
      error instanceof Error
        ? error.message
        : 'Dia 暂时没有生成可执行方案。舞台没有被修改，可以换一种说法，或继续手动置景。',
    )
  }

  cancel(notice = '已停止。没有自动采用；你仍可以继续手动置景。', state: DiaStatus = 'idle') {
    this.request?.abort()
    this.request = null
    this.epoch++
    clearProposalGhost()
    useStagePlanPreview.setState({ plan: null })
    this.store.setState({ busy: false, placementProposal: null })
    this.status(state, notice)
    const thread = this.store.getState().thread
    if (thread) this.message('system-state', notice, thread.sceneVersion)
    void this.persist().catch((error) => this.fail(error))
  }

  async send(text = this.store.getState().draft) {
    const state = this.store.getState()
    if (state.busy || !state.ready || !state.thread || !text.trim()) return
    const request = new AbortController(),
      epoch = ++this.epoch
    this.request = request
    this.store.setState({ busy: true, draft: text.trim(), placementProposal: null })
    const viewOnly = groundLanguage(text.trim(), currentStageContext())?.capability === 'view'
    if (!viewOnly) {
      clearProposalGhost()
      useStagePlanPreview.setState({ plan: null })
      this.status('understanding', '正在理解这一段……')
    }
    try {
      const context = this.currentContext()
      this.store.setState({
        thread: { ...this.store.getState().thread!, sceneVersion: context.sceneVersion ?? '' },
      })
      const userMessage = this.message('user', text.trim(), context.sceneVersion ?? '')
      await this.persist()
      request.signal.throwIfAborted()
      await this.event('dia_message_sent')
      request.signal.throwIfAborted()
      if (await this.routeBackbone(text.trim(), request.signal)) return
      request.signal.throwIfAborted()
      const current = this.store.getState()
      const selectedProposalId =
        current.interaction?.proposals.find(
          (proposal) => proposal.proposalId === current.thread!.selectedProposalId,
        )?.proposalId ?? null
      this.store.setState({
        activeBuildId: null,
        thread: {
          ...current.thread!,
          selectedProposalId,
          activeInteractionId: current.interaction?.interactionId ?? null,
        },
      })
      const conversation = conversationContext(
        current.thread!,
        current.interaction,
        selectedProposalId,
        userMessage,
        this.recentDecision,
        context.performers,
      )
      const input = { ...context, conversation }
      await this.persist()
      request.signal.throwIfAborted()
      this.status('proposing', '正在看当前人物关系，整理可以尝试的方向……')
      let next: Interaction
      const local = localRehearsalOutput(input)
      if (local) next = createInteraction(input, local, LOCAL_REHEARSAL_MODEL_VERSION)
      else if (state.synthetic) {
        await new Promise((resolve) => setTimeout(resolve, 350))
        request.signal.throwIfAborted()
        next = createInteraction(
          input,
          syntheticConversationOutput(input, state.thread.rejectedProposalSignatures.length),
          SYNTHETIC_DEMO_MODEL_VERSION,
        )
      } else next = await requestProposal(input, request.signal)
      if (this.disposed || epoch !== this.epoch || request.signal.aborted) return
      if (this.currentContext().sceneVersion !== context.sceneVersion) {
        this.cancel('舞台已经变化，请重新生成。', 'stale')
        return
      }
      await saveInteraction(next)
      if (this.disposed || epoch !== this.epoch || request.signal.aborted) return
      const thread = this.store.getState().thread!
      this.store.setState({
        interaction: next,
        activeBuildId: null,
        suggestions: structuredClone(next.proposals[0]!.suggestions),
        editing: false,
        note: '',
        draft: '',
        thread: {
          ...thread,
          sceneVersion: context.sceneVersion ?? '',
          activeInteractionId: next.interactionId,
          selectedProposalId: next.proposals[0]!.proposalId,
        },
      })
      this.message(
        'dia',
        next.proposals
          .map((p, i) => `方案 ${String(i + 1).padStart(2, '0')} · ${p.title}：${p.intention}`)
          .join('\n'),
        context.sceneVersion ?? '',
        next,
      )
      this.status('proposal-ready', '可以先在舞台上试试，再决定是否采用。')
      await this.persist()
      await this.event('proposal_generated')
    } catch (error) {
      if (!this.disposed && epoch === this.epoch) {
        clearProposalGhost()
        this.fail(error)
        await this.persist().catch(() => {})
      }
    } finally {
      if (epoch === this.epoch && !this.disposed) {
        this.request = null
        this.store.setState({ busy: false })
      }
    }
  }

  choose(proposalId: string) {
    if (!this.rehearsalEnabled) return
    if (proposalId === this.buildProposal()?.id) return
    const state = this.store.getState(),
      proposal = state.interaction?.proposals.find((p) => p.proposalId === proposalId)
    if (!proposal || !state.thread || state.busy) return
    clearProposalGhost()
    this.store.setState({
      suggestions: structuredClone(proposal.suggestions),
      editing: false,
      note: '',
      thread: { ...state.thread, selectedProposalId: proposalId },
    })
    this.status('proposal-ready', '已选择方案，先预演再决定。')
    void this.persist().catch((error) => this.fail(error))
    void this.event('proposal_switched', proposalId)
  }

  edit(suggestions: Suggestion[], editing: boolean) {
    if (!this.rehearsalEnabled) return
    if (this.store.getState().busy) return
    clearProposalGhost()
    this.store.setState({ suggestions, editing })
    this.status('proposal-ready', '已调整建议，请重新预演，再决定是否采用。')
    void this.persist().catch((error) => this.fail(error))
  }

  proposal(): RehearsalProposal | undefined {
    if (!this.rehearsalEnabled) return undefined
    const state = this.store.getState()
    return state.interaction?.proposals.find(
      (p) => p.proposalId === state.thread?.selectedProposalId,
    )
  }

  private async act(status: DiaStatus, action: (signal: AbortSignal) => Promise<void>) {
    if (this.store.getState().busy || !this.store.getState().ready) return
    const epoch = ++this.epoch,
      request = new AbortController()
    this.request = request
    this.store.setState({ busy: true })
    this.status(status, status === 'compiling' ? '正在准备舞台预演……' : '正在保存你的决定……')
    try {
      await action(request.signal)
      if (!this.disposed && epoch === this.epoch) await this.persist()
    } catch (error) {
      if (!this.disposed && epoch === this.epoch) {
        clearProposalGhost()
        this.fail(error)
        await this.persist().catch(() => {})
      }
    } finally {
      if (!this.disposed && epoch === this.epoch) {
        this.request = null
        this.store.setState({ busy: false })
      }
    }
  }

  preview() {
    if (this.buildProposal()) return this.previewBuild(this.buildProposal()!.plan)
    if (!this.rehearsalEnabled) return
    return this.act('compiling', async (signal) => {
      const state = this.store.getState(),
        proposal = this.proposal()
      if (!proposal || !state.interaction) throw new Error('请先选择方案。')
      await previewProposal(
        state.interaction,
        { ...proposal, suggestions: state.suggestions },
        signal,
      )
      signal.throwIfAborted()
      this.status('ghost-ready', '半透明人物与虚线是建议，正式舞台没有改变。')
      await this.event('proposal_previewed')
      signal.throwIfAborted()
      this.status('waiting-human', '已在舞台预演，等待你的决定。')
    })
  }

  adopt() {
    if (this.buildProposal()) return this.adoptBuild(this.buildProposal()!.plan)
    if (!this.rehearsalEnabled) return
    return this.act('applying', async (signal) => {
      const state = this.store.getState(),
        proposal = this.proposal()
      if (!state.interaction || !proposal) throw new Error('请先选择方案。')
      const decision = state.editing
        ? 'edit'
        : state.suggestions.length === proposal.suggestions.length
          ? 'adopt'
          : 'partial'
      await applyHumanDecision(
        state.interaction,
        proposal,
        decision,
        state.suggestions,
        state.note,
        signal,
      )
      signal.throwIfAborted()
      this.recentDecision = {
        decision,
        proposalId: proposal.proposalId,
        sceneVersion: state.interaction.inputContext.sceneVersion ?? '',
        note: state.note,
      }
      this.message(
        'system-state',
        '已采用，本机已保存。可用撤销恢复到采用前。',
        this.currentContext().sceneVersion ?? '',
      )
      this.status('applied', '已采用，本机已保存。你可以继续调整，或再问 Dia。')
      await this.event(
        decision === 'partial'
          ? 'proposal_partial'
          : decision === 'edit'
            ? 'proposal_edited'
            : 'proposal_adopted',
      )
    })
  }

  reject() {
    if (this.buildProposal()) return this.rejectBuild()
    if (!this.rehearsalEnabled) return
    return this.act('waiting-human', async (signal) => {
      const state = this.store.getState(),
        proposal = this.proposal()
      if (!state.interaction || !proposal || !state.thread) throw new Error('请先选择方案。')
      const event = makeFeedback(state.interaction, proposal, 'reject')
      clearProposalGhost()
      await saveFeedback({
        ...event,
        optionalUserNote: state.note,
        humanEdit:
          JSON.stringify(state.suggestions) === JSON.stringify(proposal.suggestions)
            ? null
            : state.suggestions,
      })
      signal.throwIfAborted()
      this.recentDecision = {
        decision: 'reject',
        proposalId: proposal.proposalId,
        sceneVersion: state.thread.sceneVersion,
        note: state.note,
      }
      this.store.setState({
        thread: {
          ...this.store.getState().thread!,
          rejectedProposalSignatures: [
            ...state.thread.rejectedProposalSignatures,
            proposalActionSignature(proposal),
          ].slice(-8),
        },
      })
      this.message('system-state', '已记录“不成立”，正式舞台没有改变。', state.thread.sceneVersion)
      this.status('rejected', '这个方向不成立。可以告诉我原因，或换几个方向。')
      await this.event('proposal_rejected')
    })
  }

  dispose() {
    clearTimeout(this.draftTimer)
    this.disposed = true
    this.epoch++
    this.request?.abort()
    this.unsubscribe?.()
    this.stopGhost?.()
    clearProposalGhost()
    useStagePlanPreview.setState({ plan: null })
  }

  buildProposal() {
    const state = this.store.getState()
    return state.builds.find((p) => p.id === state.activeBuildId && this.buildInScope(p.plan))
  }

  private buildInScope(plan: StagePlan) {
    return (
      this.rehearsalEnabled ||
      plan.items.every((item) => !['camera', 'performer-marker'].includes(item.kind))
    )
  }

  private replaceBuild(proposal: DiaBuildProposal) {
    if (proposal.envelope)
      proposal = { ...proposal, envelope: { ...proposal.envelope, status: proposal.status } }
    this.store.setState((state) => ({
      builds: state.builds.map((p) => (p.id === proposal.id ? proposal : p)),
    }))
  }

  editBuild(plan: StagePlan) {
    if (!this.buildInScope(plan)) return
    const proposal = this.buildProposal()
    if (
      !proposal ||
      this.store.getState().busy ||
      ['applied', 'rejected'].includes(proposal.status)
    )
      return
    useStagePlanPreview.setState({ plan: null })
    this.replaceBuild({ ...proposal, plan, previewedPlan: null, status: 'proposed' })
    if (proposal.envelope)
      void saveBuildFeedback(buildFeedbackEvent(this.sceneId, this.buildProposal()!, 'edit')).catch(
        (error) => this.fail(error),
      )
    this.status('proposal-ready', '搭台建议已调整，先预演再采用。')
    void this.persist().catch((error) => this.fail(error))
  }

  private assertBuildCurrent(proposal: DiaBuildProposal) {
    if (this.currentContext().sceneVersion !== proposal.sceneVersion)
      throw new Error('舞台已经变化，请重新生成搭台方案。')
    const current = currentStageContext()
    if (
      JSON.stringify({ ...current, documentVersion: 0, selectedObjectIds: [] }) !==
      JSON.stringify({ ...proposal.context, documentVersion: 0, selectedObjectIds: [] })
    )
      throw new Error('布景或场地已经变化，请重新生成搭台方案。')
    return current
  }

  previewBuild(plan: StagePlan) {
    if (!this.buildInScope(plan)) return Promise.resolve()
    return this.act('compiling', async (signal) => {
      const proposal = this.buildProposal()
      if (!proposal || ['applied', 'rejected'].includes(proposal.status))
        throw new Error('请先生成新的搭台方案。')
      await checkCurrentScene(this.sceneId)
      signal.throwIfAborted()
      const current = this.assertBuildCurrent(proposal)
      const result = validateStagePlan(plan, current)
      if (!result.valid)
        throw new Error(result.warnings.map((w) => w.message).join('；') || '请先补齐方案信息。')
      const updated: DiaBuildProposal = {
        ...proposal,
        sceneId: this.sceneId,
        envelope: this.buildEnvelope(proposal, 'previewed'),
        plan: result.plan,
        previewedPlan: result.plan,
        status: 'previewed',
      }
      this.replaceBuild(updated)
      await saveBuildFeedback(buildFeedbackEvent(this.sceneId, updated, 'preview'))
      await this.persist()
      signal.throwIfAborted()
      this.assertBuildCurrent(proposal)
      useStagePlanPreview.setState({ plan: result.plan })
      this.status('waiting-human', '半透明布景是搭台建议，完整场地保持原样；确认后才落位。')
      await this.event('proposal_previewed')
    })
  }

  adoptBuild(plan: StagePlan) {
    if (!this.buildInScope(plan)) return Promise.resolve()
    return this.act('applying', async (signal) => {
      const proposal = this.buildProposal()
      const committed = proposal && (await committedBuild(this.sceneId, proposal.id))
      signal.throwIfAborted()
      if (proposal && committed) {
        await reconcileBuildFeedback(this.sceneId, useScene.getState().nodes)
        signal.throwIfAborted()
        this.replaceBuild({ ...proposal, status: 'applied' })
        this.status('applied', '该搭台方案已有正式回执；没有重复应用。撤销后的场景保持原样。')
        return
      }
      const preview = useStagePlanPreview.getState().plan
      if (
        proposal?.status !== 'previewed' ||
        JSON.stringify(preview) !== JSON.stringify(plan) ||
        JSON.stringify(proposal.previewedPlan) !== JSON.stringify(plan)
      )
        throw new Error('请先预演这次搭台调整，再确认采用。')
      await checkCurrentScene(this.sceneId)
      signal.throwIfAborted()
      assertTheatreWritable()
      this.assertBuildCurrent(proposal)
      const prepared = {
        ...proposal,
        status: 'prepared' as const,
        envelope: this.buildEnvelope(proposal, 'prepared'),
      }
      const feedback = buildFeedbackEvent(this.sceneId, prepared, 'adopt', 'prepared')
      this.replaceBuild(prepared)
      await saveBuildFeedback(feedback)
      await this.persist()
      signal.throwIfAborted()
      await checkCurrentScene(this.sceneId)
      signal.throwIfAborted()
      assertTheatreWritable()
      if (
        this.buildProposal()?.id !== proposal.id ||
        this.buildProposal()?.status !== 'prepared' ||
        useStagePlanPreview.getState().plan !== preview
      )
        throw new Error('搭台预演已经结束或变化，请重新预演后再采用。')
      const context = this.assertBuildCurrent(proposal)
      const compiled = compileStagePlan(plan, context, {
        transactionId: proposal.id,
        issuedAt: new Date().toISOString(),
      })
      if (!compiled.ok) throw new Error('搭台方案未通过边界与冲突检查。')
      const result = executeStageCommands(compiled.commands, undefined, prepared.envelope)
      if (!result.ok) throw new Error(result.error)
      useStagePlanPreview.setState({ plan: null })
      const siteId = stageSite().id
      const receipt = JSON.stringify(stageSite().metadata.stageTransaction)
      await waitForLocalScene(
        this.sceneId,
        (nodes) => {
          const node = nodes[siteId]
          return (
            !!node &&
            typeof node === 'object' &&
            'metadata' in node &&
            JSON.stringify((node.metadata as Record<string, unknown>).stageTransaction) === receipt
          )
        },
        signal,
      )
      await reconcileBuildFeedback(this.sceneId, useScene.getState().nodes)
      signal.throwIfAborted()
      this.replaceBuild({
        ...prepared,
        status: 'applied',
        finalSceneVersion: this.currentContext().sceneVersion ?? null,
      })
      this.message(
        'system-state',
        '搭台方案已采用，本机已保存，可一步撤销。',
        this.currentContext().sceneVersion ?? '',
      )
      this.status('applied', '搭台已保留。可以继续置景，或保存为一个版本。')
      await this.event('proposal_adopted')
    })
  }

  private rejectBuild() {
    return this.act('waiting-human', async (signal) => {
      const proposal = this.buildProposal()
      if (!proposal) return
      useStagePlanPreview.setState({ plan: null })
      this.replaceBuild({ ...proposal, status: 'rejected' })
      if (proposal.envelope)
        await saveBuildFeedback(buildFeedbackEvent(this.sceneId, this.buildProposal()!, 'reject'))
      signal.throwIfAborted()
      this.message('system-state', '已放下搭台建议，正式舞台没有改变。', proposal.sceneVersion)
      this.status('rejected', '已放下这个方向，可以重新告诉 Dia 想法。')
      await this.event('proposal_rejected')
    })
  }

  private async routeBackbone(text: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const previous = this.buildProposal()
    const context = this.currentContext()
    const formalContext = currentStageContext()
    const grounded = groundLanguage(
      text,
      previous &&
        ['proposed', 'previewed'].includes(previous.status) &&
        previous.sceneVersion === context.sceneVersion
        ? draftContext(formalContext, previous.plan)
        : formalContext,
    )
    const intent =
      grounded?.capability === 'build'
        ? 'build'
        : diaIntent(
            text,
            !!previous && ['proposed', 'previewed'].includes(previous.status),
            context.performers.map((performer) => performer.name),
          )
    const reply = async (content: string, viewOnly = false) => {
      if (viewOnly) this.store.setState({ draft: '' })
      else
        this.store.setState({
          interaction: null,
          activeBuildId: null,
          draft: '',
          thread: {
            ...this.store.getState().thread!,
            selectedProposalId: null,
            activeInteractionId: null,
          },
        })
      this.message('dia', content, context.sceneVersion ?? '')
      if (!viewOnly) this.status('idle', '舞台没有改变，可以继续讨论或手动操作。')
      await this.persist()
    }
    if (
      !this.rehearsalEnabled &&
      /排演|人物|角色|走位|路线|blocking|performer|rehears|character\s*movement|create_route|edit_route|face_performer/i.test(
        text,
      )
    ) {
      await reply('0.1 只开放置景、版本、复台预览与视图。请描述要调整的布景、场地或观察方向。')
      return true
    }
    if (/^(?:不对|不是|纠正|我说的不是|我是想)/.test(text) && typeof localStorage !== 'undefined') {
      const messages = this.store.getState().thread!.messages
      const previousInput = messages.filter((message) => message.role === 'user').at(-2)
      const interpretation = messages.filter((message) => message.role === 'dia').at(-1)
      if (previousInput)
        recordGroundingCorrection(localStorage, {
          sceneId: this.sceneId,
          UserInput: previousInput.content,
          DiaInterpretation: interpretation?.content ?? null,
          HumanCorrection: text,
          CorrectInterpretation: grounded,
          SceneContext: formalContext,
        })
    }
    if (grounded?.placement) {
      // Language-only drafts must not fall through into the legacy XYZ planner.
      this.store.setState({ placementProposal: grounded.placement })
      await reply(grounded.placement.message)
      return true
    }
    if (grounded?.clarificationRequired && grounded.capability !== 'build') {
      await reply(grounded.clarification!, grounded.capability === 'view')
      return true
    }
    if (grounded?.view) {
      const { runViewCommand } = await import('./view-runtime')
      signal.throwIfAborted()
      await reply(runViewCommand(this.sceneId, grounded.view), true)
      return true
    }
    if (intent === 'reflect') {
      await reply(
        this.rehearsalEnabled
          ? discussStage(
              context.performers.map((p) => p.name),
              context.paths.length,
            )
          : '先看布景的位置、朝向和间距。请指出具体物品及想调整的方向，我们先预演，再由你决定。',
      )
      return true
    }
    if (intent === 'mixed') {
      await reply(
        this.rehearsalEnabled
          ? '这句话同时涉及布景与人物。先预演并采用布景，再根据新的正式舞台安排人物，能避免站位依据过期。请先发送布景部分，或先说清要调整的人物；两步都需要你确认。'
          : '0.1 暂不安排人物行动。请单独描述布景调整，先预演再采用。',
      )
      return true
    }
    if (intent === 'version' || intent === 'remount') {
      const { listRehearsalVersions, openVersionPreview } = await import(
        '../theatre/rehearsal-versions'
      )
      signal.throwIfAborted()
      const versions = listRehearsalVersions()
      const ordinal = text.match(/第\s*([一二三四五六七八九]|\d+)\s*版/)
      const number = ordinal
        ? '一二三四五六七八九'.indexOf(ordinal[1]!) + 1 || Number(ordinal[1])
        : null
      const day = new Date()
      day.setDate(day.getDate() - 1)
      const matches = text.includes('昨天')
        ? versions.filter(
            (v) => new Date(v.createdAt).toLocaleDateString() === day.toLocaleDateString(),
          )
        : versions
      const selected = number ? matches[number - 1] : matches.find((v) => text.includes(v.name))
      if (selected) {
        if (intent === 'version') openVersionPreview(selected.id)
        else {
          const { prepareVersionRemount } = await import('../remount-scene')
          signal.throwIfAborted()
          prepareVersionRemount(this.sceneId, selected.id, {
            schemaVersion: 1,
            interactionId: crypto.randomUUID(),
            sceneId: this.sceneId,
            capability: 'remount',
            sceneVersion: context.sceneVersion!,
            status: 'proposed',
            createdAt: new Date().toISOString(),
          })
        }
      }
      this.navigate?.(intent === 'version' ? 'versions' : 'remount')
      await reply(
        selected
          ? `已打开「${selected.name}」的${intent === 'version' ? '历史预览' : '复台参考'}。当前正式舞台未被替换；${intent === 'version' ? '恢复需要在版本面板明确确认。' : '请填写目标场地并校准，查看完整映射后决定。'}`
          : `请在${intent === 'version' ? '版本' : '复台'}面板选择${intent === 'version' ? '已保存版本' : '来源版本和目标场地'}。${number ? '没有找到你指定的日期或序号，我不会猜测。' : ''}当前舞台没有改变。`,
      )
      return true
    }
    if (intent !== 'build') {
      if (this.rehearsalEnabled) return false
      await reply(
        '请描述布景的名称、方向与幅度，或查看版本、准备复台预览、调整视图。0.1 不生成排演提案。',
      )
      return true
    }
    this.navigate?.('items')
    if (this.store.getState().builds.length >= 200)
      throw new Error('本场已保留 200 次搭台建议，请先导出私有记录并开始新的场景。')
    const formal = currentStageContext()
    const parent =
      previous &&
      ['proposed', 'previewed'].includes(previous.status) &&
      previous.sceneVersion === context.sceneVersion
        ? previous
        : null
    const inputContext = parent ? draftContext(formal, parent.plan) : formal
    const parsed = parseStageText(grounded?.normalizedInput ?? text, inputContext)
    if (!parsed) {
      await reply(
        '这句话还不能可靠地转换成搭台方案。可以写“给我一张圆桌，两把椅子，台右一扇门”或“桌子往台左一点”；复杂空间关系请补充对象、方向和距离。我不会猜测坐标。',
      )
      return true
    }
    if (!this.buildInScope(parsed)) {
      await reply('0.1 只处理标准舞台布景；人物与制作机位保留为历史资料。')
      return true
    }
    const groundedPlan = groundStageAssets(
      parsed,
      SCENERY_LIBRARY.map(({ asset }) => asset.id),
    )
    if (groundedPlan.questions.length) {
      await reply(groundedPlan.questions.map((question) => question.message).join('；'))
      return true
    }
    const plan = parent
      ? mergeDraftPlan(parent.plan, groundedPlan, formal)
      : validateStagePlan(groundedPlan, formal).plan
    const proposal: DiaBuildProposal = {
      id: crypto.randomUUID(),
      parentId: parent?.id ?? null,
      createdAt: new Date().toISOString(),
      input: text,
      sceneVersion: context.sceneVersion!,
      sourceContentVersion: sceneContentVersion(useScene.getState()),
      context: formal,
      plan,
      originalPlan: structuredClone(plan),
      previewedPlan: null,
      status: 'proposed',
      finalSceneVersion: null,
      privateProjectData: true,
      trainingAuthorized: false,
    }
    proposal.sceneId = this.sceneId
    proposal.envelope = this.buildEnvelope(proposal, 'proposed')
    await saveBuildFeedback(
      buildFeedbackEvent(this.sceneId, proposal, parent ? 'revision' : 'proposal'),
    )
    signal.throwIfAborted()
    this.store.setState((state) => ({
      builds: [...state.builds, proposal],
      activeBuildId: proposal.id,
      interaction: null,
      draft: '',
      thread: {
        ...state.thread!,
        selectedProposalId: proposal.id,
        activeInteractionId: proposal.id,
      },
    }))
    const proposalMessage = this.message(
      'dia',
      `${parent ? '搭台修订' : '搭台建议'}：${plan.items.map((p) => p.displayName).join('、') || '场地调整'}。先在舞台上试试，再由你决定。${plan.questions.map((q) => q.message).join('；')}`,
      context.sceneVersion!,
    )
    this.store.setState((state) => ({
      thread: {
        ...state.thread!,
        messages: state.thread!.messages.map((message) =>
          message.messageId === proposalMessage.messageId
            ? { ...message, interactionId: proposal.id, proposalIds: [proposal.id] }
            : message,
        ),
      },
    }))
    this.status('proposal-ready', '搭台方案已准备好，正式舞台未改变。')
    await this.persist()
    await this.event('proposal_generated')
    return true
  }

  private buildEnvelope(
    proposal: DiaBuildProposal,
    status: InteractionEnvelope['status'],
  ): InteractionEnvelope {
    return InteractionEnvelopeSchema.parse({
      schemaVersion: 1,
      interactionId: proposal.id,
      sceneId: this.sceneId,
      capability: 'build',
      sceneVersion: proposal.sceneVersion,
      status,
      createdAt: proposal.createdAt,
      parentInteractionId: proposal.parentId,
    })
  }
}
