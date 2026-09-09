import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const origin = 'http://127.0.0.1:4318'
const sceneId = 'empty-table-camera'

async function seed(checkOnly = false) {
  const headers = new Headers({ Origin: origin })
  if (process.env.PASCAL_SCENE_API_TOKEN) {
    headers.set('x-pascal-scene-token', process.env.PASCAL_SCENE_API_TOKEN)
  }
  const existing = await fetch(`${origin}/api/scenes/${sceneId}`, { headers })
  if (existing.ok) return 'Scene already exists; nothing changed.'
  if (existing.status !== 404) throw new Error(`Scene lookup failed: HTTP ${existing.status}`)
  if (checkOnly) return 'Scene is absent; check-only mode made no changes.'

  const graph = JSON.parse(
    await readFile(new URL('../examples/empty-table.json', import.meta.url), 'utf8'),
  )
  headers.set('Content-Type', 'application/json')
  const response = await fetch(`${origin}/api/scenes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: sceneId, name: '空桌 · 镜场', graph }),
  })
  if (!response.ok) throw new Error(`Scene creation failed: HTTP ${response.status}`)
  return `Scene created: ${origin}/scene/${sceneId}`
}

if (process.argv.includes('--self-test')) {
  const originalFetch = globalThis.fetch
  let getStatus = 200
  let posts = 0
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === 'POST') {
      posts++
      const body = JSON.parse(String(init.body))
      assert.equal(body.id, sceneId)
      assert.ok(Object.keys(body.graph.nodes).length > 0)
      return new Response('{}', { status: 201 })
    }
    return new Response('{}', { status: getStatus })
  }) as typeof fetch
  try {
    await seed()
    assert.equal(posts, 0)
    getStatus = 404
    await seed(true)
    assert.equal(posts, 0)
    await seed()
    assert.equal(posts, 1)
    getStatus = 500
    await assert.rejects(seed(), /HTTP 500/)
    assert.equal(posts, 1)
    console.log('Seed check passed: existing scenes and lookup failures never trigger a POST.')
  } finally {
    globalThis.fetch = originalFetch
  }
} else {
  try {
    console.log(await seed(process.argv.includes('--check')))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
