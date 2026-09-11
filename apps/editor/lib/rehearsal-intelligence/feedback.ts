import { type Feedback, FeedbackSchema, type Interaction, InteractionSchema } from './schema'

function openLog(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('diastage-rehearsal-feedback', 1)
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of [
        ['interactions', 'interactionId'],
        ['events', 'eventId'],
        ['consent', 'sceneId'],
      ] as const) {
        const store = request.result.createObjectStore(name, { keyPath })
        store.createIndex('sceneId', 'sceneId')
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('请关闭旧版窗口后重试反馈保存'))
  })
}
async function put(store: string, record: object) {
  const db = await openLog()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite', { durability: 'strict' })
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? new Error('反馈未保存，请检查本机存储空间'))
      tx.objectStore(store).put(record)
    })
  } finally {
    db.close()
  }
}
export const saveInteraction = (interaction: Interaction) =>
  put('interactions', InteractionSchema.parse({ ...interaction, trainingAuthorized: false }))
export const saveFeedback = (event: Feedback) => put('events', FeedbackSchema.parse(event))
export async function readFeedback(eventId: string) {
  const db = await openLog()
  try {
    return await new Promise<Feedback | null>((resolve, reject) => {
      const request = db.transaction('events').objectStore('events').get(eventId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        try {
          resolve(request.result ? FeedbackSchema.parse(request.result) : null)
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    db.close()
  }
}
export const saveTrainingConsent = (sceneId: string, trainingAuthorized: boolean) =>
  put('consent', {
    sceneId,
    trainingAuthorized,
    privateProjectData: true,
    updatedAt: new Date().toISOString(),
  })
export async function readFeedbackLog(sceneId: string) {
  const db = await openLog()
  try {
    const get = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).index('sceneId').getAll(sceneId)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const [interactions, events, consent] = await Promise.all([
      get('interactions'),
      get('events'),
      get('consent'),
    ])
    return {
      interactions: interactions
        .map((x) => InteractionSchema.parse(x))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      events: events
        .map((x) => FeedbackSchema.parse(x))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      consent,
    }
  } finally {
    db.close()
  }
}
export async function clearFeedbackLog(sceneId: string) {
  const db = await openLog()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['interactions', 'events', 'consent'], 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('反馈删除失败'))
      for (const name of ['interactions', 'events', 'consent']) {
        const cursor = tx.objectStore(name).index('sceneId').openCursor(sceneId)
        cursor.onsuccess = () => {
          const value = cursor.result
          if (value) {
            value.delete()
            value.continue()
          }
        }
      }
    })
  } finally {
    db.close()
  }
}
