import { expect, test } from 'bun:test'
import { Children, isValidElement, type MouseEvent, type MouseEventHandler } from 'react'
import { NodeActionMenu } from './node-action-menu'

test('touch deletion needs confirmation; cancellation leaves the scene alone', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let touch = true,
    accepted = false,
    confirmations = 0,
    deletions = 0
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: () => ({ matches: touch }),
      confirm: () => {
        confirmations++
        return accepted
      },
    },
  })
  try {
    const menu = NodeActionMenu({ onDelete: () => deletions++ })
    const button = Children.toArray(menu.props.children).find(
      (child) =>
        isValidElement<{ 'aria-label': string }>(child) && child.props['aria-label'] === '删除',
    )
    if (!isValidElement<{ onClick: MouseEventHandler<HTMLButtonElement> }>(button))
      throw new Error('Delete control missing')
    const click = () => button.props.onClick({} as MouseEvent<HTMLButtonElement>)
    click()
    expect(deletions).toBe(0)
    accepted = true
    click()
    expect(deletions).toBe(1)
    touch = false
    click()
    expect(deletions).toBe(2)
    expect(confirmations).toBe(2)
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
