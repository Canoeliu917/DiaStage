import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import {
  deleteAsset,
  readAssetBlob,
  restoreAssetBlob,
  saveAsset,
  setAssetStorageScope,
} from '@pascal-app/core'
import * as account from './auth/local-account'
import { hydrateSceneAssets, uploadSceneAssets } from './scene-assets-client'

const id = '0000000000000001'
const url = `asset://${id}`
const graph = () => ({
  nodes: { photo: { src: url } },
  metadata: { versions: [{ graph: { src: url } }] },
})
const originalFetch = globalThis.fetch
let owner = ''
let sessionOwner = ''
let sequence = 0
let requests: { owner: string; method: string; id: string }[]
let server: Map<
  string,
  { blob: Blob; metadata: { id: string; contentType: string; bytes: number; sha256: string } }
>
let failNext: { method: string; status: number } | null
async function metadata(assetId: string, blob: Blob) {
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('')
  return { id: assetId, contentType: blob.type, bytes: blob.size, sha256 }
}
beforeEach(() => {
  owner = `scene-assets-test-${++sequence}`
  sessionOwner = owner
  setAssetStorageScope(owner)
  spyOn(account, 'getLocalAccountOwner').mockImplementation(() => owner)
  requests = []
  server = new Map()
  failNext = null
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(
      new URL(
        input instanceof Request ? input.url : String(input),
        'https://assets-offline.invalid',
      ),
      init,
    )
    const assetId = /^\/api\/assets\/([a-z0-9]{16})$/.exec(new URL(request.url).pathname)?.[1]
    if (!assetId) throw new Error('External network is forbidden')
    const requestOwner = owner
    requests.push({ owner: requestOwner, method: request.method, id: assetId })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(request.headers.get('x-diastage-asset-owner')).toBe(requestOwner)
    if (request.headers.get('x-diastage-asset-owner') !== sessionOwner)
      return Response.json({ error: 'asset_account_changed' }, { status: 409 })
    if (failNext?.method === request.method) {
      const status = failNext.status
      failNext = null
      return new Response(null, { status })
    }
    const key = `${requestOwner}:${assetId}`
    let stored = server.get(key)
    if (request.method === 'PUT') {
      const blob = new Blob([await request.arrayBuffer()], {
        type: request.headers.get('content-type')!,
      })
      const next = await metadata(assetId, blob)
      if (
        stored &&
        (stored.metadata.sha256 !== next.sha256 || stored.metadata.contentType !== next.contentType)
      )
        return new Response(null, { status: 409 })
      const status = stored ? 200 : 201
      stored = { blob, metadata: next }
      server.set(key, stored)
      return Response.json(next, { status })
    }
    if (!stored) return new Response(null, { status: 404 })
    const headers = {
      'content-type': stored.metadata.contentType,
      'content-length': String(stored.metadata.bytes),
      'x-asset-sha256': stored.metadata.sha256,
    }
    return new Response(request.method === 'HEAD' ? null : stored.blob, { headers })
  }) as unknown as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
  setAssetStorageScope(null)
})

test('graphs without handles are no-ops without an account or storage scope', async () => {
  owner = ''
  setAssetStorageScope(null)
  await uploadSceneAssets({ nodes: {}, image: 'data:image/png;base64,AAAA' })
  await hydrateSceneAssets({ nodes: {} })
  await uploadSceneAssets({
    nodes: Array.from({ length: 2500 }, () => ({ metadata: Array(50).fill(0) })),
  })
  expect(requests).toEqual([])
})

test('unique handles include version metadata, upload once and never rewrite the graph', async () => {
  await restoreAssetBlob(url, new Blob(['synthetic image'], { type: 'image/png' }))
  const source = graph()
  const before = JSON.stringify(source)
  await uploadSceneAssets(source)
  await uploadSceneAssets(source)
  expect(requests.map((r) => r.method)).toEqual(['HEAD', 'PUT'])
  expect(JSON.stringify(source)).toBe(before)
  expect(server.size).toBe(1)
  expect(await (await readAssetBlob(url))?.text()).toBe('synthetic image')
})

test('a second browser cache restores the same immutable handle and only missing assets', async () => {
  const blob = new Blob(['from cloud'], { type: 'image/webp' })
  server.set(`${owner}:${id}`, { blob, metadata: await metadata(id, blob) })
  const source = graph()
  const before = JSON.stringify(source)
  await hydrateSceneAssets(source)
  await hydrateSceneAssets(source)
  expect(requests.map((r) => r.method)).toEqual(['GET'])
  expect(await (await readAssetBlob(url))?.text()).toBe('from cloud')
  expect(JSON.stringify(source)).toBe(before)
})

