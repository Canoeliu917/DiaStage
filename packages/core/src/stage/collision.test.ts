import { expect, test } from 'bun:test'
import { rotatePoint } from '../remount/geometry'
import { stageCollisionGeometry, stageObjectsTouch } from './collision'
import { compileStagePlan } from './plan'
import type { SceneContextObject, SceneContextSummary, StagePlan } from './schema'
import { stageObjectFootprint, stageObjectFootprints } from './spacing'

const object = (
  kind: SceneContextObject['kind'],
  width = 1,
  height = 1,
  depth = 1,
): SceneContextObject => ({
  id: kind,
  name: kind,
  kind,
  dimensionsMeters: { width, height, depth },
  transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
})
const context: SceneContextSummary = {
  documentVersion: 1,
  objects: [],
  selectedObjectIds: [],
  doorClearanceMeters: 10,
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
}

test('touch and penetration compile, without an old clearance or minimum gap', () => {
  for (const x of [0, 1, 1.001]) {
    const a = object('neutral-block'),
      b = object('neutral-block')
    b.id = 'second'
    b.transform.position.x = x
    const plan: StagePlan = {
      schemaVersion: 1,
      source: 'manual',
      venue: null,
      relations: [],
      assumptions: [],
      questions: [],
      evidence: [],
      warnings: [
        { code: 'collision', itemIds: ['old'], message: 'old rejection', blocking: true },
        { code: 'clearance', itemIds: ['old'], message: 'old clearance', blocking: true },
      ],
      items: [a, b].map(({ kind, dimensionsMeters, transform }, index) => ({
        kind,
        dimensionsMeters,
        transform,
        proposalId: `item-${index}`,
        displayName: '方块',
        existingNodeId: null,
        libraryAssetId: null,
        certainty: 'stated',
        assumptionIds: [],
        evidenceIds: [],
      })),
    }
    const result = compileStagePlan(plan, context, {
      transactionId: `touch-${x}`,
      issuedAt: '2026-09-13T00:00:00Z',
    })
    expect(result.ok).toBe(true)
    expect(result.commands).toHaveLength(2)
    expect(
      result.warnings.some((warning) => warning.blocking || warning.code === 'clearance'),
    ).toBe(false)
    expect(result.warnings.some((warning) => warning.code === 'collision')).toBe(x <= 1)
  }
})

test('door and window openings, table legs and circular tops use occupied parts', () => {
  const door = object('door-flat', 1, 2.1, 0.15),
    small = object('neutral-block', 0.2, 0.3, 0.2)
  expect(stageObjectsTouch(door, small)).toBe(false)
  small.transform.position.x = 0.4
  expect(stageObjectsTouch(door, small)).toBe(true)
  const window = object('window-flat', 1.2, 2, 0.15)
  small.transform.position = { x: 0.2, y: 0.8, z: 3 }
  expect(stageObjectsTouch(window, small)).toBe(false)
  const table = object('table', 2, 1, 2)
  small.transform.position = { x: 0, y: 0, z: 3 }
  expect(stageObjectsTouch(table, small)).toBe(false)
  small.transform.position.y = 0.8
  expect(stageObjectsTouch(table, small)).toBe(true)
  const round = object('round-table', 2, 1, 2)
  small.transform.position = { x: 0.95, y: 0.8, z: 3.95 }
  expect(stageObjectsTouch(round, small)).toBe(false)
  small.transform.position = { x: 1.1, y: 0.8, z: 3 }
  expect(stageObjectsTouch(round, small)).toBe(true)
  expect(stageObjectFootprint(round)).toHaveLength(24)
  expect(stageObjectFootprints(door)).toHaveLength(3)
})

test('rotated and topology-baked objects preserve visible gaps', () => {
  const door = object('door-flat', 1, 2.1, 0.15),
    small = object('neutral-block', 0.1, 0.1, 0.1)
  door.transform.rotationDegrees.y = 45
  expect(stageObjectsTouch(door, small)).toBe(false)
  const tilt: [number, number, number] = [Math.PI / 4, 0, 0]
  door.collisionGeometry = stageCollisionGeometry(door).map((part) => ({
    ...part,
    vertices: part.vertices.map((point) => rotatePoint(point, tilt)),
  }))
  const vertices = door.collisionGeometry.flatMap((part) => part.vertices)
  const extents = [0, 1, 2].map(
    (axis) =>
      Math.max(...vertices.map((point) => point[axis]!)) -
      Math.min(...vertices.map((point) => point[axis]!)),
  )
  door.dimensionsMeters = { width: extents[0]!, height: extents[1]!, depth: extents[2]! }
  door.transform.rotationDegrees.y = 0
  const position = rotatePoint([0, 0.8, 0], tilt)
  small.transform.position = { x: position[0], y: position[1], z: 3 + position[2] }
  expect(stageObjectsTouch(door, small)).toBe(false)
  const post = rotatePoint([0.44, 0.8, 0], tilt)
  small.transform.position = { x: post[0], y: post[1], z: 3 + post[2] }
  expect(stageObjectsTouch(door, small)).toBe(true)
})

test('a dimensions edit resizes retained geometry for both collision and drawing', () => {
  const door = object('door-flat', 1, 2, 0.15)
  door.collisionGeometry = stageCollisionGeometry(door)
  door.dimensionsMeters.width = 2
  const small = object('neutral-block', 0.1, 0.1, 0.1)
  small.transform.position.x = 0.44
  expect(stageObjectsTouch(door, small)).toBe(false)
  small.transform.position.x = 0.88
  expect(stageObjectsTouch(door, small)).toBe(true)
  expect(Math.max(...stageObjectFootprint(door).map((point) => point[0]))).toBeCloseTo(1)
})
