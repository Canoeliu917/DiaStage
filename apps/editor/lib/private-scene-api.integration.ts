import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { NextRequest } from 'next/server'
import { SqliteSceneStore } from '../../../packages/mcp/src/storage/sqlite-scene-store'
import { POST as analyzePhoto } from '../app/api/photo-stage/analyze/route'
import { GET as events } from '../app/api/scenes/[id]/events/route'
import { DELETE, GET, PATCH, PUT } from '../app/api/scenes/[id]/route'
import { POST as thumbnail } from '../app/api/scenes/[id]/thumbnail/route'
import { POST as create, GET as list, OPTIONS as preflight } from '../app/api/scenes/route'
import { AI_LIMITS, handleAiRequest } from './ai/api'
import { __resetAuthForTests, getAuth, getSession } from './auth/server'
import {
  __resetSceneStoreForTests,
  __setSceneStoreForTests,
  getScenePageOperations,
} from './scene-store-server'

const origin = 'http://127.0.0.1:4329'
const graph = { nodes: { item: { id: 'item', type: 'qa:box' } }, rootNodeIds: ['item'] }
const emptyGraph = { nodes: {}, rootNodeIds: [] }
const thumbnailUrl = 'data:image/png;base64,iVBORw0KGgo='
const savedEnv = { ...process.env }
let directory: string
let store: SqliteSceneStore
let alice: { cookie: string; id: string }
let bob: { cookie: string; id: string }

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = alice?.cookie,
  extra: Record<string, string> = {},
) {
  return new NextRequest(`${origin}${path}`, {
    method,
    headers: {
      host: new URL(origin).host,
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'diastage-private-api-'))
  process.env.PASCAL_DB_PATH = join(directory, 'scenes.db')
  process.env.BETTER_AUTH_URL = origin
  process.env.BETTER_AUTH_SECRET = 'private-scene-integration-secret-at-least-32-characters'
  process.env.PASCAL_SCENE_API_TOKEN = 'old-shared-token-must-not-grant-access'
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:4318'
  await __resetAuthForTests()
  const auth = await getAuth()
  const register = async (name: string) => {
    const response = await auth.handler(
      request(
        '/api/auth/sign-up/email',
        'POST',
        {
          name,
          email: `${name.toLowerCase()}@example.com`,
          password: 'private-test-password',
        },
        '',
      ),
    )
    assert.equal(response.status, 200)
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const session = await getSession(new Headers({ cookie }))
    assert.ok(session)
    return { cookie, id: session.user.id }
  }
  alice = await register('Alice')
  bob = await register('Bob')
  store = new SqliteSceneStore({ databasePath: process.env.PASCAL_DB_PATH })
  __setSceneStoreForTests(store)
  await store.save({ id: 'legacy-private', name: 'Unclaimed', graph: graph as never })
})

