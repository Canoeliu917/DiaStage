import {
  type SceneContextSummary,
  type StageCommand,
  StageCommandSchema,
  type StagePlan,
  validateStagePlan,
} from '@pascal-app/core/stage'

export type CreationMode = 'suggest' | 'create' | 'draft'
export interface CreationLease {
  projectId: string
  userId: string
  sessionId: string
  mode: Exclude<CreationMode, 'suggest'>
  expiresAt: number
  maxNodes?: number
}

export function creationDecision(
  lease: CreationLease | null,
  projectId: string,
  commands: StageCommand[],
  now = Date.now(),
  maxNodes = 20,
): 'confirm' | 'execute' | 'draft' {
  const parsed = StageCommandSchema.array().min(1).max(500).safeParse(commands)
  if (!parsed.success || !lease || lease.projectId !== projectId || lease.expiresAt <= now)
    return 'confirm'
  const safe = new Set([
    'AddScenery',
    'MoveObject',
    'RotateObject',
    'ResizeObject',
    'DuplicateObject',
    'AddCamera',
    'SetCamera',
    'GroupObjects',
    'ReplaceScenery',
  ])
  const affected = new Set<string>()
  for (const command of parsed.data) {
    if (!safe.has(command.type)) return 'confirm'
    if ('nodeId' in command) affected.add(command.nodeId)
    if ('nodeIds' in command) for (const id of command.nodeIds) affected.add(id)
    if ('newNodeId' in command) affected.add(command.newNodeId)
    if (command.type === 'AddScenery' && command.libraryAssetId !== null) return 'confirm'
  }
  if (affected.size > Math.min(20, maxNodes, lease.maxNodes ?? 20)) return 'confirm'
  return lease.mode === 'draft' ? 'draft' : 'execute'
}

export function mergeDraftPlan(
  previous: StagePlan | null,
  next: StagePlan,
  original: SceneContextSummary,
): StagePlan {
  if (!previous) return validateStagePlan(next, original).plan
  const merged = structuredClone(previous)
  // Draft IDs remain proposal references until one final compilation creates real nodes.
  const sequence = crypto.randomUUID()
  const ids = new Map(
    next.items.map((item) => [
      item.proposalId,
      item.existingNodeId ?? `${sequence}:${item.proposalId}`,
    ]),
  )
  for (const item of next.items) {
    const id = ids.get(item.proposalId)!
    const index = merged.items.findIndex(
      (old) => old.proposalId === id || old.existingNodeId === id,
    )
    const proposal = {
      ...item,
      proposalId: id,
      existingNodeId: original.objects.some((object) => object.id === id) ? id : null,
      assumptionIds: item.assumptionIds.map((value) => `${sequence}:${value}`),
    }
    if (index >= 0) merged.items[index] = proposal
    else merged.items.push(proposal)
  }
  merged.venue = next.venue ?? merged.venue
  merged.relations = []
  merged.assumptions.push(
    ...next.assumptions.map((entry) => ({ ...entry, id: `${sequence}:${entry.id}` })),
  )
  merged.questions = next.questions
  merged.warnings = []
  return validateStagePlan(merged, original).plan
}

export function draftContext(original: SceneContextSummary, plan: StagePlan): SceneContextSummary {
  const replaced = new Set(plan.items.map((item) => item.existingNodeId))
  return {
    ...original,
    venue: plan.venue ?? original.venue,
    objects: [
      ...original.objects.filter((object) => !replaced.has(object.id)),
      ...plan.items.map((item) => ({
        id: item.existingNodeId ?? item.proposalId,
        name: item.displayName,
        kind: item.kind,
        dimensionsMeters: item.dimensionsMeters,
        transform: item.transform,
      })),
    ],
    selectedObjectIds: plan.items.map((item) => item.existingNodeId ?? item.proposalId),
  }
}
