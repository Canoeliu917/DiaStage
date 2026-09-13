import { describe, expect, test } from 'bun:test'
import { rotatePoint } from '../remount/geometry'
import {
  stageToWorldPosition,
  stageToWorldRotation,
  worldToStagePosition,
  worldToStageRotation,
} from './coordinates'
import { compileStagePlan, resolveStagePlan, validateStagePlan } from './plan'
import {
  type SceneContextSummary,
  type StageCommand,
  StageCommandSchema,
  type StageItemProposal,
  type StagePlan,
  StagePlanSchema,
} from './schema'

const venue = { type: 'proscenium' as const, widthMeters: 8, depthMeters: 6, heightMeters: 4 }
const context: SceneContextSummary = {
  documentVersion: 3,
  venue,
  objects: [],
  selectedObjectIds: [],
}
const transaction = { transactionId: 'transaction-1', issuedAt: '2026-09-10T00:00:00Z' }
const transform = { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } }
const item = (
  proposalId = 'sofa',
  kind: StageItemProposal['kind'] = 'sofa',
): StageItemProposal => ({
  proposalId,
  existingNodeId: null,
  kind,
  displayName: proposalId,
  libraryAssetId: null,
  dimensionsMeters: { width: 2, height: 0.85, depth: 0.9 },
  transform: structuredClone(transform),
  certainty: 'inferred',
  assumptionIds: ['sizes'],
  evidenceIds: [],
})
const plan = (): StagePlan => ({
  schemaVersion: 1,
  source: 'typed-command',
  venue,
  items: [item()],
  relations: [],
  assumptions: [{ id: 'sizes', message: '尺寸暂按舞台库默认值。' }],
  questions: [],
  evidence: [],
  warnings: [],
})
const example = (): StagePlan => ({
  ...plan(),
  items: [
    item(),
    { ...item('window', 'window-flat'), dimensionsMeters: { width: 1.2, height: 2.2, depth: 0.1 } },
    { ...item('door', 'door-flat'), dimensionsMeters: { width: 0.9, height: 2.2, depth: 0.1 } },
  ],
  relations: [
    { id: 'center', subjectId: 'sofa', referenceId: null, direction: 'center', gapMeters: 0 },
    {
      id: 'window-right',
      subjectId: 'window',
      referenceId: 'sofa',
      direction: 'stage-right',
      gapMeters: 0.3,
    },
    {
      id: 'door-right',
      subjectId: 'door',
      referenceId: 'window',
      direction: 'stage-right',
      gapMeters: 0,
    },
  ],
})

