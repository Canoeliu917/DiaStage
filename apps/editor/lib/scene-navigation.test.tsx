import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.SCENE_NAVIGATION_TEST) {
  test('scene entry retains the selected workspace and opens stage setup before creating', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, SCENE_NAVIGATION_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  let signedIn = false
  let returnTo = ''
  const scene = {
    id: 'navigation-test',
    name: '导航测试',
    thumbnailUrl: null,
    updatedAt: '2026-10-22T00:00:00Z',
  }
  mock.module('next/headers', () => ({ headers: async () => new Headers() }))
  mock.module('@/lib/auth/server', () => ({ getSession: async () => null }))
  mock.module('@/lib/scene-store-server', () => ({
    getScenePageOperations: async (_headers: Headers, next = '/scenes') => {
      returnTo = next
      if (!signedIn) throw new Error('login required')
      return { listScenes: async () => [scene], loadStoredScene: async () => null }
    },
  }))
  mock.module('@/components/account-panel', () => ({ AccountMenu: () => null }))
  mock.module('@/components/stage-entry/stage-drawing', () => ({ StageDrawing: () => null }))
  mock.module('@/components/studio-wordmark', () => ({ StudioWordmark: () => null }))
  mock.module('@/app/client-bootstrap', () => ({ ClientBootstrap: () => null }))
  mock.module('@/components/scene-loader', () => ({ SceneLoader: () => null }))
  mock.module('@/components/scene-owner-boundary', () => ({ SceneOwnerBoundary: () => null }))
  mock.module('@/components/photo-stage-builder', () => ({ PhotoStageBuilder: () => null }))

  const { default: ScenesPage } = await import('../app/scenes/page')
  const { default: ScenePage } = await import('../app/scene/[id]/page')
  const { default: PhotoStagePage } = await import('../app/photo-stage/page')
  const { CreateSceneButton } = await import('../components/save-button')
  type Element = { props?: Record<string, unknown> }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    return [element, ...elements(element.props?.children)]
  }

  for (const workspace of [undefined, 'set', 'remount', 'rehearse']) {
    const query = workspace ? `?workspace=${workspace}` : ''
    await assert.rejects(
      ScenesPage({ searchParams: Promise.resolve({ workspace }) }),
      /login required/,
    )
    assert.equal(returnTo, `/scenes${query}`)
    await assert.rejects(
      ScenePage({
        params: Promise.resolve({ id: scene.id }),
        searchParams: Promise.resolve({ workspace }),
      }),
      /login required/,
    )
    assert.equal(returnTo, `/scene/${scene.id}${query}`)

    signedIn = true
    const gallery = await ScenesPage({ searchParams: Promise.resolve({ workspace }) })
    assert.ok(elements(gallery).some((entry) => entry.props?.href === `/scene/${scene.id}${query}`))
    signedIn = false
  }
  const create = CreateSceneButton()
  assert.equal(create.props.href, '/?entry=manual&lit=1')
  assert.equal(create.props.children, '新建剧目')
  await assert.rejects(PhotoStagePage(), /login required/)
  assert.equal(returnTo, '/photo-stage')
}
