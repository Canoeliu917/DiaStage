import { expect, test } from 'bun:test'
import { SceneMaterial } from '@pascal-app/core/schema'
import { createSceneCopy, parseSceneBackup } from './scene-backup'
import { createTheatreSceneGraph } from './theatre/new-production'
import { THEATRE_METADATA_KEY } from './theatre/scene-adapter'
import { readStageDocument } from './theatre/simulation-store'

test('backup import validates the existing scene format and retains palette, collections and plugins', () => {
  const graph = createTheatreSceneGraph('备份剧目')
  graph.collections = {
    collection_kept: { id: 'collection_kept', name: '保留分组', nodeIds: [] },
  } as typeof graph.collections
  graph.materials = {
    mat_kept: SceneMaterial.parse({
      id: 'mat_kept',
      name: '保留材质',
      material: { preset: 'custom', properties: { color: '#ff0000' } },
    }),
  }
  graph.installedPlugins = ['test:plugin']
  const text = JSON.stringify(graph)
  const parsed = parseSceneBackup(text)
  expect(parsed.graph.nodes).toEqual(graph.nodes)
  expect(parsed.graph.collections).toEqual(graph.collections)
  expect(parsed.graph.materials).toEqual(graph.materials)
  expect(parsed.graph.installedPlugins).toEqual(graph.installedPlugins)
  expect(() => parseSceneBackup('{')).toThrow('无法解析为 JSON')
  expect(() => parseSceneBackup(JSON.stringify({ nodes: {}, rootNodeIds: [] }))).toThrow('无法导入')
  const unsafe = structuredClone(graph)
  unsafe.nodes.foreign = {
    id: 'foreign',
    type: 'custom:item',
    metadata: { url: 'javascript:alert(1)' },
  } as never
  expect(() => parseSceneBackup(JSON.stringify(unsafe))).toThrow('资源地址')
  const brokenCollections = {
    ...graph,
    collections: {
      collection_broken: { id: 'collection_broken', name: '坏引用', nodeIds: ['missing'] },
    },
  }
  expect(() => parseSceneBackup(JSON.stringify(brokenCollections))).toThrow('分组')
  expect(JSON.stringify(graph)).toBe(text)
})

test('recovery creates an independent scene and leaves its source intact on success or failure', async () => {
  const originalFetch = globalThis.fetch
  const graph = createTheatreSceneGraph('原剧目')
  const before = JSON.stringify(graph)
  const calls: { path: string; init: RequestInit }[] = []
  try {
    globalThis.fetch = (async (path, init = {}) => {
      calls.push({ path: String(path), init })
      return Response.json({ id: 'recovered-scene' }, { status: 201 })
    }) as typeof fetch
    expect(await createSceneCopy(graph, '恢复的副本')).toBe('/scene/recovered-scene')
    expect(calls[0]?.path).toBe('/api/scenes')
    expect(calls[0]?.init.method).toBe('POST')
    const submitted = JSON.parse(String(calls[0]?.init.body))
    expect(submitted.name).toBe('恢复的副本')
    expect(
      readStageDocument(submitted.graph.nodes, submitted.graph.rootNodeIds)?.production.name,
    ).toBe('恢复的副本')
    expect(readStageDocument(graph.nodes, graph.rootNodeIds)?.production.name).toBe('原剧目')
    const originalSite = graph.nodes[graph.rootNodeIds[0]!]!
    const copiedSite = submitted.graph.nodes[graph.rootNodeIds[0]!]
    expect(copiedSite.metadata[THEATRE_METADATA_KEY].venue).toEqual(
      (originalSite.metadata[THEATRE_METADATA_KEY] as { venue: unknown }).venue,
    )
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch
    await expect(createSceneCopy(graph, '失败的副本')).rejects.toThrow('本机记录仍保留')
    expect(JSON.stringify(graph)).toBe(before)
  } finally {
    globalThis.fetch = originalFetch
  }
})
