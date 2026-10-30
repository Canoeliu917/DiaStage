import {
  prepareStageCollision,
  type SceneContextObject,
  type SceneContextSummary,
  SceneContextSummarySchema,
  type StageItemProposal,
  type StagePlan,
  stageSupportPositions,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { z } from 'zod'
import { AVAILABLE_STAGE_SCENERY, stagePropCollisionGeometry } from '../stage/prop-assets'
import { createUUID } from '../uuid'

const stageActionFields = z.strictObject({
  mode: z.enum(['create', 'relocate', 'translate']),
  assetIds: z.array(z.enum(AVAILABLE_STAGE_SCENERY.map(({ asset }) => asset.id))).max(12),
  objectIds: z.array(z.string().min(1).max(160)).max(20),
  region: z
    .enum([
      'front-left',
      'front-center',
      'front-right',
      'middle-left',
      'center',
      'middle-right',
      'rear-left',
      'rear-center',
      'rear-right',
    ])
    .nullable(),
  wall: z.enum(['back', 'left', 'right']).nullable(),
  direction: z.enum(['audience-left', 'audience-right', 'upstage', 'downstage']).nullable(),
  distanceMeters: z.number().positive().max(1000).nullable(),
})
export const DialogueStageActionSchema = z.discriminatedUnion('mode', [
  stageActionFields.extend({
    mode: z.literal('create'),
    assetIds: stageActionFields.shape.assetIds.min(1),
    objectIds: z.array(z.string()).max(0),
    region: stageActionFields.shape.region.unwrap(),
    direction: z.null(),
    distanceMeters: z.null(),
  }),
  stageActionFields.extend({
    mode: z.literal('relocate'),
    assetIds: z.array(z.string()).max(0),
    objectIds: stageActionFields.shape.objectIds.min(1),
    region: stageActionFields.shape.region.unwrap(),
    direction: z.null(),
    distanceMeters: z.null(),
  }),
  stageActionFields.extend({
    mode: z.literal('translate'),
    assetIds: z.array(z.string()).max(0),
    objectIds: stageActionFields.shape.objectIds.min(1),
    region: z.null(),
    wall: z.null(),
    direction: stageActionFields.shape.direction.unwrap(),
    distanceMeters: stageActionFields.shape.distanceMeters.unwrap(),
  }),
])
export type DialogueStageAction = z.infer<typeof DialogueStageActionSchema>

function groupBounds(items: StageItemProposal[]) {
  const bounds = items.map((item) => prepareStageCollision(item).bounds)
  return [0, 1, 2].map(
    (axis) =>
      [
        Math.min(...bounds.map((b) => b[axis]![0])),
        Math.max(...bounds.map((b) => b[axis]![1])),
      ] as const,
  )
}

function shift(items: StageItemProposal[], x: number, z: number) {
  for (const item of items) {
    item.transform.position.x += x
    item.transform.position.z += z
  }
}

function createItems(assetIds: string[]): StageItemProposal[] {
  const table = assetIds.indexOf('SCN-TABLE-090')
  const tableGroup =
    assetIds.length === 3 &&
    table >= 0 &&
    assetIds.filter((id) => id === 'SCN-CHAIR-045').length === 2
  let cursor = 0
  let chairIndex = 0
  const items = assetIds.map((assetId): StageItemProposal => {
    const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)!
    const [width, height, depth] = source.asset.dimensions!
    const dimensionsMeters = { width, height, depth }
    const isGroupChair = tableGroup && assetId === 'SCN-CHAIR-045'
    const chairSide = isGroupChair && chairIndex++ === 0 ? -1 : 1
    const item: StageItemProposal = {
      proposalId: createUUID(),
      existingNodeId: null,
      kind: source.kind,
      displayName: source.asset.name,
      libraryAssetId: assetId,
      dimensionsMeters,
      collisionGeometry: stagePropCollisionGeometry(assetId, dimensionsMeters),
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotationDegrees: { x: 0, y: isGroupChair ? -chairSide * 90 : 180, z: 0 },
      },
      certainty: 'inferred',
      assumptionIds: ['dialogue-layout'],
      evidenceIds: [],
    }
    const bounds = prepareStageCollision(item).bounds
    const span = bounds[0]![1] - bounds[0]![0]
    const x = tableGroup
      ? isGroupChair
        ? chairSide * (0.45 + span / 2 + 0.2)
        : 0
      : cursor + span / 2
    item.transform.position = {
      x: x - (bounds[0]![0] + bounds[0]![1]) / 2,
      y: -bounds[1]![0],
      z: -(bounds[2]![0] + bounds[2]![1]) / 2,
    }
    cursor += span + 0.2
    return item
  })
  return items
}

