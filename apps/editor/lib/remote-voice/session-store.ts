import { randomBytes, timingSafeEqual } from 'node:crypto'

export const REMOTE_VOICE_LIMITS = {
  sessionTtlMs: 10 * 60_000,
  maxSessions: 128,
  maxTranscriptCharacters: 10_000,
} as const

const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export type RemoteVoiceCommand = {
  requestId: string
  sequence: number
  transcript: string
  createdAt: string
}

export type RemoteVoiceDisposition = 'applied' | 'rejected' | 'failed'
export type RemoteVoiceProgress = 'received' | 'processing' | 'waiting-confirmation'

type RemoteVoiceSession = {
  id: string
  pairingCode: string | null
  ownerToken: string
  remoteToken: string | null
  label: string | null
  sceneId: string | null
  createdAt: number
  expiresAt: number
  connectedAt: number | null
  lastSeenAt: number | null
  mode: 'suggest' | 'create' | 'draft'
  summary: string | null
  nextSequence: number
  lastAcknowledgedSequence: number
  lastAcknowledgedDisposition: RemoteVoiceDisposition | null
  pendingCommand: RemoteVoiceCommand | null
  lastCommand: RemoteVoiceCommand | null
  progress: RemoteVoiceProgress | null
}

export type CreatedRemoteVoiceSession = {
  sceneId: string | null
  id: string
  pairingCode: string
  ownerToken: string
  expiresAt: string
}

export type JoinedRemoteVoiceSession = {
  sceneId: string | null
  id: string
  remoteToken: string
  label: string | null
  expiresAt: string
}

export type OwnerRemoteVoiceStatus = {
  progress: RemoteVoiceProgress | null
  paired: boolean
  connectedAt: string | null
  expiresAt: string
  pendingCommand: RemoteVoiceCommand | null
  lastAcknowledgedSequence: number
  lastAcknowledgedDisposition: RemoteVoiceDisposition | null
}

export type RemoteRemoteVoiceStatus = {
  progress: RemoteVoiceProgress | null
  mode: 'suggest' | 'create' | 'draft'
  summary: string | null
  expiresAt: string
  pendingSequence: number | null
  lastAcknowledgedSequence: number
  lastAcknowledgedDisposition: RemoteVoiceDisposition | null
}

type RemoteVoiceErrorCode =
  | 'PAIRING_CODE_INVALID'
  | 'PAIRING_CODE_USED'
  | 'SESSION_EXPIRED'
  | 'SESSION_LIMIT_REACHED'
  | 'UNAUTHORIZED'
  | 'PHONE_NOT_PAIRED'
  | 'COMMAND_PENDING'
  | 'COMMAND_STALE'

export class RemoteVoiceSessionError extends Error {
  constructor(
    readonly code: RemoteVoiceErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'RemoteVoiceSessionError'
  }
}

export class RemoteVoiceSessionStore {
  private readonly sessions = new Map<string, RemoteVoiceSession>()
  private readonly sessionsByPairingCode = new Map<string, string>()
  private readonly revokeListeners = new Set<(id: string) => void>()

  constructor(private readonly now: () => number = Date.now) {}

  create(label?: string | null, sceneId: string | null = null): CreatedRemoteVoiceSession {
    this.removeExpired()
    if (this.sessions.size >= REMOTE_VOICE_LIMITS.maxSessions) {
      throw new RemoteVoiceSessionError(
        'SESSION_LIMIT_REACHED',
        '当前连接数量已满，请稍后再试。',
        429,
      )
    }
    const id = crypto.randomUUID()
    const pairingCode = this.uniquePairingCode()
    const createdAt = this.now()
    const session: RemoteVoiceSession = {
      id,
      pairingCode,
      ownerToken: token(),
      remoteToken: null,
      label: label?.trim().slice(0, 100) || null,
      sceneId,
      createdAt,
      expiresAt: createdAt + REMOTE_VOICE_LIMITS.sessionTtlMs,
      connectedAt: null,
      lastSeenAt: null,
      mode: 'suggest',
      summary: null,
      nextSequence: 1,
      lastAcknowledgedSequence: 0,
      lastAcknowledgedDisposition: null,
      pendingCommand: null,
      lastCommand: null,
      progress: null,
    }
    this.sessions.set(id, session)
    this.sessionsByPairingCode.set(pairingCode, id)
    return {
      sceneId,
      id,
      pairingCode: displayPairingCode(pairingCode),
      ownerToken: session.ownerToken,
      expiresAt: iso(session.expiresAt),
    }
  }

