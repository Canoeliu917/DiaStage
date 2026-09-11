import { describe, expect, test } from 'bun:test'
import type { AnyNode } from '@pascal-app/core'
import {
  attachClassOf,
  type HotSetCandidate,
  isCandidateInHotSet,
  isPickableForAttach,
} from './hot-set'

const mockNode = (id: string, type: string): AnyNode => ({ id, type }) as unknown as AnyNode
const floor: HotSetCandidate = {
  type: 'level',
  isFloorLike: true,
  exposesTop: false,
  attachClass: 'surface',
}
const wall: HotSetCandidate = {
  type: 'wall',
  isFloorLike: false,
  exposesTop: false,
  attachClass: 'surface',
}
const block: HotSetCandidate = {
  type: 'block',
  isFloorLike: false,
  exposesTop: true,
  exposesSides: true,
  attachClass: 'surface',
}

describe('stage placement hot set', () => {
  test('classifies wall mounts and surface objects', () => {
    expect(attachClassOf('wall')).toBe('wall')
    expect(attachClassOf('wall-side')).toBe('wall')
    expect(attachClassOf(undefined)).toBe('surface')
  })

  test('selects wall faces for mounted objects and top faces for props', () => {
    expect(isPickableForAttach('wall', wall)).toBe(true)
    expect(isPickableForAttach('wall', block)).toBe(true)
    expect(isPickableForAttach('wall', floor)).toBe(false)
    expect(isPickableForAttach('surface', floor)).toBe(true)
    expect(isPickableForAttach('surface', block)).toBe(true)
    expect(isPickableForAttach('surface', wall)).toBe(false)
  })

  test('narrows placement while leaving idle selection available', () => {
    expect(isCandidateInHotSet({ kind: 'idle' }, null, wall)).toBe(true)
    expect(
      isCandidateInHotSet(
        {
          kind: 'placing',
          node: mockNode('i1', 'item'),
          nodeId: 'i1',
          nodeType: 'item',
          view: '3d',
          pressDrag: false,
          driver: 'move-tool',
        },
        'surface',
        floor,
      ),
    ).toBe(true)
    expect(isCandidateInHotSet({ kind: 'box-select' }, null, floor)).toBe(false)
  })
})
