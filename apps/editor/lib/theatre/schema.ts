import { z } from 'zod'

const id = z.string().min(1)
const finite = z.number().finite()
const seconds = finite.nonnegative()
export const Vec3Schema = z.tuple([finite, finite, finite])
export type Vec3 = z.infer<typeof Vec3Schema>

export const VenueSchema = z.object({
  id,
  name: z.string().min(1),
  type: z.enum(['black-box', 'proscenium', 'thrust', 'arena', 'classroom', 'other']),
  width: finite.positive(),
  depth: finite.positive(),
  height: finite.positive(),
  origin: Vec3Schema,
})
export const RoleSchema = z.object({
  id,
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  height: finite.positive(),
  position: Vec3Schema,
  facing: finite,
  objective: z.string(),
  entry: z.string(),
  exit: z.string(),
})
export const StageMarkSchema = z.object({
  id,
  label: z.string().min(1),
  position: Vec3Schema,
  facing: finite,
  pause: seconds,
})
export const BlockingPathSchema = z.object({
  id,
  roleId: id,
  markIds: z.array(id).min(2),
  startTime: seconds,
  speed: finite.positive(),
  reason: z.string(),
})
export const PropSchema = z.object({
  id,
  name: z.string().min(1),
  nodeId: id.optional(),
  presetPosition: Vec3Schema,
  initialHolderRoleId: id.nullable(),
  transfers: z.array(
    z.object({
      id,
      time: seconds,
      fromRoleId: id.nullable(),
      toRoleId: id.nullable(),
      position: Vec3Schema.optional(),
    }),
  ),
  resetNote: z.string(),
})
export const BeatSchema = z.object({
  id,
  name: z.string().min(1),
  start: seconds,
  end: seconds,
  objective: z.string(),
  resistance: z.string(),
})
export const DramaticActionSchema = z.object({
  id,
  beatId: id,
  actorId: id,
  targetRoleId: id.optional(),
  verb: z.string().min(1),
  desiredChange: z.string(),
  resistance: z.string(),
  propId: id.optional(),
  start: seconds,
  end: seconds,
})
export const RehearsalSceneSchema = z.object({
  id,
  name: z.string().min(1),
  number: z.string(),
  duration: finite.positive(),
  script: z.string(),
  roles: z.array(RoleSchema),
  marks: z.array(StageMarkSchema),
  paths: z.array(BlockingPathSchema),
  props: z.array(PropSchema),
  beats: z.array(BeatSchema),
  actions: z.array(DramaticActionSchema),
})

const documentFields = {
  version: z.literal(1),
  production: z.object({
    id,
    name: z.string().min(1),
    notes: z.string(),
    scriptVersion: z.string(),
  }),
  venue: VenueSchema,
  activeSceneId: id,
  scenes: z.array(RehearsalSceneSchema).min(1),
}

function isFiniteJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isFiniteJson)
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.values(value).every(isFiniteJson)
}

export const StageSnapshotSchema = z
  .object({
    nodes: z.record(z.string(), z.record(z.string(), z.unknown())),
    rootNodeIds: z.array(id),
    materials: z.record(z.string(), z.record(z.string(), z.unknown())),
    collections: z.record(z.string(), z.record(z.string(), z.unknown())),
    installedPlugins: z.array(id),
  })
  .refine(isFiniteJson, '布景快照必须是有限数值组成的 JSON 数据')

export const RehearsalTakeSchema = z.object({
  id,
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  note: z.string(),
  document: z.object(documentFields),
  stage: StageSnapshotSchema,
})

const DocumentShape = z.object({ ...documentFields, takes: z.array(RehearsalTakeSchema) })
export type Venue = z.infer<typeof VenueSchema>
export type Role = z.infer<typeof RoleSchema>
export type StageMark = z.infer<typeof StageMarkSchema>
export type BlockingPath = z.infer<typeof BlockingPathSchema>
export type Prop = z.infer<typeof PropSchema>
export type Beat = z.infer<typeof BeatSchema>
export type DramaticAction = z.infer<typeof DramaticActionSchema>
export type RehearsalScene = z.infer<typeof RehearsalSceneSchema>
export type RehearsalTake = z.infer<typeof RehearsalTakeSchema>
export type StageSnapshot = z.infer<typeof StageSnapshotSchema>
export type TheatreDocument = z.infer<typeof DocumentShape>

export function pathDuration(path: BlockingPath, marks: StageMark[]): number {
  const points = path.markIds.map((markId) => {
    const mark = marks.find((entry) => entry.id === markId)
    if (!mark) throw new Error('走位引用的标记已不存在')
    return mark
  })
  return points.reduce((total, point, index) => {
    const previous = points[index - 1]
    return (
      total +
      point.pause +
      (previous
        ? Math.hypot(...point.position.map((value, axis) => value - previous.position[axis]!)) /
          path.speed
        : 0)
    )
  }, 0)
}