  join(code: string): JoinedRemoteVoiceSession {
    this.removeExpired()
    const normalized = normalizePairingCode(code)
    const id = this.sessionsByPairingCode.get(normalized)
    if (!id) {
      throw new RemoteVoiceSessionError(
        'PAIRING_CODE_INVALID',
        '配对码无效或已过期，请在舞台端重新生成。',
        404,
      )
    }
    const session = this.requireActive(id)
    if (!session.pairingCode || session.remoteToken) {
      throw new RemoteVoiceSessionError(
        'PAIRING_CODE_USED',
        '此配对码已使用，请在舞台端重新生成。',
        409,
      )
    }
    session.remoteToken = token()
    session.connectedAt = this.now()
    session.lastSeenAt = this.now()
    this.sessionsByPairingCode.delete(normalized)
    session.pairingCode = null
    return {
      sceneId: session.sceneId,
      id: session.id,
      remoteToken: session.remoteToken,
      label: session.label,
      expiresAt: iso(session.expiresAt),
    }
  }

  ownerStatus(id: string, suppliedToken: string | null): OwnerRemoteVoiceStatus {
    const session = this.authorizeOwner(id, suppliedToken)
    return {
      progress: session.progress,
      paired:
        session.remoteToken !== null &&
        session.lastSeenAt !== null &&
        this.now() - session.lastSeenAt <= 90_000,
      connectedAt: session.connectedAt === null ? null : iso(session.connectedAt),
      expiresAt: iso(session.expiresAt),
      pendingCommand: session.pendingCommand ? { ...session.pendingCommand } : null,
      lastAcknowledgedSequence: session.lastAcknowledgedSequence,
      lastAcknowledgedDisposition: session.lastAcknowledgedDisposition,
    }
  }

  remoteStatus(id: string, suppliedToken: string | null): RemoteRemoteVoiceStatus {
    const session = this.authorizeRemote(id, suppliedToken)
    session.lastSeenAt = this.now()
    return {
      progress: session.progress,
      mode: session.mode,
      summary: session.summary,
      expiresAt: iso(session.expiresAt),
      pendingSequence: session.pendingCommand?.sequence ?? null,
      lastAcknowledgedSequence: session.lastAcknowledgedSequence,
      lastAcknowledgedDisposition: session.lastAcknowledgedDisposition,
    }
  }

  sendCommand(
    id: string,
    suppliedToken: string | null,
    transcript: string,
    requestId = crypto.randomUUID(),
    sequence?: number,
  ): RemoteVoiceCommand {
    const session = this.authorizeRemote(id, suppliedToken)
    const previous = session.pendingCommand ?? session.lastCommand
    if (previous?.requestId === requestId) {
      if (
        previous.transcript !== transcript.trim() ||
        (sequence !== undefined && sequence !== previous.sequence)
      ) {
        throw new RemoteVoiceSessionError('COMMAND_STALE', '同一请求不能更换口令。', 409)
      }
      return { ...previous }
    }
    if (sequence !== undefined && sequence !== session.nextSequence) {
      throw new RemoteVoiceSessionError(
        'COMMAND_STALE',
        '口令顺序已变化，请等待回执后再发送。',
        409,
      )
    }
    if (session.pendingCommand) {
      throw new RemoteVoiceSessionError(
        'COMMAND_PENDING',
        '上一条口令仍在等待舞台端载入，请先回到舞台端处理。',
        409,
      )
    }
    const clean = transcript.trim()
    if (!clean || clean.length > REMOTE_VOICE_LIMITS.maxTranscriptCharacters) {
      throw new RemoteVoiceSessionError('COMMAND_STALE', '口令为空或过长，请缩短后重新发送。', 400)
    }
    const command = {
      requestId,
      sequence: session.nextSequence++,
      transcript: clean,
      createdAt: iso(this.now()),
    }
    session.pendingCommand = command
    session.progress = 'received'
    return { ...command }
  }

