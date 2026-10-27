import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { GET, HEAD, PUT } from '../app/api/assets/[id]/route'
import { __resetAuthForTests, getAuth, getSession } from './auth/server'
import { getSceneAssetStore } from './scene-assets-server'

const origin = 'http://127.0.0.1:4329'
const id = '0123456789abcdef'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
)
let directory: string
let alice: string
let bob: string
let aliceId: string
let bobId: string
let networkAttempts = 0
const params = (value = id) => ({ params: Promise.resolve({ id: value }) })
function request(
  method = 'GET',
  cookie = alice,
  body?: Uint8Array,
  extra: Record<string, string> = {},
) {
  return new Request(`${origin}/api/assets/${id}`, {
    method,
    headers: {
      host: new URL(origin).host,
      origin,
      'content-type': 'image/png',
      'x-diastage-asset-owner': cookie === bob ? bobId : aliceId,
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    ...(body ? { body: new Uint8Array(body) } : {}),
  })
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'diastage-assets-auth-'))
  process.env.PASCAL_DB_PATH = join(directory, 'scenes.db')
  process.env.BETTER_AUTH_URL = origin
  process.env.BETTER_AUTH_SECRET = 'asset-integration-only-secret-at-least-32-characters'
  process.env.DIASTAGE_AUTH_EMAIL_ENABLED = 'false'
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  const rejectNetwork = () => {
    networkAttempts++
    throw new Error('Unexpected outbound request in asset fixture')
  }
  globalThis.fetch = Object.assign(async () => rejectNetwork(), { preconnect: rejectNetwork })
  await __resetAuthForTests()
  const auth = await getAuth()
  const register = async (name: string) => {
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4329', origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          email: `${name}@example.test`,
          password: 'synthetic-password-123',
        }),
      }),
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
  ;({ cookie: alice, id: aliceId } = await register('alice-assets'))
  ;({ cookie: bob, id: bobId } = await register('bob-assets'))
})
after(async () => {
  await getSceneAssetStore().close()
  await __resetAuthForTests()
  if (directory) {
    const target = resolve(directory)
    assert.equal(dirname(target), resolve(tmpdir()))
    assert.ok(basename(target).startsWith('diastage-assets-auth-'))
    await rm(target, { recursive: true, force: true })
  }
  assert.equal(networkAttempts, 0)
})

test('anonymous and legacy operator tokens cannot upload or retrieve private assets', async () => {
  for (const route of [GET, HEAD, PUT]) {
    const method = route === PUT ? 'PUT' : route === HEAD ? 'HEAD' : 'GET'
    assert.equal(
      (await route(request(method, '', method === 'PUT' ? png : undefined), params())).status,
      401,
    )
    assert.equal(
      (
        await route(
          request(method, '', method === 'PUT' ? png : undefined, {
            authorization: 'Bearer obsolete-shared-key',
          }),
          params(),
        )
      ).status,
      401,
    )
  }
})

test('real sessions upload before a scene exists and preserve exact metadata and bytes', async () => {
  const first = await PUT(request('PUT', alice, png), params())
  assert.equal(first.status, 201)
  const metadata = await first.json()
  assert.deepEqual(metadata, {
    id,
    contentType: 'image/png',
    bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
  })
  assert.equal((await PUT(request('PUT', alice, png), params())).status, 200)
  const head = await HEAD(request('HEAD'), params())
  const get = await GET(request(), params())
  for (const response of [head, get]) {
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('content-length'), String(png.length))
    assert.equal(response.headers.get('x-asset-sha256'), metadata.sha256)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  }
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), png)
})

test('another account receives 404 and supplied owner fields cannot change the stored owner', async () => {
  assert.equal((await GET(request('GET', bob), params())).status, 404)
  const head = await HEAD(request('HEAD', bob), params())
  assert.equal(head.status, 404)
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  const altered = new Uint8Array(png)
  altered[altered.length - 1] = altered[altered.length - 1]! ^ 1
  assert.equal(
    (await PUT(request('PUT', bob, altered, { 'x-owner-id': 'alice-assets' }), params())).status,
    201,
  )
  assert.deepEqual(Buffer.from(await (await GET(request(), params())).arrayBuffer()), png)
  assert.deepEqual(
    new Uint8Array(await (await GET(request('GET', bob), params())).arrayBuffer()),
    altered,
  )
  assert.equal((await PUT(request('PUT', alice, altered), params())).status, 409)
  assert.deepEqual(Buffer.from(await (await GET(request(), params())).arrayBuffer()), png)
})

