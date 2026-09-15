import { expect, test } from 'bun:test'
import { getMovementInputForKey } from './walkthrough-keyboard-input'

test('walkthrough W A S D press and release map to independent movement directions', () => {
  for (const [code, direction] of [
    ['KeyW', 'forward'],
    ['KeyS', 'backward'],
    ['KeyA', 'leftward'],
    ['KeyD', 'rightward'],
  ] as const) {
    expect(getMovementInputForKey(code, true)).toEqual({ [direction]: true })
    expect(getMovementInputForKey(code, false)).toEqual({ [direction]: false })
  }
})

test('walkthrough leaves Q and E to the existing drone altitude controls', () => {
  expect(getMovementInputForKey('KeyQ', true)).toBeNull()
  expect(getMovementInputForKey('KeyE', true)).toBeNull()
})