test('resized stage rebases unchanged context before bounds, relative placement and collision checks', () => {
  const chair = {
    id: 'chair',
    name: '椅子',
    kind: 'chair' as const,
    dimensionsMeters: { width: 0.5, height: 0.9, depth: 0.5 },
    transform: { position: { x: 0, y: 0, z: 0.5 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
  const source = { ...context, objects: [chair] }
  const shrinking = { ...plan(), venue: { ...venue, depthMeters: 4 }, items: [] }
  expect(
    validateStagePlan(shrinking, source).warnings.some(
      (warning) => warning.code === 'out-of-bounds',
    ),
  ).toBe(true)
  const proposed = {
    ...item('new', 'chair'),
    dimensionsMeters: chair.dimensionsMeters,
    transform: { ...chair.transform, position: { x: 0, y: 0, z: 1.5 } },
  }
  const growing = { ...plan(), venue: { ...venue, depthMeters: 8 }, items: [proposed] }
  expect(
    validateStagePlan(growing, source).warnings.some((warning) => warning.code === 'collision'),
  ).toBe(true)
  const relative = {
    ...growing,
    relations: [
      {
        id: 'left',
        subjectId: 'new',
        referenceId: 'chair',
        direction: 'stage-left' as const,
        gapMeters: 0.3,
      },
    ],
  }
  expect(resolveStagePlan(relative, source).items[0]?.transform.position.z).toBe(1.5)
  expect(source.objects[0]?.transform.position.z).toBe(0.5)
})

test('camera roll is blocked because legacy keyframes cannot preserve it', () => {
  const input = plan()
  input.items[0] = {
    ...item('camera', 'camera'),
    dimensionsMeters: { width: 0.35, height: 0.25, depth: 0.5 },
    transform: { position: { x: 0, y: 1.5, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 10 } },
  }
  const result = compileStagePlan(input, context, transaction)
  expect(result.ok).toBe(false)
  expect(result.commands).toHaveLength(0)
  expect(result.warnings.some((warning) => warning.message.includes('横滚'))).toBe(true)
})

describe('stage domain coordinates', () => {
  test('台右、台左、台后、台前 convert once at the Pascal boundary and round trip', () => {
    const frame = { origin: [10, 2, -3] as [number, number, number], depthMeters: 6 }
    expect(stageToWorldPosition({ x: 0, y: 0, z: 0 }, frame)).toEqual([10, 2, 0])
    expect(stageToWorldPosition({ x: 1, y: 0, z: 0 }, frame)).toEqual([9, 2, 0])
    expect(stageToWorldPosition({ x: -1, y: 0, z: 0 }, frame)).toEqual([11, 2, 0])
    expect(stageToWorldPosition({ x: 0, y: 0, z: 1 }, frame)).toEqual([10, 2, -1])
    expect(stageToWorldPosition({ x: 0, y: 0, z: -1 }, frame)).toEqual([10, 2, 1])
    const p = { x: -0.2, y: 1.4, z: 4.6 }
    const back = worldToStagePosition(stageToWorldPosition(p, frame), frame)
    for (const axis of ['x', 'y', 'z'] as const) expect(back[axis]).toBeCloseTo(p[axis], 12)
    expect(() => stageToWorldPosition({ ...p, x: Number.NaN }, frame)).toThrow()
  })
  test('rotation includes the half-turn basis for both yaw and tilted objects', () => {
    const r = { x: 20, y: 35, z: 15 }
    const world = stageToWorldRotation(r)
    const direction = rotatePoint(
      [0.2, 0.4, 0.6],
      [(r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180],
    )
    const converted = rotatePoint([0.2, 0.4, 0.6], world)
    expect(converted[0]).toBeCloseTo(-direction[0], 12)
    expect(converted[1]).toBeCloseTo(direction[1], 12)
    expect(converted[2]).toBeCloseTo(-direction[2], 12)
    const back = worldToStageRotation(world)
    for (const axis of ['x', 'y', 'z'] as const) expect(back[axis]).toBeCloseTo(r[axis], 12)
    expect(stageToWorldRotation({ x: 0, y: 0, z: 0 })[1]).toBe(Math.PI)
  })
})

describe('stage plan trust boundary and compiler', () => {
  test('dense contacts stay within the response schema limit and remain advisory', () => {
    const input = plan()
    input.items = Array.from({ length: 50 }, (_, index) => item(`item-${index}`))
    const result = validateStagePlan(input, context)
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeLessThanOrEqual(400)
    expect(StagePlanSchema.safeParse(result.plan).success).toBe(true)
    expect(
      result.warnings.every((warning) => warning.code === 'collision' && !warning.blocking),
    ).toBe(true)
  })
  test('the sofa / window / door example has deterministic edge gaps and command metadata', () => {
    const input = example()
    const untouched = structuredClone(input)
    const result = compileStagePlan(input, context, transaction)
    expect(result.ok).toBe(true)
    expect(result.commands.map((command) => command.type)).toEqual([
      'CreateStage',
      'AddScenery',
      'AddScenery',
      'AddScenery',
    ])
    expect(result.plan.items[0]!.transform.position).toEqual({ x: 0, y: 0, z: 3 })
    expect(result.plan.items[1]!.transform.position.x).toBeCloseTo(1.9, 10)
    expect(result.plan.items[2]!.transform.position.x).toBeCloseTo(2.95, 10)
    expect(
      result.commands.every(
        (command) =>
          command.meta.expectedDocumentVersion === 3 &&
          command.meta.transactionId === transaction.transactionId,
      ),
    ).toBe(true)
    expect(input).toEqual(untouched)
    expect(compileStagePlan(input, context, transaction)).toEqual(result)
  })
  test('all plan objects reject forbidden fields and kinds at every nesting level', () => {
    for (const field of ['lighting', 'room', 'scene', 'beat', 'objective', 'code']) {
      expect(StagePlanSchema.safeParse({ ...plan(), [field]: {} }).success).toBe(false)
      expect(
        StagePlanSchema.safeParse({ ...plan(), items: [{ ...item(), [field]: {} }] }).success,
      ).toBe(false)
    }
    for (const kind of ['light', 'lamp', 'fixture', 'room', 'roof', 'HVAC', 'cabinetry']) {
      expect(StagePlanSchema.safeParse({ ...plan(), items: [{ ...item(), kind }] }).success).toBe(
        false,
      )
    }
    expect(
      StagePlanSchema.safeParse({ ...plan(), venue: { ...venue, widthMeters: Infinity } }).success,
    ).toBe(false)
    expect(
      StagePlanSchema.safeParse({
        ...plan(),
        items: [{ ...item(), dimensionsMeters: { width: 0, depth: 1, height: 1 } }],
      }).success,
    ).toBe(false)
  })
  test('unresolved direction questions never compile executable commands', () => {
    const input = plan()
    input.questions = [
      { id: 'right', message: '右边是台右还是观众右？', options: ['台右', '观众右'] },
    ]
    const result = compileStagePlan(input, context, transaction)
    expect(result.ok).toBe(false)
    expect(result.commands).toEqual([])
  })
  test('bounds and references block execution while contacts and old clearances do not', () => {
    const outside = plan()
    outside.items[0]!.transform.position.x = 4
    expect(
      validateStagePlan(outside, context).warnings.some(
        (w) => w.code === 'out-of-bounds' && w.blocking,
      ),
    ).toBe(true)
    const collision = plan()
    collision.items.push(item('other'))
    expect(compileStagePlan(collision, context, transaction).ok).toBe(true)
    expect(validateStagePlan(collision, context).warnings.some((w) => w.code === 'collision')).toBe(
      true,
    )
    const doorway = plan()
    doorway.items = [
      { ...item('door', 'door-flat'), dimensionsMeters: { width: 0.9, height: 2, depth: 0.1 } },
      {
        ...item('chair', 'chair'),
        dimensionsMeters: { width: 0.5, height: 0.9, depth: 0.5 },
        transform: { ...transform, position: { x: 0, y: 0, z: 3.5 } },
      },
    ]
    expect(
      validateStagePlan(doorway, { ...context, doorClearanceMeters: 10 }).warnings.some(
        (w) => w.code === 'clearance',
      ),
    ).toBe(false)
    expect(compileStagePlan(doorway, context, transaction).ok).toBe(true)
    const absent = example()
    absent.relations[1]!.referenceId = 'missing'
    expect(validateStagePlan(absent, context).valid).toBe(false)
    const cycle = example()
    cycle.relations[0] = {
      id: 'loop',
      subjectId: 'sofa',
      referenceId: 'door',
      direction: 'stage-right',
      gapMeters: 0,
    }
    expect(
      validateStagePlan(cycle, context).warnings.some((w) => w.code === 'invalid-relation'),
    ).toBe(true)
  })
  test('existing objects are transformed, not replaced, and old neighbours participate in validation', () => {
    const old = item()
    const scene: SceneContextSummary = {
      ...context,
      objects: [
        {
          id: 'real-sofa',
          name: 'sofa',
          kind: 'sofa',
          dimensionsMeters: old.dimensionsMeters,
          transform: old.transform,
        },
      ],
    }
    const input = plan()
    input.venue = null
    input.items[0]!.existingNodeId = 'real-sofa'
    input.items[0]!.transform.position.x = 1
    expect(
      compileStagePlan(input, scene, transaction).commands.map((command) => command.type),
    ).toEqual(['MoveObject', 'RotateObject', 'ResizeObject'])
    input.items[0]!.existingNodeId = null
    const result = validateStagePlan(input, scene)
    expect(result.valid).toBe(true)
    expect(
      result.warnings.some((warning) => warning.code === 'collision' && !warning.blocking),
    ).toBe(true)
  })
  test('allowed commands and manual name/lock properties are strict, finite and metadata-complete', () => {
    const meta = {
      ...transaction,
      commandId: 'cmd',
      source: 'manual' as const,
      expectedDocumentVersion: 1,
    }
    const camera = {
      nodeId: 'camera',
      transform,
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDegrees: 50,
    }
    const commands: StageCommand[] = [
      { type: 'CreateStage', meta, venue },
      {
        type: 'AddScenery',
        meta,
        nodeId: 'sofa',
        name: '沙发',
        kind: 'sofa',
        libraryAssetId: null,
        transform,
        dimensionsMeters: item().dimensionsMeters,
      },
      { type: 'MoveObject', meta, nodeId: 'sofa', position: transform.position },
      { type: 'RotateObject', meta, nodeId: 'sofa', rotationDegrees: transform.rotationDegrees },
      { type: 'ResizeObject', meta, nodeId: 'sofa', dimensionsMeters: item().dimensionsMeters },
      {
        type: 'DuplicateObject',
        meta,
        sourceNodeId: 'sofa',
        newNodeId: 'copy',
        name: '沙发副本',
        position: transform.position,
      },
      { type: 'RemoveObject', meta, nodeId: 'sofa' },
      { type: 'RenameObject', meta, nodeId: 'sofa', name: '双人沙发' },
      { type: 'SetObjectLock', meta, nodeId: 'sofa', locked: true },
      { type: 'SetObjectVisibility', meta, nodeId: 'sofa', visible: false },
      { type: 'SetScenicFinish', meta, nodeId: 'sofa', finish: 'white' },
      { type: 'AddCamera', meta, ...camera, name: '主机位' },
      { type: 'SetCamera', meta, ...camera },
      {
        type: 'AddPerformerMarker',
        meta,
        nodeId: 'performer',
        name: '甲',
        color: '#777777',
        position: transform.position,
        facingDegrees: 0,
      },
      {
        type: 'SetPerformerPosition',
        meta,
        nodeId: 'performer',
        position: transform.position,
        facingDegrees: 0,
      },
    ]
    for (const command of commands) {
      expect(StageCommandSchema.safeParse(command).success).toBe(true)
      expect(StageCommandSchema.safeParse({ ...command, code: 'alert(1)' }).success).toBe(false)
      expect(
        StageCommandSchema.safeParse({ ...command, meta: { ...meta, expectedDocumentVersion: -1 } })
          .success,
      ).toBe(false)
    }
    expect(StageCommandSchema.safeParse({ type: 'AddLight', meta }).success).toBe(false)
  })
  test('relations resolve independently of proposal ordering', () => {
    const input = example()
    input.items.reverse()
    const resolved = resolveStagePlan(input, context)
    expect(
      resolved.items.find((item) => item.kind === 'door-flat')!.transform.position.x,
    ).toBeCloseTo(2.95, 10)
  })
  test('unchanged legacy cameras outside the stage do not block new scenery', () => {
    const scene: SceneContextSummary = {
      ...context,
      objects: [
        {
          id: 'audience-camera',
          name: '观众机位',
          kind: 'camera',
          dimensionsMeters: { width: 0.3, height: 0.3, depth: 0.3 },
          transform: { ...transform, position: { x: 0, y: 1.6, z: -4 } },
        },
      ],
    }
    expect(validateStagePlan(example(), scene).valid).toBe(true)
    const reduced = example()
    reduced.venue!.widthMeters = 7
    expect(validateStagePlan(reduced, scene).valid).toBe(true)
  })
  test('relations can refer to the updated existing object ID', () => {
    const input = example()
    input.items[0]!.existingNodeId = 'old-sofa'
    input.relations[1]!.referenceId = 'old-sofa'
    const old = item()
    const scene: SceneContextSummary = {
      ...context,
      objects: [
        {
          id: 'old-sofa',
          name: 'sofa',
          kind: 'sofa',
          dimensionsMeters: old.dimensionsMeters,
          transform: { ...transform, position: { x: -2, y: 0, z: 2 } },
        },
      ],
    }
    const result = validateStagePlan(input, scene)
    expect(result.valid).toBe(true)
    expect(result.plan.items[1]!.transform.position.x).toBeCloseTo(1.9, 10)
    expect(result.plan.items[1]!.transform.position.z).toBe(3)
  })
})
