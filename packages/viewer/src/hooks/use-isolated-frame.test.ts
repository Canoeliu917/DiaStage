import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.ISOLATED_FRAME_TEST) {
  test('a failed frame is forwarded to its boundary without stopping sibling frames', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, ISOLATED_FRAME_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const frames: (() => void)[] = []
  let failure: Error | null = null
  let freshRender = true
  mock.module('@react-three/fiber', () => ({ useFrame: (frame: () => void) => frames.push(frame) }))
  mock.module('react', () => ({
    useRef: (current: boolean) => ({ current }),
    useState: () => [
      freshRender ? null : failure,
      (error: Error) => {
        failure = error
      },
    ],
  }))
  const { useIsolatedFrame } = await import('./use-isolated-frame')
  let failedCalls = 0,
    siblingCalls = 0
  const cause = new Error('injected monitor failure')
  function Frames() {
    useIsolatedFrame(() => {
      failedCalls++
      throw cause
    })
    useIsolatedFrame(() => {
      siblingCalls++
    })
  }
  Frames()
  for (let i = 0; i < 3; i++) for (const frame of frames) assert.doesNotThrow(frame)
  assert.equal(failedCalls, 1)
  assert.equal(siblingCalls, 3)
  assert.equal(failure, cause)
  freshRender = false
  assert.throws(Frames, cause)
}
