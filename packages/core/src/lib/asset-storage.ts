import { del, get, set, update } from 'idb-keyval'
import { customAlphabet } from 'nanoid'

export const ASSET_PREFIX = 'asset_data:'

// Cache for active object URLs to prevent leaks and flickering
const urlCache = new Map<string, string>()
let storageScope: string | null = null
let scopeEpoch = 0

export function getAssetStorageScope(): string | null {
  return storageScope
}

export function setAssetStorageScope(scope: string | null): void {
  if (scope !== null && !scope.trim()) throw new Error('An asset storage scope is required')
  if (scope === storageScope) return
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
  storageScope = scope
  scopeEpoch++
}

function assetKey(id: string): IDBValidKey {
  return storageScope === null ? `${ASSET_PREFIX}${id}` : [ASSET_PREFIX, storageScope, id]
}

function cacheKey(id: string) {
  return JSON.stringify([storageScope, id])
}

function assertScope(epoch: number) {
  if (scopeEpoch !== epoch) throw new Error('Asset storage scope changed during the operation')
}

export async function readAssetBlob(url: string): Promise<Blob | null> {
  if (!url.startsWith('asset://') || url.length === 'asset://'.length) return null
  const epoch = scopeEpoch
  const blob = await get<unknown>(assetKey(url.slice('asset://'.length)))
  assertScope(epoch)
  if (blob === undefined) return null
  if (!(blob instanceof Blob)) throw new Error('Invalid stored asset')
  return blob
}

export async function restoreAssetBlob(url: string, blob: Blob): Promise<void> {
  if (!url.startsWith('asset://') || url.length === 'asset://'.length || !(blob instanceof Blob))
    throw new Error('An asset handle and blob are required')
  const epoch = scopeEpoch
  await update(assetKey(url.slice('asset://'.length)), (current: unknown) => {
    if (current !== undefined && !(current instanceof Blob)) throw new Error('Invalid stored asset')
    return current ?? blob
  })
  assertScope(epoch)
}

// Unlike crypto.randomUUID(), nanoid works outside secure contexts.
const nanoAssetId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16)

/**
 * Save a file to IndexedDB and return a custom protocol URL
 */
export async function saveAsset(file: File): Promise<string> {
  const id = nanoAssetId()
  const epoch = scopeEpoch
  await set(assetKey(id), file)
  assertScope(epoch)
  return `asset://${id}`
}

/** Only remove uncommitted imports; committed assets may still be referenced by undo. */
export async function deleteAsset(url: string): Promise<void> {
  if (!url.startsWith('asset://')) return
  const id = url.slice('asset://'.length)
  const epoch = scopeEpoch
  await del(assetKey(id))
  if (scopeEpoch === epoch) releaseAssetUrl(url)
}

export function releaseAssetUrl(url: string): void {
  if (!url.startsWith('asset://')) return
  const id = url.slice('asset://'.length)
  const key = cacheKey(id)
  const cached = urlCache.get(key)
  if (cached) URL.revokeObjectURL(cached)
  urlCache.delete(key)
}

/**
 * Load a file from IndexedDB and return an object URL
 * If the URL is not a custom protocol URL, return it as is
 */
export async function loadAssetUrl(url: string): Promise<string | null> {
  if (!url) return null

  // If it's already a blob or http URL, return as is
  if (url.startsWith('blob:') || url.startsWith('http')) {
    return url
  }

  // Handle our custom asset protocol
  if (url.startsWith('asset://')) {
    const id = url.replace('asset://', '')
    const key = cacheKey(id)
    const epoch = scopeEpoch

    // Check cache first
    if (urlCache.has(key)) {
      return urlCache.get(key)!
    }

    try {
      const file = await readAssetBlob(url)
      assertScope(epoch)
      if (!file) {
        console.warn(`Asset not found: ${id}`)
        return null
      }
      if (urlCache.has(key)) return urlCache.get(key)!
      const objectUrl = URL.createObjectURL(file)
      urlCache.set(key, objectUrl)
      return objectUrl
    } catch (error) {
      console.error('Failed to load asset:', error)
      return null
    }
  }

  // Legacy data URLs are returned as is
  return url
}
