import { expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import {
  prepareStageCollision,
  stageObjectsTouch,
  stageToWorldPosition,
} from '@pascal-app/core/stage'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { commandMeta, connectStageCommandExecutor, executeStageCommands } from './command-executor'
import { currentStageContext } from './context'
import { edgeRunCommands, edgeRunRefusal, planRoomEdge } from './edge-run'

const venue = { widthMeters: 8, depthMeters: 6 }

function placed(piece: ReturnType<typeof planRoomEdge>['pieces'][number]) {
  return {
    kind: 'scenic-flat' as const,
    libraryAssetId: piece.assetId,
    dimensionsMeters: piece.dimensionsMeters,
    collisionGeometry: piece.collisionGeometry,
    transform: {
      position: piece.position,
      rotationDegrees: { x: 0, y: piece.yaw, z: 0 },
    },
  }
}

test('side buttons follow audience left and right without changing the stage coordinate frame', () => {
  const frame = { origin: [0, 0, 0] as [number, number, number], depthMeters: venue.depthMeters }
  for (const [edge, stageSign] of [
    ['left', 1],
    ['right', -1],
  ] as const) {
    const { pieces } = planRoomEdge(edge, venue)
    expect(pieces.length).toBeGreaterThan(0)
    for (const piece of pieces) {
      expect(piece.position.x * stageSign).toBeGreaterThan(0)
      expect(stageToWorldPosition(piece.position, frame)[0] * stageSign).toBeLessThan(0)
      const bounds = prepareStageCollision(placed(piece)).bounds[0]!
      expect(stageSign === 1 ? bounds[1] : bounds[0]).toBeCloseTo(stageSign * 4, 3)
    }
  }
})

test('audience-side correction preserves the original 1.3 metre window and door openings', () => {
  for (const [edge, axis, opening] of [
    ['back', 0, '给窗'],
    ['left', 2, '给门'],
  ] as const) {
    const planned = planRoomEdge(edge, venue)
    const spans = planned.pieces
      .map((piece) => prepareStageCollision(placed(piece)).bounds[axis]!)
      .sort((a, b) => a[0] - b[0])
    const gaps = spans.slice(1).map((span, index) => span[0] - spans[index]![1])
    expect(gaps.filter((gap) => gap > 1e-4)).toHaveLength(1)
    expect(Math.max(...gaps)).toBeCloseTo(1.3, 5)
    expect(planned.notice).toContain(opening)
  }
  const spans = planRoomEdge('right', venue)
    .pieces.map((piece) => prepareStageCollision(placed(piece)).bounds[2]!)
    .sort((a, b) => a[0] - b[0])
  for (let index = 1; index < spans.length; index++)
    expect(spans[index]![0] - spans[index - 1]![1]).toBeCloseTo(0, 5)
})

test('the audience-oriented enclosure keeps all three edges non-intersecting at native scale', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  const disconnect = connectStageCommandExecutor()
  try {
    for (const edge of ['back', 'left', 'right'] as const) {
      const planned = planRoomEdge(edge, venue)
      expect(edgeRunRefusal(planned.pieces, currentStageContext())).toBeNull()
      const result = executeStageCommands(edgeRunCommands(planned.pieces, commandMeta('manual')))
      expect(result.ok, result.error).toBe(true)
    }
    const flats = currentStageContext().objects.filter((object) => object.kind === 'scenic-flat')
    expect(flats.length).toBeGreaterThan(0)
    for (let i = 0; i < flats.length; i++)
      for (let j = i + 1; j < flats.length; j++)
        expect(stageObjectsTouch(flats[i]!, flats[j]!, true)).toBe(false)
    for (const node of Object.values(useScene.getState().nodes)) {
      if (node.type !== 'item' || !node.asset.id.startsWith('SCN-FOLD')) continue
      expect(node.scale).toEqual([1, 1, 1])
      expect(node.controls?.fold_angle_1_deg).toBe(180)
      expect(node.controls?.fold_angle_2_deg).toBe(180)
    }
  } finally {
    disconnect()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
