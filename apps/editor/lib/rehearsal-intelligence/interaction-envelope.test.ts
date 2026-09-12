import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { evalContext } from './eval'
import { EVAL_CASES } from './eval-cases'
import { openRehearsalLog, readFeedbackLog, saveFeedback, saveInteraction } from './feedback'
import { InteractionEnvelopeSchema, readInteractionEnvelope } from './interaction-envelope'
import { createInteraction } from './proposal-generator'
import { type Feedback, FeedbackSchema, InteractionSchema } from './schema'

const envelope = {
  schemaVersion: 1,
  interactionId: 'interaction-a',
  sceneId: 'scene-a',
  capability: 'build',
  sceneVersion: 'source-scene-v1',
  status: 'proposed',
  createdAt: '2026-09-12T00:00:00.000Z',
} as const

test('one reference envelope supports separate capabilities without accepting business payloads', () => {
  for (const capability of ['build', 'rehearse', 'remount'] as const) {
    const value = { ...envelope, capability, parentInteractionId: 'parent-a' }
    expect(InteractionEnvelopeSchema.parse(value)).toEqual(value)
  }
  expect(InteractionEnvelopeSchema.safeParse({ ...envelope, arbitraryPlan: {} }).success).toBe(
    false,
  )
  expect(InteractionEnvelopeSchema.safeParse({ ...envelope, capability: 'agent' }).success).toBe(
    false,
  )
})

test('legacy absence is readable without changing it; malformed or unsupported envelopes throw', () => {
  const legacy = { interactionId: 'legacy-a', arbitraryOldPayload: { keep: true } }
  const before = JSON.stringify(legacy)
  expect(readInteractionEnvelope(Reflect.get(legacy, 'envelope'))).toBeNull()
  expect(JSON.stringify(legacy)).toBe(before)
  for (const raw of [null, {}, { ...envelope, schemaVersion: 2 }, { ...envelope, sceneId: '' }])
    expect(() => readInteractionEnvelope(raw)).toThrow()
})

test('applied and stale references retain their original input version and creation time', () => {
  for (const status of ['prepared', 'applied', 'stale'] as const) {
    expect(readInteractionEnvelope({ ...envelope, status })).toMatchObject({
      sceneVersion: envelope.sceneVersion,
      createdAt: envelope.createdAt,
      status,
    })
  }
})

test('existing IndexedDB records remain readable and unchanged; new references survive save and invalid ones cannot be hidden', async () => {
  const context = { ...evalContext(EVAL_CASES[0]!.caseId), sceneId: crypto.randomUUID() }
  const interaction = createInteraction(
    context,
    {
      dramaticState: [],
      proposals: [
        {
          title: '保留当前站位',
          intention: '先保留当前处理',
          rationale: '保留位置供导演决定',
          suggestions: [
            {
              id: 'suggestion-a',
              performerId: context.performers[0]!.id,
              intention: '保持当前站位',
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
    'synthetic-envelope-test',
  )
  const event: Feedback = {
    eventId: crypto.randomUUID(),
    interactionId: interaction.interactionId,
    proposalId: interaction.proposals[0]!.proposalId,
    sceneId: context.sceneId,
    createdAt: new Date().toISOString(),
    previewed: false,
    decision: 'reject',
    originalProposal: interaction.proposals[0]!,
    previewedProposal: null,
    privateProjectData: true,
    trainingAuthorized: false,
    rightsStatus: 'unknown',
    trainingEligible: false,
    humanEdit: null,
    finalResult: null,
    reasonTags: [],
    optionalUserNote: '',
    status: 'recorded',
  }
  const legacy = structuredClone(interaction)
  delete legacy.envelope
  await saveInteraction(legacy)
  await saveFeedback(event)
  const before = await readFeedbackLog(context.sceneId)
  expect(before.interactions).toEqual([legacy])
  expect(before.events).toEqual([event])
  expect(before.interactions[0]!.envelope).toBeUndefined()
  expect(before.events[0]!.envelope).toBeUndefined()
  await saveInteraction(interaction)
  await saveFeedback({ ...event, status: 'prepared', envelope: interaction.envelope })
  const after = await readFeedbackLog(context.sceneId)
  expect(after.interactions[0]!.envelope).toEqual(interaction.envelope)
  expect(after.events[0]!.envelope).toMatchObject({
    interactionId: interaction.interactionId,
    status: 'prepared',
  })
  expect(after.events[0]!.status).toBe('prepared')
  expect(
    InteractionSchema.safeParse({
      ...interaction,
      envelope: { ...interaction.envelope, interactionId: 'foreign' },
    }).success,
  ).toBe(false)
  expect(
    FeedbackSchema.safeParse({
      ...event,
      envelope: { ...interaction.envelope, sceneId: 'foreign' },
    }).success,
  ).toBe(false)

  const invalid = { ...legacy, envelope: { ...interaction.envelope, schemaVersion: 999 } }
  const db = await openRehearsalLog()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('interactions', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('interactions').put(invalid)
    })
    await expect(readFeedbackLog(context.sceneId)).rejects.toThrow()
    const persisted = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction('interactions')
        .objectStore('interactions')
        .get(legacy.interactionId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect(persisted).toEqual(invalid)
  } finally {
    db.close()
  }
})
