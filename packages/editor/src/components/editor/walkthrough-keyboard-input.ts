import type { MovementInput } from '@pascal-app/viewer'

type MovementKeyName = Exclude<keyof MovementInput, 'joystick'>

const movementKeyToName = new Map<string, MovementKeyName>([
  ['ArrowUp', 'forward'],
  ['KeyW', 'forward'],
  ['ArrowDown', 'backward'],
  ['KeyS', 'backward'],
  ['ArrowLeft', 'leftward'],
  ['KeyA', 'leftward'],
  ['ArrowRight', 'rightward'],
  ['KeyD', 'rightward'],
  ['Space', 'jump'],
  ['ShiftLeft', 'run'],
  ['ShiftRight', 'run'],
])

export const inactiveMovementInput: MovementInput = {
  backward: false,
  forward: false,
  jump: false,
  leftward: false,
  rightward: false,
  run: false,
}

export function getMovementInputForKey(code: string, active: boolean): MovementInput | null {
  const name = movementKeyToName.get(code)
  return name ? ({ [name]: active } as MovementInput) : null
}
