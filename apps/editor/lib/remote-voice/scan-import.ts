import { deleteAsset, ScanNode, saveAsset, useScene } from '@pascal-app/core'
import { waitForLocalScene } from '../scene-journal'
import { stageSite } from '../stage/context'
import type { CreatedRemoteVoiceSession } from './client'
import { type ScanUpload, validateScanGlb } from './scan-glb'

const imports = new Map<string, Promise<string>>()

export async function verifyScanFile(blob: Blob, upload: ScanUpload): Promise<void> {
  if (blob.size !== upload.bytes) throw new Error('扫描下载长度不一致，未导入。')
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const hex = [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('')
  if (hex !== upload.sha256) throw new Error('扫描摘要不一致，未导入。')
  const info = await validateScanGlb(
    async (offset, length) =>
      new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
    blob.size,
  )
  if (info.vertices !== upload.vertices) throw new Error('扫描顶点信息不一致，未导入。')
}

export function importConfirmedScan(
  upload: ScanUpload,
  session: CreatedRemoteVoiceSession,
  sceneId: string,
  signal: AbortSignal,
): Promise<string> {
  if (session.sceneId !== sceneId || upload.sceneId !== sceneId || upload.sessionId !== session.id)
    return Promise.reject(new Error('扫描不属于当前场景，请重新配对。'))
  const pending = imports.get(upload.id)
  if (pending) return pending
  const task = importScan(upload, session, sceneId, signal).finally(() => imports.delete(upload.id))
  imports.set(upload.id, task)
  return task
}

async function importScan(
  upload: ScanUpload,
  session: CreatedRemoteVoiceSession,
  sceneId: string,
  signal: AbortSignal,
): Promise<string> {
  const siteId = stageSite().id
  const id = `scan_${upload.id}` as const
  const existing = useScene.getState().nodes[id]
  if (existing?.type === 'scan' && existing.metadata.remoteScanId === upload.id) {
    await waitForLocalScene(
      sceneId,
      (nodes) => ScanNode.safeParse(nodes[id]).data?.url === existing.url,
      signal,
    )
    return id
  }
  if (existing || upload.state !== 'ready') throw new Error('扫描状态已变化，请刷新待导入列表。')
  const response = await fetch(`/api/remote-voice/sessions/${session.id}/scans/${upload.id}`, {
    signal,
    headers: { 'x-diastage-owner-token': session.ownerToken },
  })
  if (
    !response.ok ||
    Number(response.headers.get('content-length')) !== upload.bytes ||
    response.headers.get('x-scan-sha256') !== upload.sha256
  )
    throw new Error('扫描下载响应不完整，未导入。')
  if (!response.body) throw new Error('扫描下载内容为空。')
  const reader = response.body.getReader(),
    chunks: ArrayBuffer[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.length
      if (size > upload.bytes) throw new Error('扫描下载长度超限，未导入。')
      chunks.push(result.value.slice().buffer)
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const blob = new Blob(chunks, { type: 'model/gltf-binary' })
  await verifyScanFile(blob, upload)
  signal.throwIfAborted()
  const assetUrl = await saveAsset(new File([blob], upload.name, { type: 'model/gltf-binary' }))
  try {
    signal.throwIfAborted()
    if (stageSite().id !== siteId || useScene.getState().readOnly)
      throw new Error('当前场景已切换或只读，未导入。')
    const node = ScanNode.parse({
      id,
      name: '场地扫描',
      parentId: siteId,
      url: assetUrl,
      metadata: { remoteScanId: upload.id, sha256: upload.sha256 },
    })
    useScene.getState().applyNodeChanges({ create: [{ node }] })
    if (useScene.getState().nodes[id]?.type !== 'scan')
      throw new Error('扫描创建未完成，资源已撤回。')
  } catch (error) {
    if (!useScene.getState().nodes[id]) await deleteAsset(assetUrl)
    throw error
  }
  await waitForLocalScene(
    sceneId,
    (nodes) => ScanNode.safeParse(nodes[id]).data?.url === assetUrl,
    signal,
  )
  return id
}
