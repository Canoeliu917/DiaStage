import { getAssetStorageScope, readAssetBlob, restoreAssetBlob } from '@pascal-app/core'
import { z } from 'zod'
import { getLocalAccountOwner } from './auth/local-account'

const maxBytes = 32 * 1024 * 1024
const contentTypes = ['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary'] as const
const MetadataSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]{16}$/),
  contentType: z.enum(contentTypes),
  bytes: z.number().int().positive().max(maxBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
type Metadata = z.infer<typeof MetadataSchema>
const metadataCache = new Map<string, Metadata>()
let cacheOwner: string | null = null

function assetIds(graph: unknown) {
  const ids = new Set<string>()
  const parents = new Set<object>()
  let visited = 0
  const visit = (value: unknown, depth: number) => {
    if (++visited > 1_000_000 || depth > 64) throw new Error('场景素材引用超过处理范围。')
    if (typeof value === 'string') {
      if (value.startsWith('asset://')) {
        const match = /^asset:\/\/([a-z0-9]{16})$/.exec(value)
        if (!match) throw new Error('场景含无效的素材句柄，尚未完成素材同步。')
        ids.add(match[1]!)
        if (ids.size > 256) throw new Error('单个场景的素材不能超过 256 件。')
      }
      return
    }
    if (!value || typeof value !== 'object') return
    if (parents.has(value)) throw new Error('场景含循环引用，无法同步素材。')
    parents.add(value)
    for (const child of Object.values(value)) visit(child, depth + 1)
    parents.delete(value)
  }
  visit(graph, 0)
  return ids
}

function ownerScope() {
  const owner = getLocalAccountOwner()
  if (!owner || getAssetStorageScope() !== owner)
    throw new Error('账号素材缓存尚未准备好，请重新打开场景。')
  if (cacheOwner !== owner) {
    cacheOwner = owner
    metadataCache.clear()
  }
  return owner
}

function guard(owner: string, signal: AbortSignal) {
  signal.throwIfAborted()
  if (getLocalAccountOwner() !== owner || getAssetStorageScope() !== owner)
    throw new Error('账号已切换，已停止当前素材同步。')
}

function failure(status: number) {
  return new Error(
    status === 401
      ? '登录已失效，素材尚未同步。'
      : status === 409
        ? '登录账号已变化或素材编号冲突，请重新登录检查；未覆盖云端素材。'
        : status === 413
          ? '素材大小或账号素材空间已超出限制。'
          : status === 415
            ? '素材格式不受支持；只同步场景图片与 GLB 扫描模型，不保存原始 PDF。'
            : `素材同步失败（${status}），请重试。`,
  )
}

function headerMetadata(id: string, response: Response) {
  const length = response.headers.get('content-length')
  if (!length || !/^\d+$/.test(length)) throw new Error('云端素材大小信息无效。')
  return MetadataSchema.parse({
    id,
    contentType: response.headers.get('content-type'),
    bytes: Number(length),
    sha256: response.headers.get('x-asset-sha256'),
  })
}

async function describeBlob(blob: Blob) {
  if (!blob.size || blob.size > maxBytes) throw new Error('素材为空或超过 32 MB，尚未同步。')
  const data = await blob.arrayBuffer()
  let contentType = blob.type.split(';')[0]!.trim().toLowerCase()
  if (!contentType || contentType === 'application/octet-stream') {
    const view = new DataView(data)
    if (
      data.byteLength >= 12 &&
      view.getUint32(0, true) === 0x46546c67 &&
      view.getUint32(4, true) === 2 &&
      view.getUint32(8, true) === data.byteLength
    )
      contentType = 'model/gltf-binary'
  }
  if (!contentTypes.includes(contentType as (typeof contentTypes)[number])) throw failure(415)
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return { contentType, bytes: blob.size, sha256 }
}

async function verifyBlob(blob: Blob, metadata: Metadata) {
  const local = await describeBlob(blob)
  if (
    local.bytes !== metadata.bytes ||
    local.sha256 !== metadata.sha256 ||
    local.contentType !== metadata.contentType
  )
    throw new Error('素材内容与云端校验不一致，未覆盖已有素材。')
}

function operationSignal(signal?: AbortSignal) {
  return AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)])
}

export async function uploadSceneAssets(graph: unknown, signal?: AbortSignal): Promise<void> {
  const ids = assetIds(graph)
  if (!ids.size) return
  const owner = ownerScope()
  const active = operationSignal(signal)
  for (const id of ids) {
    guard(owner, active)
    const blob = await readAssetBlob(`asset://${id}`)
    guard(owner, active)
    let metadata = metadataCache.get(id)
    if (!metadata) {
      const response = await fetch(`/api/assets/${id}`, {
        method: 'HEAD',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'x-diastage-asset-owner': owner },
        signal: active,
      })
      guard(owner, active)
      if (response.status === 404) {
        if (!blob) throw new Error('本机与云端均找不到场景使用的素材，尚未完成同步。')
        const local = await describeBlob(blob)
        guard(owner, active)
        const uploaded = await fetch(`/api/assets/${id}`, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': local.contentType, 'x-diastage-asset-owner': owner },
          credentials: 'same-origin',
          signal: active,
        })
        guard(owner, active)
        if (uploaded.status !== 200 && uploaded.status !== 201) throw failure(uploaded.status)
        metadata = MetadataSchema.parse(await uploaded.json())
        guard(owner, active)
        if (
          metadata.id !== id ||
          metadata.sha256 !== local.sha256 ||
          metadata.bytes !== local.bytes ||
          metadata.contentType !== local.contentType
        )
          throw new Error('上传后的素材校验不一致，尚未完成同步。')
      } else {
        if (response.status !== 200) throw failure(response.status)
        metadata = headerMetadata(id, response)
      }
    }
    if (blob) await verifyBlob(blob, metadata)
    guard(owner, active)
    metadataCache.set(id, metadata)
  }
}

export async function hydrateSceneAssets(graph: unknown, signal?: AbortSignal): Promise<void> {
  const ids = assetIds(graph)
  if (!ids.size) return
  const owner = ownerScope()
  const active = operationSignal(signal)
  for (const id of ids) {
    guard(owner, active)
    if (await readAssetBlob(`asset://${id}`)) {
      guard(owner, active)
      continue
    }
    guard(owner, active)
    const response = await fetch(`/api/assets/${id}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'x-diastage-asset-owner': owner },
      signal: active,
    })
    guard(owner, active)
    if (response.status !== 200) throw failure(response.status)
    const metadata = headerMetadata(id, response)
    const previous = metadataCache.get(id)
    if (
      previous &&
      (previous.sha256 !== metadata.sha256 ||
        previous.bytes !== metadata.bytes ||
        previous.contentType !== metadata.contentType)
    )
      throw new Error('云端素材编号发生内容冲突，未恢复素材。')
    const blob = await response.blob()
    await verifyBlob(blob, metadata)
    guard(owner, active)
    await restoreAssetBlob(`asset://${id}`, blob)
    const restored = await readAssetBlob(`asset://${id}`)
    if (!restored) throw new Error('素材未能恢复到本机，请重试。')
    await verifyBlob(restored, metadata)
    guard(owner, active)
    metadataCache.set(id, metadata)
  }
}
