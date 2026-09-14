import {
  type SceneContextObject,
  type SceneContextSummary,
  type StagePlan,
  stageObjectsTouch,
  validateStagePlan,
} from '@pascal-app/core/stage'
import {
  DiaStageProposalSchema,
  type DiaStageProposal,
} from '../rehearsal-intelligence/knowledge/stage-proposal'
import {
  stageClearanceFootprints,
  stageModelBelowFloor,
  stageVisibleFootprints,
} from './model-contact'
import { scenicConnectionTransforms } from './scenic-proposal'
import {
  SPATIAL_RUNTIME_CONFIG,
  SpatialSolutionSchema,
  StageSpatialConstraintSchema,
  spatialConstraintsForProposal,
  type SpatialCandidate,
  type SpatialSolution,
  type StageSpatialConstraint,
} from './spatial-constraints'

type Point = [number, number]
const epsilon = 1e-6
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]
const axis = (angle: number): Point => [
  Math.cos((angle * Math.PI) / 180),
  -Math.sin((angle * Math.PI) / 180),
]
const delta = (a: SceneContextObject, b: SceneContextObject): Point => [
  a.transform.position.x - b.transform.position.x,
  a.transform.position.z - b.transform.position.z,
]
const physical = (item: SceneContextObject) => !['camera', 'performer-marker'].includes(item.kind)
const flat = (item: SceneContextObject) =>
  ['scenic-flat', 'door-flat', 'window-flat'].includes(item.kind)

/** SAT tests interiors, so an exact edge contact remains legal. */
export function spatialInteriorsOverlap(a: Point[], b: Point[]): boolean {
  if (a.length < 3 || b.length < 3) return false
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!,
        q = polygon[(i + 1) % polygon.length]!
      const length = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (length < epsilon) continue
      const n: Point = [(q[1] - p[1]) / length, (p[0] - q[0]) / length]
      const left = a.map((point) => dot(point, n)),
        right = b.map((point) => dot(point, n))
      if (
        Math.min(Math.max(...left), Math.max(...right)) -
          Math.max(Math.min(...left), Math.min(...right)) <=
        epsilon
      )
        return false
    }
  return true
}

const extent = (item: SceneContextObject, direction: Point) => {
  const values = stageVisibleFootprints(item)
    .flat()
    .map((point) => dot(point, direction))
  return [Math.min(...values), Math.max(...values)] as const
}
function rectangle(
  u: Point,
  v: Point,
  minU: number,
  maxU: number,
  minV: number,
  maxV: number,
): Point[] {
  return [
    [minU, minV],
    [maxU, minV],
    [maxU, maxV],
    [minU, maxV],
  ].map(([x, z]) => [u[0] * x! + v[0] * z!, u[1] * x! + v[1] * z!] as Point)
}
function clearRegion(polygon: Point[], objects: SceneContextObject[]) {
  return objects
    .filter(physical)
    .every(
      (item) =>
        !stageVisibleFootprints(item).some((part) => spatialInteriorsOverlap(polygon, part)),
    )
}
function inStage(polygon: Point[], context: SceneContextSummary) {
  return (
    !!context.venue &&
    polygon.every(
      ([x, z]) =>
        Math.abs(x) <= context.venue!.widthMeters / 2 + epsilon &&
        z >= -epsilon &&
        z <= context.venue!.depthMeters + epsilon,
    )
  )
}
function legalObjects(moved: SceneContextObject[], context: SceneContextSummary) {
  const ids = new Set(moved.map((item) => item.id))
  const others = context.objects.filter((item) => !ids.has(item.id) && physical(item))
  return moved.every((item, i) => {
    if (stageModelBelowFloor(item) ?? item.transform.position.y < -epsilon) return false
    if (!inStage(stageVisibleFootprints(item).flat(), context)) return false
    for (const other of [...moved.slice(i + 1), ...others]) {
      if (!stageObjectsTouch(item, other)) continue
      if (
        stageVisibleFootprints(item).some((a) =>
          stageVisibleFootprints(other).some((b) => spatialInteriorsOverlap(a, b)),
        )
      )
        return false
    }
    return true
  })
}

