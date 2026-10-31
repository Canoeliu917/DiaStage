import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { SaveStatus } from '@pascal-app/editor'

if (!process.env.STAGE_GUIDE_TEST) {
  test('the guide persists dismissal and only completes after a prop is saved successfully', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, STAGE_GUIDE_TEST: '1' },
      encoding: 'utf8',
      windowsHide: true,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const stored = new Map<string, string>()
  const windowEvents = new EventTarget()
  Object.assign(globalThis, {
    window: windowEvents,
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  })
  let hasProp = false
  let cursor = 0
  let values: unknown[] = []
  let effects: (() => void)[] = []
  const useState = <T,>(initial: T) => {
    const index = cursor++
    if (!(index in values)) values[index] = initial
    return [
      values[index] as T,
      (value: T) => {
        values[index] = value
      },
    ] as const
  }
  mock.module('react', () => ({
    ...React,
    useState,
    useCallback: <T,>(callback: T) => callback,
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = cursor++
      const before = values[index] as { deps: unknown[]; cleanup?: () => void } | undefined
      if (!before || deps.some((dep, i) => dep !== before.deps[i])) {
        effects.push(() => {
          before?.cleanup?.()
          values[index] = { deps, cleanup: effect() }
        })
      }
    },
  }))
  mock.module('@pascal-app/core', () => ({ useScene: () => hasProp }))
  mock.module('../../lib/auth/local-account', () => ({
    localAccountStorageKey: (key: string) => key,
  }))
  mock.module('../studio-navigation', () => ({ openStudioPanel: () => {} }))
  const { StageFirstVisit } = await import('./stage-first-visit')
  const render = (saveStatus: SaveStatus = 'idle') => {
    cursor = 0
    const result = StageFirstVisit({ ready: true, readOnly: false, saveStatus })
    for (const effect of effects.splice(0)) effect()
    return result
  }
  const reset = () => {
    for (const value of values) {
      const cleanup = (value as { cleanup?: () => void } | null)?.cleanup
      cleanup?.()
    }
    values = []
    stored.clear()
    hasProp = false
    render()
  }
  reset()
  assert.ok(render())
  windowEvents.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
  assert.equal(render(), null)
  assert.equal(stored.get('diastage:set-first-visit'), 'closed')
  for (const value of values) (value as { cleanup?: () => void } | null)?.cleanup?.()
  values = []
  render()
  assert.equal(render(), null, 'a fresh mount remembers dismissal')

  reset()
  render('saved')
  windowEvents.dispatchEvent(new Event('scene:retry-save'))
  render('saved')
  assert.ok(render('saved'), 'saving an empty stage does not complete the guide')

  reset()
  hasProp = true
  render()
  windowEvents.dispatchEvent(new Event('scene:retry-save'))
  render('pending')
  render('error')
  assert.ok(render('error'), 'failed save keeps the guide visible')
  render('local-saved')
  assert.equal(render('local-saved'), null)
  assert.equal(stored.get('diastage:set-first-visit'), 'closed')
}
