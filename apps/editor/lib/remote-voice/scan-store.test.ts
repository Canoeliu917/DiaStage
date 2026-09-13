import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCAN_LIMITS } from './scan-glb'
import { ScanUploadStore } from './scan-store'
import { scanGlb } from './scan-test-fixtures'

const input = (bytes: Uint8Array) => ({
  id: crypto.randomUUID(),
  name: 'synthetic.glb',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
})
function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 64) c.enqueue(bytes.slice(i, i + 64))
      c.close()
    },
  })
}

test('startup removes orphan uploads before admission and rechecks revoked authority', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diastage-scan-test-'))
  try {
    await writeFile(join(dir, `${crypto.randomUUID()}.glb`), scanGlb())
    const store = new ScanUploadStore(dir)
    let active = true
    const uploading = store.upload(
      'revoked',
      'scene',
      input(scanGlb()),
      stream(scanGlb()),
      new AbortController().signal,
      () => {
        if (!active) throw new Error('revoked')
      },
    )
    active = false
    await store.revoke('revoked')
    await expect(uploading).rejects.toThrow('revoked')
    expect(store.list('revoked')).toEqual([])
    expect(await readdir(dir)).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('real 120-second stalled upload timeout closes stream and removes temporary file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diastage-scan-test-'))
  const store = new ScanUploadStore(dir)
  let cancelled = false
  try {
    const start = performance.now()
    const result = await store.upload(
      'timeout',
      'scene',
      input(scanGlb()),
      new ReadableStream({
        cancel() {
          cancelled = true
        },
      }),
      new AbortController().signal,
    )
    expect(performance.now() - start).toBeGreaterThanOrEqual(SCAN_LIMITS.uploadMs - 100)
    expect(result.state).toBe('failed')
    expect(result.error).toContain('超时')
    expect(cancelled).toBe(true)
    expect(await readdir(dir)).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 130_000)

test('250 real temporary-file upload/import-or-dismiss cycles, lost ACK and no leaks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diastage-scan-test-'))
  const store = new ScanUploadStore(dir)
  const bytes = scanGlb()
  try {
    for (let i = 0; i < 250; i++) {
      const spec = input(bytes)
      const ready = await store.upload(
        'session',
        'saved-scene',
        spec,
        stream(bytes),
        new AbortController().signal,
      )
      expect(ready.state).toBe('ready')
      if (i % 2 === 0) {
        const response = await store.download('session', spec.id)
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
      }
      const state = i % 2 === 0 ? 'imported' : 'rejected'
      expect((await store.finish('session', spec.id, state)).state).toBe(state)
      expect((await store.finish('session', spec.id, state)).state).toBe(state)
      expect(
        (
          await store.upload(
            'session',
            'saved-scene',
            spec,
            stream(bytes),
            new AbortController().signal,
          )
        ).state,
      ).toBe(state)
      expect(await readdir(dir)).toEqual([])
    }
    expect(store.list('session')).toHaveLength(1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('digest, truncation, concurrent reservations, cancel, revoke and expiry release files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diastage-scan-test-'))
  let now = Date.now()
  const store = new ScanUploadStore(dir, () => now)
  const bytes = scanGlb()
  try {
    for (const [spec, body] of [
      [{ ...input(bytes), sha256: '0'.repeat(64) }, bytes],
      [input(bytes), bytes.slice(0, -1)],
    ] as const) {
      expect(
        (await store.upload('bad', 'scene', spec, stream(body), new AbortController().signal))
          .state,
      ).toBe('failed')
      expect(await readdir(dir)).toEqual([])
    }
    const tasks: Promise<unknown>[] = [],
      aborts: AbortController[] = []
    for (let i = 0; i < SCAN_LIMITS.concurrent; i++) {
      const abort = new AbortController()
      aborts.push(abort)
      tasks.push(
        store.upload(
          `concurrent-${i}`,
          'scene',
          { ...input(bytes), bytes: SCAN_LIMITS.bytes },
          new ReadableStream(),
          abort.signal,
        ),
      )
    }
    await expect(
      store.upload('overflow', 'scene', input(bytes), stream(bytes), new AbortController().signal),
    ).rejects.toThrow('繁忙')
    for (const abort of aborts) abort.abort()
    await Promise.all(tasks)
    expect(await readdir(dir)).toEqual([])
    const ready = await store.upload(
      'expires',
      'scene',
      input(bytes),
      stream(bytes),
      new AbortController().signal,
    )
    now += SCAN_LIMITS.ttlMs + 1
    await store.sweep()
    expect(store.list('expires')).toEqual([])
    await expect(store.download('expires', ready.id)).rejects.toThrow()
    await store.upload('revoke', 'scene', input(bytes), stream(bytes), new AbortController().signal)
    await store.revoke('revoke')
    expect(await readdir(dir)).toEqual([])
    await expect(
      store.upload('unsaved', null, input(bytes), stream(bytes), new AbortController().signal),
    ).rejects.toThrow('保存')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