export function spatialCandidatePlan(
  items: SceneContextObject[],
  warnings: string[] = [],
): StagePlan {
  return {
    schemaVersion: 1,
    source: 'typed-command',
    venue: null,
    items: items.map((item) => ({
      proposalId: `spatial-${item.id}`,
      existingNodeId: item.id,
      kind: item.kind,
      displayName: item.name,
      libraryAssetId: null,
      dimensionsMeters: structuredClone(item.dimensionsMeters),
      ...(item.collisionGeometry
        ? { collisionGeometry: structuredClone(item.collisionGeometry) }
        : {}),
      ...(item.stepCount === undefined ? {} : { stepCount: item.stepCount }),
      transform: structuredClone(item.transform),
      certainty: 'stated',
      assumptionIds: [],
      evidenceIds: [],
    })),
    relations: [],
    assumptions: warnings.map((message, index) => ({ id: `spatial-default-${index}`, message })),
    questions: [],
    evidence: [],
    warnings: [],
  }
}

/** Bounded enumeration of contact layouts, never a Scene mutation or an aesthetic ranking. */
export function solveSpatialConstraints(input: {
  snapshot: SceneContextSummary
  proposal: DiaStageProposal
  assets: SceneContextObject[]
  constraints: StageSpatialConstraint[]
}): SpatialSolution {
  const proposal = DiaStageProposalSchema.parse(input.proposal)
  const constraints = StageSpatialConstraintSchema.array().parse(input.constraints)
  const expected = spatialConstraintsForProposal(proposal)
  if (!constraints.length || JSON.stringify(constraints) !== JSON.stringify(expected))
    throw new Error('空间约束必须与已验证 Proposal 的语义和来源一致')
  const context = structuredClone(input.snapshot)
  const objects = new Map(context.objects.map((item) => [item.id, item]))
  const supplied = new Map(input.assets.map((item) => [item.id, item]))
  if (
    context.objects.some((item) => JSON.stringify(supplied.get(item.id)) !== JSON.stringify(item))
  )
    throw new Error('资产与 Scene snapshot 不一致')
  const warnings = constraints.flatMap((constraint) =>
    constraint.parameters.widthSource === 'runtime_default'
      ? [
          `${constraint.type === 'preserve_path' ? '通道' : '入口'}最小净宽 ${constraint.parameters.minimumWidthMeters} 米（runtime 默认值）。${constraint.type === 'preserve_path' ? '目标区域：台前边界。' : ''}`,
        ]
      : constraint.parameters.minimumWidthMeters
        ? [`请求最小净宽 ${constraint.parameters.minimumWidthMeters} 米。`]
        : [],
  )
  const candidates: SpatialCandidate[] = []
  const add = (items: SceneContextObject[], regions: SpatialCandidate['clearanceRegions'] = []) => {
    if (!legalObjects(items, context)) return
    const checked = validateStagePlan(spatialCandidatePlan(items, warnings), context)
    if (!checked.valid) return
    const actions: SpatialCandidate['actions'] = []
    let movementCost = 0
    for (const item of items) {
      const old = objects.get(item.id)!
      const distance = Math.hypot(
        ...delta(item, old),
        item.transform.position.y - old.transform.position.y,
      )
      const rotation = Math.abs(
        ((item.transform.rotationDegrees.y - old.transform.rotationDegrees.y + 540) % 360) - 180,
      )
      movementCost += distance + rotation / 180
      if (distance > epsilon) actions.push({ type: 'move', subject: item.id })
      if (rotation > epsilon) actions.push({ type: 'rotate', subject: item.id })
    }
    const resolvedTransforms = items.map((item) => ({
      subject: item.id,
      transform: structuredClone(item.transform),
    }))
    if (
      candidates.some(
        (candidate) =>
          JSON.stringify(candidate.resolvedTransforms) === JSON.stringify(resolvedTransforms),
      )
    )
      return
    candidates.push({
      candidateId: '',
      actions,
      resolvedTransforms,
      folds: [],
      constraintsSatisfied: constraints.map((_, index) => index),
      constraintsUnsatisfied: [],
      warnings: [...warnings],
      feasibility: 'feasible',
      movementCost,
      clearanceRegions: regions,
      plan: checked.plan,
    })
  }
  const selected = constraints[0]!.subjects.map((id) => objects.get(id))
  if (selected.some((item) => !item))
    return {
      constraints,
      candidates: [],
      selectedCandidateId: null,
      warnings: ['约束对象已不存在。'],
    }
  const items = selected as SceneContextObject[]
  if (
    items.some(
      (item) =>
        Math.abs(item.transform.rotationDegrees.x) > epsilon ||
        Math.abs(item.transform.rotationDegrees.z) > epsilon,
    )
  )
    return {
      constraints,
      candidates: [],
      selectedCandidateId: null,
      warnings: ['V0.1 仅支持直立舞台平面对象。'],
    }
  const enclosure = constraints.find((constraint) => constraint.type === 'form_enclosure')
  const opening = constraints.find((constraint) => constraint.type === 'leave_opening')
  const path = constraints.find((constraint) => constraint.type === 'preserve_path')
  if (enclosure && items.every(flat)) {
    // ponytail: three flats only; enumerate each unchanged anchor and both open sides, no general packing search.
    for (const base of items) {
      const [left, right] = items.filter((item) => item.id !== base.id)
      const u = axis(base.transform.rotationDegrees.y),
        v: Point = [-u[1], u[0]]
      const representatives = (item: SceneContextObject) => {
        const seen = new Set<string>()
        return scenicConnectionTransforms(item, base, 90).filter((transform) => {
          const vector = delta({ ...item, transform }, base)
          const key = `${Math.sign(dot(vector, u))}:${Math.sign(dot(vector, v))}:${transform.rotationDegrees.y}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }
      const leftOptions = representatives(left!)
      const rightOptions = representatives(right!)
      for (const sign of [-1, 1]) {
        const forwards: Point = [v[0] * sign, v[1] * sign]
        for (const lt of leftOptions)
          for (const rt of rightOptions) {
            const a = { ...left!, transform: lt },
              b = { ...right!, transform: rt }
            if (
              dot(delta(a, base), u) * dot(delta(b, base), u) >= -epsilon ||
              dot(delta(a, base), forwards) <= epsilon ||
              dot(delta(b, base), forwards) <= epsilon
            )
              continue
            if (!stageObjectsTouch(a, base) || !stageObjectsTouch(b, base)) continue
            const [sideA, sideB] = dot(delta(a, b), u) < 0 ? [a, b] : [b, a]
            const minU = extent(sideA, u)[1],
              maxU = extent(sideB, u)[0]
            const inner = extent(base, forwards)[1]
            const tip = Math.min(extent(a, forwards)[1], extent(b, forwards)[1])
            const width = maxU - minU
            if (width <= epsilon || tip - inner <= epsilon) continue
            const moved = [base, a, b]
            const requiredWidth = opening?.parameters.minimumWidthMeters ?? epsilon
            if (width + epsilon < requiredWidth) continue
            const entrance = rectangle(
              u,
              forwards,
              (minU + maxU - requiredWidth) / 2,
              (minU + maxU + requiredWidth) / 2,
              Math.max(inner, tip - 0.2),
              tip + 0.2,
            )
            const rest = context.objects.filter(
              (item) => !items.some((selected) => selected.id === item.id),
            )
            if (
              opening &&
              (!inStage(entrance, context) || !clearRegion(entrance, [...moved, ...rest]))
            )
              continue
            add(moved, opening ? [{ type: 'opening', widthMeters: width, polygon: entrance }] : [])
          }
      }
    }
  } else if (path) {
    const door = objects.get(path.target!)!
    const width = path.parameters.minimumWidthMeters!
    const rotation = ((door.transform.rotationDegrees.y % 180) + 180) % 180
    if (door.kind !== 'door-flat' || Math.min(rotation, 180 - rotation) > epsilon)
      warnings.push('V0.1 通道要求门景片平行台口；目标是台前边界。')
    else {
      const x = door.transform.position.x
      const z = extent(door, [0, 1])[0]
      const corridor = rectangle([1, 0], [0, 1], x - width / 2, x + width / 2, 0, z + 0.05)
      // Door jambs are included: a nominal asset width is never accepted as its clear opening.
      const doorCrossing = rectangle(
        [1, 0],
        [0, 1],
        x - width / 2,
        x + width / 2,
        extent(door, [0, 1])[0],
        extent(door, [0, 1])[1],
      )
      const doorParts = stageClearanceFootprints(
        door,
        SPATIAL_RUNTIME_CONFIG.pathClearanceHeightMeters,
      )
      const doorClear = !doorParts.some((part) => spatialInteriorsOverlap(doorCrossing, part))
      if (
        !doorClear ||
        width > door.dimensionsMeters.width + epsilon ||
        !inStage(corridor, context) ||
        z <= epsilon
      ) {
        warnings.push('门洞或台内通道宽度不足。')
      } else {
        const rest = context.objects.filter((item) => item.id !== door.id && physical(item))
        const blocked = rest.filter((item) => !clearRegion(corridor, [item]))
        const region = { type: 'path' as const, widthMeters: width, polygon: corridor }
        if (!blocked.length) add([door], [region])
        else
          for (const side of [-1, 1]) {
            const moved = blocked.map((item) => {
              const [minX, maxX] = extent(item, [1, 0])
              const dx = side < 0 ? x - width / 2 - maxX : x + width / 2 - minX
              return {
                ...item,
                transform: {
                  ...item.transform,
                  position: { ...item.transform.position, x: item.transform.position.x + dx },
                },
              }
            })
            if (
              clearRegion(corridor, [...rest.filter((item) => !blocked.includes(item)), ...moved])
            )
              add([door, ...moved], [region])
          }
      }
    }
  } else if (items.length === 2 && items.every(flat)) {
    const [target, moving] = items
    const corner = constraints.some((constraint) => constraint.type === 'corner_angle')
    const transforms = scenicConnectionTransforms(moving!, target!, corner ? 90 : 0)
    const selectedSides = new Set<number>()
    for (const transform of transforms) {
      const changed = { ...moving!, transform }
      const u = axis(target!.transform.rotationDegrees.y),
        normal: Point = [-u[1], u[0]]
      const side = Math.sign(dot(delta(changed, target!), corner ? normal : u))
      if (!side || selectedSides.has(side) || !stageObjectsTouch(changed, target!)) continue
      if (!corner && Math.abs(dot(delta(changed, target!), normal)) > epsilon) continue
      const count = candidates.length
      add([target!, changed])
      if (candidates.length > count) selectedSides.add(side)
    }
  }
  candidates.sort((a, b) => a.movementCost - b.movementCost || a.actions.length - b.actions.length)
  const bounded = candidates
    .slice(0, SPATIAL_RUNTIME_CONFIG.maxCandidates)
    .map((candidate, index) => ({
      ...candidate,
      candidateId: `${proposal.proposalId}:candidate-${index + 1}`,
    }))
  if (!bounded.length)
    warnings.push('没有满足 required 约束、碰撞、舞台边界及净宽要求的候选；不可采用。')
  return SpatialSolutionSchema.parse({
    constraints,
    candidates: bounded,
    selectedCandidateId: bounded[0]?.candidateId ?? null,
    warnings,
  })
}
