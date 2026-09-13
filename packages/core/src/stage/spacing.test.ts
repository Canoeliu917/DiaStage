import { expect, test } from 'bun:test'
import { pointInPolygon } from '../lib/polygon-relations'
import { getObjectCorners } from '../remount/geometry'
import { stageToWorldPosition, stageToWorldRotation, worldToStagePosition } from './coordinates'
import type { SceneContextObject, SceneContextSummary, StagePlan } from './schema'
import { stageFootprintGap, stageLayoutObjects, stageObjectFootprint } from './spacing'

const prop = (id: string, x: number, yaw = 0): SceneContextObject => ({
  id,
  name: id,
  kind: 'platform',
  dimensionsMeters: { width: 2, height: 4, depth: 2 },
  transform: { position: { x, y: 0, z: 0 }, rotationDegrees: { x: 0, y: yaw, z: 0 } },
})
const gap = (left: SceneContextObject, right: SceneContextObject) =>
  stageFootprintGap(stageObjectFootprint(left), stageObjectFootprint(right))

test('spacing measures closest declared edges, including rotated, tilted and intersecting props', () => {
  expect(gap(prop('a', 0), prop('b', 4)).meters).toBeCloseTo(2)
  expect(gap(prop('a', 0, 45), prop('b', 4, 45)).meters).toBeCloseTo(4 - 2 * Math.SQRT2)
  expect(gap(prop('a', 0), prop('b', 1)).meters).toBe(0)
  expect(gap(prop('a', 0), prop('b', 2)).meters).toBe(0)
  const contained = { ...prop('small', 0), dimensionsMeters: { width: 0.5, height: 1, depth: 0.5 } }
  expect(gap(prop('a', 0), contained).meters).toBe(0)
  const tilted = prop('tilted', 0)
  tilted.transform.rotationDegrees.x = 90
  const footprint = stageObjectFootprint(tilted)
  expect(Math.min(...footprint.map((point) => point[1]))).toBeCloseTo(0)
  expect(Math.max(...footprint.map((point) => point[1]))).toBeCloseTo(4)
  const beyond = prop('beyond', 0)
  beyond.transform.position.z = 6
  expect(gap(tilted, beyond).meters).toBeCloseTo(1)
  const halfTurn = prop('half-turn', 0)
  halfTurn.transform.rotationDegrees = { x: 180, y: 0, z: 180 }
  const rectangle = stageObjectFootprint(halfTurn)
  expect(rectangle.length).toBe(4)
  expect(
    Math.abs(
      rectangle.reduce((sum, [x, z], index) => {
        const next = rectangle[(index + 1) % rectangle.length]!
        return sum + x * next[1] - next[0] * z
      }, 0),
    ) / 2,
  ).toBeCloseTo(4)
})

test('layout replaces existing props once and preserves their world location when stage depth changes', () => {
  const context: SceneContextSummary = {
    documentVersion: 1,
    venue: { type: 'black-box', widthMeters: 10, depthMeters: 6, heightMeters: 4 },
    selectedObjectIds: [],
    objects: [prop('existing-a', 0), prop('existing-b', 4)],
  }
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'manual',
    venue: { ...context.venue!, depthMeters: 8 },
    items: [
      {
        proposalId: 'moved-a',
        existingNodeId: 'existing-a',
        displayName: 'moved a',
        kind: 'platform',
        libraryAssetId: null,
        dimensionsMeters: prop('a', 0).dimensionsMeters,
        transform: prop('a', -2).transform,
        certainty: 'stated',
        assumptionIds: [],
        evidenceIds: [],
      },
    ],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  const before = JSON.stringify({ context, plan })
  expect(stageLayoutObjects(context, null)).toEqual(context.objects)
  const items = stageLayoutObjects(context, plan)
  expect(items.map((item) => item.id)).toEqual(['existing-b', 'existing-a'])
  expect(items[0]!.transform.position.z).toBe(1)
  expect(items[1]!.transform.position.x).toBe(-2)
  expect(JSON.stringify({ context, plan })).toBe(before)
})

test('three-axis stage footprint matches the projected world volume after stage coordinate conversion', () => {
  const item = prop('tilted', 2)
  item.transform.rotationDegrees = { x: 37, y: 63, z: 29 }
  const frame = { origin: [3, 2, 8] as [number, number, number], depthMeters: 10 }
  const worldCorners = getObjectCorners({
    nodeId: item.id,
    name: item.name,
    representation: 'physical',
    dimensions: [2, 4, 2],
    boundsCenter: [0, 2, 0],
    position: stageToWorldPosition(item.transform.position, frame),
    rotation: stageToWorldRotation(item.transform.rotationDegrees),
  }).map((corner) => worldToStagePosition(corner, frame))
  const footprint = stageObjectFootprint(item)
  for (const corner of worldCorners)
    expect(pointInPolygon([corner.x, corner.z], footprint)).toBe(true)
  for (const point of footprint)
    expect(
      worldCorners.some((corner) => Math.hypot(point[0] - corner.x, point[1] - corner.z) < 1e-8),
    ).toBe(true)
})
