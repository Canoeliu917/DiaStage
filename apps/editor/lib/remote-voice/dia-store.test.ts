import { expect, test } from 'bun:test'
import { GET, PATCH, POST } from '../../app/api/remote-voice/sessions/[id]/dia/route'
import {
  RemoteDiaCommandInputSchema,
  type RemoteDiaSnapshot,
  RemoteDiaSnapshotSchema,
} from './dia-protocol'
import { RemoteDiaChannelStore } from './dia-store'
import { REMOTE_VOICE_LIMITS, RemoteVoiceSessionStore, remoteVoiceSessions } from './session-store'

function snapshot(): RemoteDiaSnapshot {
  return {
    version: 1,
    sceneId: 'synthetic-scene',
    sceneVersion: 'synthetic-v1',
    thread: {
      threadId: 'synthetic-thread',
      messages: [
        {
          messageId: 'synthetic-message',
          role: 'user',
          content: '两个人在告别，可以更克制一点吗？',
          createdAt: '2026-09-12T00:00:00.000Z',
        },
      ],
    },
    interactionId: 'synthetic-interaction',
    proposals: [
      {
        proposalId: 'synthetic-proposal',
        title: '先保持距离',
        intention: '留一点回避的可能',
        rationale: '可以让行动先停下来。',
        changes: ['A 暂时不动'],
        alternatives: ['也可以保留现在的处理。'],
      },
    ],
    selectedProposalId: 'synthetic-proposal',
    state: 'proposal-ready',
    statusText: '可以试试，也可以保持现在。',
    decision: 'none',
    synthetic: true,
    stage: {
      width: 8,
      depth: 6,
      origin: [0, 0, 0],
      performers: [
        { id: 'A', name: 'A', position: [-1, 0, 0] },
        { id: 'B', name: 'B', position: [1, 0, 0] },
      ],
      paths: [],
    },
    ghost: null,
  }
}

function setup() {
  let now = Date.parse('2026-09-12T00:00:00.000Z')
  const sessions = new RemoteVoiceSessionStore(() => now)
  const channels = new RemoteDiaChannelStore(sessions, () => now)
  const owner = sessions.create('synthetic', 'synthetic-scene')
  const remote = sessions.join(owner.pairingCode)
  const publish = (value = snapshot()) =>
    channels.publish(owner.id, owner.ownerToken, { snapshot: value })
  const message = (sequence = 1) => ({
    type: 'message' as const,
    requestId: crypto.randomUUID(),
    sequence,
    sceneVersion: 'synthetic-v1',
    content: '第二个方向能保持不动吗？',
  })
  return {
    sessions,
    channels,
    owner,
    remote,
    publish,
    message,
    advance: (ms: number) => {
      now += ms
    },
  }
}

test('Dia shares one bounded display projection and preserves existing token roles and scene binding', () => {
  const { channels, owner, remote, publish } = setup()
  expect(channels.remoteStatus(owner.id, remote.remoteToken).status.ownerOnline).toBe(false)
  expect(() => channels.publish(owner.id, remote.remoteToken, { snapshot: snapshot() })).toThrow()
  expect(() => channels.remoteStatus(owner.id, owner.ownerToken)).toThrow()
  expect(() =>
    channels.publish(owner.id, owner.ownerToken, {
      snapshot: { ...snapshot(), sceneId: 'another-scene' },
    }),
  ).toThrow()
  publish()
  const status = channels.remoteStatus(owner.id, remote.remoteToken)
  expect(status.status.snapshot).toEqual(snapshot())
  expect(status.status.ownerOnline).toBe(true)
  expect(status.status).not.toHaveProperty('pendingCommand')
  expect(JSON.stringify(status)).not.toContain(owner.ownerToken)
  expect(JSON.stringify(status)).not.toContain(remote.remoteToken)
})

