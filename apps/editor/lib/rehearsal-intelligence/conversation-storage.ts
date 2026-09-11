import { z } from 'zod'
import { RehearsalThreadSchema } from './conversation'
import { openRehearsalLog } from './feedback'
import { SuggestionSchema } from './schema'

export const StoredConversationSchema = z.strictObject({
  sceneId: z.string().min(1),
  storageRevision: z.number().int().nonnegative(),
  thread: RehearsalThreadSchema,
  script: z.string().max(12000),
  directorIntention: z.string().max(2000),
  draft: z.string().max(2000),
  suggestions: z.array(SuggestionSchema).max(12),
  editing: z.boolean(),
  note: z.string().max(1000),
})
export type StoredConversation = z.infer<typeof StoredConversationSchema>

export const ProductEventSchema = z.strictObject({
  eventId: z.string().min(1),
  sceneId: z.string().min(1),
  threadId: z.string().nullable(),
  interactionId: z.string().nullable(),
  proposalId: z.string().nullable(),
  sceneVersion: z.string(),
  createdAt: z.iso.datetime(),
  name: z.enum([
    'dia_message_sent',
    'proposal_generated',
    'proposal_previewed',
    'proposal_switched',
    'proposal_adopted',
    'proposal_partial',
    'proposal_edited',
    'proposal_rejected',
    'post_adopt_manual_edit',
    'post_adopt_undo',
  ]),
  privateProjectData: z.literal(true),
  trainingAuthorized: z.literal(false),
  trainingEligible: z.literal(false),
})
export type ProductEvent = z.infer<typeof ProductEventSchema>

export async function readConversation(sceneId: string): Promise<StoredConversation | null> {
  const db = await openRehearsalLog()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('threads').objectStore('threads').get(sceneId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        try {
          resolve(request.result ? StoredConversationSchema.parse(request.result) : null)
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    db.close()
  }
}

export async function saveConversation(raw: StoredConversation): Promise<number> {
  const record = StoredConversationSchema.parse(raw)
  if (record.thread.sceneId !== record.sceneId) throw new Error('对话与当前场景不一致')
  const db = await openRehearsalLog()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('threads', 'readwrite', { durability: 'strict' })
      let failure: Error | null = null
      tx.oncomplete = () => resolve(record.storageRevision + 1)
      tx.onabort = tx.onerror = () =>
        reject(
          failure ??
            tx.error ??
            new Error('对话未能保存在本机，请检查存储空间。正式舞台不受影响。'),
        )
      const store = tx.objectStore('threads')
      const current = store.get(record.sceneId)
      current.onsuccess = () => {
        const previous = current.result ? StoredConversationSchema.safeParse(current.result) : null
        if (
          (previous && !previous.success) ||
          (previous?.data?.storageRevision ?? 0) !== record.storageRevision
        ) {
          failure = new Error('另一窗口更新了这段对话，请刷新后继续；当前舞台已保留。')
          tx.abort()
          return
        }
        store.put({ ...record, storageRevision: record.storageRevision + 1 })
      }
    })
  } finally {
    db.close()
  }
}

export async function saveProductEvent(raw: ProductEvent) {
  const event = ProductEventSchema.parse(raw)
  const db = await openRehearsalLog()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('product-events', 'readwrite', { durability: 'strict' })
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error)
      tx.objectStore('product-events').put(event)
    })
  } finally {
    db.close()
  }
}

export async function readProductEvents(sceneId: string) {
  const db = await openRehearsalLog()
  try {
    return await new Promise<ProductEvent[]>((resolve, reject) => {
      const request = db
        .transaction('product-events')
        .objectStore('product-events')
        .index('sceneId')
        .getAll(sceneId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        try {
          resolve(z.array(ProductEventSchema).parse(request.result))
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    db.close()
  }
}
