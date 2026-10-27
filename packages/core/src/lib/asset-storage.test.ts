import 'fake-indexeddb/auto'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { deleteAsset, getAssetStorageScope, loadAssetUrl, readAssetBlob, releaseAssetUrl,
  restoreAssetBlob, saveAsset, setAssetStorageScope } from './asset-storage'

afterEach(() => setAssetStorageScope(null))

function file(contents: string, name = 'test.txt'): File {
  return new File([contents], name, { type: 'text/plain' })
}

describe('saveAsset', () => {
  const originalRandomUUID = crypto.randomUUID

  afterEach(() => {
    crypto.randomUUID = originalRandomUUID
  })

  test('returns an asset:// URL', async () => {
    const url = await saveAsset(file('hello'))
    expect(url.startsWith('asset://')).toBe(true)
  })

  test('generates distinct ids across calls', async () => {
    const [a, b] = await Promise.all([saveAsset(file('a')), saveAsset(file('b'))])
    expect(a).not.toBe(b)
  })

  // Regression test: crypto.randomUUID() throws/`undefined`s on plain-HTTP
  // origins because it requires a secure context (HTTPS or localhost). Every
  // upload used to fail on such deployments (see packages/editor's
  // reference-panel.tsx, local-guide-image.ts, both of which call saveAsset).
  test('still works when crypto.randomUUID is unavailable (insecure context)', async () => {
    // @ts-expect-error simulating a browser without Web Crypto's randomUUID
    crypto.randomUUID = undefined

    const url = await saveAsset(file('insecure-context'))
    expect(url.startsWith('asset://')).toBe(true)

    const loaded = await loadAssetUrl(url)
    expect(loaded).not.toBeNull()
  })
})

test('scopes isolate the same handle from each other and from legacy global blobs', async () => {
  const url = 'asset://scope-isolation'
  await restoreAssetBlob(url, file('legacy'))
  setAssetStorageScope('asset-test-alice')
  expect(await readAssetBlob(url)).toBeNull()
  await restoreAssetBlob(url, file('alice'))
  const revoke = spyOn(URL, 'revokeObjectURL')
  try {
    const first = await loadAssetUrl(url)
    setAssetStorageScope('asset-test-bob')
    expect(getAssetStorageScope()).toBe('asset-test-bob')
    expect(revoke).toHaveBeenCalledWith(first!)
    expect(await readAssetBlob(url)).toBeNull()
    await restoreAssetBlob(url, file('bob'))
    expect(await (await readAssetBlob(url))?.text()).toBe('bob')
    expect(await loadAssetUrl(url)).not.toBe(first)
    setAssetStorageScope('asset-test-alice')
    expect(await (await readAssetBlob(url))?.text()).toBe('alice')
    setAssetStorageScope(null)
    expect(await (await readAssetBlob(url))?.text()).toBe('legacy')
  } finally { revoke.mockRestore() }
})

test('restore never replaces an existing handle and account deletion cannot remove legacy data', async () => {
  const url = 'asset://restore-immutable'
  await restoreAssetBlob(url, file('global'))
  setAssetStorageScope('asset-test-restore')
  await restoreAssetBlob(url, file('original'))
  await restoreAssetBlob(url, file('replacement'))
  expect(await (await readAssetBlob(url))?.text()).toBe('original')
  await deleteAsset(url)
  expect(await readAssetBlob(url)).toBeNull()
  setAssetStorageScope(null)
  expect(await (await readAssetBlob(url))?.text()).toBe('global')
})

test('scope changes reject pending reads and cannot publish an object URL from the old scope', async () => {
  setAssetStorageScope('asset-test-race-a')
  const url = await saveAsset(file('old account'))
  const read = readAssetBlob(url)
  setAssetStorageScope('asset-test-race-b')
  await expect(read).rejects.toThrow('scope changed')
  setAssetStorageScope('asset-test-race-a')
  const create = spyOn(URL, 'createObjectURL')
  try {
    const loading = loadAssetUrl(url)
    setAssetStorageScope('asset-test-race-b')
    expect(await loading).toBeNull()
    expect(create).not.toHaveBeenCalled()
  } finally { create.mockRestore() }
})

describe('loadAssetUrl', () => {
  test('release keeps the persisted file for undo, rollback removes only an uncommitted file', async () => {
    const url = await saveAsset(file('scan rollback'))
    const first = await loadAssetUrl(url)
    releaseAssetUrl(url)
    const second = await loadAssetUrl(url)
    expect(second).not.toBe(first)
    expect(second).not.toBeNull()
    await deleteAsset(url)
    expect(await loadAssetUrl(url)).toBeNull()
  })
  test('round-trips a saved asset back to an object URL', async () => {
    const url = await saveAsset(file('round-trip'))
    const objectUrl = await loadAssetUrl(url)
    expect(objectUrl?.startsWith('blob:')).toBe(true)
  })

  test('passes through blob: and http(s) URLs unchanged', async () => {
    expect(await loadAssetUrl('blob:http://example.com/1234')).toBe('blob:http://example.com/1234')
    expect(await loadAssetUrl('https://cdn.example.com/a.glb')).toBe(
      'https://cdn.example.com/a.glb',
    )
  })

  test('returns null for an unknown asset id', async () => {
    expect(await loadAssetUrl('asset://does-not-exist')).toBeNull()
  })

  test('returns null for an empty URL', async () => {
    expect(await loadAssetUrl('')).toBeNull()
  })
})
