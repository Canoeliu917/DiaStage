import { expect, test } from 'bun:test'
import { parseStageText, SceneContextSummarySchema } from '@pascal-app/core/stage'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { RehearsalVersionSchema } from '../theatre/rehearsal-versions'
import { StageSceneDocumentSchema } from '../theatre/simulation'
import { createRehearsalThread } from './conversation'
import { readConversation, StoredConversationSchema } from './conversation-storage'
import { evalContext } from './eval'
import { EVAL_CASES } from './eval-cases'
import { openRehearsalLog, readFeedbackLog } from './feedback'
import { createInteraction } from './proposal-generator'
import { FeedbackSchema, InteractionSchema } from './schema'

const OLD_STORES = [
  ['interactions', 'interactionId'],
  ['events', 'eventId'],
  ['consent', 'sceneId'],
  ['threads', 'sceneId'],
  ['product-events', 'eventId'],
] as const

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function completed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error)
  })
}
async function rawRecords(db: IDBDatabase) {
  return Promise.all(
    OLD_STORES.map(([name]) => result(db.transaction(name).objectStore(name).getAll())),
  )
}

test('real feedback v2 to v3 upgrade preserves old raw records, embedded Build and journal Version without hiding malformed envelopes', async () => {
  const previousFactory = globalThis.indexedDB
  const previousRange = globalThis.IDBKeyRange
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  const opened: IDBDatabase[] = []
  try {
    const context = { ...evalContext(EVAL_CASES[0]!.caseId), sceneId: 'legacy-rehearse-scene' }
    const interaction = createInteraction(
      context,
      {
        dramaticState: [],
        proposals: [
          {
            title: '旧排演方案',
            intention: '保持当前处理',
            rationale: '旧版合成记录',
            suggestions: [
              {
                id: 'old-suggestion',
                performerId: context.performers[0]!.id,
                intention: '保持原站位',
                movement: 'hold',
                targetPerformerId: null,
                zone: null,
                extent: 'small',
                pace: 'natural',
              },
            ],
            alternatives: [],
            evidence: [],
            confidence: 0.5,
          },
        ],
      },
      'synthetic-v2-migration-fixture',
    )
    delete interaction.envelope
    const feedback = FeedbackSchema.parse({
      eventId: 'legacy-event',
      interactionId: interaction.interactionId,
      proposalId: interaction.proposals[0]!.proposalId,
      sceneId: context.sceneId,
      createdAt: interaction.createdAt,
      previewed: false,
      decision: 'reject',
      originalProposal: interaction.proposals[0],
      previewedProposal: null,
      privateProjectData: true,
      trainingAuthorized: false,
      rightsStatus: 'unknown',
      trainingEligible: false,
      humanEdit: null,
      finalResult: null,
      reasonTags: [],
      optionalUserNote: '必须原样保留的旧版笔记',
      status: 'recorded',
    })
    const buildContext = SceneContextSummarySchema.parse({
      documentVersion: 1,
      venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
      objects: [],
      selectedObjectIds: [],
    })
    const plan = parseStageText('给我一张圆桌', buildContext)
    const build = {
      id: crypto.randomUUID(),
      parentId: null,
      createdAt: interaction.createdAt,
      input: '给我一张圆桌',
      sceneVersion: 'legacy-build-version',
      context: buildContext,
      plan,
      originalPlan: structuredClone(plan),
      previewedPlan: null,
      status: 'proposed',
      finalSceneVersion: null,
      privateProjectData: true,
      trainingAuthorized: false,
    }
    const thread = StoredConversationSchema.parse({
      sceneId: 'legacy-build-scene',
      storageRevision: 7,
      thread: {
        ...createRehearsalThread('legacy-build-scene', build.sceneVersion),
        selectedProposalId: build.id,
        status: 'proposal-ready',
      },
      script: '',
      directorIntention: '',
      draft: '尚未发送的旧输入',
      suggestions: [],
      editing: false,
      note: '旧搭台对话',
      builds: [build],
      activeBuildId: build.id,
    })
    const invalidInteraction = {
      ...interaction,
      interactionId: 'invalid-envelope-interaction',
      sceneId: 'damaged-scene',
      envelope: { schemaVersion: 999, interactionId: 'keep-invalid-reference' },
    }
    const invalidThread = {
      ...thread,
      sceneId: 'damaged-thread',
      thread: { ...thread.thread, sceneId: 'damaged-thread' },
      builds: [{ ...build, envelope: { schemaVersion: 999, originalUnknownField: ['keep', 1] } }],
    }

    const opening = indexedDB.open('diastage-rehearsal-feedback', 2)
    opening.onupgradeneeded = () => {
      for (const [name, keyPath] of OLD_STORES)
        opening.result.createObjectStore(name, { keyPath }).createIndex('sceneId', 'sceneId')
    }
    const old = await result(opening)
    opened.push(old)
    expect(old.version).toBe(2)
    expect(old.objectStoreNames.contains('build-events')).toBe(false)
    const tx = old.transaction(
      OLD_STORES.map(([name]) => name),
      'readwrite',
    )
    tx.objectStore('interactions').put(interaction)
    tx.objectStore('interactions').put(invalidInteraction)
    tx.objectStore('events').put(feedback)
    tx.objectStore('threads').put(thread)
    tx.objectStore('threads').put(invalidThread)
    tx.objectStore('consent').put({
      sceneId: context.sceneId,
      trainingAuthorized: false,
      privateProjectData: true,
      updatedAt: interaction.createdAt,
    })
    tx.objectStore('product-events').put({
      eventId: 'legacy-product-event',
      sceneId: context.sceneId,
      threadId: null,
      interactionId: interaction.interactionId,
      proposalId: interaction.proposals[0]!.proposalId,
      sceneVersion: interaction.sceneVersion,
      name: 'proposal_generated',
      createdAt: interaction.createdAt,
      privateProjectData: true,
      trainingAuthorized: false,
      trainingEligible: false,
    })
    await completed(tx)
    const rawBefore = await rawRecords(old)

    // Versions actually live in the scene checkpoint, not in a feedback Version store.
    const graph = createTheatreSceneGraph('旧版本场地')
    const site = graph.nodes[graph.rootNodeIds[0]!]!
    const document = StageSceneDocumentSchema.parse(site.metadata.diastageTheatre)
    const version = RehearsalVersionSchema.parse({
      id: 'legacy-version',
      name: '旧场景保留版',
      createdAt: interaction.createdAt,
      note: '原来的手动记录',
      interactionId: interaction.interactionId,
      stageGraph: structuredClone(graph),
      venue: document.venue,
      rehearsalSimulation: document.rehearsalSimulation,
      cameraState: { project: { version: 1, shots: [] }, selectedId: null },
      displayState: {
        viewMode: '3d',
        theme: 'studio',
        textures: true,
        shading: 'solid',
        showGrid: true,
        showGuides: true,
        showRoutes: true,
        showCameras: false,
      },
    })
    site.metadata.diastageRehearsalVersions = [version]
    const journalOpening = indexedDB.open('diastage-scene-journal', 2)
    journalOpening.onupgradeneeded = () => {
      journalOpening.result.createObjectStore('heads', { keyPath: 'id' })
      journalOpening.result.createObjectStore('checkpoints')
      journalOpening.result.createObjectStore('transactions', { keyPath: ['id', 'sequence'] })
      journalOpening.result.createObjectStore('receipts', { keyPath: ['id', 'eventId'] })
    }
    const journal = await result(journalOpening)
    opened.push(journal)
    const journalTx = journal.transaction('checkpoints', 'readwrite')
    journalTx.objectStore('checkpoints').put(graph, context.sceneId)
    await completed(journalTx)
    const versionBefore = await result(
      journal.transaction('checkpoints').objectStore('checkpoints').get(context.sceneId),
    )
    old.close()

    const upgraded = await openRehearsalLog()
    opened.push(upgraded)
    expect(upgraded.version).toBe(3)
    expect([...upgraded.objectStoreNames]).toEqual(
      [...OLD_STORES.map(([name]) => name), 'build-events'].sort(),
    )
    for (const [name, keyPath] of OLD_STORES) {
      const store = upgraded.transaction(name).objectStore(name)
      expect(store.keyPath).toBe(keyPath)
      expect(store.index('sceneId').keyPath).toBe('sceneId')
    }
    expect(
      await result(upgraded.transaction('build-events').objectStore('build-events').count()),
    ).toBe(0)
    expect(await rawRecords(upgraded)).toEqual(rawBefore)
    expect(JSON.stringify(await rawRecords(upgraded))).toBe(JSON.stringify(rawBefore))
    const log = await readFeedbackLog(context.sceneId)
    expect(log.interactions).toEqual([InteractionSchema.parse(interaction)])
    expect(log.events).toEqual([feedback])
    expect(log.buildEvents).toEqual([])
    expect(await readConversation(thread.sceneId)).toEqual(thread)
    expect((await readConversation(thread.sceneId))!.builds[0]!.envelope).toBeUndefined()
    await expect(readFeedbackLog(invalidInteraction.sceneId)).rejects.toThrow()
    await expect(readConversation(invalidThread.sceneId)).rejects.toThrow()
    expect(await rawRecords(upgraded)).toEqual(rawBefore)
    expect(
      await result(
        journal.transaction('checkpoints').objectStore('checkpoints').get(context.sceneId),
      ),
    ).toEqual(versionBefore)
    expect(RehearsalVersionSchema.parse(version).source).toBeUndefined()
    expect(RehearsalVersionSchema.parse(version).interactionId).toBe(interaction.interactionId)
    expect(journal.version).toBe(2)
  } finally {
    for (const db of opened) db.close()
    globalThis.indexedDB = previousFactory
    globalThis.IDBKeyRange = previousRange
  }
})
