import { expect, test } from 'bun:test'
import {
  clearKeyboardPanState,
  createKeyboardPanState,
  hasKeyboardPanInput,
  setKeyboardPanKey,
} from './keyboard-pan-state'

test('W A S D Q E each owns one camera direction until its matching keyup', () => {
  const cases = [
    ['KeyW', 'forward'],
    ['KeyS', 'backward'],
    ['KeyA', 'left'],
    ['KeyD', 'right'],
    ['KeyQ', 'down'],
    ['KeyE', 'up'],
  ] as const

  for (const [code, direction] of cases) {
    const state = createKeyboardPanState()
    expect(setKeyboardPanKey(state, code, true)).toBe(true)
    expect(state).toEqual({ ...createKeyboardPanState(), [direction]: true })
    expect(hasKeyboardPanInput(state)).toBe(true)
    expect(setKeyboardPanKey(state, code, false)).toBe(true)
    expect(state).toEqual(createKeyboardPanState())
    expect(hasKeyboardPanInput(state)).toBe(false)
  }
})

test('opposite keys remain independent and input loss clears every direction', () => {
  const state = createKeyboardPanState()
  for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE']) {
    expect(setKeyboardPanKey(state, code, true)).toBe(true)
  }
  expect(Object.values(state).every(Boolean)).toBe(true)
  expect(setKeyboardPanKey(state, 'KeyW', false)).toBe(true)
  expect(state.backward).toBe(true)
  clearKeyboardPanState(state)
  expect(state).toEqual(createKeyboardPanState())
})

test('unrelated keys and repeated keydown do not create extra state changes', () => {
  const state = createKeyboardPanState()
  expect(setKeyboardPanKey(state, 'KeyX', true)).toBe(false)
  expect(setKeyboardPanKey(state, 'KeyS', true)).toBe(true)
  expect(setKeyboardPanKey(state, 'KeyS', true)).toBe(false)
})
