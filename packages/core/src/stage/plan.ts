import { getObjectCorners, objectSeparation, rotatePoint } from '../remount/geometry'
import type { RemountObject } from '../remount/schema'
import {
  type CommandMeta,
  CommandMetaSchema,
  type PlanWarning,
  type SceneContextObject,
  type SceneContextSummary,
  SceneContextSummarySchema,
  type StageCommand,
  StageCommandSchema,
  type StageItemProposal,
  type StagePlan,
  StagePlanSchema,
  type VenueProposal,
} from './schema'

type SpatialItem = Pick<
  SceneContextObject,
  'id' | 'name' | 'kind' | 'dimensionsMeters' | 'transform'
>
const radians = Math.PI / 180
const tolerance = 1e-6
function boundedWarnings(warnings: PlanWarning[]): PlanWarning[] {
  return warnings.length <= 400
    ? warnings
    : [
        ...warnings.slice(0, 399),
        {
          code: 'invalid-plan',
          message: '冲突较多，请分批检查或减少布景后重新预览。',
          itemIds: [],
          blocking: true,
        },
      ]
}

function asObject(item: SpatialItem): RemountObject {
  const { position: p, rotationDegrees: r } = item.transform
  const d = item.dimensionsMeters
  return {
    nodeId: item.id,
    name: item.name,
    representation: item.kind === 'performer-marker' ? 'virtual' : 'physical',
    dimensions: [d.width, d.height, d.depth],
    boundsCenter: [0, d.height / 2, 0],
    position: [p.x, p.y, p.z],
    rotation: [r.x * radians, r.y * radians, r.z * radians],
  }
}

function spatialItem(item: StageItemProposal): SpatialItem {
  return { ...item, id: item.proposalId, name: item.displayName }
}

export function stageObjectBounds(item: SpatialItem) {
  const corners = getObjectCorners(asObject(item))
  return {
    minX: Math.min(...corners.map((p) => p[0])),
    maxX: Math.max(...corners.map((p) => p[0])),
    minZ: Math.min(...corners.map((p) => p[2])),
    maxZ: Math.max(...corners.map((p) => p[2])),
  }
}

function warning(
  code: PlanWarning['code'],
  message: string,
  itemIds: string[],
  blocking = true,
): PlanWarning {
  return { code, message, itemIds, blocking }
}

function contextForVenue(
  context: SceneContextSummary,
  venue: VenueProposal | null,
): SceneContextSummary {
  const delta = venue && context.venue ? (venue.depthMeters - context.venue.depthMeters) / 2 : 0
  if (!delta) return context
  // The Pascal graph stays centred in world space when the proscenium moves.
  return {
    ...context,
    objects: context.objects.map((item) => ({
      ...item,
      transform: {
        ...item.transform,
        position: { ...item.transform.position, z: item.transform.position.z + delta },
      },
    })),
  }
}

