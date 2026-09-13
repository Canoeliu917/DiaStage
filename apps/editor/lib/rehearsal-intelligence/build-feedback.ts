import { type AnyNode, subscribeSceneCommits, useScene } from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import { localSceneSequence, readLocalDecisionReceipt, subscribeLocalScene } from '../scene-journal'
import { sceneContentVersion } from '../scene-signature'
import { THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { StageSceneDocumentSchema } from '../theatre/simulation'
import { buildDiaContext } from './context'
import { type BuildFeedback, BuildFeedbackSchema, type DiaBuildProposal } from './dia-backbone'
import { openRehearsalLog } from './feedback'

export const BUILD_DECISION_KEY = 'diastageBuildDecision'

export async function saveBuildFeedback(raw: BuildFeedback) {
  const event = BuildFeedbackSchema.parse(raw)
  const db = await openRehearsalLog()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('build-events', 'readwrite', { durability: 'strict' })
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? new Error('搭台反馈未保存，正式舞台仍保留'))
      const store = tx.objectStore('build-events')
      const existing = store.get(event.eventId)
      existing.onsuccess = () => {
        try {
          const previous = existing.result ? BuildFeedbackSchema.parse(existing.result) : null
          // A late callback cannot demote a receipt or replace a newer durable final state.
          if (previous?.status === 'applied' && event.status === 'prepared') return
          if (
            event.kind === 'final-state' &&
            previous?.journalSequence !== undefined &&
            (event.journalSequence === undefined ||
              previous.journalSequence > event.journalSequence)
          )
            return
          store.put(event)
        } catch (error) {
          tx.abort()
          reject(error)
        }
      }
    })
  } finally {
    db.close()
  }
}