test('Dia exact retries are idempotent, preserve old command isolation, and block duplicate interactions', () => {
  const { channels, sessions, owner, remote, publish, message } = setup()
  publish()
  sessions.sendCommand(owner.id, remote.remoteToken, '合成旧舞台口令')
  const input = message()
  const first = channels.send(owner.id, remote.remoteToken, input)
  expect(channels.send(owner.id, remote.remoteToken, input)).toEqual(first)
  expect(() =>
    channels.send(owner.id, remote.remoteToken, { ...input, content: '更换请求内容' }),
  ).toThrow()
  expect(() => channels.send(owner.id, remote.remoteToken, message(2))).toThrow()
  channels.publish(owner.id, owner.ownerToken, {
    acknowledgement: { sequence: 1, disposition: 'received' },
  })
  expect(channels.send(owner.id, remote.remoteToken, input)).toEqual(first)
  expect(channels.ownerStatus(owner.id, owner.ownerToken).status.pendingCommand).toBeNull()
  expect(sessions.ownerStatus(owner.id, owner.ownerToken).pendingCommand?.transcript).toBe(
    '合成旧舞台口令',
  )
})

test('mobile preview is only a request until owner confirms Ghost and decision', () => {
  const { channels, owner, remote, publish } = setup()
  publish()
  const preview = {
    type: 'preview' as const,
    requestId: crypto.randomUUID(),
    sequence: 1,
    sceneVersion: 'synthetic-v1',
    interactionId: 'synthetic-interaction',
    proposalId: 'synthetic-proposal',
  }
  expect(() =>
    channels.send(owner.id, remote.remoteToken, { ...preview, sceneVersion: 'old' }),
  ).toThrow()
  expect(() =>
    channels.send(owner.id, remote.remoteToken, { ...preview, interactionId: 'old' }),
  ).toThrow()
  expect(() =>
    channels.send(owner.id, remote.remoteToken, { ...preview, proposalId: 'old' }),
  ).toThrow()
  channels.send(owner.id, remote.remoteToken, preview)
  expect(channels.remoteStatus(owner.id, remote.remoteToken).status.snapshot?.ghost).toBeNull()
  expect(channels.ownerStatus(owner.id, owner.ownerToken).status.pendingCommand?.type).toBe(
    'preview',
  )
  const projected = snapshot()
  projected.state = 'ghost-ready'
  projected.ghost = {
    proposalId: 'synthetic-proposal',
    performers: projected.stage.performers,
    paths: [],
  }
  channels.publish(owner.id, owner.ownerToken, {
    snapshot: projected,
    acknowledgement: { sequence: 1, disposition: 'received' },
  })
  expect(channels.remoteStatus(owner.id, remote.remoteToken).status.snapshot).toEqual(projected)
  publish({ ...projected, ghost: null, state: 'applied', decision: 'adopt' })
  expect(channels.remoteStatus(owner.id, remote.remoteToken).status.snapshot?.decision).toBe(
    'adopt',
  )
  expect(() =>
    channels.send(owner.id, remote.remoteToken, {
      ...preview,
      requestId: crypto.randomUUID(),
      sequence: 2,
    }),
  ).toThrow()
})

test('cancel supersedes pending work; a delayed acknowledgement cannot restore its snapshot', () => {
  const { channels, owner, remote, publish, message } = setup()
  publish()
  const input = message()
  channels.send(owner.id, remote.remoteToken, input)
  const cancel = {
    type: 'cancel' as const,
    requestId: crypto.randomUUID(),
    sequence: 2,
    sceneVersion: input.sceneVersion,
  }
  channels.send(owner.id, remote.remoteToken, cancel)
  channels.publish(owner.id, owner.ownerToken, {
    acknowledgement: { sequence: 1, disposition: 'received' },
    snapshot: { ...snapshot(), statusText: 'late result' },
  })
  expect(channels.ownerStatus(owner.id, owner.ownerToken).status.pendingCommand?.type).toBe(
    'cancel',
  )
  expect(channels.remoteStatus(owner.id, remote.remoteToken).status.snapshot?.statusText).not.toBe(
    'late result',
  )
  channels.publish(owner.id, owner.ownerToken, {
    acknowledgement: { sequence: 2, disposition: 'received' },
    snapshot: { ...snapshot(), state: 'idle', statusText: '已停止。' },
  })
  expect(channels.send(owner.id, remote.remoteToken, input).sequence).toBe(1)
  expect(channels.ownerStatus(owner.id, owner.ownerToken).status.pendingCommand).toBeNull()
})