export function resolveStagePlan(input: unknown, sceneContext: SceneContextSummary): StagePlan {
  const plan = StagePlanSchema.parse(input)
  const context = contextForVenue(SceneContextSummarySchema.parse(sceneContext), plan.venue)
  const venue = plan.venue ?? context.venue
  const items = new Map(plan.items.map((item) => [item.proposalId, item]))
  const updates = new Map(
    plan.items.flatMap((item) =>
      item.existingNodeId ? [[item.existingNodeId, item] as const] : [],
    ),
  )
  const oldItems = new Map(context.objects.map((item) => [item.id, item]))
  const settled = new Set<string>()
  const visiting = new Set<string>()
  const finish = (id: string): void => {
    if (settled.has(id)) return
    if (visiting.has(id)) {
      plan.warnings.push(
        warning('invalid-relation', '布景的位置关系形成循环，请指定一个起始台位。', [id]),
      )
      return
    }
    const item = items.get(id)
    if (!item) return
    visiting.add(id)
    const axes = new Set<string>()
    const relations = plan.relations.filter((relation) => relation.subjectId === id)
    const hasXConstraint = relations.some(
      (relation) => relation.direction === 'stage-left' || relation.direction === 'stage-right',
    )
    const hasZConstraint = relations.some(
      (relation) => relation.direction === 'upstage' || relation.direction === 'downstage',
    )
    for (const relation of relations) {
      const axis =
        relation.direction === 'stage-left' || relation.direction === 'stage-right'
          ? 'x'
          : relation.direction === 'center'
            ? 'center'
            : 'z'
      if (axes.has(axis) || axes.has('center') || (axis === 'center' && axes.size > 0)) {
        plan.warnings.push(
          warning(
            'invalid-relation',
            `${item.displayName} 在同一方向有多个位置要求，请确认一个。`,
            [id],
          ),
        )
        continue
      }
      axes.add(axis)
      if (relation.direction === 'center') {
        if (!venue || relation.referenceId !== null) {
          plan.warnings.push(
            warning('invalid-relation', '舞台中区需要明确的舞台尺寸，且不以布景为参照。', [id]),
          )
        } else {
          item.transform.position.x = 0
          item.transform.position.z = venue.depthMeters / 2
        }
        continue
      }
      if (relation.referenceId === null && venue) {
        const bounds = stageObjectBounds(spatialItem(item))
        const p = item.transform.position
        if (relation.direction === 'stage-right')
          p.x += venue.widthMeters / 2 - relation.gapMeters - bounds.maxX
        else if (relation.direction === 'stage-left')
          p.x += -venue.widthMeters / 2 + relation.gapMeters - bounds.minX
        else if (relation.direction === 'upstage')
          p.z += venue.depthMeters - relation.gapMeters - bounds.maxZ
        else p.z += relation.gapMeters - bounds.minZ
        continue
      }
      if (!relation.referenceId || relation.referenceId === id) {
        plan.warnings.push(
          warning('missing-reference', `${item.displayName} 缺少有效参照布景。`, [id]),
        )
        continue
      }
      const reference = items.get(relation.referenceId) ?? updates.get(relation.referenceId)
      if (reference) finish(reference.proposalId)
      const anchor = reference ? spatialItem(reference) : oldItems.get(relation.referenceId)
      if (!anchor) {
        plan.warnings.push(
          warning('missing-reference', `${item.displayName} 的参照布景已不存在。`, [
            id,
            relation.referenceId,
          ]),
        )
        continue
      }
      const target = stageObjectBounds(anchor)
      const bounds = stageObjectBounds(spatialItem(item))
      const p = item.transform.position
      const old = { ...p }
      const anchorP = anchor.transform.position
      if (axis === 'x') {
        p.x +=
          relation.direction === 'stage-right'
            ? target.maxX + relation.gapMeters - bounds.minX
            : target.minX - relation.gapMeters - bounds.maxX
        if (!hasZConstraint) p.z = anchorP.z
      } else {
        p.z +=
          relation.direction === 'upstage'
            ? target.maxZ + relation.gapMeters - bounds.minZ
            : target.minZ - relation.gapMeters - bounds.maxZ
        if (!hasXConstraint) p.x = anchorP.x
      }
      if (![p.x, p.z].every(Number.isFinite)) {
        item.transform.position = old
        plan.warnings.push(warning('invalid-relation', '位置计算超出有效数值范围。', [id]))
      }
    }
    visiting.delete(id)
    settled.add(id)
  }
  for (const id of items.keys()) finish(id)
  for (const relation of plan.relations) {
    if (!items.has(relation.subjectId))
      plan.warnings.push(
        warning('missing-reference', '位置关系引用了未纳入方案的布景。', [relation.subjectId]),
      )
  }
  return { ...plan, warnings: boundedWarnings(plan.warnings) }
}

