import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CoordinateField,
  clampSpaceMove,
  HOME_SPACE_GROUPS,
  HOME_SPACE_NODES,
} from './coordinate-field'

test('first space enters categories; only second space exposes real actions and destinations', () => {
  expect(HOME_SPACE_NODES).toHaveLength(12)
  for (const node of HOME_SPACE_NODES) {
    expect(node.action).toBeUndefined()
    expect(node.href).toBeUndefined()
    if (node.light) {
      expect(node.title).toBe('光')
      expect(node.group).toBeUndefined()
      expect(node.y).toBeLessThan(20)
    } else {
      expect(node.group).toBeDefined()
      expect(HOME_SPACE_GROUPS[node.group!].options.length).toBeGreaterThan(0)
    }
  }
  const secondLevel = Object.values(HOME_SPACE_GROUPS).flatMap((group) => group.options)
  expect(secondLevel.flatMap((node) => (node.action ? [node.action] : [])).sort()).toEqual([
    'archive-info',
    'dialogue',
    'manual',
    'script',
    'voice',
  ])
  expect(secondLevel.flatMap((node) => (node.href ? [node.href] : []))).toContain('/remote-voice')
  expect(secondLevel.flatMap((node) => (node.href ? [node.href] : []))).toContain(
    '/scenes?workspace=remount',
  )
  const markup = renderToStaticMarkup(
    <CoordinateField onSelect={() => {}} illuminated={false} onToggleLight={() => {}} />,
  )
  expect(markup.match(/class="dia-coordinate-node"/g)).toHaveLength(12)
  expect(markup).not.toContain('href=')
  expect(markup).not.toContain('>Dialogue<')
  expect(markup).not.toContain('>Diagonal<')
  expect(markup).not.toContain('>Diagram<')
  expect(markup).not.toContain('>Diary<')
  expect(markup).toContain('aria-label="光 · 切换明暗"')
  expect(markup).toContain('data-illuminated="false"')
  expect(markup).toContain('aria-pressed="true">散开')
  expect(markup).toContain('aria-pressed="false">聚合')
})

test('repeated target movement cannot pass the usable space boundary', () => {
  const field = { left: 0, right: 1200, top: 180, bottom: 660 }
  const node = { left: 500, right: 660, top: 300, bottom: 370 }
  expect(clampSpaceMove(5000, 5000, node, field)).toEqual({ x: 516, y: 266 })
  expect(clampSpaceMove(-5000, -5000, node, field)).toEqual({ x: -476, y: -96 })
  expect(clampSpaceMove(8, -8, node, field)).toEqual({ x: 8, y: -8 })
  for (let index = 0; index < 100; index++) {
    const delta = clampSpaceMove(24, 24, node, field)
    node.left += delta.x
    node.right += delta.x
    node.top += delta.y
    node.bottom += delta.y
  }
  expect(node.right).toBe(field.right - 24)
  expect(node.bottom).toBe(field.bottom - 24)
  expect(clampSpaceMove(24, 24, node, field)).toEqual({ x: 0, y: 0 })
})
