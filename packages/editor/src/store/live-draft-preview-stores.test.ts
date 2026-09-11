import { afterEach, describe, expect, test } from 'bun:test'
import useFenceCurveDraft from './use-fence-curve-draft'
import { useFloorplanDraftPreview } from './use-floorplan-draft-preview'
import { useStairBuildPreview } from './use-stair-build-preview'

afterEach(() => {
  useFenceCurveDraft.getState().reset()
  useFloorplanDraftPreview.getState().reset()
  useStairBuildPreview.getState().reset()
})

describe('live draft preview stores', () => {
  test('dedupes polygon snapshots and owns an immutable point copy', () => {
    let changes = 0
    const unsubscribe = useFloorplanDraftPreview.subscribe(() => {
      changes += 1
    })
    const points: Array<[number, number]> = [
      [0, 0],
      [2, 0],
    ]
    useFloorplanDraftPreview.getState().setPolygonDraft('slab', points)
    useFloorplanDraftPreview.getState().setPolygonDraft('slab', points)
    points[0]![0] = 9

    expect(changes).toBe(1)
    expect(useFloorplanDraftPreview.getState().polygonDraftPoints).toEqual([
      [0, 0],
      [2, 0],
    ])
    unsubscribe()
  })

  test('publishes stair point and rotation atomically', () => {
    let changes = 0
    const unsubscribe = useStairBuildPreview.subscribe(() => {
      changes += 1
    })
    useStairBuildPreview.getState().setPreview([3, 4], Math.PI / 2)
    useStairBuildPreview.getState().setPreview([3, 4], Math.PI / 2)

    expect(changes).toBe(1)
    expect(useStairBuildPreview.getState()).toMatchObject({
      point: [3, 4],
      rotation: Math.PI / 2,
    })
    unsubscribe()
  })

  test('dedupes curved-fence control points and cursor', () => {
    let changes = 0
    const unsubscribe = useFenceCurveDraft.subscribe(() => {
      changes += 1
    })
    const points: Array<[number, number]> = [
      [0, 0],
      [1, 1],
    ]
    useFenceCurveDraft.getState().setDraft(points, [2, 0])
    useFenceCurveDraft.getState().setDraft(points, [2, 0])
    points[0]![0] = 5

    expect(changes).toBe(1)
    expect(useFenceCurveDraft.getState()).toMatchObject({
      cursor: [2, 0],
      pointCount: 2,
      points: [
        [0, 0],
        [1, 1],
      ],
    })
    unsubscribe()
  })
})