function validateDocument(
  document: Omit<TheatreDocument, 'takes'>,
  context: z.RefinementCtx,
): void {
  const issue = (message: string) => context.addIssue({ code: 'custom', message })
  const unique = (entries: { id: string }[], label: string) => {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
      issue(`${label}的 ID 不可重复`)
  }
  unique(document.scenes, '场次')
  if (!document.scenes.some((scene) => scene.id === document.activeSceneId)) issue('当前场次不存在')
  for (const scene of document.scenes) {
    for (const entries of [
      scene.roles,
      scene.marks,
      scene.paths,
      scene.props,
      scene.beats,
      scene.actions,
    ]) {
      unique(entries, '排演对象')
    }
    const roles = new Set(scene.roles.map((role) => role.id))
    const marks = new Set(scene.marks.map((mark) => mark.id))
    const props = new Set(scene.props.map((prop) => prop.id))
    const beats = new Map(scene.beats.map((beat) => [beat.id, beat]))
    const ranges = new Map<string, [number, number][]>()
    const inRange = (start: number, end: number) => start <= end && end <= scene.duration
    for (const path of scene.paths) {
      if (!roles.has(path.roleId)) issue('走位人物不存在')
      if (path.markIds.some((markId) => !marks.has(markId))) {
        issue('走位点不存在')
        continue
      }
      const end = path.startTime + pathDuration(path, scene.marks)
      if (!inRange(path.startTime, end)) issue('走位与停顿必须位于场次时长内')
      const previous = ranges.get(path.roleId) ?? []
      if (previous.some(([from, to]) => path.startTime < to && end > from))
        issue('同一人物的走位时间不可重叠')
      previous.push([path.startTime, end])
      ranges.set(path.roleId, previous)
    }
    const nodeIds = scene.props.flatMap((prop) => (prop.nodeId ? [prop.nodeId] : []))
    if (new Set(nodeIds).size !== nodeIds.length) issue('一个场景物件只能关联一件道具')
    for (const prop of scene.props) {
      let holder = prop.initialHolderRoleId
      if (holder !== null && !roles.has(holder)) issue('道具预置持有人不存在')
      unique(prop.transfers, '道具交接')
      let previousTime = -1
      for (const transfer of prop.transfers) {
        if (transfer.time <= previousTime || transfer.time > scene.duration)
          issue('道具交接时间必须递增且位于场次内')
        if (transfer.fromRoleId !== holder) issue('道具交出人必须是当前持有人')
        if (transfer.toRoleId !== null && !roles.has(transfer.toRoleId)) issue('道具接收人不存在')
        if (transfer.toRoleId === null && !transfer.position) issue('道具放下时必须指定落位位置')
        holder = transfer.toRoleId
        previousTime = transfer.time
      }
    }
    for (const beat of scene.beats) {
      if (!inRange(beat.start, beat.end)) issue('节拍起止时间必须位于场次内')
    }
    for (const action of scene.actions) {
      const beat = beats.get(action.beatId)
      if (!beat) issue('行动所属节拍不存在')
      if (!roles.has(action.actorId) || (action.targetRoleId && !roles.has(action.targetRoleId)))
        issue('行动人物不存在')
      if (action.propId && !props.has(action.propId)) issue('行动道具不存在')
      if (
        !inRange(action.start, action.end) ||
        (beat && (action.start < beat.start || action.end > beat.end))
      )
        issue('行动必须位于所属节拍内')
    }
  }
}

export const TheatreDocumentSchema = DocumentShape.superRefine((document, context) => {
  validateDocument(document, context)
  if (new Set(document.takes.map((take) => take.id)).size !== document.takes.length) {
    context.addIssue({ code: 'custom', message: '排演版本 ID 不可重复' })
  }
  for (const take of document.takes) validateDocument(take.document, context)
})

export const VENUE_TEMPLATES: ReadonlyArray<Omit<Venue, 'id'>> = [
  {
    name: '黑匣子 · 8 × 6 米',
    type: 'black-box',
    width: 8,
    depth: 6,
    height: 4,
    origin: [0, 0, 0],
  },
  {
    name: '镜框式 · 10 × 8 米',
    type: 'proscenium',
    width: 10,
    depth: 8,
    height: 5,
    origin: [0, 0, 0],
  },
  { name: '伸出式 · 8 × 8 米', type: 'thrust', width: 8, depth: 8, height: 4, origin: [0, 0, 0] },
  { name: '环形 · 8 × 8 米', type: 'arena', width: 8, depth: 8, height: 4, origin: [0, 0, 0] },
  {
    name: '教室 / 排练厅 · 8 × 6 米',
    type: 'classroom',
    width: 8,
    depth: 6,
    height: 3,
    origin: [0, 0, 0],
  },
]

export function theatreId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createRehearsalScene(name = '第一场'): RehearsalScene {
  return {
    id: theatreId('scene'),
    name,
    number: '1',
    duration: 20,
    script: '',
    roles: [],
    marks: [],
    paths: [],
    props: [],
    beats: [],
    actions: [],
  }
}

export function createTheatreDocument(
  name = '未命名剧目',
  productionId = theatreId('production'),
): TheatreDocument {
  const scene = createRehearsalScene()
  return {
    version: 1,
    production: { id: productionId, name, notes: '', scriptVersion: '1' },
    venue: { ...VENUE_TEMPLATES[0]!, id: theatreId('venue'), origin: [0, 0, 0] },
    activeSceneId: scene.id,
    scenes: [scene],
    takes: [],
  }
}

export function activeRehearsalScene(document: TheatreDocument): RehearsalScene {
  const scene = document.scenes.find((entry) => entry.id === document.activeSceneId)
  if (!scene) throw new Error('当前场次不存在')
  return scene
}