test('origin and phone-token checks apply before any binary processing', async () => {
  for (const [headers, status] of [
    [{ origin: 'https://untrusted.example' }, 403],
    [{ 'sec-fetch-site': 'cross-site' }, 403],
    [{ 'x-diastage-remote-token': 'phone-token' }, 403],
  ] as const)
    assert.equal((await PUT(request('PUT', alice, png, headers), params())).status, status)
  assert.equal(
    (await GET(request('GET', alice, undefined, { origin: 'https://untrusted.example' }), params()))
      .status,
    403,
  )
})

test('a cookie account change rejects the expected owner before reading or returning asset data', async () => {
  for (const route of [GET, HEAD, PUT]) {
    const method = route === PUT ? 'PUT' : route === HEAD ? 'HEAD' : 'GET'
    for (const expected of ['', aliceId]) {
      const input = request(method, bob, method === 'PUT' ? png : undefined, {
        'x-diastage-asset-owner': expected,
      })
      if (!expected) input.headers.delete('x-diastage-asset-owner')
      const response = await route(input, params())
      assert.equal(response.status, 409)
      if (method === 'HEAD') assert.equal((await response.arrayBuffer()).byteLength, 0)
      else assert.equal((await response.json()).error, 'asset_account_changed')
      if (method === 'PUT') assert.equal(input.bodyUsed, false)
    }
  }
  let reads = 0
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads++
        controller.enqueue(png)
        controller.close()
      },
    },
    { highWaterMark: 0 },
  )
  const raced = new Request(`${origin}/api/assets/${id}`, {
    method: 'PUT',
    headers: {
      host: '127.0.0.1:4329',
      origin,
      cookie: bob,
      'content-type': 'image/png',
      'x-diastage-asset-owner': aliceId,
    },
    body: stream,
    duplex: 'half',
  } as RequestInit)
  assert.equal((await PUT(raced, params())).status, 409)
  assert.equal(reads, 0)
  await stream.cancel()
  assert.deepEqual(Buffer.from(await (await GET(request(), params())).arrayBuffer()), png)
})

test('invalid IDs, PDF, MIME spoofing and an oversized streamed request are rejected', async () => {
  assert.equal((await PUT(request('PUT', alice, png), params('../private'))).status, 400)
  assert.equal(
    (await PUT(request('PUT', alice, png, { 'content-type': 'application/pdf' }), params())).status,
    415,
  )
  const fake = new TextEncoder().encode('%PDF-synthetic')
  assert.equal((await PUT(request('PUT', alice, fake), params())).status, 415)
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024))
    },
    cancel() {
      cancelled = true
    },
  })
  const tooLarge = new Request(`${origin}/api/assets/${id}`, {
    method: 'PUT',
    headers: {
      host: '127.0.0.1:4329',
      origin,
      cookie: alice,
      'content-type': 'image/png',
      'x-diastage-asset-owner': aliceId,
      'content-length': '1',
    },
    body: stream,
    duplex: 'half',
  } as RequestInit)
  const response = await PUT(tooLarge, params())
  assert.equal(response.status, 413)
  assert.equal((await response.json()).error, 'asset_too_large')
  assert.equal(cancelled, true)
})

test('sign-out immediately revokes access to the already stored binary', async () => {
  const auth = await getAuth()
  const signedOut = await auth.handler(
    new Request(`${origin}/api/auth/sign-out`, {
      method: 'POST',
      headers: { host: '127.0.0.1:4329', origin, cookie: bob, 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  assert.equal(signedOut.status, 200)
  assert.equal((await GET(request('GET', bob), params())).status, 401)
  assert.equal((await PUT(request('PUT', bob, png), params())).status, 401)
})
