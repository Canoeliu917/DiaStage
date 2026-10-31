import { rotatePoint } from '@pascal-app/core/remount'
import {
  type CommandMeta,
  prepareStageCollision,
  type SceneContextSummary,
  type StageCommand,
  type StageItemProposal,
  type StagePoint,
  stageFoldGeometry,
  stageObjectsTouch,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { formatRehearsalLength, rehearsalKept } from './rehearsal-measure'

const PANEL = 0.9
const THICK = 0.04
const TRIPLE = PANEL * 3
const DOUBLE = PANEL * 2
const OPENING = 1.3
const STRAIGHT = { fold_angle_1_deg: 180, fold_angle_2_deg: 180 } as const
const INSET = 1e-4
const EDGE_REACH = 0.5

export type StageEdge = 'back' | 'left' | 'right'
export type FoldPlacement = {
  angles: [number, number]
  centerOffset: { x: number; z: number }
}

type PieceSpec = { assetId: 'SCN-FOLD-02' | 'SCN-FOLD-03'; run: number; name: string }
type CollisionItem = Parameters<typeof prepareStageCollision>[0]

export function straightFoldShape(assetId: string) {
  return stageFoldGeometry(assetId, STRAIGHT, [1, 1, 1])
}

export function pivotFromCenter(
  center: StagePoint,
  yawDegrees: number,
  offset: { x: number; z: number },
): StagePoint {
  const [dx, , dz] = rotatePoint([offset.x, 0, offset.z], [0, (yawDegrees * Math.PI) / 180, 0])
  return { x: center.x - dx, y: center.y, z: center.z - dz }
}

export function centerFromPivot(
  pivot: StagePoint,
  yawDegrees: number,
  offset: { x: number; z: number },
): StagePoint {
  const [dx, , dz] = rotatePoint([offset.x, 0, offset.z], [0, (yawDegrees * Math.PI) / 180, 0])
  return { x: pivot.x + dx, y: pivot.y, z: pivot.z + dz }
}

function fill(budget: number): { pieces: PieceSpec[]; used: number } {
  const pieces: PieceSpec[] = []
  let used = 0
  while (used + TRIPLE <= budget + 1e-6) {
    pieces.push({ assetId: 'SCN-FOLD-03', run: TRIPLE, name: '三帘' })
    used += TRIPLE
  }
  if (used + DOUBLE <= budget + 1e-6) {
    pieces.push({ assetId: 'SCN-FOLD-02', run: DOUBLE, name: '二帘' })
    used += DOUBLE
  }
  return { pieces, used }
}

const countWord = (count: number) => ['', '一', '两', '三', '四'][count] ?? String(count)

function pieceSentence(pieces: PieceSpec[]): string {
  const groups = [
    ['三帘', pieces.filter((piece) => piece.assetId === 'SCN-FOLD-03').length],
    ['二帘', pieces.filter((piece) => piece.assetId === 'SCN-FOLD-02').length],
  ] as const
  return groups
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${countWord(count)}片${name}`)
    .join('、')
}

type Slot = { kind: 'flat'; spec: PieceSpec } | { kind: 'gap'; run: number }

function slotsFor(pieces: PieceSpec[], hole: number): Slot[] {
  const flats: Slot[] = pieces.map((spec) => ({ kind: 'flat', spec }))
  if (!hole) return flats
  if (flats.length >= 2) return [flats[0]!, { kind: 'gap', run: hole }, ...flats.slice(1)]
  return [...flats, { kind: 'gap', run: hole }]
}

export type PlannedFlat = {
  name: string
  assetId: 'SCN-FOLD-02' | 'SCN-FOLD-03'
  position: StagePoint
  yaw: number
  foldAngles: [number, number]
  dimensionsMeters: { width: number; height: number; depth: number }
  collisionGeometry: NonNullable<ReturnType<typeof stageFoldGeometry>>['collisionGeometry']
}

function placeSlots(
  edge: StageEdge,
  venue: { widthMeters: number; depthMeters: number },
  slots: Slot[],
): PlannedFlat[] {
  const marks = ['甲', '乙', '丙', '丁']
  const half = venue.widthMeters / 2
  const placed: PlannedFlat[] = []
  let cursor = edge === 'back' ? -half : venue.depthMeters - THICK - INSET
  const fixed =
    edge === 'back'
      ? venue.depthMeters - THICK / 2 - INSET
      : edge === 'left'
        ? half - THICK / 2
        : -half + THICK / 2
  let flatIndex = 0
  for (const slot of slots) {
    const run = slot.kind === 'flat' ? slot.spec.run : slot.run
    if (slot.kind === 'flat') {
      const shape = straightFoldShape(slot.spec.assetId)!
      const edgeLabel = edge === 'back' ? '后墙' : edge === 'left' ? '左侧' : '右侧'
      placed.push({
        name: `${edgeLabel}${slot.spec.name}${marks[flatIndex] ?? ''}`,
        assetId: slot.spec.assetId,
        position: edge === 'back' ? { x: cursor, y: 0, z: fixed } : { x: fixed, y: 0, z: cursor },
        yaw: edge === 'back' ? 0 : 90,
        foldAngles: [180, 180],
        dimensionsMeters: {
          width: shape.dimensions[0],
          height: shape.dimensions[1],
          depth: shape.dimensions[2],
        },
        collisionGeometry: shape.collisionGeometry,
      })
      flatIndex += 1
    }
    cursor += edge === 'back' ? run : -run
  }
  return placed
}

export function planRoomEdge(
  edge: StageEdge,
  venue: { widthMeters: number; depthMeters: number },
): { pieces: PlannedFlat[]; notice: string } {
  const length = edge === 'back' ? venue.widthMeters : venue.depthMeters - THICK
  const opening = edge === 'right' ? 0 : OPENING
  const withHole = fill(length - opening)
  const packed = withHole.pieces.length ? withHole : fill(length)
  const hole = withHole.pieces.length ? opening : 0
  if (!packed.pieces.length)
    return {
      pieces: [],
      notice: '这面墙太短，一片直帘都放不下。把舞台加大，或换一条边。',
    }
  const pieces = placeSlots(edge, venue, slotsFor(packed.pieces, hole))
  const leftover = Math.max(0, length - packed.used - hole)
  const listed = pieceSentence(packed.pieces)
  const seam =
    leftover >= 0.05
      ? `还空 ${formatRehearsalLength(leftover)}。每片宽 90 厘米，对不齐整面墙，所以留缝，没有拉变形。`
      : '已经靠到边。'
  const holeText = hole
    ? `中间留了 ${formatRehearsalLength(hole)} 给${edge === 'back' ? '窗' : '门'}。`
    : ''
  const notice =
    edge === 'back'
      ? `后墙宽 ${formatRehearsalLength(venue.widthMeters)}。从观众右侧排了${listed}，都是直墙。${holeText}观众左侧${seam}`
      : edge === 'left'
        ? `观众左侧贴着台边。靠后墙排了${listed}，直墙。${holeText}台口${seam}开口朝观众。`
        : `观众右侧贴着台边。从后墙排了${listed}，直墙。台口${seam}开口朝观众。`
  return { pieces, notice }
}

function proposal(piece: PlannedFlat, id: string): StageItemProposal {
  return {
    proposalId: id,
    existingNodeId: null,
    kind: 'scenic-flat',
    displayName: piece.name,
    libraryAssetId: piece.assetId,
    dimensionsMeters: piece.dimensionsMeters,
    collisionGeometry: piece.collisionGeometry,
    transform: {
      position: piece.position,
      rotationDegrees: { x: 0, y: piece.yaw, z: 0 },
    },
    certainty: 'stated',
    assumptionIds: [],
    evidenceIds: [],
  }
}

export function edgeRunRefusal(
  pieces: readonly PlannedFlat[],
  context: SceneContextSummary,
): string | null {
  if (!pieces.length) return '这面墙排不下直帘。'
  const result = validateStagePlan(
    {
      schemaVersion: 1,
      source: 'manual',
      venue: null,
      items: pieces.map((piece, index) => proposal(piece, `edge-${index + 1}`)),
      relations: [],
      assumptions: [],
      questions: [],
      evidence: [],
      warnings: [],
    },
    context,
  )
  if (!result.valid)
    return rehearsalKept(
      result.warnings
        .filter((warning) => warning.blocking)
        .map((w) => w.message)
        .join(' '),
    )
  const hits = result.warnings.filter(
    (warning) => warning.code === 'collision' && warning.message.includes('穿插'),
  )
  if (hits.length) return '这条边上已经有景片，没有再叠一层。先挪开，或换一条边。'
  return null
}

export function edgeRunCommands(pieces: readonly PlannedFlat[], meta: CommandMeta): StageCommand[] {
  return pieces.map((piece, index) => ({
    type: 'AddScenery' as const,
    meta: { ...meta, commandId: `${meta.transactionId}:${index + 1}` },
    nodeId: `${meta.transactionId}:edge-${index + 1}`,
    name: piece.name,
    kind: 'scenic-flat' as const,
    libraryAssetId: piece.assetId,
    dimensionsMeters: piece.dimensionsMeters,
    foldAngles: piece.foldAngles,
    transform: {
      position: piece.position,
      rotationDegrees: { x: 0, y: piece.yaw, z: 0 },
    },
  }))
}

export function snapFootprintToStageEdges(
  item: CollisionItem,
  venue: { widthMeters: number; depthMeters: number },
  threshold = EDGE_REACH,
): { position: StagePoint; labels: string[] } {
  const position = { ...item.transform.position }
  const labels: string[] = []
  const bounds = prepareStageCollision({
    ...item,
    transform: { ...item.transform, position },
  }).bounds
  const minX = bounds[0]![0]
  const maxX = bounds[0]![1]
  const minZ = bounds[2]![0]
  const maxZ = bounds[2]![1]
  const half = venue.widthMeters / 2
  const left = minX + half
  const right = half - maxX
  if (Math.abs(left) <= threshold && Math.abs(left) <= Math.abs(right)) {
    position.x += -half + INSET - minX
    labels.push('贴台左')
  } else if (Math.abs(right) <= threshold) {
    position.x += half - INSET - maxX
    labels.push('贴台右')
  }
  const front = minZ
  const back = venue.depthMeters - maxZ
  if (Math.abs(back) <= threshold && Math.abs(back) <= Math.abs(front)) {
    position.z += venue.depthMeters - INSET - maxZ
    labels.push('贴后墙')
  } else if (Math.abs(front) <= threshold) {
    position.z += INSET - minZ
    labels.push('贴台口')
  }
  return { position, labels }
}

function footprintSpan(item: CollisionItem, axis: 'x' | 'z'): [number, number] {
  const bounds = prepareStageCollision(item).bounds
  const pair = axis === 'x' ? bounds[0]! : bounds[2]!
  return [pair[0], pair[1]]
}

function overlaps(a: [number, number], b: [number, number]) {
  return a[1] > b[0] + 1e-4 && b[1] > a[0] + 1e-4
}

export function settleOpening(
  item: CollisionItem,
  others: readonly CollisionItem[],
  venue: { widthMeters: number; depthMeters: number },
): { position: StagePoint; labels: string[]; yaw: number } {
  const aimed = snapFootprintToStageEdges(item, venue)
  const side = aimed.labels.some((label) => label === '贴台左' || label === '贴台右')
  const yaw = side ? 90 : aimed.labels.length ? 0 : item.transform.rotationDegrees.y
  const oriented: CollisionItem = {
    ...item,
    transform: {
      ...item.transform,
      rotationDegrees: { ...item.transform.rotationDegrees, y: yaw },
    },
  }
  const flushed = snapFootprintToStageEdges(oriented, venue)
  const axis: 'x' | 'z' | null = flushed.labels.some(
    (label) => label === '贴后墙' || label === '贴台口',
  )
    ? 'x'
    : flushed.labels.some((label) => label === '贴台左' || label === '贴台右')
      ? 'z'
      : null
  if (!axis) return { ...flushed, yaw }
  const at = (position: StagePoint): CollisionItem => ({
    ...oriented,
    transform: { ...oriented.transform, position },
  })
  const blocked = (position: StagePoint) => {
    const placed = at(position)
    const bounds = prepareStageCollision(placed).bounds
    if (
      bounds[0]![0] < -venue.widthMeters / 2 - 1e-3 ||
      bounds[0]![1] > venue.widthMeters / 2 + 1e-3 ||
      bounds[2]![0] < -1e-3 ||
      bounds[2]![1] > venue.depthMeters + 1e-3
    )
      return true
    return others.some((other) => stageObjectsTouch(placed, other, true))
  }
  if (!blocked(flushed.position)) return { ...flushed, yaw }
  const probe = at(flushed.position)
  const self = footprintSpan(probe, axis)
  const size = self[1] - self[0]
  const cross = footprintSpan(probe, axis === 'x' ? 'z' : 'x')
  const blockers = others
    .filter((other) => overlaps(cross, footprintSpan(other, axis === 'x' ? 'z' : 'x')))
    .map((other) => footprintSpan(other, axis))
    .sort((a, b) => a[0] - b[0])
  const limit: [number, number] =
    axis === 'x' ? [-venue.widthMeters / 2, venue.widthMeters / 2] : [0, venue.depthMeters]
  const gaps: [number, number][] = []
  let cursor = limit[0]
  for (const [start, end] of blockers) {
    if (start > cursor + 1e-4) gaps.push([cursor, start])
    cursor = Math.max(cursor, end)
  }
  if (cursor < limit[1] - 1e-4) gaps.push([cursor, limit[1]])
  const click = axis === 'x' ? item.transform.position.x : item.transform.position.z
  let best: { position: StagePoint; distance: number } | null = null
  for (const [start, end] of gaps) {
    if (end - start + 0.01 < size) continue
    const desiredMin = Math.min(Math.max(click - size / 2, start), end - size)
    const delta = desiredMin - self[0]
    const position = { ...flushed.position, [axis]: flushed.position[axis] + delta }
    if (blocked(position)) continue
    const distance = Math.abs(delta)
    if (!best || distance < best.distance) best = { position, distance }
  }
  if (!best) return { ...flushed, yaw }
  return {
    position: best.position,
    labels: [...flushed.labels, '空位'],
    yaw,
  }
}