  acknowledgeCommand(
    id: string,
    suppliedToken: string | null,
    sequence: number,
    disposition: RemoteVoiceDisposition | RemoteVoiceProgress,
    summary?: string,
  ): void {
    const session = this.authorizeOwner(id, suppliedToken)
    if (session.lastAcknowledgedSequence >= sequence) return
    if (session.pendingCommand?.sequence !== sequence) {
      throw new RemoteVoiceSessionError(
        'COMMAND_STALE',
        '这条手机口令已经失效，请重新连接后再试。',
        409,
      )
    }
    if (
      disposition === 'received' ||
      disposition === 'processing' ||
      disposition === 'waiting-confirmation'
    ) {
      const rank = { received: 0, processing: 1, 'waiting-confirmation': 2 }
      if (rank[disposition] >= rank[session.progress ?? 'received']) session.progress = disposition
      session.summary = summary?.slice(0, 300) ?? null
      return
    }
    session.lastCommand = session.pendingCommand
    session.pendingCommand = null
    session.progress = null
    session.lastAcknowledgedSequence = sequence
    session.lastAcknowledgedDisposition = disposition
    session.summary = summary?.slice(0, 300) ?? null
  }

  setMode(id: string, suppliedToken: string | null, mode: RemoteVoiceSession['mode']) {
    this.authorizeOwner(id, suppliedToken).mode = mode
  }

  revoke(id: string, suppliedToken: string | null): void {
    const session = this.authorizeOwner(id, suppliedToken)
    this.deleteSession(session)
  }
  revokeRemote(id: string, suppliedToken: string | null): void {
    this.deleteSession(this.authorizeRemote(id, suppliedToken))
  }

  authorizeRemoteRequest(id: string, suppliedToken: string | null): void {
    this.authorizeRemote(id, suppliedToken)
  }

  sceneForRequest(
    id: string,
    suppliedToken: string | null,
    role: 'owner' | 'remote',
  ): string | null {
    return (
      role === 'owner'
        ? this.authorizeOwner(id, suppliedToken)
        : this.authorizeRemote(id, suppliedToken)
    ).sceneId
  }

  onRevoke(listener: (id: string) => void): () => void {
    this.revokeListeners.add(listener)
    return () => this.revokeListeners.delete(listener)
  }

  private authorizeOwner(id: string, suppliedToken: string | null): RemoteVoiceSession {
    const session = this.requireActive(id)
    if (!matchesToken(session.ownerToken, suppliedToken)) {
      throw new RemoteVoiceSessionError('UNAUTHORIZED', '此连接未通过舞台端验证。', 401)
    }
    return session
  }

  private authorizeRemote(id: string, suppliedToken: string | null): RemoteVoiceSession {
    const session = this.requireActive(id)
    if (!session.remoteToken) {
      throw new RemoteVoiceSessionError('PHONE_NOT_PAIRED', '请先输入舞台端配对码。', 409)
    }
    if (!matchesToken(session.remoteToken, suppliedToken)) {
      throw new RemoteVoiceSessionError('UNAUTHORIZED', '此手机连接未通过验证。', 401)
    }
    return session
  }

  private requireActive(id: string): RemoteVoiceSession {
    const session = this.sessions.get(id)
    if (!session) {
      throw new RemoteVoiceSessionError('SESSION_EXPIRED', '连接不存在或已过期，请重新配对。', 410)
    }
    if (session.expiresAt <= this.now()) {
      this.deleteSession(session)
      throw new RemoteVoiceSessionError('SESSION_EXPIRED', '连接已过期，请在舞台端重新配对。', 410)
    }
    return session
  }

  private uniquePairingCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      let result = ''
      const bytes = randomBytes(8)
      for (const byte of bytes) result += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length]
      if (!this.sessionsByPairingCode.has(result)) return result
    }
    throw new RemoteVoiceSessionError(
      'SESSION_LIMIT_REACHED',
      '暂时无法生成唯一配对码，请稍后再试。',
      503,
    )
  }

  removeExpired(): void {
    const now = this.now()
    for (const session of this.sessions.values()) {
      if (session.expiresAt <= now) this.deleteSession(session)
    }
  }

  private deleteSession(session: RemoteVoiceSession): void {
    this.sessions.delete(session.id)
    if (session.pairingCode) this.sessionsByPairingCode.delete(session.pairingCode)
    for (const listener of this.revokeListeners) listener(session.id)
  }
}

function normalizePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

function displayPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

function token(): string {
  return randomBytes(32).toString('base64url')
}

function matchesToken(expected: string, supplied: string | null): boolean {
  if (!supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return (
    expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
  )
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

declare global {
  var __diastageRemoteVoiceSessions: RemoteVoiceSessionStore | undefined
}

export const remoteVoiceSessions =
  globalThis.__diastageRemoteVoiceSessions ?? new RemoteVoiceSessionStore()

globalThis.__diastageRemoteVoiceSessions = remoteVoiceSessions