test('offline, expired, and revoked sessions cannot receive new Dia commands', () => {
  const state = setup()
  state.publish()
  state.advance(15_001)
  expect(
    state.channels.remoteStatus(state.owner.id, state.remote.remoteToken).status.ownerOnline,
  ).toBe(false)
  expect(() =>
    state.channels.send(state.owner.id, state.remote.remoteToken, state.message()),
  ).toThrow()
  state.publish()
  state.advance(REMOTE_VOICE_LIMITS.sessionTtlMs)
  expect(() => state.channels.ownerStatus(state.owner.id, state.owner.ownerToken)).toThrow()
  const revoked = setup()
  revoked.publish()
  revoked.sessions.revokeRemote(revoked.owner.id, revoked.remote.remoteToken)
  expect(() =>
    revoked.channels.remoteStatus(revoked.owner.id, revoked.remote.remoteToken),
  ).toThrow()
})

test('Dia schemas reject scene writes, adopt, unbounded display data, and inconsistent selections', () => {
  const base = { requestId: crypto.randomUUID(), sequence: 1, sceneVersion: 'synthetic-v1' }
  for (const type of ['adopt', 'apply', 'updateScene'])
    expect(RemoteDiaCommandInputSchema.safeParse({ ...base, type }).success).toBe(false)
  expect(
    RemoteDiaCommandInputSchema.safeParse({ ...base, type: 'message', content: 'hello', nodes: [] })
      .success,
  ).toBe(false)
  expect(
    RemoteDiaCommandInputSchema.safeParse({ ...base, type: 'message', content: 'a'.repeat(2001) })
      .success,
  ).toBe(false)
  expect(RemoteDiaSnapshotSchema.safeParse({ ...snapshot(), script: 'private text' }).success).toBe(
    false,
  )
  expect(
    RemoteDiaSnapshotSchema.safeParse({ ...snapshot(), selectedProposalId: 'missing' }).success,
  ).toBe(false)
  expect(
    RemoteDiaSnapshotSchema.safeParse({
      ...snapshot(),
      proposals: Array.from({ length: 4 }, () => snapshot().proposals[0]),
    }).success,
  ).toBe(false)
})

test('Build projection carries bounded scenery and confirmed Ghost without extending remote authority', () => {
  const { channels, owner, remote, publish } = setup()
  const build = snapshot()
  build.stage.performers = []
  build.stage.scenery = [{ id: 'table', name: '圆桌', min: [-1, -1], max: [1, 1] }]
  publish(build)
  const preview = {
    type: 'preview',
    requestId: crypto.randomUUID(),
    sequence: 1,
    sceneVersion: build.sceneVersion,
    interactionId: build.interactionId,
    proposalId: build.selectedProposalId,
  }
  channels.send(owner.id, remote.remoteToken, preview)
  expect(channels.remoteStatus(owner.id, remote.remoteToken).status.snapshot?.ghost).toBeNull()
  build.state = 'waiting-human'
  build.ghost = {
    proposalId: build.selectedProposalId!,
    performers: [],
    paths: [],
    scenery: [{ id: 'new-table', name: '建议圆桌', min: [-2, -1], max: [-1, 0] }],
    venue: { width: 10, depth: 8, origin: [0, 0, 0] },
  }
  channels.publish(owner.id, owner.ownerToken, {
    snapshot: build,
    acknowledgement: { sequence: 1, disposition: 'received' },
  })
  expect(
    channels.remoteStatus(owner.id, remote.remoteToken).status.snapshot?.ghost?.scenery,
  ).toEqual(build.ghost.scenery)
  for (const invalid of [
    { ...build.stage.scenery[0], min: [2, 0], max: [1, 1] },
    { ...build.stage.scenery[0], min: [Infinity, 0] },
    { ...build.stage.scenery[0], geometry: [] },
  ])
    expect(
      RemoteDiaSnapshotSchema.safeParse({ ...build, stage: { ...build.stage, scenery: [invalid] } })
        .success,
    ).toBe(false)
  expect(
    RemoteDiaSnapshotSchema.safeParse({
      ...build,
      ghost: {
        ...build.ghost,
        scenery: Array.from({ length: 201 }, () => build.ghost!.scenery![0]),
      },
    }).success,
  ).toBe(false)
  expect(RemoteDiaCommandInputSchema.safeParse({ ...preview, type: 'adopt' }).success).toBe(false)
})

