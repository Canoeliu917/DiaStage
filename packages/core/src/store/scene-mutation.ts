import type { AnyNode, AnyNodeId } from '../schema/types'

export type NodeChanges = {
  create?: { node: AnyNode; parentId?: AnyNodeId }[]
  update?: { id: AnyNodeId; data: Partial<AnyNode> }[]
  delete?: AnyNodeId[]
}

export type SceneMutationHandler = (
  changes: NodeChanges,
  commit: (replacement?: NodeChanges) => void,
  // biome-ignore lint/suspicious/noConfusingVoidType: Existing synchronous callbacks return void; false explicitly vetoes the pending write.
) => void | false

export class SceneMutationError extends Error {
  constructor(public readonly code: 'REENTRANT_MUTATION' | 'COMMIT_CLOSED' | 'DUPLICATE_COMMIT') {
    super(`Scene mutation rejected: ${code}`)
    this.name = 'SceneMutationError'
  }
}

let registration: { handler: SceneMutationHandler } | null = null
let phase: 'idle' | 'validating' | 'committing' = 'idle'

export function installSceneMutationHandler(handler: SceneMutationHandler): () => void {
  const installed = { handler }
  registration = installed
  return () => {
    if (registration === installed) registration = null
  }
}

/** A no-argument commit preserves the caller's original node-action semantics. */
export function dispatchSceneMutation(
  changes: NodeChanges,
  original: () => void,
  replace: (changes: NodeChanges) => void,
): void {
  if (phase === 'validating') throw new SceneMutationError('REENTRANT_MUTATION')
  if (!registration || phase === 'committing') {
    original()
    return
  }

  let requested = false
  let replacement: NodeChanges | undefined
  let open = true
  phase = 'validating'
  try {
    const result = registration.handler(changes, (next) => {
      if (!open) throw new SceneMutationError('COMMIT_CLOSED')
      if (requested) throw new SceneMutationError('DUPLICATE_COMMIT')
      requested = true
      replacement = next
    })
    open = false
    // Delay the write until validation returns; false or an exception cannot leave a partial edit.
    if (result === false || !requested) return
    phase = 'committing'
    if (replacement === undefined) original()
    else replace(replacement)
  } finally {
    open = false
    phase = 'idle'
  }
}