after(async () => {
  store?.close()
  __resetSceneStoreForTests()
  await __resetAuthForTests()
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('anonymous loopback and legacy bearer tokens cannot read scenes; SSR requests redirect to login', async () => {
  assert.equal((await list(request('/api/scenes', 'GET', undefined, ''))).status, 401)
  assert.equal(
    (
      await list(
        request('/api/scenes', 'GET', undefined, '', {
          authorization: 'Bearer old-shared-token-must-not-grant-access',
        }),
      )
    ).status,
    401,
  )
  await assert.rejects(
    getScenePageOperations(new Headers({ host: '127.0.0.1:4329' }), '/scenes'),
    (error: unknown) => {
      assert.match((error as { digest: string }).digest, /NEXT_REDIRECT.*\/login\?next=%2Fscenes/)
      return true
    },
  )
})

test('real cookie sessions assign ownership and keep SSR, lists, graph and thumbnail data private', async () => {
  const created = await create(
    request('/api/scenes', 'POST', {
      id: 'alice-stage',
      name: 'Alice scene',
      graph,
      ownerId: bob.id,
    }),
  )
  assert.equal(created.status, 201)
  assert.equal((await created.json()).ownerId, alice.id)
  assert.equal(
    (
      await create(
        request('/api/scenes', 'POST', { id: 'bob-stage', name: 'Bob scene', graph }, bob.cookie),
      )
    ).status,
    201,
  )
  const listed = await list(request(`/api/scenes?ownerId=${bob.id}`))
  assert.deepEqual(
    (await listed.json()).scenes.map((scene: { id: string }) => scene.id),
    ['alice-stage'],
  )
  const bobList = await list(request('/api/scenes', 'GET', undefined, bob.cookie))
  assert.deepEqual(
    (await bobList.json()).scenes.map((scene: { id: string }) => scene.id),
    ['bob-stage'],
  )
  const page = await getScenePageOperations(
    new Headers({ host: '127.0.0.1:4329', cookie: alice.cookie }),
  )
  assert.deepEqual((await page.loadStoredScene('alice-stage'))?.graph, graph)
  assert.equal(await page.loadStoredScene('bob-stage'), null)
  assert.equal(await page.loadStoredScene('legacy-private'), null)
  assert.deepEqual(
    (await page.listScenes()).map((scene) => scene.id),
    ['alice-stage'],
  )
})

test('foreign and ownerless IDs reject all routes, supplied-ID overwrite and cross-owner projects', async () => {
  for (const id of ['bob-stage', 'legacy-private', 'missing']) {
    const before = await store.load(id)
    const routes = [
      () => GET(request(`/api/scenes/${id}`), params(id)),
      () => PUT(request(`/api/scenes/${id}`, 'PUT', { graph, expectedVersion: 1 }), params(id)),
      () => PATCH(request(`/api/scenes/${id}`, 'PATCH', { name: 'Stolen' }), params(id)),
      () => DELETE(request(`/api/scenes/${id}`, 'DELETE'), params(id)),
      () =>
        thumbnail(
          request(`/api/scenes/${id}/thumbnail`, 'POST', { thumbnailUrl, expectedVersion: 1 }),
          params(id),
        ),
      () => events(request(`/api/scenes/${id}/events`), params(id)),
    ]
    for (const route of routes) assert.equal((await route()).status, 404)
    assert.deepEqual(await store.load(id), before)
  }
  for (const id of ['bob-stage', 'legacy-private'])
    assert.equal(
      (
        await create(
          request('/api/scenes', 'POST', { id, name: 'Stolen', graph, expectedVersion: 1 }),
        )
      ).status,
      404,
    )
  assert.equal(
    (
      await create(
        request('/api/scenes', 'POST', {
          id: 'foreign-project',
          projectId: 'bob-stage',
          name: 'Stolen project',
          graph,
        }),
      )
    ).status,
    404,
  )
})

test('cookie-auth mutations reject another localhost origin, unrelated websites and remote device tokens', async () => {
  for (const origin of ['http://localhost:9999', 'https://untrusted.example']) {
    assert.equal(
      (
        await PUT(
          request('/api/scenes/alice-stage', 'PUT', { graph }, alice.cookie, { origin }),
          params('alice-stage'),
        )
      ).status,
      403,
    )
  }
  assert.equal(
    (
      await GET(
        request('/api/scenes/alice-stage', 'GET', undefined, alice.cookie, {
          'x-diastage-remote-token': 'device-token',
        }),
        params('alice-stage'),
      )
    ).status,
    403,
  )
})

test('the configured HTTPS website works behind a loopback proxy without trusting spoofed host headers', async () => {
  const previous = process.env.BETTER_AUTH_URL
  process.env.BETTER_AUTH_URL = 'https://PUBLIC.example/'
  const forwardedOrigin = { origin: 'https://public.example' }
  const id = 'proxy-private-stage'
  try {
    const options = preflight(request('/api/scenes', 'OPTIONS', undefined, '', forwardedOrigin))
    assert.equal(options.status, 204)
    assert.equal(options.headers.get('access-control-allow-origin'), forwardedOrigin.origin)
    assert.equal(
      (await list(request('/api/scenes', 'GET', undefined, '', forwardedOrigin))).status,
      401,
    )
    const created = await create(
      request(
        '/api/scenes',
        'POST',
        { id, name: 'Proxy private scene', graph },
        alice.cookie,
        forwardedOrigin,
      ),
    )
    assert.equal(created.status, 201)
    assert.equal(created.headers.get('access-control-allow-origin'), forwardedOrigin.origin)
    assert.equal(
      (
        await GET(
          request(`/api/scenes/${id}`, 'GET', undefined, alice.cookie, forwardedOrigin),
          params(id),
        )
      ).status,
      200,
    )
    assert.equal(
      (
        await PUT(
          request(
            `/api/scenes/${id}`,
            'PUT',
            { graph, expectedVersion: 1 },
            alice.cookie,
            forwardedOrigin,
          ),
          params(id),
        )
      ).status,
      200,
    )
    const spoofed = {
      origin: 'https://malicious.example',
      host: 'malicious.example',
      'x-forwarded-host': 'malicious.example',
      'x-forwarded-proto': 'https',
    }
    assert.equal(
      (await PUT(request(`/api/scenes/${id}`, 'PUT', { graph }, alice.cookie, spoofed), params(id)))
        .status,
      403,
    )
    assert.equal(preflight(request('/api/scenes', 'OPTIONS', undefined, '', spoofed)).status, 403)
  } finally {
    await DELETE(
      request(`/api/scenes/${id}`, 'DELETE', undefined, alice.cookie, forwardedOrigin),
      params(id),
    )
    process.env.BETTER_AUTH_URL = previous
  }
})

test('owned edits retain empty-graph protection, optimistic versions, covers and thumbnail validation', async () => {
  const id = 'alice-stage'
  const initial = await store.load(id)
  const wipe = await PUT(
    request(`/api/scenes/${id}`, 'PUT', { graph: emptyGraph, expectedVersion: 1 }),
    params(id),
  )
  assert.equal(wipe.status, 409)
  assert.equal((await wipe.json()).error, 'empty_graph_rejected')
  assert.deepEqual(await store.load(id), initial)
  assert.equal(
    (
      await thumbnail(
        request(`/api/scenes/${id}/thumbnail`, 'POST', { thumbnailUrl, expectedVersion: 1 }),
        params(id),
      )
    ).status,
    200,
  )
  assert.deepEqual(await store.load(id), { ...initial, thumbnailUrl })
  for (const invalid of [
    { thumbnailUrl, expectedVersion: 0 },
    { thumbnailUrl, expectedVersion: 1.5 },
    { thumbnailUrl },
    { thumbnailUrl: 'https://example.com/image.png', expectedVersion: 1 },
    { thumbnailUrl: 'data:image/svg+xml;base64,PHN2Zy8+', expectedVersion: 1 },
    { thumbnailUrl: 'data:image/png;base64,aGVsbG8=', expectedVersion: 1 },
    { thumbnailUrl: `${thumbnailUrl}${'A'.repeat(2 * 1024 * 1024)}`, expectedVersion: 1 },
  ])
    assert.equal(
      (await thumbnail(request(`/api/scenes/${id}/thumbnail`, 'POST', invalid), params(id))).status,
      400,
    )
  assert.equal(
    (await PUT(request(`/api/scenes/${id}`, 'PUT', { graph, expectedVersion: 1 }), params(id)))
      .status,
    200,
  )
  assert.equal((await store.load(id))?.thumbnailUrl, thumbnailUrl)
  const beforeConflict = await store.load(id)
  const stale = await PUT(
    request(`/api/scenes/${id}`, 'PUT', { graph, thumbnailUrl: null, expectedVersion: 1 }),
    params(id),
  )
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).currentVersion, 2)
  assert.deepEqual(await store.load(id), beforeConflict)
  assert.equal(
    (
      await PUT(
        request(`/api/scenes/${id}`, 'PUT', { graph, thumbnailUrl: null, expectedVersion: 2 }),
        params(id),
      )
    ).status,
    200,
  )
  assert.equal((await store.load(id))?.thumbnailUrl, null)
  assert.equal(
    (
      await PUT(
        request(`/api/scenes/${id}`, 'PUT', { graph: emptyGraph, expectedVersion: 3, force: true }),
        params(id),
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await PUT(
        request(`/api/scenes/${id}`, 'PUT', { graph: emptyGraph, expectedVersion: 4 }),
        params(id),
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await PATCH(
        request(`/api/scenes/${id}`, 'PATCH', { name: 'Renamed', expectedVersion: 5 }),
        params(id),
      )
    ).status,
    200,
  )
})

test('event streams expose only the owner and stop when the session is revoked', async () => {
  await store.appendSceneEvent({
    sceneId: 'bob-stage',
    version: 1,
    kind: 'saved',
    graph: graph as never,
  })
  const response = await events(
    request('/api/scenes/bob-stage/events', 'GET', undefined, bob.cookie),
    params('bob-stage'),
  )
  assert.equal(response.status, 200)
  const reader = response.body!.getReader()
  let received = ''
  while (!received.includes('event: scene')) {
    const chunk = await reader.read()
    assert.equal(chunk.done, false)
    received += new TextDecoder().decode(chunk.value)
  }
  assert.match(received, /event: scene/)
  const auth = await getAuth()
  assert.equal(
    (await auth.handler(request('/api/auth/sign-out', 'POST', {}, bob.cookie))).status,
    200,
  )
  while (!(await reader.read()).done) {}
  assert.equal((await list(request('/api/scenes', 'GET', undefined, bob.cookie))).status, 401)
})

test('AI processing requires a real account before executing any operation', async () => {
  let executions = 0
  const operation = async () => {
    executions++
    return { plan: {} }
  }
  assert.equal(
    (await handleAiRequest(request('/api/stage/plan', 'POST', {}, ''), operation)).status,
    401,
  )
  assert.equal(executions, 0)
  assert.equal(
    (await handleAiRequest(request('/api/stage/plan', 'POST', {}), operation)).status,
    200,
  )
  assert.equal(executions, 1)
})

test('authenticated photo requests preserve size limits, origin checks and honest missing-provider errors', async () => {
  delete process.env.OPENAI_API_KEY
  const imageDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  const path = '/api/photo-stage/analyze'
  assert.equal(
    (
      await analyzePhoto(
        request(path, 'POST', {}, alice.cookie, {
          'content-length': String(AI_LIMITS.jsonBytes + 1),
        }),
      )
    ).status,
    413,
  )
  assert.equal(
    (
      await analyzePhoto(
        request(path, 'POST', { imageDataUrl }, alice.cookie, {
          origin: 'https://untrusted.example',
        }),
      )
    ).status,
    403,
  )
  assert.equal(
    (await analyzePhoto(request(path, 'POST', { imageDataUrl: 'https://example.com/image.png' })))
      .status,
    415,
  )
  const missing = await analyzePhoto(request(path, 'POST', { imageDataUrl }))
  assert.equal(missing.status, 503)
  const body = await missing.json()
  assert.match(body.error.message, /OPENAI_API_KEY/)
  assert.equal('plan' in body, false)
  assert.equal(typeof body.requestId, 'string')
  assert.equal(missing.headers.get('cache-control'), 'no-store')
})
