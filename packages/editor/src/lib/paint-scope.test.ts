import { describe, expect, it } from 'bun:test'
import type { AnyNode, ItemNode } from '@pascal-app/core'
import {
  availablePaintScopes,
  cyclePaintScope,
  type PaintHoverInfo,
  type PaintScope,
  paintScopeLabel,
  resolvePaintScopeTargets,
} from './paint-scope'

function item(id: string, assetId: string): ItemNode {
  return { id, type: 'item', asset: { id: assetId } } as unknown as ItemNode
}

function stageElement(): AnyNode {
  return { id: 'block_b', type: 'block' } as unknown as AnyNode
}

describe('stage paint scopes', () => {
  it('offers surface, whole-object and matching-asset scopes from actual node data', () => {
    expect(availablePaintScopes({ node: stageElement(), slotRoles: ['top'] })).toEqual(['single'])
    expect(availablePaintScopes({ node: stageElement(), slotRoles: ['top', 'edge'] })).toEqual([
      'single',
      'object',
    ])
    expect(availablePaintScopes({ node: item('item_a', 'chair'), slotRoles: ['seat'] })).toEqual([
      'single',
      'matching',
    ])
  })

  it('cycles only through the available stage-object scopes', () => {
    const scopes: PaintScope[] = ['single', 'object', 'matching']
    expect(cyclePaintScope('single', scopes)).toBe('object')
    expect(cyclePaintScope('object', scopes)).toBe('matching')
    expect(cyclePaintScope('matching', scopes)).toBe('single')
    expect(cyclePaintScope('single', [])).toBe('single')
  })

  it('labels the remaining scopes clearly', () => {
    const info: PaintHoverInfo = {
      scopes: ['single', 'object', 'matching'],
      slotLabel: '座面',
      nodeNoun: '物件',
    }
    expect(paintScopeLabel('single', info)).toBe('座面')
    expect(paintScopeLabel('object', info)).toBe('整个物件')
    expect(paintScopeLabel('matching', info)).toBe('全部匹配项')
  })
})

describe('resolvePaintScopeTargets', () => {
  const a = item('item_a', 'chair')
  const b = item('item_b', 'chair')
  const c = item('item_c', 'table')
  const nodes = Object.fromEntries([a, b, c].map((node) => [node.id, node]))

  it('keeps one surface or expands to the whole object', () => {
    expect(
      resolvePaintScopeTargets({
        node: a,
        role: 'seat',
        scope: 'single',
        nodes,
        slotRolesOf: () => ['seat', 'legs'],
      }),
    ).toEqual([{ nodeId: 'item_a', role: 'seat' }])
    expect(
      resolvePaintScopeTargets({
        node: a,
        role: 'seat',
        scope: 'object',
        nodes,
        slotRolesOf: () => ['seat', 'legs'],
      }),
    ).toEqual([
      { nodeId: 'item_a', role: 'seat' },
      { nodeId: 'item_a', role: 'legs' },
    ])
  })

  it('matches only instances of the same asset', () => {
    expect(
      resolvePaintScopeTargets({
        node: a,
        role: 'seat',
        scope: 'matching',
        nodes,
        slotRolesOf: () => [],
      }),
    ).toEqual([
      { nodeId: 'item_a', role: 'seat' },
      { nodeId: 'item_b', role: 'seat' },
    ])
  })
})