export function validateStagePlan(
  input: unknown,
  sceneContext: SceneContextSummary,
): {
  plan: StagePlan
  warnings: PlanWarning[]
  valid: boolean
} {
  const sourceContext = SceneContextSummarySchema.parse(sceneContext)
  const plan = resolveStagePlan(input, sourceContext)
  const context = contextForVenue(sourceContext, plan.venue)
  const warnings = [...plan.warnings]
  const venue = plan.venue ?? context.venue
  if (!venue) warnings.push(warning('missing-venue', '请先明确舞台宽度与深度。', []))
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length)
      warnings.push(warning('invalid-plan', `${label}不能重复。`, []))
  }
  unique(
    plan.items.map((item) => item.proposalId),
    '方案对象编号',
  )
  unique(
    plan.items.flatMap((item) => (item.existingNodeId ? [item.existingNodeId] : [])),
    '被修改对象',
  )
  unique(
    plan.assumptions.map((item) => item.id),
    '默认值编号',
  )
  unique(
    plan.evidence.map((item) => item.id),
    '证据编号',
  )
  unique(
    plan.questions.map((item) => item.id),
    '问题编号',
  )
  unique(
    plan.relations.map((item) => item.id),
    '位置关系编号',
  )
  unique(
    context.objects.map((item) => item.id),
    '当前舞台对象编号',
  )
  const oldItems = new Map(context.objects.map((item) => [item.id, item]))
  const assumptions = new Set(plan.assumptions.map((item) => item.id))
  const evidence = new Set(plan.evidence.map((item) => item.id))
  for (const item of plan.items) {
    if (item.kind === 'camera' && Math.abs(item.transform.rotationDegrees.z) > tolerance)
      warnings.push(
        warning('invalid-plan', '当前机位只保存观察方向，暂不支持镜头横滚。请将 Z 轴角度设为 0。', [
          item.proposalId,
        ]),
      )
    if (item.existingNodeId) {
      const old = oldItems.get(item.existingNodeId)
      if (!old || old.kind !== item.kind)
        warnings.push(
          warning('missing-reference', `${item.displayName} 的原对象不存在或类型已改变。`, [
            item.proposalId,
          ]),
        )
    }
    if (
      item.assumptionIds.some((id) => !assumptions.has(id)) ||
      item.evidenceIds.some((id) => !evidence.has(id))
    ) {
      warnings.push(
        warning('missing-reference', `${item.displayName} 引用了不存在的默认值或证据。`, [
          item.proposalId,
        ]),
      )
    }
  }
  const changed = new Set(
    plan.items.flatMap((item) => (item.existingNodeId ? [item.existingNodeId] : [])),
  )
  const proposed = plan.items.map(spatialItem)
  const others = context.objects.filter((item) => !changed.has(item.id))
  const outside = (item: SpatialItem) =>
    venue &&
    getObjectCorners(asObject(item)).some(
      ([x, y, z]) =>
        Math.abs(x) > venue.widthMeters / 2 + tolerance ||
        y < -tolerance ||
        z < -tolerance ||
        z > venue.depthMeters + tolerance ||
        (venue.heightMeters !== null && y > venue.heightMeters + tolerance),
    )
  const resized =
    plan.venue &&
    (!context.venue ||
      plan.venue.widthMeters !== context.venue.widthMeters ||
      plan.venue.depthMeters !== context.venue.depthMeters ||
      plan.venue.heightMeters !== context.venue.heightMeters)
  const boundsItems = resized
    ? [
        ...proposed,
        ...others.filter((item) => item.kind !== 'camera' && item.kind !== 'performer-marker'),
      ]
    : proposed
  for (const item of boundsItems) {
    if (outside(item))
      warnings.push(
        warning('out-of-bounds', `${item.name} 超出台面可用范围，请调整位置或舞台尺寸。`, [
          item.id,
        ]),
      )
  }
  const checkPair = (a: SpatialItem, b: SpatialItem) => {
    if (warnings.length > 400) return
    if (a.kind === 'performer-marker' || b.kind === 'performer-marker') return
    const separation = objectSeparation(asObject(a), asObject(b))
    if (separation.intersects) {
      warnings.push(
        warning('collision', `${a.name} 与 ${b.name} 的声明体积发生穿插，请调整台位。`, [
          a.id,
          b.id,
        ]),
      )
    }
    const door = a.kind === 'door-flat' ? a : b.kind === 'door-flat' ? b : null
    const obstacle = door === a ? b : a
    if (door && !['door-flat', 'window-flat', 'scenic-flat', 'curtain'].includes(obstacle.kind)) {
      const passage = asObject(door)
      passage.dimensions[2] += 2 * (context.doorClearanceMeters ?? 0.6)
      if (objectSeparation(passage, asObject(obstacle)).intersects) {
        warnings.push(
          warning(
            'clearance',
            `${door.name} 前后通行空间被 ${obstacle.name} 占用，请保留出入口。`,
            [door.id, obstacle.id],
          ),
        )
      }
    }
  }
  // ponytail: pair checks are quadratic; spatial indexing is only needed beyond the 200-item plan limit.
  proposed.forEach((item, index) => {
    for (const other of proposed.slice(index + 1)) checkPair(item, other)
    for (const other of others) checkPair(item, other)
  })
  const distinctWarnings = warnings.filter(
    (item, i) =>
      warnings.findIndex(
        (other) =>
          other.code === item.code &&
          other.message === item.message &&
          other.itemIds.join('|') === item.itemIds.join('|'),
      ) === i,
  )
  return {
    plan: { ...plan, warnings: boundedWarnings(distinctWarnings) },
    warnings: boundedWarnings(distinctWarnings),
    valid: plan.questions.length === 0 && !distinctWarnings.some((item) => item.blocking),
  }
}