test('Dia HTTP routes validate requests/responses, enforce roles and streamed payload limits', async () => {
  const oldRate = process.env.PASCAL_SCENE_API_RATE_LIMIT
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  const owner = remoteVoiceSessions.create('synthetic', 'synthetic-scene')
  const remote = remoteVoiceSessions.join(owner.pairingCode)
  const url = `http://127.0.0.1/api/remote-voice/sessions/${owner.id}/dia`
  const context = { params: Promise.resolve({ id: owner.id }) }
  const ownerHeaders = { 'x-diastage-owner-token': owner.ownerToken }
  const remoteHeaders = { 'x-diastage-remote-token': remote.remoteToken }
  const json = (method: string, headers: Record<string, string>, body: unknown) =>
    new Request(url, {
      method,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  try {
    expect((await GET(new Request(url), context)).status).toBe(401)
    expect(
      (await PATCH(json('PATCH', remoteHeaders, { snapshot: snapshot() }), context)).status,
    ).toBe(401)
    expect(
      (await PATCH(json('PATCH', ownerHeaders, { snapshot: snapshot() }), context)).status,
    ).toBe(200)
    expect((await POST(json('POST', ownerHeaders, { type: 'cancel' }), context)).status).toBe(401)
    const invalid = {
      requestId: crypto.randomUUID(),
      sequence: 1,
      sceneVersion: 'synthetic-v1',
      type: 'adopt',
    }
    expect((await POST(json('POST', remoteHeaders, invalid), context)).status).toBe(400)
    expect(
      (
        await POST(
          json('POST', remoteHeaders, {
            ...invalid,
            type: 'message',
            content: 'x'.repeat(33 * 1024),
          }),
          context,
        )
      ).status,
    ).toBe(413)
    expect(
      (
        await PATCH(
          json('PATCH', ownerHeaders, {
            snapshot: { ...snapshot(), statusText: 'x'.repeat(129 * 1024) },
          }),
          context,
        )
      ).status,
    ).toBe(413)
    const input = { ...invalid, type: 'message', content: '可以保持位置吗？' }
    expect((await POST(json('POST', remoteHeaders, input), context)).status).toBe(202)
    expect((await POST(json('POST', remoteHeaders, input), context)).status).toBe(202)
    const ownerResult = await (
      await GET(new Request(url, { headers: ownerHeaders }), context)
    ).json()
    expect(ownerResult.status.pendingCommand.content).toBe(input.content)
    const remoteResult = await (
      await GET(new Request(url, { headers: remoteHeaders }), context)
    ).json()
    expect(remoteResult.status.pendingSequence).toBe(1)
    expect(remoteResult.status).not.toHaveProperty('pendingCommand')
    remoteVoiceSessions.revoke(owner.id, owner.ownerToken)
    expect((await GET(new Request(url, { headers: remoteHeaders }), context)).status).toBe(410)
  } finally {
    try {
      remoteVoiceSessions.revoke(owner.id, owner.ownerToken)
    } catch {}
    if (oldRate === undefined) delete process.env.PASCAL_SCENE_API_RATE_LIMIT
    else process.env.PASCAL_SCENE_API_RATE_LIMIT = oldRate
  }
})
