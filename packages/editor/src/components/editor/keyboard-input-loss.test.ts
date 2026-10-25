import { expect, test } from 'bun:test'
import { registerKeyboardInputLoss } from './keyboard-input-loss'

test('keyboard input is cleared on blur, page hide and hidden document, then listeners detach', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const page = new EventTarget()
  const documentTarget = new EventTarget() as EventTarget & { visibilityState: string }
  documentTarget.visibilityState = 'visible'
  Object.assign(globalThis, { window: page, document: documentTarget })
  try {
    let clears = 0
    const remove = registerKeyboardInputLoss(() => clears++)

    page.dispatchEvent(new Event('blur'))
    page.dispatchEvent(new Event('pagehide'))
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(clears).toBe(2)

    documentTarget.visibilityState = 'hidden'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(clears).toBe(3)

    remove()
    page.dispatchEvent(new Event('blur'))
    page.dispatchEvent(new Event('pagehide'))
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(clears).toBe(3)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
