import { afterEach, beforeEach, expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import { prepareStageCollision, stageObjectsTouch, validateStagePlan } from '@pascal-app/core/stage'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { commandMeta, connectStageCommandExecutor, executeStageCommands } from './command-executor'
import { currentStageContext } from './context'
import {
  edgeRunCommands,
  edgeRunRefusal,
  planRoomEdge,
  settleOpening,
  snapFootprintToStageEdges,
  straightFoldShape,
} from './edge-run'
import { formatRehearsalLength, snapFoldStop } from './rehearsal-measure'

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

test('rehearsal lengths stay on whole metres or 10 centimetre steps', () => {
  expect(formatRehearsalLength(8)).toBe('8 米')
  expect(formatRehearsalLength(0.8)).toBe('80 厘米')
  expect(formatRehearsalLength(1.3)).toBe('130 厘米')
  expect(formatRehearsalLength(0.56)).toBe('约 60 厘米')
  expect(formatRehearsalLength(8)).not.toMatch(/\d+\.\d+/)
  expect(snapFoldStop(170)).toBe(180)
  expect(snapFoldStop(10)).toBe(0)
  expect(snapFoldStop(200)).toBe(180)
})

test('an 8 by 6 stage gets straight curtains flush to the back and both sides, with a named gap', () => {
  const straight = straightFoldShape('SCN-FOLD-03')!
  expect(straight.dimensions[0]).toBeCloseTo(2.7, 5)
  expect(straight.dimensions[2]).toBeCloseTo(0.04, 5)
  for (const edge of ['back', 'left', 'right'] as const) {
    const planned = planRoomEdge(edge, venue)
    expect(planned.pieces.length).toBeGreaterThan(0)
    expect(planned.notice).not.toMatch(/\d+\.\d+/)
    expect(
      planned.pieces.every((piece) => piece.foldAngles.every((angle) => angle % 45 === 0)),
    ).toBe(true)
    for (const piece of planned.pieces) {
      const bounds = prepareStageCollision(placed(piece)).bounds
      expect(bounds[0]![0]).toBeGreaterThanOrEqual(-4 - 1e-3)
      expect(bounds[0]![1]).toBeLessThanOrEqual(4 + 1e-3)
      expect(bounds[2]![0]).toBeGreaterThanOrEqual(-1e-3)
      expect(bounds[2]![1]).toBeLessThanOrEqual(6 + 1e-3)
    }
    for (let i = 0; i < planned.pieces.length; i++)
      for (let j = i + 1; j < planned.pieces.length; j++)
        expect(
          stageObjectsTouch(placed(planned.pieces[i]!), placed(planned.pieces[j]!), true),
        ).toBe(false)
  }
  const back = planRoomEdge('back', venue)
  expect(back.notice).toContain('给窗')
  expect(back.notice).toContain('留缝')
  const left = planRoomEdge('left', venue)
  expect(left.notice).toContain('给门')
  const backBounds = back.pieces.map((piece) => prepareStageCollision(placed(piece)).bounds)
  expect(Math.min(...backBounds.map((bounds) => bounds[0]![0]))).toBeCloseTo(-4, 2)
  expect(Math.max(...backBounds.map((bounds) => bounds[2]![1]))).toBeCloseTo(6, 2)
  const leftBounds = prepareStageCollision(placed(left.pieces[0]!)).bounds
  expect(leftBounds[0]![1]).toBeCloseTo(4, 2)
  expect(leftBounds[2]![1]).toBeLessThanOrEqual(6)
})

test('a window clicked near the back wall settles into the curtain gap', () => {
  const back = planRoomEdge('back', venue)
  const walls = back.pieces.map(placed)
  const window = {
    kind: 'window-flat' as const,
    dimensionsMeters: { width: 1.3, height: 2.4, depth: 0.082 },
    transform: {
      position: { x: -1.1, y: 0, z: 5.7 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
    },
  }
  const settled = settleOpening(window, walls, venue)
  expect(settled.labels).toContain('贴后墙')
  const placedWindow = { ...window, transform: { ...window.transform, position: settled.position } }
  for (const wall of walls) expect(stageObjectsTouch(placedWindow, wall, true)).toBe(false)
  const bounds = prepareStageCollision(placedWindow).bounds
  expect(bounds[2]![1]).toBeLessThanOrEqual(6 + 1e-3)
})

test('a door clicked near the left wall turns to face the wall and sits in the opening', () => {
  const left = planRoomEdge('left', venue)
  const walls = [...planRoomEdge('back', venue).pieces.map(placed), ...left.pieces.map(placed)]
  const door = {
    kind: 'door-flat' as const,
    dimensionsMeters: { width: 1.3, height: 2.4, depth: 0.08 },
    transform: {
      position: { x: 3.6, y: 0, z: 3 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
    },
  }
  const settled = settleOpening(door, walls, venue)
  expect(settled.labels).toContain('贴台右')
  expect(settled.yaw).toBe(90)
  const placedDoor = {
    ...door,
    transform: {
      position: settled.position,
      rotationDegrees: { x: 0, y: settled.yaw, z: 0 },
    },
  }
  for (const wall of walls) expect(stageObjectsTouch(placedDoor, wall, true)).toBe(false)
  const bounds = prepareStageCollision(placedDoor).bounds
  expect(bounds[0]![1]).toBeLessThanOrEqual(4 + 1e-3)
})

test('footprint snap pulls a straight curtain onto the back edge without a decimal readout', () => {
  const shape = straightFoldShape('SCN-FOLD-02')!
  const item = {
    kind: 'scenic-flat' as const,
    dimensionsMeters: {
      width: shape.dimensions[0],
      height: shape.dimensions[1],
      depth: shape.dimensions[2],
    },
    collisionGeometry: shape.collisionGeometry,
    transform: {
      position: { x: -shape.boundsCenter[0], y: 0, z: 5.6 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
    },
  }
  const snapped = snapFootprintToStageEdges(item, venue)
  expect(snapped.labels).toContain('贴后墙')
  const bounds = prepareStageCollision({
    ...item,
    transform: { ...item.transform, position: snapped.position },
  }).bounds
  expect(bounds[2]![1]).toBeCloseTo(6, 3)
})

let disconnect: () => void
beforeEach(() => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  disconnect = connectStageCommandExecutor()
})
afterEach(() => {
  disconnect?.()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('placing the three edges stores straight 45-degree folds at scale 1 and stays inside the stage', () => {
  const context = currentStageContext()
  expect(edgeRunRefusal(planRoomEdge('back', venue).pieces, context)).toBeNull()
  for (const edge of ['back', 'left', 'right'] as const) {
    const stage = currentStageContext().venue
    if (!stage) throw new Error('舞台还没建好')
    const planned = planRoomEdge(edge, stage)
    const result = executeStageCommands(edgeRunCommands(planned.pieces, commandMeta('manual')))
    expect(result.ok, result.error).toBe(true)
  }
  const flats = currentStageContext().objects.filter((object) => object.kind === 'scenic-flat')
  for (let i = 0; i < flats.length; i++)
    for (let j = i + 1; j < flats.length; j++)
      expect(stageObjectsTouch(flats[i]!, flats[j]!, true)).toBe(false)
  const folds = Object.values(useScene.getState().nodes).filter(
    (node) => node.type === 'item' && node.asset.id.startsWith('SCN-FOLD'),
  )
  expect(folds.length).toBeGreaterThanOrEqual(5)
  for (const node of folds) {
    if (node.type !== 'item') continue
    expect(node.scale).toEqual([1, 1, 1])
    expect(node.controls?.fold_angle_1_deg).toBe(180)
    expect(node.controls?.fold_angle_2_deg).toBe(180)
  }
  const again = planRoomEdge('back', venue)
  expect(edgeRunRefusal(again.pieces, currentStageContext())).toContain('已经有景片')
  const plan = validateStagePlan(
    {
      schemaVersion: 1,
      source: 'manual',
      venue: null,
      items: [],
      relations: [],
      assumptions: [],
      questions: [],
      evidence: [],
      warnings: [],
    },
    currentStageContext(),
  )
  expect(plan.valid).toBe(true)
})
