import { expect, test } from 'bun:test'
import { z } from 'zod'
import { handleRemoteVoiceRequest, readRemoteJson, takeRemoteJoinRateLimit } from './api'
import {
  REMOTE_VOICE_LIMITS,
  RemoteVoiceSessionError,
  RemoteVoiceSessionStore,
} from './session-store'

function expectSessionError(operation: () => unknown, code: string, status: number) {
  try {
    operation()
    throw new Error('Expected RemoteVoiceSessionError')
  } catch (error) {
    expect(error).toBeInstanceOf(RemoteVoiceSessionError)
    expect(error).toMatchObject({ code, status })
  }
}

test('a one-time code pairs one phone without exposing owner authority', () => {
  const store = new RemoteVoiceSessionStore()
  const owner = store.create('空桌排练')
  expect(owner.pairingCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  expect(store.ownerStatus(owner.id, owner.ownerToken).paired).toBe(false)

  const remote = store.join(owner.pairingCode.toLowerCase())
  expect(remote.label).toBe('空桌排练')
  expect(remote.remoteToken).not.toBe(owner.ownerToken)
  expect(store.ownerStatus(owner.id, owner.ownerToken).paired).toBe(true)
  expectSessionError(() => store.join(owner.pairingCode), 'PAIRING_CODE_INVALID', 404)
  expectSessionError(() => store.ownerStatus(owner.id, remote.remoteToken), 'UNAUTHORIZED', 401)
})

test('only one reviewed transcript can be pending and acknowledgement is idempotent', () => {
  const store = new RemoteVoiceSessionStore()
  const owner = store.create()
  const remote = store.join(owner.pairingCode)
  const command = store.sendCommand(owner.id, remote.remoteToken, '  把沙发向台右移半米。  ')
  expect(command.transcript).toBe('把沙发向台右移半米。')
  expect(store.ownerStatus(owner.id, owner.ownerToken).pendingCommand).toEqual(command)
  expectSessionError(
    () => store.sendCommand(owner.id, remote.remoteToken, '再移动一次'),
    'COMMAND_PENDING',
    409,
  )

  store.acknowledgeCommand(owner.id, owner.ownerToken, command.sequence, 'loaded')
  store.acknowledgeCommand(owner.id, owner.ownerToken, command.sequence, 'loaded')
  const remoteStatus = store.remoteStatus(owner.id, remote.remoteToken)
  expect(remoteStatus.pendingSequence).toBeNull()
  expect(remoteStatus.lastAcknowledgedSequence).toBe(command.sequence)
  expect(remoteStatus.lastAcknowledgedDisposition).toBe('loaded')

  const next = store.sendCommand(owner.id, remote.remoteToken, '门景片向台后移20厘米')
  expect(next.sequence).toBe(command.sequence + 1)
  expectSessionError(
    () => store.acknowledgeCommand(owner.id, owner.ownerToken, command.sequence + 2, 'dismissed'),
    'COMMAND_STALE',
    409,
  )
})

test('expired or revoked sessions reject both devices', () => {
  let now = Date.now()
  const store = new RemoteVoiceSessionStore(() => now)
  const owner = store.create()
  const remote = store.join(owner.pairingCode)
  now += REMOTE_VOICE_LIMITS.sessionTtlMs
  expectSessionError(() => store.ownerStatus(owner.id, owner.ownerToken), 'SESSION_EXPIRED', 410)
  expectSessionError(() => store.remoteStatus(owner.id, remote.remoteToken), 'SESSION_EXPIRED', 410)

  const secondOwner = store.create()
  store.revoke(secondOwner.id, secondOwner.ownerToken)
  expectSessionError(
    () => store.ownerStatus(secondOwner.id, secondOwner.ownerToken),
    'SESSION_EXPIRED',
    410,
  )
})

test('pairing guesses are independently rate limited', () => {
  const key = crypto.randomUUID()
  const now = Date.now() + 120_000
  for (let attempt = 0; attempt < 8; attempt++) {
    expect(takeRemoteJoinRateLimit(key, now)).toBeNull()
  }
  expect(takeRemoteJoinRateLimit(key, now)).toBe(60)
  expect(takeRemoteJoinRateLimit(key, now + 60_000)).toBeNull()
})

test('remote JSON is bounded and scene authority is required only for session creation', async () => {
  const schema = z.strictObject({ code: z.string() })
  const valid = new Request('http://127.0.0.1/api/remote-voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'ABCD-EFGH' }),
  })
  expect(await readRemoteJson(valid, schema)).toEqual({ code: 'ABCD-EFGH' })

  const oversized = new Request('http://127.0.0.1/api/remote-voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '40000' },
    body: '{}',
  })
  await expect(readRemoteJson(oversized, schema)).rejects.toMatchObject({ status: 413 })

  let called = false
  const publicRequest = new Request('https://stage.example/api/remote-voice', {
    method: 'POST',
    headers: { origin: 'https://stage.example' },
  })
  const response = await handleRemoteVoiceRequest(
    publicRequest,
    () => {
      called = true
      return { body: {} }
    },
    { requireSceneAuth: true },
  )
  expect(response.status).toBe(503)
  expect(called).toBe(false)
  expect((await response.json()).error.message).toContain('安全访问')
})
