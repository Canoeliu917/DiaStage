import { describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '@pascal-app/core'
import {
  resolveHomogeneousSelection,
  resolveUniqueSelectionIds,
} from './homogeneous-selection'

function node(
  id: string,
  type: string,
  metadata?: Record<string, unknown>,
): AnyNode {
  return {
    object: 'node',
    id: id as AnyNodeId,
    type,
    parentId: null,
    visible: true,
    metadata: metadata ?? {},
    children: [],
  } as unknown as AnyNode
}

describe('resolveHomogeneousSelection', () => {
  test('mixed selection is null', () => {
    const nodes = {
      wall_a: node('wall_a', 'wall'),
      slab_a: node('slab_a', 'slab'),
    }
    expect(resolveHomogeneousSelection(['wall_a', 'slab_a'], nodes)).toBeNull()
  })

  test('three walls share the wall type', () => {
    const nodes = {
      wall_a: node('wall_a', 'wall'),
      wall_b: node('wall_b', 'wall'),
      wall_c: node('wall_c', 'wall'),
    }
    expect(resolveHomogeneousSelection(['wall_a', 'wall_b', 'wall_c'], nodes)).toBe('wall')
  })


  test('stale ids are skipped without breaking a homogeneous remainder', () => {
    const nodes = {
      wall_a: node('wall_a', 'wall'),
      wall_b: node('wall_b', 'wall'),
    }
    expect(resolveHomogeneousSelection(['wall_a', 'gone', 'wall_b'], nodes)).toBe('wall')
  })

  test('a single live node after skips is not homogeneous', () => {
    const nodes = { wall_a: node('wall_a', 'wall') }
    expect(resolveHomogeneousSelection(['wall_a', 'gone'], nodes)).toBeNull()
  })
})
