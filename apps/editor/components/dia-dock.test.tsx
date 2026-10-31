import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.DIA_DOCK_TEST) {
  test('first desktop visit is collapsed, while explicit dock preferences survive reopening', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, DIA_DOCK_TEST: '1' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  let values: unknown[] = []
  let cursor = 0
  let effects: Array<() => unknown> = []
  let stored: string | null = null
  let mouse = true
  function state<T>(initial: T) {
    const index = cursor++
    if (!(index in values)) values[index] = initial
    return [
      values[index] as T,
      (next: T | ((value: T) => T)) => {
        values[index] =
          typeof next === 'function' ? (next as (value: T) => T)(values[index] as T) : next
      },
    ] as const
  }
  mock.module('react', () => ({
    ...React,
    useState: state,
    useRef: <T,>(value: T) => state({ current: value })[0],
    useCallback: <T,>(value: T) => value,
    useEffect: (effect: () => unknown) => effects.push(effect),
  }))
  mock.module('./dia-edge-tab', () => ({ DiaEdgeTab: () => null, useDiaTouchViewport: () => null }))
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: mouse }) },
    localStorage: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value
      },
    },
  })
  const { DiaDock } = await import('./dia-dock')
  type Element = { type?: unknown; props?: Record<string, any> }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    return [element, ...elements(element.props?.children)]
  }
  function render() {
    cursor = 0
    effects = []
    return elements(DiaDock({ hidden: false, children: 'conversation' }))
  }
  function mount(saved: string | null) {
    stored = saved
    values = []
    render()
    effects[0]!()
    const tree = render()
    effects[1]!()
    return tree
  }
  const collapsed = (tree: Element[]) => tree.find((node) => node.type === 'aside')?.props?.hidden
  assert.equal(collapsed(mount(null)), true)
  assert.equal(collapsed(mount(JSON.stringify({ open: true, width: 420 }))), false)
  assert.equal(collapsed(mount(JSON.stringify({ open: false }))), true)
  const first = mount(null)
  first.find((node) => node.props?.['aria-label'] === '打开 DIA')!.props!.onClick()
  const opened = render()
  effects[1]!()
  assert.equal(collapsed(opened), false)
  assert.equal(collapsed(mount(stored)), false, 'expanded choice persists across mounts')
  const closed = render()
  closed.find((node) => node.props?.['aria-label'] === '收起 Dia 对话框')!.props!.onClick()
  render()
  effects[1]!()
  assert.equal(collapsed(mount(stored)), true, 'collapsed choice persists across mounts')
  mouse = false
  assert.equal(collapsed(mount(null)), false, 'existing touch default is unchanged')
}
