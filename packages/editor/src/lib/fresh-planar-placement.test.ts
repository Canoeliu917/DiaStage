import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  type SceneCommit,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import {
  commitFreshPlacementSubtree,
  prepareFreshPlacementRootDuplicate,
} from './fresh-planar-placement'

type RafFn = (cb: (time: number) => void) => number
;(globalThis as { requestAnimationFrame?: RafFn }).requestAnimationFrame ??= ((
  cb: (time: number) => void,
) => {
  cb(0)
  return 0
}) as RafFn
;(globalThis as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame ??= () => {}

const LEVEL_ID = 'level_test' as AnyNodeId
const SHELF_ID = 'shelf_draft' as AnyNodeId

function level(children: AnyNodeId[]): AnyNode {
  return {
    id: LEVEL_ID,
    type: 'level',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    children,
    level: 0,
  } as AnyNode
}

function shelf(): AnyNode {
  return {
    id: SHELF_ID,
    type: 'shelf',
    object: 'node',
    parentId: LEVEL_ID,
    visible: false,
    metadata: { isNew: true, label: 'draft' },
    children: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    width: 1.2,
    depth: 0.3,
    thickness: 0.04,
    height: 0.9,
    style: 'wall-shelf',
    rows: 1,
    columns: 1,
    withBack: false,
    withSides: true,
    withBottom: false,
    bracketStyle: 'minimal',
  } as AnyNode
}

describe('commitFreshPlacementSubtree', () => {
  beforeEach(() => {
    useScene.setState({
      nodes: {
        [LEVEL_ID]: level([SHELF_ID]),
        [SHELF_ID]: shelf(),
      },
      rootNodeIds: [LEVEL_ID],
      collections: {},
      dirtyNodes: new Set(),
    } as never)
    useScene.temporal.getState().clear()
    useScene.temporal.getState().resume()
  })

  test('commits a fresh draft as one undoable clean subtree', () => {
    const commits: SceneCommit[] = []
    const unsubscribe = subscribeSceneCommits((commit) => commits.push(commit))
    useScene.temporal.getState().pause()

    const committedId = commitFreshPlacementSubtree(SHELF_ID, {
      position: [2, 0, 3],
      visible: true,
    } as Partial<AnyNode>)
    unsubscribe()

    expect(committedId).toBeTruthy()
    expect(committedId).not.toBe(SHELF_ID)
    const finalId = committedId as AnyNodeId
    expect(useScene.getState().nodes[SHELF_ID]).toBeUndefined()

    const committed = useScene.getState().nodes[finalId] as
      | (AnyNode & { position: [number, number, number]; metadata?: Record<string, unknown> })
      | undefined
    expect(committed?.position).toEqual([2, 0, 3])
    expect(committed?.visible).toBe(true)
    expect(committed?.metadata?.isNew).toBeUndefined()
    expect(committed?.metadata?.label).toBe('draft')
    expect((useScene.getState().nodes[LEVEL_ID] as { children: AnyNodeId[] }).children).toEqual([
      finalId,
    ])
    expect(commits).toHaveLength(1)
    expect(commits[0]?.origin).toBe('local')
    expect(commits[0]?.before.nodes[SHELF_ID]).toBeUndefined()
    expect(commits[0]?.before.nodes[finalId]).toBeUndefined()
    expect(commits[0]?.current.nodes[SHELF_ID]).toBeUndefined()
    expect(commits[0]?.current.nodes[finalId]).toEqual(committed)

    useScene.temporal.getState().resume()
    useScene.temporal.getState().undo()

    expect(useScene.getState().nodes[finalId]).toBeUndefined()
    expect(useScene.getState().nodes[SHELF_ID]).toBeUndefined()
    expect((useScene.getState().nodes[LEVEL_ID] as { children: AnyNodeId[] }).children).toEqual([])
  })

  test('never aliases root-only children', () => {
    const source = {
      ...shelf(),
      children: ['item_original' as AnyNodeId],
      metadata: { isTransient: true, label: 'source' },
    } as AnyNode
    const duplicate = prepareFreshPlacementRootDuplicate(source) as AnyNode & {
      children: AnyNodeId[]
      id?: AnyNodeId
      metadata?: Record<string, unknown>
    }

    expect(duplicate.id).toBeUndefined()
    expect(duplicate.children).toEqual([])
    expect(duplicate.metadata).toEqual({ isNew: true, label: 'source' })
    expect((source as AnyNode & { children: AnyNodeId[] }).children).toEqual(['item_original'])
  })
})
