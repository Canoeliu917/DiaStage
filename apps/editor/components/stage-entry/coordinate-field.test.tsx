import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CoordinateField,
  clampSpaceMove,
  HOME_SPACE_GROUPS,
  HOME_SPACE_NODES,
  parseSpaceNotes,
} from './coordinate-field'

test('first space enters categories; only second space exposes real actions and destinations', () => {
  expect(HOME_SPACE_NODES).toHaveLength(13)
  for (const node of HOME_SPACE_NODES) {
    expect(node.action).toBeUndefined()
    expect(node.href).toBeUndefined()
    if (node.light) {
      expect(node.title).toBe('光')
      expect(node.group).toBeUndefined()
      expect(node.y).toBeLessThan(20)
    } else if (node.compose) {
      expect(node.title).toBe('台词')
      expect(node.group).toBeUndefined()
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
  expect(markup.match(/class="dia-coordinate-node"/g)).toHaveLength(1)
  expect(markup).not.toContain('href=')
  expect(markup).not.toContain('>Dialogue<')
  expect(markup).not.toContain('>Diagonal<')
  expect(markup).not.toContain('>Diagram<')
  expect(markup).not.toContain('>Diary<')
  expect(markup).toContain('aria-label="光 · 点亮舞台"')
  expect(markup).toContain('data-illuminated="false"')
  expect(markup).toContain('这一幕，与 Dia，从哪里开始？')
  expect(markup).toContain('class="dia-coordinate-welcome" hidden=""')
  expect(markup).not.toContain('轻点光，展开舞台')
  expect(markup).not.toContain('轻点进入 · 拖动探索')
  expect(markup).not.toContain('>台词<')
  expect(markup).not.toContain('aria-label="空间排列"')
  const litMarkup = renderToStaticMarkup(
    <CoordinateField onSelect={() => {}} illuminated={true} onToggleLight={() => {}} />,
  )
  expect(litMarkup.match(/class="dia-coordinate-node"/g)).toHaveLength(13)
  expect(litMarkup).toContain('>台词<')
  expect(litMarkup).toContain('aria-label="空间排列"')
  expect(litMarkup).toContain('轻点进入 · 拖动探索')
  expect(litMarkup).not.toContain('class="dia-coordinate-welcome" hidden=""')
})

test('browser notes retain valid text and positions while rejecting malformed stored entries', () => {
  const note = { id: 'note-test', text: '我们在这里等一束光。', x: 32.5, y: 48 }
  expect(parseSpaceNotes(JSON.stringify([note]))).toEqual([note])
  expect(parseSpaceNotes(null)).toEqual([])
  expect(parseSpaceNotes('broken json')).toEqual([])
  expect(parseSpaceNotes('{}')).toEqual([])
  expect(
    parseSpaceNotes(
      JSON.stringify([
        note,
        note,
        null,
        { ...note, id: 'note-empty', text: '  ' },
        { ...note, id: 'note-long', text: '字'.repeat(81) },
        { ...note, id: 'note-invalid-position', x: '32' },
        { ...note, id: 'note-offscreen', y: 10000 },
      ]),
    ),
  ).toEqual([note])
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
