import { z } from 'zod'
import { ScriptImportSchema } from '../stage/import-metadata'
import {
  createTheatreDocument,
  type TheatreDocument,
  VENUE_TEMPLATES,
  Vec3Schema,
  VenueSchema,
} from './schema'

export const PerformerMarkerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  position: Vec3Schema,
  facing: z.number().finite(),
  visible: z.boolean(),
  stageLocked: z.boolean().optional(),
})
export const RehearsalPathSchema = z.object({
  id: z.string().min(1),
  performerId: z.string().min(1),
  points: z.array(Vec3Schema).min(2),
  durationSeconds: z.number().finite().positive(),
  visible: z.boolean(),
})
export const RehearsalSimulationSchema = z
  .object({
    version: z.literal(1),
    performers: z.array(PerformerMarkerSchema),
    paths: z.array(RehearsalPathSchema),
    durationSeconds: z.number().finite().positive(),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.performers.map((p) => p.id))
    if (
      ids.size !== value.performers.length ||
      new Set(value.paths.map((p) => p.id)).size !== value.paths.length
    )
      ctx.addIssue({ code: 'custom', message: '人物或路线编号重复' })
    if (new Set(value.paths.map((p) => p.performerId)).size !== value.paths.length)
      ctx.addIssue({ code: 'custom', message: '每个人物只保留一条路线' })
    for (const path of value.paths)
      if (!ids.has(path.performerId) || path.durationSeconds > value.durationSeconds)
        ctx.addIssue({ code: 'custom', message: '路线人物或时长无效' })
  })
export const StageSceneDocumentSchema = z.object({
  version: z.literal(2),
  production: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  venue: VenueSchema,
  rehearsalSimulation: RehearsalSimulationSchema,
  importMetadata: z.array(ScriptImportSchema).optional(),
  legacy: z.record(z.string(), z.unknown()).optional(),
})
export type StageSceneDocument = z.infer<typeof StageSceneDocumentSchema>
export type PerformerMarker = z.infer<typeof PerformerMarkerSchema>
export type RehearsalSimulation = z.infer<typeof RehearsalSimulationSchema>

export function assertPerformerLocks(previous: StageSceneDocument, next: StageSceneDocument) {
  for (const performer of previous.rehearsalSimulation.performers) {
    if (!performer.stageLocked) continue
    const updated = next.rehearsalSimulation.performers.find((entry) => entry.id === performer.id)
    const paths = (document: StageSceneDocument) =>
      document.rehearsalSimulation.paths.filter((path) => path.performerId === performer.id)
    if (
      !updated ||
      JSON.stringify({ ...performer, stageLocked: undefined }) !==
        JSON.stringify({ ...updated, stageLocked: undefined }) ||
      JSON.stringify(paths(previous)) !== JSON.stringify(paths(next))
    )
      throw new Error(`${performer.name}已固定，请先解除固定。`)
  }
}

export function createStageSceneDocument(name = '未命名剧目'): StageSceneDocument {
  return {
    version: 2,
    production: { id: crypto.randomUUID(), name },
    venue: { ...VENUE_TEMPLATES[0]!, id: crypto.randomUUID(), origin: [0, 0, 0] },
    rehearsalSimulation: { version: 1, performers: [], paths: [], durationSeconds: 20 },
  }
}

const legacySpatialSchema = z.object({
  production: z.object({ id: z.string(), name: z.string() }),
  venue: VenueSchema,
  activeSceneId: z.string(),
  scenes: z.array(
    z.object({
      id: z.string(),
      duration: z.number().positive(),
      roles: z.array(PerformerMarkerSchema.omit({ visible: true })),
      marks: z.array(z.object({ id: z.string(), position: Vec3Schema })),
      paths: z.array(
        z.object({
          id: z.string(),
          roleId: z.string(),
          markIds: z.array(z.string()),
          speed: z.number().positive(),
        }),
      ),
    }),
  ),
})

export function migrateStageDocument(raw: unknown): StageSceneDocument {
  if (raw && typeof raw === 'object' && 'version' in raw && raw.version === 2)
    return StageSceneDocumentSchema.parse(raw)
  const previous = legacySpatialSchema.parse(raw)
  const current = previous.scenes.find((s) => s.id === previous.activeSceneId) ?? previous.scenes[0]
  if (!current) throw new Error('旧项目缺少空间记录')
  const performers = current.roles.map((role) => ({ ...role, visible: true }))
  const paths: z.infer<typeof RehearsalPathSchema>[] = []
  for (const role of performers) {
    const route = current.paths.filter((p) => p.roleId === role.id)
    const points = route.flatMap((p) =>
      p.markIds.flatMap((id) => {
        const mark = current.marks.find((m) => m.id === id)
        return mark ? [mark.position] : []
      }),
    )
    if (points.length >= 2)
      paths.push({
        id: route[0]!.id,
        performerId: role.id,
        points,
        durationSeconds: current.duration,
        visible: true,
      })
  }
  return StageSceneDocumentSchema.parse({
    version: 2,
    production: previous.production,
    venue: previous.venue,
    rehearsalSimulation: { version: 1, performers, paths, durationSeconds: current.duration },
    legacy: { theatre: raw },
  })
}

/** Compatibility projection for the existing geometry and motion sampler; never persisted. */
export function runtimeTheatreDocument(document: StageSceneDocument): TheatreDocument {
  const result = createTheatreDocument(document.production.name, document.production.id)
  result.venue = document.venue
  const scene = result.scenes[0]!
  scene.id = `${document.production.id}:simulation`
  result.activeSceneId = scene.id
  scene.name = '模拟排演'
  scene.duration = document.rehearsalSimulation.durationSeconds
  scene.roles = document.rehearsalSimulation.performers
    .filter((p) => p.visible)
    .map((p) => ({
      ...p,
      height: 1.7,
      objective: '',
      entry: '',
      exit: '',
    }))
  for (const path of document.rehearsalSimulation.paths) {
    if (!scene.roles.some((r) => r.id === path.performerId)) continue
    const length = path.points.reduce(
      (sum, point, i) =>
        sum + (i ? Math.hypot(...point.map((v, a) => v - path.points[i - 1]![a]!)) : 0),
      0,
    )
    if (length < 0.000001) continue
    const markIds = path.points.map((position, i) => {
      const id = `${path.id}:${i}`
      const next = path.points[i + 1] ?? position
      scene.marks.push({
        id,
        label: '',
        position,
        facing: Math.atan2(next[0] - position[0], next[2] - position[2]),
        pause: 0,
      })
      return id
    })
    scene.paths.push({
      id: path.id,
      roleId: path.performerId,
      markIds,
      startTime: 0,
      speed: length / path.durationSeconds,
      reason: '',
    })
  }
  return result
}