function contactWall(
  items: StageItemProposal[],
  wall: NonNullable<DialogueStageAction['wall']>,
  context: SceneContextSummary,
) {
  const bounds = groupBounds(items)
  const axis = wall === 'back' ? 2 : 0
  const cross = axis === 2 ? 0 : 2
  const sign = wall === 'right' ? -1 : 1
  const center = (bounds[axis]![0] + bounds[axis]![1]) / 2
  const moved = new Set(items.map((item) => item.existingNodeId))
  const faces = context.objects.flatMap((object) => {
    if (
      moved.has(object.id) ||
      !['scenic-flat', 'window-flat', 'door-flat', 'curtain', 'screen'].includes(object.kind)
    )
      return []
    const b = prepareStageCollision(object).bounds
    if (b[cross]![1] <= bounds[cross]![0] || b[cross]![0] >= bounds[cross]![1]) return []
    const surface = b[axis]![sign > 0 ? 0 : 1]
    return (surface - center) * sign > 0 ? [surface] : []
  })
  if (!faces.length) throw new Error('指定方向没有可确认的现有墙片，请先选择墙片或取消靠墙要求。')
  const face = sign > 0 ? Math.min(...faces) : Math.max(...faces)
  const edge = bounds[axis]![sign > 0 ? 1 : 0]
  const delta = face - edge - sign * 0.001
  shift(items, axis === 0 ? delta : 0, axis === 2 ? delta : 0)
}

export function assertDialogueWallContact(
  items: StageItemProposal[],
  context: SceneContextSummary,
  wall: NonNullable<DialogueStageAction['wall']>,
) {
  if (!items.length) throw new Error('靠墙要求没有对应的布景候选。')
  const touching = structuredClone(items)
  contactWall(touching, wall, context)
  if (
    touching.some((item, index) =>
      (['x', 'z'] as const).some(
        (axis) =>
          Math.abs(item.transform.position[axis] - items[index]!.transform.position[axis]) > 0.002,
      ),
    )
  )
    throw new Error('候选没有贴近指定的现有墙片，不能省略靠墙要求。')
}

export function assertDialogueRigidGroup(
  items: StageItemProposal[],
  context: SceneContextSummary,
  requiredIds: string[],
) {
  const required = new Set(requiredIds)
  const actual = new Set(items.map((item) => item.existingNodeId))
  if (
    !required.size ||
    required.size !== requiredIds.length ||
    items.length !== required.size ||
    actual.size !== required.size ||
    items.some((item) => !item.existingNodeId || !required.has(item.existingNodeId))
  )
    throw new Error('整组移动必须包含要求中的全部对象，不能遗漏、重复或新增物件。')
  let delta: number[] | undefined
  for (const item of items) {
    const matches = context.objects.filter((object) => object.id === item.existingNodeId)
    const previous = matches[0]
    if (!previous || matches.length !== 1)
      throw new Error('整组对象没有唯一的当前身份，请先明确选择。')
    if (
      item.libraryAssetId !== null ||
      item.kind !== previous.kind ||
      JSON.stringify(item.dimensionsMeters) !== JSON.stringify(previous.dimensionsMeters) ||
      JSON.stringify(item.collisionGeometry) !== JSON.stringify(previous.collisionGeometry) ||
      (item.stepCount ?? null) !== (previous.stepCount ?? null) ||
      (['x', 'y', 'z'] as const).some(
        (axis) =>
          Math.abs(
            item.transform.rotationDegrees[axis] - previous.transform.rotationDegrees[axis],
          ) > 1e-6,
      )
    )
      throw new Error('整组平移必须保留每件道具的身份、尺寸、形状与朝向。')
    const moved = (['x', 'y', 'z'] as const).map(
      (axis) => item.transform.position[axis] - previous.transform.position[axis],
    )
    if (delta && moved.some((value, axis) => Math.abs(value - delta![axis]!) > 1e-6))
      throw new Error('整组移动必须保持相对位置，不能分别改变物件之间的距离或高度。')
    delta = moved
  }
}

