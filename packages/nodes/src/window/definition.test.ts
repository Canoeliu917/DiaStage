import { describe, expect, test } from 'bun:test'
import { type HandleDescriptor, LevelNode, WallNode, WindowNode } from '@pascal-app/core'
import { resolveWindowHandlePortalTarget, windowDefinition } from './definition'

const windowHandles = windowDefinition.handles as HandleDescriptor<WindowNode>[]

describe('window handle presentation', () => {
  test('does not register the legacy move arrow', () => {
    expect(windowHandles.some((handle) => 'shape' in handle && handle.shape === 'move-cross')).toBe(
      false,
    )
  })

  test('opts every resize arrow into live grid snapping', () => {
    expect(
      windowHandles.every((handle) => handle.kind !== 'linear-resize' || handle.gridSnap === true),
    ).toBe(true)
  })

  test('portals wall-hosted window handles to the performance level', () => {
    const level = LevelNode.parse({ id: 'level_test' })
    const wall = WallNode.parse({
      end: [4, 0],
      id: 'wall_test',
      parentId: level.id,
      start: [0, 0],
    })
    const window = WindowNode.parse({ id: 'window_test', parentId: wall.id, wallId: wall.id })
    const nodes = { [level.id]: level, [wall.id]: wall }

    expect(resolveWindowHandlePortalTarget(window, { get: (id) => nodes[id] })).toBe(level.id)
  })
})
