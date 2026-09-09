import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRendererLifecycle } from './renderer-lifecycle'

function resource() {
  let disposals = 0
  let recoveryAttempts = 0
  const renderer = {
    onDeviceLost(_info: { reason: string }) {
      recoveryAttempts++
    },
    dispose() {
      disposals++
      renderer.onDeviceLost({ reason: 'destroyed' })
    },
  }
  return { renderer, disposals: () => disposals, recoveryAttempts: () => recoveryAttempts }
}

test('a factory can finish before attach, and unmount releases its renderer after the commit', async () => {
  const lifecycle = createRendererLifecycle()
  const owned = resource()
  assert.equal(lifecycle.isActive(), true)
  assert.equal(lifecycle.track(owned.renderer), true)
  lifecycle.attach()
  lifecycle.detach()
  assert.equal(lifecycle.isActive(), false)
  assert.equal(owned.disposals(), 0)
  await Promise.resolve()
  assert.equal(owned.disposals(), 1)
  assert.equal(owned.recoveryAttempts(), 0, 'intentional disposal cannot start device recovery')
  assert.equal(lifecycle.isActive(), false)
})

test('StrictMode cleanup and immediate setup keep the live renderer', async () => {
  const lifecycle = createRendererLifecycle()
  const owned = resource()
  lifecycle.attach()
  assert.equal(lifecycle.track(owned.renderer), true)
  lifecycle.detach()
  lifecycle.attach()
  await Promise.resolve()
  assert.equal(owned.disposals(), 0)
  assert.equal(lifecycle.isActive(), true)
  assert.equal(lifecycle.track(owned.renderer), true)
  lifecycle.detach()
  await Promise.resolve()
  assert.equal(owned.disposals(), 1)
})

test('late initialization after an unmount is disposed immediately and never becomes active', async () => {
  const lifecycle = createRendererLifecycle()
  const late = resource()
  lifecycle.attach()
  lifecycle.detach()
  await Promise.resolve()
  assert.equal(lifecycle.track(late.renderer), false)
  assert.equal(late.disposals(), 1)
  assert.equal(late.recoveryAttempts(), 0)
  assert.equal(lifecycle.isActive(), false)
  assert.equal(lifecycle.track(late.renderer), false)
  lifecycle.detach()
  await Promise.resolve()
  assert.equal(late.disposals(), 1)
})

test('repeated detach and track calls dispose once, including completion before the cleanup microtask', async () => {
  const lifecycle = createRendererLifecycle()
  const owned = resource()
  assert.equal(lifecycle.track(owned.renderer), true)
  assert.equal(lifecycle.track(owned.renderer), true)
  lifecycle.detach()
  lifecycle.detach()
  assert.equal(lifecycle.track(owned.renderer), false)
  assert.equal(owned.disposals(), 1)
  assert.equal(lifecycle.track(owned.renderer), false)
  await Promise.resolve()
  assert.equal(owned.disposals(), 1)
  lifecycle.attach()
  assert.equal(lifecycle.isActive(), false, 'a disposed renderer cannot be revived')
})
