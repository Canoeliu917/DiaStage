import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../../schema'
import useScene, { clearSceneHistory } from '../../store/use-scene'
import { spatialGridManager } from './spatial-grid-manager'
import {
  initSpatialGridSync,
  markCoveringDependentsBelow,
  markLevelHeightDependents,
  markSlabChangeDependents,
} from './spatial-grid-sync'

const SQUARE: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

function makeLevel(id: string, ordinal: number, height: number, children: string[]): AnyNode {
  return {
    id,
    type: 'level',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    children,
    level: ordinal,
    height,
  } as AnyNode
}

function makeChild(id: string, type: string, parentId: string): AnyNode {
  return {
    id,
    type,
    object: 'node',
    parentId,
    visible: true,
    metadata: {},
    children: [],
    start: [0, 1],
    end: [4, 1],
    thickness: 0.1,
    polygon: SQUARE,
    holes: [],
  } as unknown as AnyNode
}

function makeSlab(id: string, parentId: string, overrides: Partial<AnyNode> = {}): AnyNode {
  return {
    id,
    type: 'slab',
    object: 'node',
    parentId,
    visible: true,
    metadata: {},
    children: [],
    polygon: SQUARE,
    holes: [],
    holeMetadata: [],
    elevation: 0.05,
    thickness: 0.05,
    autoFromWalls: false,
    ...overrides,
  } as AnyNode
}

function nodesFor(...nodes: AnyNode[]): Record<AnyNodeId, AnyNode> {
  return Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<AnyNodeId, AnyNode>
}

function dirtyIds(): string[] {
  return [...useScene.getState().dirtyNodes].sort()
}

describe('spatial-grid sync dirty rules (vertical model)', () => {
  let stopSync = () => {}

  // Two orphan performance levels: level_0 carries stage elements and
  // level_1 carries a platform.
  const wall = makeChild('wall_a', 'wall', 'level_0')
  const stair = makeChild('stair_a', 'stair', 'level_0')
  const fence = makeChild('fence_a', 'fence', 'level_0')
  const zone = makeChild('zone_a', 'zone', 'level_0')
  const upperSlab = makeSlab('slab_up', 'level_1', { elevation: 0, thickness: 0.3 })
  const level0 = makeLevel('level_0', 0, 2.5, ['wall_a', 'stair_a', 'fence_a', 'zone_a'])
  const level1 = makeLevel('level_1', 1, 2.5, ['slab_up'])

  function setScene(nodes: Record<AnyNodeId, AnyNode>) {
    useScene.setState({
      collections: {},
      dirtyNodes: new Set<AnyNodeId>(),
      nodes,
      readOnly: false,
      rootNodeIds: ['level_0', 'level_1'] as AnyNodeId[],
    } as never)
    clearSceneHistory()
  }

  beforeEach(() => {
    spatialGridManager.clear()
    setScene(nodesFor(level0, level1, wall, stair, fence, zone, upperSlab))
    stopSync = initSpatialGridSync()
    useScene.setState({ dirtyNodes: new Set<AnyNodeId>() })
  })

  afterEach(() => {
    stopSync()
    stopSync = () => {}
  })

  test('changing a level height marks its wall, stair, and fence children dirty', () => {
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        level_0: { ...level0, height: 3 } as AnyNode,
      } as never,
    })

    expect(dirtyIds()).toEqual(['fence_a', 'stair_a', 'wall_a'])
  })

  test('a platform thickness change marks walls on the level below', () => {
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        slab_up: { ...upperSlab, thickness: 0.5 } as AnyNode,
      } as never,
    })

    expect(dirtyIds()).toEqual(['wall_a'])
  })

  test('a platform recessed toggle marks walls on the level below', () => {
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        slab_up: { ...upperSlab, recessed: true } as AnyNode,
      } as never,
    })

    expect(dirtyIds()).toEqual(['wall_a'])
  })

  test('creating a slab on the level above marks the level below, deleting it too', () => {
    const added = makeSlab('slab_new', 'level_1', { elevation: 0, thickness: 0.2 })
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        slab_new: added,
        level_1: { ...level1, children: ['slab_up', 'slab_new'] } as AnyNode,
      } as never,
    })
    expect(useScene.getState().dirtyNodes.has('wall_a' as AnyNodeId)).toBe(true)

    useScene.setState({ dirtyNodes: new Set<AnyNodeId>() })
    const { slab_new: _gone, ...rest } = useScene.getState().nodes as Record<string, AnyNode>
    useScene.setState({
      nodes: { ...rest, level_1: { ...level1, children: ['slab_up'] } as AnyNode } as never,
    })
    expect(useScene.getState().dirtyNodes.has('wall_a' as AnyNodeId)).toBe(true)
  })
})

describe('sync dirty helpers (pure)', () => {
  const collect = () => {
    const marked: string[] = []
    return { marked, markDirty: (id: AnyNodeId) => marked.push(id) }
  }

  test('markLevelHeightDependents marks only wall, stair, and fence children', () => {
    const level = makeLevel('level_0', 0, 2.5, [
      'wall_a',
      'stair_a',
      'fence_a',
      'zone_a',
      'missing',
    ])
    const nodes = nodesFor(
      level,
      makeChild('wall_a', 'wall', 'level_0'),
      makeChild('stair_a', 'stair', 'level_0'),
      makeChild('fence_a', 'fence', 'level_0'),
      makeChild('zone_a', 'zone', 'level_0'),
    )

    const { marked, markDirty } = collect()
    markLevelHeightDependents(level as never, nodes, markDirty)
    expect(marked.sort()).toEqual(['fence_a', 'stair_a', 'wall_a'])
  })

  test('markCoveringDependentsBelow marks walls on the level below only', () => {
    const nodes = nodesFor(
      makeLevel('level_0', 0, 2.5, ['wall_a', 'zone_a']),
      makeLevel('level_1', 1, 2.5, []),
      makeChild('wall_a', 'wall', 'level_0'),
      makeChild('zone_a', 'zone', 'level_0'),
    )

    const { marked, markDirty } = collect()
    markCoveringDependentsBelow('level_1', nodes, markDirty)
    expect(marked.sort()).toEqual(['wall_a'])
  })

  test('markCoveringDependentsBelow is a no-op for the lowest level', () => {
    const nodes = nodesFor(
      makeLevel('level_0', 0, 2.5, ['wall_a']),
      makeChild('wall_a', 'wall', 'level_0'),
    )

    const { marked, markDirty } = collect()
    markCoveringDependentsBelow('level_0', nodes, markDirty)
    expect(marked).toEqual([])
  })

  test('markSlabChangeDependents covers surface consumers', () => {
    const previous = makeSlab('slab_a', 'level_1', { elevation: 0.2, thickness: 0.2 })
    const next = { ...previous, elevation: 0.4, thickness: 0.4 } as AnyNode
    const sameLevelWall = makeChild('wall_same', 'wall', 'level_1')
    const belowWall = makeChild('wall_below', 'wall', 'level_0')
    const nodes = nodesFor(
      makeLevel('level_0', 0, 2.5, ['wall_below']),
      makeLevel('level_1', 1, 2.5, ['slab_a', 'wall_same']),
      next,
      sameLevelWall,
      belowWall,
    )

    const { marked, markDirty } = collect()
    markSlabChangeDependents(previous as never, next as never, nodes, markDirty)

    expect([...new Set(marked)].sort()).toEqual(['wall_below', 'wall_same'])
  })
})
