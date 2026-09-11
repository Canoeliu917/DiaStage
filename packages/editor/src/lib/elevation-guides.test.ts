import { describe, expect, test } from 'bun:test'
import { type AnyNode, LevelNode, SlabNode } from '@pascal-app/core'
import useElevationGuides from '../store/use-elevation-guides'
import {
  clearStructuralElevationGuide,
  collectElevationSnapTargets,
  publishResolvedElevationGuide,
  publishStructuralElevationGuide,
  resolveElevationSnapMatch,
  resolveStructuralElevationSnap,
} from './elevation-guides'

function structuralScene() {
  const rawLevel = LevelNode.parse({ level: 0, height: 3 })
  const slab = SlabNode.parse({
    parentId: rawLevel.id,
    polygon: [
      [2, -1],
      [4, -1],
      [4, 1],
      [2, 1],
    ],
    elevation: 0.6,
    thickness: 0.2,
  })
  const level = { ...rawLevel, children: [slab.id] }
  const nodes: Record<string, AnyNode> = {
    [level.id]: level,
    [slab.id]: slab,
  }
  return { level, nodes, slab }
}

describe('elevation guides', () => {
  test('collects the level and slab faces on the source level', () => {
    const { level, nodes, slab } = structuralScene()
    const targets = collectElevationSnapTargets(
      { nodeId: 'wall_moving', levelId: level.id, anchor: [0, 0] },
      nodes,
    )

    expect(targets.map((target) => [target.label, target.elevation])).toEqual([
      ['表演层', 0],
      ['舞台平台顶面', 0.6],
      ['舞台平台底面', 0.39999999999999997],
    ])

    const withoutSelf = collectElevationSnapTargets(
      { nodeId: slab.id, levelId: level.id, anchor: [0, 0] },
      nodes,
    )
    expect(withoutSelf.some((target) => target.id.startsWith(slab.id))).toBe(false)
  })

  test('snaps inside the Y tolerance and leaves values outside it alone', () => {
    const { level, nodes } = structuralScene()
    const source = { nodeId: 'wall_moving', levelId: level.id, anchor: [0, 0] } as const

    expect(resolveStructuralElevationSnap(source, 0.54, nodes)).toBe(0.6)
    expect(resolveStructuralElevationSnap(source, 0.49, nodes)).toBe(0.49)
  })

  test('uses plan distance to disambiguate datums at the same elevation', () => {
    const match = resolveElevationSnapMatch(
      1,
      [0, 0],
      [
        { id: 'far', elevation: 1, anchor: [10, 0], label: 'Far' },
        { id: 'near', elevation: 1, anchor: [2, 0], label: 'Near' },
      ],
    )

    expect(match?.target.id).toBe('near')
  })

  test('publishes one owner-scoped guide only while exactly aligned', () => {
    const { level, nodes } = structuralScene()
    const source = { nodeId: 'wall_moving', levelId: level.id, anchor: [0, 0] } as const
    useElevationGuides.setState({ guide: null })

    publishStructuralElevationGuide(source, 0.6, nodes)
    expect(useElevationGuides.getState().guide).toMatchObject({
      ownerId: 'wall_moving',
      elevation: 0.6,
      label: '舞台平台顶面',
      direction: [1, 0],
    })

    clearStructuralElevationGuide('someone_else')
    expect(useElevationGuides.getState().guide).not.toBeNull()

    publishStructuralElevationGuide(source, 0.7, nodes)
    expect(useElevationGuides.getState().guide).toBeNull()
  })

  test('publishes an explicitly resolved neighboring datum', () => {
    const { level } = structuralScene()
    useElevationGuides.setState({ guide: null })

    publishResolvedElevationGuide(
      { nodeId: 'platform_moving', levelId: level.id, anchor: [2, 1] },
      {
        id: 'platform_neighbor:high-edge',
        elevation: 3.4,
        anchor: [5, 1],
        label: 'Neighbor shed edge',
      },
    )

    expect(useElevationGuides.getState().guide).toMatchObject({
      ownerId: 'platform_moving',
      elevation: 3.4,
      direction: [1, 0],
      label: 'Neighbor shed edge',
    })
  })
})