test('another account cannot read scoped or legacy assets or reuse successful metadata', async () => {
  const firstOwner = owner
  await restoreAssetBlob(url, new Blob(['alice'], { type: 'image/png' }))
  await uploadSceneAssets(graph())
  setAssetStorageScope(null)
  const legacy = await saveAsset(new File(['legacy'], 'legacy.png', { type: 'image/png' }))
  owner = `${firstOwner}-other`
  sessionOwner = owner
  setAssetStorageScope(owner)
  await expect(uploadSceneAssets(graph())).rejects.toThrow('本机与云端均找不到')
  await expect(uploadSceneAssets({ src: legacy })).rejects.toThrow('本机与云端均找不到')
  expect(requests.filter((r) => r.owner === owner).map((r) => r.method)).toEqual(['HEAD', 'HEAD'])
  expect(server.has(`${owner}:${id}`)).toBe(false)
  setAssetStorageScope(null)
  expect(await (await readAssetBlob(legacy))?.text()).toBe('legacy')
})

test('uncached requests cannot upload to or hydrate from a cookie-switched session account', async () => {
  const firstOwner = owner
  await restoreAssetBlob(url, new Blob(['alice local'], { type: 'image/png' }))
  sessionOwner = `${owner}-cookie-switched`
  await expect(uploadSceneAssets(graph())).rejects.toThrow('登录账号已变化')
  expect(requests.map((r) => r.method)).toEqual(['HEAD'])
  expect(server.has(`${sessionOwner}:${id}`)).toBe(false)
  await deleteAsset(url)
  const bob = new Blob(['bob private'], { type: 'image/png' })
  server.set(`${sessionOwner}:${id}`, { blob: bob, metadata: await metadata(id, bob) })
  await expect(hydrateSceneAssets(graph())).rejects.toThrow('登录账号已变化')
  expect(await readAssetBlob(url)).toBeNull()
  expect(owner).toBe(firstOwner)
})

test('account switches during a pending download cannot restore the previous response', async () => {
  const firstOwner = owner
  const blob = new Blob(['old account'], { type: 'image/png' })
  const info = await metadata(id, blob)
  let respond!: (response: Response) => void
  let fetched!: () => void
  const started = new Promise<void>((resolve) => {
    fetched = resolve
  })
  globalThis.fetch = mock(async () => {
    fetched()
    return new Promise<Response>((resolve) => {
      respond = resolve
    })
  }) as unknown as typeof fetch
  const pending = hydrateSceneAssets(graph())
  await started
  owner = `${firstOwner}-next`
  setAssetStorageScope(owner)
  respond(
    new Response(blob, {
      headers: {
        'content-type': info.contentType,
        'content-length': String(info.bytes),
        'x-asset-sha256': info.sha256,
      },
    }),
  )
  await expect(pending).rejects.toThrow('账号已切换')
  expect(await readAssetBlob(url)).toBeNull()
  owner = firstOwner
  setAssetStorageScope(owner)
  expect(await readAssetBlob(url)).toBeNull()
})

test('failed uploads and downloads can be retried without caching failures', async () => {
  await restoreAssetBlob(url, new Blob(['retry'], { type: 'image/jpeg' }))
  failNext = { method: 'PUT', status: 413 }
  await expect(uploadSceneAssets(graph())).rejects.toThrow('超出限制')
  await uploadSceneAssets(graph())
  expect(server.size).toBe(1)
  await deleteAsset(url)
  failNext = { method: 'GET', status: 401 }
  await expect(hydrateSceneAssets(graph())).rejects.toThrow('登录已失效')
  expect(await readAssetBlob(url)).toBeNull()
  await hydrateSceneAssets(graph())
  expect(await (await readAssetBlob(url))?.text()).toBe('retry')
})

test('local ID conflicts and corrupted downloads never overwrite immutable content', async () => {
  const original = new Blob(['original'], { type: 'image/png' })
  server.set(`${owner}:${id}`, { blob: original, metadata: await metadata(id, original) })
  await restoreAssetBlob(url, new Blob(['different'], { type: 'image/png' }))
  await expect(uploadSceneAssets(graph())).rejects.toThrow('校验不一致')
  expect(requests.map((r) => r.method)).toEqual(['HEAD'])
  await deleteAsset(url)
  server.set(`${owner}:${id}`, {
    blob: new Blob(['corrupt!'], { type: 'image/png' }),
    metadata: await metadata(id, original),
  })
  await expect(hydrateSceneAssets(graph())).rejects.toThrow('校验不一致')
  expect(await readAssetBlob(url)).toBeNull()
})

test('invalid, excessive and cyclic references fail before network; PDFs are never uploaded', async () => {
  for (const source of [
    { src: 'asset://bad' },
    Array.from({ length: 257 }, (_, n) => `asset://${String(n).padStart(16, '0')}`),
  ])
    await expect(uploadSceneAssets(source)).rejects.toThrow()
  const cyclic: { self?: unknown } = {}
  cyclic.self = cyclic
  await expect(uploadSceneAssets(cyclic)).rejects.toThrow('循环引用')
  expect(requests).toEqual([])
  await restoreAssetBlob(url, new Blob(['%PDF synthetic'], { type: 'application/pdf' }))
  await expect(uploadSceneAssets(graph())).rejects.toThrow('不保存原始 PDF')
  expect(requests.map((r) => r.method)).toEqual(['HEAD'])
})
