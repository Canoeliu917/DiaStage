import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.AUTOSAVE_RACE_FIXTURE) {
  test('local commit queue survives offline edits, retry and an in-flight older save without exit PUTs', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, AUTOSAVE_RACE_FIXTURE: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { createSceneSaveQueue } = await import('../lib/scene-save-queue')
  const timers = new Map<number, { callback: () => void; delay: number }>()
  let timerId = 0
  Object.assign(globalThis, {
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++timerId
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout: (id: number) => timers.delete(id),
  })
  const settle = async () => {
    for (let i = 0; i < 220; i++) await Promise.resolve()
  }
  const tick = async () => {
    const item = timers.entries().next().value
    assert.ok(item)
    timers.delete(item[0])
    item[1].callback()
    await settle()
  }
  let paused = true,
    offline = true,
    quota = false
  const local: number[] = [],
    sent: number[] = [],
    status: string[] = []
  let release: (() => void) | undefined
  const queue = createSceneSaveQueue({
    persist: async (graph) => {
      if (quota) throw new DOMException('full', 'QuotaExceededError')
      local.push(Number(graph.nodes.revision))
    },
    sync: async (graph) => {
      if (offline) throw new Error('offline')
      sent.push(Number(graph.nodes.revision))
      await new Promise<void>((resolve) => {
        release = resolve
      })
    },
    paused: () => paused,
    status: (value) => status.push(value),
  })
  const graph = (revision: number) => ({ nodes: { revision }, rootNodeIds: ['revision'] })
  queue.enqueue(graph(1))
  await settle()
  assert.deepEqual(local, [1])
  assert.equal(status.at(-1), 'local-saved')
  await tick()
  assert.deepEqual(sent, [], 'an active drag must not send even older pending edits')
  paused = false
  for (let i = 2; i <= 100; i++) queue.enqueue(graph(i))
  await settle()
  assert.deepEqual(
    local,
    Array.from({ length: 100 }, (_, i) => i + 1),
  )
  await tick()
  assert.equal(status.at(-1), 'local-saved')
  assert.ok([...timers.values()][0]!.delay >= 2000, 'failed sync backs off')
  offline = false
  queue.retry()
  await tick()
  assert.deepEqual(sent, [100], 'offline commits coalesce in order to a single final snapshot')
  queue.enqueue(graph(101))
  await settle()
  await tick()
  assert.deepEqual(sent, [100], 'only one in-flight request')
  release!()
  await settle()
  await tick()
  assert.deepEqual(sent, [100, 101])
  release!()
  await settle()
  assert.equal(status.at(-1), 'saved')
  quota = true
  queue.enqueue(graph(102))
  await settle()
  assert.equal(queue.unsavedLocally, true)
  assert.equal(status.at(-1), 'error')
  assert.deepEqual(sent, [100, 101])
  quota = false
  queue.retry()
  await tick()
  assert.equal(local.at(-1), 102)
  release!()
  await settle()
  assert.equal(queue.unsavedLocally, false)
  queue.dispose()
  assert.equal(timers.size, 0, 'closing never schedules a full-scene PUT')
}
