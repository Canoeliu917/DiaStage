import { afterEach, expect, test } from 'bun:test'
import { parseStageText, type SceneContextSummary } from '@pascal-app/core/stage'
import { groundStageAssets } from '@/lib/stage/ground-assets'
import { applyReviewedPlan } from './command-input'

const context: SceneContextSummary = {
  documentVersion: 0,
  venue: { type: 'proscenium', widthMeters: 12, depthMeters: 8, heightMeters: 5 },
  objects: [],
  selectedObjectIds: [],
}
const originalFetch = globalThis.fetch
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'sessionStorage')
})

test('typed and voice local drafts reject the retired asset before confirmation can save an empty scene', async () => {
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    throw new Error('retired plans must not create scenes')
  }) as typeof fetch
  for (const source of ['typed-command', 'voice'] as const) {
    const parsed = parseStageText('添加单帘景片', context, [], source)!
    const local = groundStageAssets(parsed)
    expect(local.items).toEqual([])
    expect(local.questions[0]!.message).toContain('当前不在可选舞台库')
    await expect(
      applyReviewedPlan({ ...parsed, venue: context.venue }, context, 'retired'),
    ).rejects.toThrow('当前不可选')
  }
  expect(requests).toBe(0)
})

test('a selectable local draft still creates the pending plan and new scene through the normal path', async () => {
  const pending = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      setItem: (key: string, value: string) => pending.set(key, value),
      removeItem: (key: string) => pending.delete(key),
    },
  })
  const requests: string[] = []
  globalThis.fetch = (async (url: string | URL | Request) => {
    requests.push(String(url))
    return Response.json({ id: 'local-only-test' })
  }) as typeof fetch
  const plan = groundStageAssets(parseStageText('添加圆桌', context)!)
  const path = await applyReviewedPlan({ ...plan, venue: context.venue }, context, 'allowed')
  expect(path).toMatch(/^\/scene\/.+\?workspace=set&applyPlan=1$/)
  expect(requests).toEqual(['/api/scenes'])
  expect(pending.size).toBe(1)
  const saved = JSON.parse([...pending.values()][0]!)
  expect(saved.plan.items[0].libraryAssetId).toBe('SCN-TABLE-090')
})
