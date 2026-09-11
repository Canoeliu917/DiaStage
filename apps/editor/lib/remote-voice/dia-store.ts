import { RemoteVoiceApiError } from './api'
import {
  OwnerDiaResponseSchema,
  type RemoteDiaCommand,
  type RemoteDiaCommandInput,
  RemoteDiaCommandInputSchema,
  RemoteDiaPatchSchema,
  RemoteDiaResponseSchema,
  type RemoteDiaSnapshot,
} from './dia-protocol'
import { type RemoteVoiceSessionStore, remoteVoiceSessions } from './session-store'

type DiaChannel = {
  snapshot: RemoteDiaSnapshot | null
  publishedAt: string | null
  pendingCommand: RemoteDiaCommand | null
  nextSequence: number
  lastAcknowledgedSequence: number
  lastAcknowledgedDisposition: 'received' | 'rejected' | 'failed' | null
  summary: string | null
  requests: Map<string, RemoteDiaCommand>
}

export class RemoteDiaChannelStore {
  private readonly channels = new Map<string, DiaChannel>()

  constructor(
    private readonly sessions: RemoteVoiceSessionStore,
    private readonly now: () => number = Date.now,
  ) {
    sessions.onRevoke((id) => this.channels.delete(id))
  }

  ownerStatus(id: string, token: string | null) {
    const sceneId = this.sessions.sceneForRequest(id, token, 'owner')
    const session = this.sessions.ownerStatus(id, token)
    const { requests: _, ...channel } = this.channel(id)
    return OwnerDiaResponseSchema.parse({
      role: 'owner',
      status: { ...channel, sceneId, expiresAt: session.expiresAt, paired: session.paired },
    })
  }

  remoteStatus(id: string, token: string | null) {
    const sceneId = this.sessions.sceneForRequest(id, token, 'remote')
    const session = this.sessions.remoteStatus(id, token)
    const { requests: _, pendingCommand, ...channel } = this.channel(id)
    return RemoteDiaResponseSchema.parse({
      role: 'remote',
      status: {
        ...channel,
        sceneId,
        expiresAt: session.expiresAt,
        pendingSequence: pendingCommand?.sequence ?? null,
        ownerOnline: this.ownerOnline(channel.publishedAt),
      },
    })
  }

  publish(id: string, token: string | null, input: unknown) {
    const sceneId = this.sessions.sceneForRequest(id, token, 'owner')
    const parsed = RemoteDiaPatchSchema.safeParse(input)
    if (!parsed.success) throw new RemoteVoiceApiError('INVALID_REQUEST', 'Dia 状态字段无效。', 400)
    const { snapshot, acknowledgement } = parsed.data
    const channel = this.channel(id)
    if (snapshot && (!sceneId || snapshot.sceneId !== sceneId)) {
      throw new RemoteVoiceApiError('SCENE_MISMATCH', '此 Dia 状态不属于已配对舞台。', 409)
    }
    if (acknowledgement) {
      // A retry of an old acknowledgement cannot overwrite a newer published state.
      if (acknowledgement.sequence <= channel.lastAcknowledgedSequence)
        return this.ownerStatus(id, token)
      if (channel.pendingCommand?.sequence !== acknowledgement.sequence)
        throw new RemoteVoiceApiError('COMMAND_STALE', '这条 Dia 请求已经失效。', 409)
      channel.lastAcknowledgedSequence = acknowledgement.sequence
      channel.lastAcknowledgedDisposition = acknowledgement.disposition
      channel.summary = acknowledgement.summary ?? null
      channel.pendingCommand = null
    }
    if (snapshot) {
      channel.snapshot = snapshot
      channel.publishedAt = new Date(this.now()).toISOString()
    }
    return this.ownerStatus(id, token)
  }

  send(id: string, token: string | null, input: RemoteDiaCommandInput): RemoteDiaCommand {
    this.sessions.sceneForRequest(id, token, 'remote')
    this.sessions.remoteStatus(id, token)
    const parsed = RemoteDiaCommandInputSchema.safeParse(input)
    if (!parsed.success) throw new RemoteVoiceApiError('INVALID_REQUEST', 'Dia 请求字段无效。', 400)
    const command = parsed.data
    const channel = this.channel(id)
    const previous = channel.requests.get(command.requestId)
    if (previous) {
      const { createdAt: _, ...original } = previous
      if (JSON.stringify(original) !== JSON.stringify(command))
        throw new RemoteVoiceApiError('COMMAND_STALE', '同一请求不能更换内容。', 409)
      return structuredClone(previous)
    }
    const snapshot = channel.snapshot
    if (!snapshot || !this.ownerOnline(channel.publishedAt))
      throw new RemoteVoiceApiError('OWNER_OFFLINE', '电脑 Dia 暂未连接，请回到电脑打开 Dia。', 409)
    if (command.sequence !== channel.nextSequence || command.sceneVersion !== snapshot.sceneVersion)
      throw new RemoteVoiceApiError('COMMAND_STALE', '舞台已经变化，请刷新状态后重新发送。', 409)
    if (channel.pendingCommand && command.type !== 'cancel')
      throw new RemoteVoiceApiError('COMMAND_PENDING', '上一条请求仍在等待电脑接收。', 409)
    if (
      command.type === 'message' &&
      ['understanding', 'proposing', 'compiling', 'applying'].includes(snapshot.state)
    )
      throw new RemoteVoiceApiError('COMMAND_PENDING', 'Dia 正在处理，可以先停止再继续。', 409)
    if (command.type === 'select' || command.type === 'preview' || command.type === 'reject') {
      if (
        command.interactionId !== snapshot.interactionId ||
        !snapshot.proposals.some((proposal) => proposal.proposalId === command.proposalId) ||
        !['proposal-ready', 'ghost-ready', 'waiting-human'].includes(snapshot.state)
      )
        throw new RemoteVoiceApiError('COMMAND_STALE', '当前方案已经变化，请查看最新方案。', 409)
    }
    // Keep one final slot for stopping work when the session's request limit is reached.
    if (channel.requests.size >= (command.type === 'cancel' ? 129 : 128))
      throw new RemoteVoiceApiError('SESSION_LIMIT_REACHED', '本次对话连接已满，请重新配对。', 429)
    if (channel.pendingCommand) {
      channel.lastAcknowledgedSequence = channel.pendingCommand.sequence
      channel.lastAcknowledgedDisposition = 'rejected'
      channel.summary = '请求已被停止指令替代。'
    }
    const received = { ...command, createdAt: new Date(this.now()).toISOString() }
    channel.pendingCommand = received
    channel.requests.set(command.requestId, received)
    channel.nextSequence++
    return structuredClone(received)
  }

  private ownerOnline(publishedAt: string | null) {
    return publishedAt !== null && this.now() - Date.parse(publishedAt) <= 15_000
  }

  private channel(id: string): DiaChannel {
    let channel = this.channels.get(id)
    if (!channel) {
      channel = {
        snapshot: null,
        publishedAt: null,
        pendingCommand: null,
        nextSequence: 1,
        lastAcknowledgedSequence: 0,
        lastAcknowledgedDisposition: null,
        summary: null,
        requests: new Map(),
      }
      this.channels.set(id, channel)
    }
    return channel
  }
}

declare global {
  var __diastageRemoteDiaChannels: RemoteDiaChannelStore | undefined
}
export const remoteDiaChannels =
  globalThis.__diastageRemoteDiaChannels ?? new RemoteDiaChannelStore(remoteVoiceSessions)
globalThis.__diastageRemoteDiaChannels = remoteDiaChannels
