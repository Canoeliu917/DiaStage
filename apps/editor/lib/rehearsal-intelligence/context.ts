import type { AnyNode, WallMiterData } from '@pascal-app/core'
import { getObjectCorners } from '@pascal-app/core/remount'
import { obstacleSnapshot } from '../remount-scene'
import type { Vec3 } from '../theatre/schema'
import type { StageSceneDocument } from '../theatre/simulation'
import { PerformerMarkerSchema } from '../theatre/simulation'
import { sceneFactsVersion } from './conversation'
import { ACTIVE_DIMENSIONS } from './dimensions'
import { validateContext } from './proposal-validator'
import { type RehearsalContext, RehearsalContextSchema } from './schema'

export function buildDiaContext(
  sceneId: string,
  document: StageSceneDocument,
  nodes: Record<string, AnyNode>,
  input: {
    intention: string
    script: string
    directorIntention: string
    selectedPerformerId: string | null
    conversation?: RehearsalContext['conversation']
    rightsStatus?: RehearsalContext['rightsStatus']
  },
): RehearsalContext {
  const obstacles: RehearsalContext['obstacles'] = []
  const miters = new Map<string | null, WallMiterData>()
  for (const node of Object.values(nodes)) {
    if (
      !['item', 'block', 'stair', 'wall'].includes(node.type) ||
      node.visible === false ||
      node.metadata.isTransient ||
      node.metadata.isNew
    )
      continue
    const obstacle = obstacleSnapshot(node, nodes, miters)
    if (!obstacle) continue
    const corners = getObjectCorners(obstacle)
    obstacles.push({
      id: node.id,
      name: (node.name || '布景').slice(0, 160),
      min: [0, 1, 2].map((axis) => Math.min(...corners.map((p) => p[axis]!))) as Vec3,
      max: [0, 1, 2].map((axis) => Math.max(...corners.map((p) => p[axis]!))) as Vec3,
    })
  }
  const context = {
    sceneId,
    productionId: document.production.id,
    intention: input.intention,
    script: input.script,
    directorIntention: input.directorIntention,
    selectedPerformerId: input.selectedPerformerId,
    venue: document.venue,
    performers: document.rehearsalSimulation.performers,
    paths: document.rehearsalSimulation.paths,
    durationSeconds: document.rehearsalSimulation.durationSeconds,
    obstacles,
    activeDimensions: [...ACTIVE_DIMENSIONS],
    ...(input.conversation ? { conversation: input.conversation } : {}),
    ...(input.rightsStatus ? { rightsStatus: input.rightsStatus } : {}),
  }
  return RehearsalContextSchema.extend({ performers: PerformerMarkerSchema.array().max(24) }).parse(
    { ...context, sceneVersion: sceneFactsVersion(context) },
  )
}

export function buildRehearsalContext(...args: Parameters<typeof buildDiaContext>) {
  return validateContext(buildDiaContext(...args))
}
