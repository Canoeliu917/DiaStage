import type { AnyNode } from '@pascal-app/core'
import { sceneObstacles } from '../remount-scene'
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
  const obstacles = sceneObstacles(nodes)
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
