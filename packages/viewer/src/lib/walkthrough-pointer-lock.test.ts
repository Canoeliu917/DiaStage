import { expect, mock, test } from 'bun:test'
import {
  requestWalkthroughPointerLock,
  shouldHandleWalkthroughLook,
} from './walkthrough-pointer-lock'

test('unlocked walkthrough looks only during a left-button canvas drag', () => {
  const documentStub = { pointerLockElement: null as Element | null }
  const canvas = { ownerDocument: documentStub } as HTMLCanvasElement
  const move = (target: unknown, buttons: number) => ({ target, buttons }) as MouseEvent
  expect(shouldHandleWalkthroughLook(move(canvas, 1), canvas)).toBe(true)
  expect(shouldHandleWalkthroughLook(move(canvas, 0), canvas)).toBe(false)
  expect(shouldHandleWalkthroughLook(move(canvas, 2), canvas)).toBe(false)
  expect(shouldHandleWalkthroughLook(move({}, 1), canvas)).toBe(false)
  documentStub.pointerLockElement = canvas
  expect(shouldHandleWalkthroughLook(move(canvas, 0), canvas)).toBe(true)
})

test('walkthrough lock handles Chromium rejection, retries once and respects session exit', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const error = new DOMException(
    'If you see this error we have a bug. Please report this bug to chromium.',
    'UnknownError',
  )
  const request = mock<() => Promise<void> | void>(() => Promise.reject(error))
  const canvas = {
    isConnected: true,
    hasAttribute: () => false,
    tabIndex: 0,
    focus: mock(() => {}),
    requestPointerLock: request,
  } as unknown as HTMLCanvasElement
  const documentStub = { querySelector: () => canvas, pointerLockElement: null as Element | null }
  const retries: Array<() => void> = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentStub })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout: (callback: () => void, delay: number) => {
        expect(delay).toBe(1400)
        retries.push(callback)
      },
    },
  })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  try {
    requestWalkthroughPointerLock()
    expect(request).toHaveBeenCalledTimes(1) // Must stay inside the user gesture.
    expect(canvas.tabIndex).toBe(-1)
    expect(canvas.focus).toHaveBeenCalledWith({ preventScroll: true })
    await settle() // An unhandled rejected Promise fails this test in Bun.
    expect(retries).toHaveLength(0)

    requestWalkthroughPointerLock({ canvas, retryWhile: () => true })
    await settle()
    retries.shift()!()
    await settle()
    expect(request).toHaveBeenCalledTimes(3)
    expect(retries).toHaveLength(0)

    let active = true
    requestWalkthroughPointerLock({ retryWhile: () => active })
    await settle()
    active = false
    retries.shift()!()
    expect(request).toHaveBeenCalledTimes(4)

    request.mockImplementation(() => {
      throw error
    })
    expect(() => requestWalkthroughPointerLock({ canvas })).not.toThrow()
    request.mockImplementation(() => undefined)
    expect(() => requestWalkthroughPointerLock({ canvas })).not.toThrow()
    request.mockImplementation(() => Promise.resolve())
    requestWalkthroughPointerLock({ canvas })
    await settle()
    const count = request.mock.calls.length
    documentStub.pointerLockElement = canvas
    requestWalkthroughPointerLock({ canvas })
    expect(request).toHaveBeenCalledTimes(count)
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
