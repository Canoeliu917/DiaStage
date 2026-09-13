import { createHash } from 'node:crypto'
import { mkdir, open, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { z } from 'zod'
import { RemoteVoiceApiError, withAbort } from './api'
import { SCAN_LIMITS, type ScanUpload, validateScanGlb } from './scan-glb'
import { remoteVoiceSessions } from './session-store'

const inputSchema = z.strictObject({
  id: z.string().uuid(),
  name: z
    .string()
    .min(5)
    .max(160)
    .regex(/\.glb$/i),
  bytes: z.number().int().positive().max(SCAN_LIMITS.bytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
type UploadInput = z.infer<typeof inputSchema>
type Entry = {
  info: ScanUpload
  reserved: boolean
  controller: AbortController
  task?: Promise<ScanUpload>
}

export class ScanUploadStore {
  private readonly entries = new Map<string, Entry>()
  private initialized: Promise<void> | undefined
  constructor(
    readonly directory: string,
    private readonly now: () => number = Date.now,
  ) {}

  list(sessionId: string): ScanUpload[] {
    return [...this.entries.values()]
      .filter((e) => e.info.sessionId === sessionId)
      .map((e) => ({ ...e.info }))
  }

  async upload(
    sessionId: string,
    sceneId: string | null,
    input: UploadInput,
    body: ReadableStream<Uint8Array> | null,
    signal: AbortSignal,
    assertActive: () => void = () => {},
  ): Promise<ScanUpload> {
    if (!sceneId)
      throw new RemoteVoiceApiError('SCENE_NOT_SAVED', '请先在电脑端保存并连接场景。', 409)
    if (!inputSchema.safeParse(input).success || !body)
      throw new RemoteVoiceApiError('SCAN_INVALID', '请选择 32MB 以内的单文件 .glb。', 400)
    await this.initialize()
    // Revocation can occur while startup cleanup awaits disk access.
    assertActive()
    signal.throwIfAborted()
    const existing = this.entries.get(input.id)
    if (existing) {
      if (
        existing.info.sessionId !== sessionId ||
        existing.info.sha256 !== input.sha256 ||
        existing.info.bytes !== input.bytes
      )
        throw new RemoteVoiceApiError('SCAN_CONFLICT', '上传编号已使用，请重新选择文件。', 409)
      void body.cancel().catch(() => {})
      return Promise.resolve({ ...existing.info })
    }
    const entries = [...this.entries.values()]
    const active = entries.filter((e) => e.reserved)
    if (
      active.some((e) => e.info.sessionId === sessionId) ||
      active.length >= SCAN_LIMITS.concurrent ||
      active.reduce((n, e) => n + e.info.bytes, 0) + input.bytes > SCAN_LIMITS.temporaryBytes
    ) {
      throw new RemoteVoiceApiError('SCAN_CAPACITY', '临时扫描空间繁忙，请先处理待导入文件。', 429)
    }
    // Reserve synchronously before opening a file so concurrent requests cannot oversubscribe.
    for (const old of entries)
      if (old.info.sessionId === sessionId && !old.reserved) this.entries.delete(old.info.id)
    const entry: Entry = {
      info: {
        ...input,
        sessionId,
        sceneId,
        state: 'uploading',
        vertices: 0,
        expiresAt: this.now() + SCAN_LIMITS.ttlMs,
        error: null,
      },
      reserved: true,
      controller: new AbortController(),
    }
    this.entries.set(input.id, entry)
    entry.task = this.receive(entry, body, signal)
    return entry.task
  }

  async download(sessionId: string, id: string): Promise<Response> {
    const entry = this.require(sessionId, id)
    if (entry.info.state !== 'ready' || entry.info.expiresAt <= this.now())
      throw new RemoteVoiceApiError('SCAN_NOT_READY', '扫描不可下载，请重新上传。', 409)
    const file = await open(this.path(id), 'r')
    const stream = file.createReadStream({ autoClose: true })
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'content-type': 'model/gltf-binary',
        'content-length': String(entry.info.bytes),
        'x-scan-sha256': entry.info.sha256,
      },
    })
  }

  async finish(sessionId: string, id: string, state: 'imported' | 'rejected'): Promise<ScanUpload> {
    const entry = this.require(sessionId, id)
    if (state === 'imported' && entry.info.state === 'uploading')
      throw new RemoteVoiceApiError('SCAN_NOT_READY', '扫描尚未完成。', 409)
    if (entry.info.state === 'ready' || entry.info.state === 'uploading') entry.info.state = state
    entry.controller.abort()
    await entry.task
    await this.removeFile(entry)
    return { ...entry.info }
  }

  async revoke(sessionId: string): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.info.sessionId !== sessionId) continue
      await this.finish(sessionId, entry.info.id, 'rejected')
      if (!entry.reserved) this.entries.delete(entry.info.id)
    }
  }

  async sweep(): Promise<void> {
    await this.initialize()
    for (const entry of this.entries.values()) {
      if (entry.info.expiresAt <= this.now()) await this.revoke(entry.info.sessionId)
      else if (entry.reserved && !['uploading', 'ready'].includes(entry.info.state))
        await this.removeFile(entry)
    }
    await mkdir(this.directory, { recursive: true })
    // After a server restart only expired files created by this store are eligible for cleanup.
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}\.glb$/.test(name) || this.entries.has(name.slice(0, -4))) continue
      const path = join(this.directory, name)
      const info = await stat(path).catch(() => null)
      if (info && this.now() - info.mtimeMs >= SCAN_LIMITS.ttlMs)
        await rm(path, { force: true }).catch(() => {})
    }
  }

  private require(sessionId: string, id: string): Entry {
    const entry = this.entries.get(id)
    if (!entry || entry.info.sessionId !== sessionId)
      throw new RemoteVoiceApiError('SCAN_NOT_FOUND', '扫描已清理或不存在。', 404)
    return entry
  }
  private initialize(): Promise<void> {
    this.initialized ??= (async () => {
      await mkdir(this.directory, { recursive: true })
      // Pairing authority is in memory. After restart old uploads have no valid owner; clear before admitting capacity.
      for (const name of await readdir(this.directory)) {
        if (/^[a-f0-9-]{36}\.glb$/.test(name)) await rm(join(this.directory, name), { force: true })
      }
    })()
    return this.initialized
  }
  private path(id: string): string {
    return join(this.directory, `${id}.glb`)
  }
  private async removeFile(entry: Entry): Promise<void> {
    if (!entry.reserved) return
    try {
      await rm(this.path(entry.info.id), { force: true })
      entry.reserved = false
    } catch {
      /* A download can still hold the file on Windows; the sweeper retries without releasing capacity. */
    }
  }

  private async receive(
    entry: Entry,
    body: ReadableStream<Uint8Array>,
    requestSignal: AbortSignal,
  ): Promise<ScanUpload> {
    const controller = entry.controller
    const signal = AbortSignal.any([requestSignal, controller.signal])
    const timeout = setTimeout(
      () => controller.abort(new Error('扫描上传超时，请重试。')),
      SCAN_LIMITS.uploadMs,
    )
    const reader = body.getReader()
    let file: Awaited<ReturnType<typeof open>> | undefined
    try {
      await mkdir(this.directory, { recursive: true })
      file = await open(this.path(entry.info.id), 'wx+')
      const hash = createHash('sha256')
      let size = 0
      while (true) {
        const result = await withAbort(reader.read(), signal)
        if (result.done) break
        size += result.value.length
        if (size > entry.info.bytes) throw new Error('扫描实际长度超过声明长度。')
        hash.update(result.value)
        let offset = 0
        while (offset < result.value.length) {
          signal.throwIfAborted()
          const { bytesWritten } = await file.write(result.value, offset)
          if (!bytesWritten) throw new Error('临时磁盘写入失败。')
          offset += bytesWritten
        }
      }
      if (size !== entry.info.bytes || hash.digest('hex') !== entry.info.sha256)
        throw new Error('扫描长度或 SHA-256 不匹配，请重新上传。')
      const handle = file
      const info = await validateScanGlb(async (offset, length) => {
        signal.throwIfAborted()
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, offset)
        return buffer.subarray(0, bytesRead)
      }, size)
      signal.throwIfAborted()
      entry.info.vertices = info.vertices
      entry.info.state = 'ready'
    } catch (error) {
      if (entry.info.state === 'uploading') entry.info.state = 'failed'
      entry.info.error = signal.aborted
        ? '上传已取消或超时，请重试。'
        : error instanceof Error && !('code' in error)
          ? error.message.slice(0, 200)
          : '临时文件写入失败，请稍后重试。'
    } finally {
      clearTimeout(timeout)
      void reader.cancel().catch(() => {})
      reader.releaseLock()
      await file?.close().catch(() => {})
      if (entry.info.state !== 'ready') await this.removeFile(entry)
    }
    return { ...entry.info }
  }
}

declare global {
  var __diastageScanUploads: ScanUploadStore | undefined
}
// ponytail: one server process, matching the existing pairing store; shared storage is needed for multiple replicas.
export const scanUploads =
  globalThis.__diastageScanUploads ?? new ScanUploadStore(join(tmpdir(), 'diastage-scan-uploads'))
if (!globalThis.__diastageScanUploads) {
  globalThis.__diastageScanUploads = scanUploads
  remoteVoiceSessions.onRevoke((id) => {
    void scanUploads.revoke(id).catch(() => {})
  })
  const sweep = setInterval(() => {
    remoteVoiceSessions.removeExpired()
    void scanUploads.sweep().catch(() => {})
  }, 10_000)
  sweep.unref()
}