export async function readBuildFeedback(sceneId: string): Promise<BuildFeedback[]> {
  const db = await openRehearsalLog()
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('build-events')
        .objectStore('build-events')
        .index('sceneId')
        .getAll(sceneId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        try {
          resolve(BuildFeedbackSchema.array().parse(request.result))
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    db.close()
  }
}

export function buildFeedbackEvent(
  sceneId: string,
  proposal: DiaBuildProposal,
  kind: BuildFeedback['kind'],
  status: BuildFeedback['status'] = 'recorded',
): BuildFeedback {
  if (!proposal.envelope) throw new Error('旧搭台建议缺少交互引用，请重新预演后确认')
  return BuildFeedbackSchema.parse({
    eventId: kind === 'adopt' ? proposal.id : crypto.randomUUID(),
    sceneId,
    interactionId: proposal.id,
    createdAt: new Date().toISOString(),
    kind,
    status,
    proposal,
    envelope: { ...proposal.envelope, status: kind === 'adopt' ? status : proposal.status },
    privateProjectData: true,
    trainingAuthorized: false,
    trainingEligible: false,
  })
}

export async function committedBuild(sceneId: string, proposalId: string) {
  const receipt = await readLocalDecisionReceipt(sceneId, proposalId)
  return (
    receipt?.eventId === proposalId &&
    receipt.proposalId === proposalId &&
    receipt.interactionId === proposalId
  )
}

/** Like Rehearse, only a durable Scene receipt promotes prepared feedback; never re-execute it. */
export async function reconcileBuildFeedback(
  sceneId: string,
  nodes: Record<string, AnyNode>,
  change?: 'undo' | 'redo' | 'manual-edit',
  graph: SceneGraph = { ...useScene.getState(), nodes },
  sequence = localSceneSequence(sceneId, nodes),
) {
  const contentVersion = sceneContentVersion(graph)
  const site = Object.values(nodes).find((node) => node.type === 'site')
  if (!site) return []
  const document = StageSceneDocumentSchema.parse(site.metadata[THEATRE_METADATA_KEY])
  const context = buildDiaContext(sceneId, document, nodes, {
    intention: '搭台结果记录',
    script: '',
    directorIntention: '',
    selectedPerformerId: null,
  })
  const events = await readBuildFeedback(sceneId)
  const adoptions = events.filter((event) => event.kind === 'adopt')
  const committed: BuildFeedback[] = []
  for (const prepared of adoptions) {
    const receipt = await readLocalDecisionReceipt(sceneId, prepared.interactionId)
    if (
      receipt?.eventId !== prepared.interactionId ||
      receipt.interactionId !== prepared.interactionId ||
      receipt.proposalId !== prepared.interactionId
    )
      continue
    const adopted: BuildFeedback = {
      ...prepared,
      status: 'applied',
      envelope: { ...prepared.envelope, status: 'applied' },
      ...(receipt.resultSceneVersion ? { resultSceneVersion: receipt.resultSceneVersion } : {}),
      ...(receipt.resultContentVersion
        ? { resultContentVersion: receipt.resultContentVersion }
        : {}),
    }
    if (prepared.status !== 'applied') await saveBuildFeedback(adopted)
    committed.push(adopted)
    const live = site.metadata[BUILD_DECISION_KEY]
    const matches =
      !!live &&
      typeof live === 'object' &&
      'interactionId' in live &&
      live.interactionId === prepared.interactionId
    const previous = events.find((event) => event.eventId === `${prepared.eventId}:result`)
    const state = !matches
      ? context.sceneVersion === prepared.proposal.sceneVersion &&
        (!prepared.proposal.sourceContentVersion ||
          prepared.proposal.sourceContentVersion === contentVersion)
        ? 'undone'
        : 'modified'
      : site.metadata.diastageVersionSource &&
          typeof site.metadata.diastageVersionSource === 'object' &&
          'resultSceneVersion' in site.metadata.diastageVersionSource &&
          'interactionId' in site.metadata.diastageVersionSource &&
          site.metadata.diastageVersionSource.interactionId === prepared.interactionId &&
          site.metadata.diastageVersionSource.resultSceneVersion === context.sceneVersion &&
          (!receipt.resultContentVersion || receipt.resultContentVersion === contentVersion)
        ? 'applied'
        : 'modified'
    if (previous?.resultContentVersion !== contentVersion || previous?.finalState !== state) {
      const result: BuildFeedback = {
        ...adopted,
        eventId: `${prepared.eventId}:result`,
        kind: 'final-state',
        createdAt: new Date().toISOString(),
        resultSceneVersion: context.sceneVersion,
        resultContentVersion: contentVersion,
        journalSequence: sequence,
        finalState: state,
        finalContext: context,
      }
      await saveBuildFeedback(result)
      if (previous && change)
        await saveBuildFeedback({
          ...result,
          eventId: `${prepared.eventId}:${change}:${sequence ?? contentVersion}`,
          kind: change,
        })
    }
    const versions = site.metadata.diastageRehearsalVersions
    if (Array.isArray(versions))
      for (const version of versions) {
        if (
          version?.source !== 'dia-build' ||
          version.interactionId !== prepared.interactionId ||
          typeof version.id !== 'string'
        )
          continue
        const eventId = `${prepared.eventId}:version:${version.id}`
        if (!events.some((event) => event.eventId === eventId))
          await saveBuildFeedback({
            ...adopted,
            eventId,
            kind: 'version-link',
            versionId: version.id,
          })
      }
  }
  return committed
}

export function observeBuildFeedback(sceneId: string, onError: (message: string) => void) {
  let queue = Promise.resolve()
  const changes = new WeakMap<object, 'undo' | 'redo' | 'manual-edit'>()
  const stopChanges = subscribeSceneCommits((commit) => {
    if (commit.origin !== 'local') return
    const site = (nodes: typeof commit.current.nodes) =>
      Object.values(nodes).find((node) => node.type === 'site')
    const before = site(commit.before.nodes)?.metadata
    const after = site(commit.current.nodes)?.metadata
    // A subsequent Dia adoption or version restore is not a manual edit of the earlier proposal.
    if (before?.diastageVersionSource === after?.diastageVersionSource)
      changes.set(commit.current.nodes, 'manual-edit')
  })
  // Zundo splices its arrays in place; retain the previous references before notification.
  let future = [...useScene.temporal.getState().futureStates]
  const stopHistory = useScene.temporal.subscribe((current) => {
    if (current.futureStates.length > future.length) changes.set(useScene.getState().nodes, 'undo')
    else if (
      current.futureStates.length < future.length &&
      future.some((state) => state.nodes === useScene.getState().nodes)
    )
      changes.set(useScene.getState().nodes, 'redo')
    future = [...current.futureStates]
  })
  const stopLocal = subscribeLocalScene(sceneId, (nodes, graph, sequence) => {
    const change = changes.get(nodes)
    queue = queue
      .then(async () => {
        await reconcileBuildFeedback(
          sceneId,
          nodes as Record<string, AnyNode>,
          change,
          graph,
          sequence,
        )
      })
      .catch(() =>
        onError('舞台已保存，但搭台反馈未更新；请检查本机空间，刷新后将按正式回执恢复。'),
      )
  })
  return () => {
    stopChanges()
    stopHistory()
    stopLocal()
  }
}
