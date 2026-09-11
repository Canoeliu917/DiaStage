import { useScene } from '@pascal-app/core'
import { createStore } from 'zustand/vanilla'
import { readStageDocument } from '../theatre/simulation-store'
import {
  applyHumanDecision,
  clearProposalGhost,
  isCommittedRehearsalDecision,
  makeFeedback,
  previewProposal,
  useProposalGhost,
} from './authority'
import { buildRehearsalContext } from './context'
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
  type ProductEvent,
  readConversation,
  saveConversation,
  saveProductEvent,
} from './conversation-storage'
import { readFeedbackLog, saveFeedback, saveInteraction } from './feedback'
import { requestProposal } from './proposal-client'
import { createInteraction } from './proposal-generator'
import type { Interaction, RehearsalProposal, Suggestion } from './schema'
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
  ) {}

  currentContext() {
    const document = readStageDocument()
    if (!document) throw new Error('请先建立剧目并添加人物。')
    const state = this.store.getState()
    return buildRehearsalContext(this.sceneId, document, useScene.getState().nodes, {
      intention: state.draft.trim() || '看看当前排演',
      script: state.script,
      directorIntention: state.directorIntention,
      selectedPerformerId: this.selectedId(),
    })
  }

  async load() {
    const epoch = ++this.epoch
    this.disposed = false
    try {
      const synthetic = isSyntheticDemoScene(useScene.getState().nodes)
      this.store.setState({ synthetic, script: synthetic ? SYNTHETIC_DEMO_SCRIPT : '' })
      const [saved, log] = await Promise.all([
        readConversation(this.sceneId),
        readFeedbackLog(this.sceneId),
      ])
      if (this.disposed || epoch !== this.epoch) return
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
      this.revision = saved?.storageRevision ?? 0
      const thread = saved?.thread ?? createRehearsalThread(this.sceneId, version)
      const interrupted = ['understanding', 'proposing', 'compiling', 'applying'].includes(
        thread.status,
      )
      if (interrupted) thread.status = 'failed'
      else if (['ghost-ready', 'waiting-human'].includes(thread.status))
        thread.status = 'proposal-ready'
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
            }
          : { draft: synthetic ? readSyntheticDemoIntention(this.sceneId) : '' }),
        thread,
        interaction,
        ready: true,
        notice: interrupted
          ? '上次请求已中断，正式舞台以本机保存结果为准。请重新发送或预览。'
          : saved
            ? '已恢复这场对话。预览不会自动重放，采用前请重新在舞台上试试。'
            : '',
      })
      await this.persist()
      if (this.disposed || epoch !== this.epoch) return
      this.unsubscribe = useScene.subscribe((next, previous) => {
        if (next.nodes === previous.nodes || this.disposed) return
        const state = this.store.getState()
        if (!state.interaction && !state.busy) return
        if (state.thread?.status === 'applying') return
        try {
          if (
            this.currentContext().sceneVersion === state.interaction?.inputContext.sceneVersion &&
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
          this.status('failed', '预演已停止，不能采用。请重新预演，手动排演仍可使用。')
          void this.persist().catch((error) => this.fail(error))
        }
      })
    } catch (error) {
      this.fail(error)
    }
  }

  patch(patch: Partial<Pick<DiaView, 'draft' | 'script' | 'directorIntention' | 'note'>>) {
    this.store.setState(patch)
    clearTimeout(this.draftTimer)
    this.draftTimer = setTimeout(() => {
      void this.persist().catch((error) => this.fail(error))
    }, 600)
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
    })
    const task = this.queue.then(async () => {
      this.revision = await saveConversation({ ...record, storageRevision: this.revision })
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
        interactionId: interaction?.interactionId ?? null,
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
    this.store.setState({ busy: false })
    this.status(
      'failed',
      error instanceof Error
        ? error.message
        : 'Dia 暂时没有生成可执行方案。舞台没有被修改，可以换一种说法，或继续手动排演。',
    )
  }

  cancel(notice = '已停止。没有自动采用；你仍可以继续手动排演。', state: DiaStatus = 'idle') {
    this.request?.abort()
    this.request = null
    this.epoch++
    clearProposalGhost()
    this.store.setState({ busy: false })
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
    this.store.setState({ busy: true, draft: text.trim() })
    clearProposalGhost()
    this.status('understanding', '正在理解这一段……')
    try {
      const context = this.currentContext()
      this.store.setState({
        thread: { ...this.store.getState().thread!, sceneVersion: context.sceneVersion ?? '' },
      })
      const userMessage = this.message('user', text.trim(), context.sceneVersion ?? '')
      const current = this.store.getState()
      const conversation = conversationContext(
        current.thread!,
        current.interaction,
        current.thread!.selectedProposalId,
        userMessage,
        this.recentDecision,
        context.performers,
      )
      const input = { ...context, conversation }
      await this.persist()
      request.signal.throwIfAborted()
      await this.event('dia_message_sent')
      request.signal.throwIfAborted()
      this.status('proposing', '正在看当前人物关系，整理可以尝试的方向……')
      let next: Interaction
      if (state.synthetic) {
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
    if (this.store.getState().busy) return
    clearProposalGhost()
    this.store.setState({ suggestions, editing })
    this.status('proposal-ready', '已调整建议，请重新预演，再决定是否采用。')
    void this.persist().catch((error) => this.fail(error))
  }

  proposal(): RehearsalProposal | undefined {
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
  }
}
