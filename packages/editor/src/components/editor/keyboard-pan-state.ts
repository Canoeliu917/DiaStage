export type KeyboardPanState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  up: boolean
  down: boolean
}

export function createKeyboardPanState(): KeyboardPanState {
  return { forward: false, backward: false, left: false, right: false, up: false, down: false }
}

export function setKeyboardPanKey(
  state: KeyboardPanState,
  code: string,
  pressed: boolean,
): boolean {
  const key = {
    KeyW: 'forward',
    KeyS: 'backward',
    KeyA: 'left',
    KeyD: 'right',
    KeyQ: 'down',
    KeyE: 'up',
  }[code] as keyof KeyboardPanState | undefined
  if (!key) return false
  const changed = state[key] !== pressed
  state[key] = pressed
  return changed
}

export function clearKeyboardPanState(state: KeyboardPanState) {
  Object.assign(state, createKeyboardPanState())
}

export function hasKeyboardPanInput(state: KeyboardPanState): boolean {
  return Object.values(state).some(Boolean)
}