/** Semantic actions become the same preview plan in 2D and 3D; this function never mutates a scene. */
export function buildDialogueStagePlan(raw: unknown, snapshot: SceneContextSummary): StagePlan {
  const action = DialogueStageActionSchema.parse(raw)
  const context = SceneContextSummarySchema.parse(snapshot)
  if (!context.venue) throw new Error('请先明确舞台宽度和深度。')
  if (
    action.mode === 'create'
      ? !action.assetIds.length || action.objectIds.length
      : action.assetIds.length || !action.objectIds.length
  )
    throw new Error('新增需要明确标准道具；移动需要明确现有物件，不能混用。')
  if (new Set(action.objectIds).size !== action.objectIds.length)
    throw new Error('同一物件不能重复纳入这次移动。')
  if (action.mode === 'translate') {
    if (
      !action.direction ||
      action.distanceMeters === null ||
      action.region !== null ||
      action.wall !== null
    )
      throw new Error('整组平移需要明确方向和距离；区域或靠墙请作为另一个调整。')
  } else if (
    action.region === null ||
    action.direction !== null ||
    action.distanceMeters !== null
  ) {
    throw new Error('请明确摆放区域，不同时指定另一项平移要求。')
  }
  if (
    action.wall &&
    action.region &&
    ((action.wall === 'back' && action.region.startsWith('front')) ||
      (action.wall === 'left' && action.region.endsWith('right')) ||
      (action.wall === 'right' && action.region.endsWith('left')))
  )
    throw new Error('指定区域与要靠的墙不在同一侧，请确认区域或墙的位置。')
  const items =
    action.mode === 'create'
      ? createItems(action.assetIds)
      : action.objectIds.map((id): StageItemProposal => {
          const matches = context.objects.filter((object) => object.id === id)
          const object = matches[0]
          if (
            matches.length !== 1 ||
            !object ||
            ['camera', 'performer-marker'].includes(object.kind)
          )
            throw new Error('没有唯一且可移动的布景对象，请明确选择。')
          return {
            proposalId: createUUID(),
            existingNodeId: object.id,
            kind: object.kind,
            displayName: object.name,
            libraryAssetId: null,
            dimensionsMeters: object.dimensionsMeters,
            collisionGeometry: object.collisionGeometry,
            stepCount: object.stepCount,
            transform: structuredClone(object.transform),
            certainty: 'stated',
            assumptionIds: [],
            evidenceIds: [],
          }
        })
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'typed-command',
    venue: null,
    items,
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  if (action.mode === 'translate') {
    const distance = action.distanceMeters!
    shift(
      items,
      action.direction === 'audience-left'
        ? distance
        : action.direction === 'audience-right'
          ? -distance
          : 0,
      action.direction === 'upstage' ? distance : action.direction === 'downstage' ? -distance : 0,
    )
  } else {
    const { widthMeters: width, depthMeters: depth } = context.venue
    const region = action.region!
    const x = ((region.endsWith('left') ? 1 : region.endsWith('right') ? -1 : 0) * width) / 3
    const z = depth * (region.startsWith('front') ? 0.25 : region.startsWith('rear') ? 0.75 : 0.5)
    const bounds = groupBounds(items)
    shift(items, x - (bounds[0]![0] + bounds[0]![1]) / 2, z - (bounds[2]![0] + bounds[2]![1]) / 2)
    if (action.wall) contactWall(items, action.wall, context)
    plan.assumptions.push({
      id: 'dialogue-layout',
      message:
        action.mode === 'create'
          ? `按观众视角、标准道具原生尺寸预览；${items.map((item) => item.displayName).join('、')}的区域内位置与间距可再调整。`
          : '按观众视角调整整组位置，保留物件之间的距离、尺寸、高度与朝向。',
    })
  }
  const result = validateStagePlan(plan, context)
  const issue = result.warnings.find((warning) => warning.blocking || warning.code === 'collision')
  if (!result.valid || issue)
    throw new Error(issue?.message ?? '这次摆放没有安全落点，请调整区域或对象。')
  assertDialogueSupports(result.plan.items, context)
  return result.plan
}

/** Validate every dialogue plan, including locally compiled candidates, against real supports. */
export function assertDialogueSupports(items: StageItemProposal[], context: SceneContextSummary) {
  const changedIds = new Set(items.map((item) => item.existingNodeId))
  const movedObjects: SceneContextObject[] = items.map((item) => ({
    id: item.existingNodeId ?? item.proposalId,
    name: item.displayName,
    kind: item.kind,
    dimensionsMeters: item.dimensionsMeters,
    collisionGeometry: item.collisionGeometry,
    transform: item.transform,
  }))
  const finalObjects = [
    ...context.objects.filter((object) => !changedIds.has(object.id)),
    ...movedObjects,
  ]
  for (const item of movedObjects) {
    if (prepareStageCollision(item).bounds[1]![0] <= 1e-6) continue
    if (
      !stageSupportPositions(item, finalObjects).some(
        (support) =>
          support.supportId !== null && Math.abs(support.y - item.transform.position.y) < 1e-6,
      )
    )
      throw new Error(`${item.name} 移动后缺少接触支撑；请把支撑台块一起选入或另行明确摆放高度。`)
  }
}