export function compileStagePlan(
  input: unknown,
  context: SceneContextSummary,
  transaction: Pick<CommandMeta, 'transactionId' | 'issuedAt'>,
): { ok: boolean; plan: StagePlan; warnings: PlanWarning[]; commands: StageCommand[] } {
  const result = validateStagePlan(input, context)
  if (!result.valid) return { ok: false, ...result, commands: [] }
  const commands: StageCommand[] = []
  const meta = (): CommandMeta =>
    CommandMetaSchema.parse({
      ...transaction,
      commandId: `${transaction.transactionId}:${commands.length + 1}`,
      source: result.plan.source,
      expectedDocumentVersion: context.documentVersion,
    })
  const add = (command: StageCommand) => commands.push(StageCommandSchema.parse(command))
  if (result.plan.venue) add({ type: 'CreateStage', meta: meta(), venue: result.plan.venue })
  result.plan.items.forEach((item, index) => {
    const nodeId = item.existingNodeId ?? `${transaction.transactionId}:item-${index + 1}`
    const shared = { nodeId, transform: item.transform }
    if (item.kind === 'camera') {
      const r = item.transform.rotationDegrees
      const previous = context.objects.find((object) => object.id === item.existingNodeId)
      if (previous) {
        const rotated = (['x', 'y', 'z'] as const).some(
          (axis) => Math.abs(previous.transform.rotationDegrees[axis] - r[axis]) >= tolerance,
        )
        const previousPosition = {
          ...previous.transform.position,
          z:
            previous.transform.position.z +
            (result.plan.venue && context.venue
              ? (result.plan.venue.depthMeters - context.venue.depthMeters) / 2
              : 0),
        }
        const moved = (['x', 'y', 'z'] as const).some(
          (axis) => Math.abs(previousPosition[axis] - item.transform.position[axis]) >= tolerance,
        )
        // Preserve lens settings and focus distance when editing an existing camera pose.
        if (moved || !rotated)
          add({ type: 'MoveObject', meta: meta(), nodeId, position: item.transform.position })
        if (rotated) add({ type: 'RotateObject', meta: meta(), nodeId, rotationDegrees: r })
        return
      }
      const direction = rotatePoint([0, 0, -1], [r.x * radians, r.y * radians, r.z * radians])
      const p = item.transform.position
      const camera = {
        ...shared,
        target: { x: p.x + direction[0], y: p.y + direction[1], z: p.z + direction[2] },
        fieldOfViewDegrees: 50,
      }
      add(
        item.existingNodeId
          ? { type: 'SetCamera', meta: meta(), ...camera }
          : { type: 'AddCamera', meta: meta(), ...camera, name: item.displayName },
      )
    } else if (item.kind === 'performer-marker') {
      const performer = {
        nodeId,
        position: item.transform.position,
        facingDegrees: item.transform.rotationDegrees.y,
      }
      add(
        item.existingNodeId
          ? { type: 'SetPerformerPosition', meta: meta(), ...performer }
          : {
              type: 'AddPerformerMarker',
              meta: meta(),
              ...performer,
              name: item.displayName,
              color: '#777777',
            },
      )
    } else if (item.existingNodeId) {
      if (item.libraryAssetId)
        add({ type: 'ReplaceScenery', meta: meta(), nodeId, libraryAssetId: item.libraryAssetId })
      add({ type: 'MoveObject', meta: meta(), nodeId, position: item.transform.position })
      add({
        type: 'RotateObject',
        meta: meta(),
        nodeId,
        rotationDegrees: item.transform.rotationDegrees,
      })
      add({
        type: 'ResizeObject',
        meta: meta(),
        nodeId,
        dimensionsMeters: item.dimensionsMeters,
        stepCount: item.stepCount ?? undefined,
      })
    } else {
      add({
        type: 'AddScenery',
        meta: meta(),
        ...shared,
        name: item.displayName,
        kind: item.kind,
        libraryAssetId: item.libraryAssetId,
        dimensionsMeters: item.dimensionsMeters,
        stepCount: item.stepCount ?? undefined,
      })
    }
  })
  return { ok: true, plan: result.plan, warnings: result.warnings, commands }
}
