import { expect, test } from 'bun:test'
import type { SceneGraph } from '@pascal-app/editor'
import { replayScenePatch, scenePatch } from './scene-journal'

test('1000-object journal stores only changed nodes and replays 100 offline commits exactly once', () => {
  const base: SceneGraph = {
    nodes: Object.fromEntries(
      Array.from({ length: 1000 }, (_, id) => [
        String(id),
        { position: [id, 0, 0], rotation: [0, 0, 0] },
      ]),
    ),
    rootNodeIds: ['0'],
  }
  let source = base,
    recovered = base
  for (let i = 0; i < 100; i++) {
    const next = {
      ...source,
      nodes: {
        ...source.nodes,
        [i]: { position: [i, 0.01 * i, -i], rotation: [0, Math.PI / 2, 0] },
      },
    }
    const patch = scenePatch(source, next)
    expect(Object.keys(patch.put)).toEqual([String(i)])
    recovered = replayScenePatch(recovered, patch)
    expect(replayScenePatch(recovered, patch)).toEqual(recovered)
    source = next
  }
  expect(recovered).toEqual({ ...source, collections: {}, materials: {}, installedPlugins: [] })
  expect(base.nodes['99']).toEqual({ position: [99, 0, 0], rotation: [0, 0, 0] })
  const deleted = { ...source, nodes: { ...source.nodes } }
  delete deleted.nodes['99']
  expect(replayScenePatch(source, scenePatch(source, deleted)).nodes['99']).toBeUndefined()
  expect(replayScenePatch(deleted, scenePatch(deleted, source)).nodes['99']).toEqual(
    source.nodes['99'],
  )
})

test('legacy architecture archive survives journal replay and a stair edit undo', async () => {
  const { archiveArchitecture } = await import('@pascal-app/core/scene-migrations')
  const { createStageStair, updateStageStair } = await import('@pascal-app/core/stage')
  const { SiteNode, BuildingNode, LevelNode, useScene, clearSceneHistory } = await import(
    '@pascal-app/core'
  )
  const { applySceneGraphToEditor } = await import('@pascal-app/editor')
  const { stair, segment } = createStageStair({}, 'level_legacy')
  const site = SiteNode.parse({ id: 'site_legacy', children: ['building_legacy'] })
  const building = BuildingNode.parse({
    id: 'building_legacy',
    parentId: site.id,
    children: ['level_legacy'],
  })
  const level = LevelNode.parse({
    id: 'level_legacy',
    parentId: building.id,
    children: [stair.id, 'roof_legacy', 'ceiling_legacy'],
  })
  const roof = {
    type: 'roof',
    id: 'roof_legacy',
    parentId: level.id,
    unknownSavedField: { keep: true },
    children: [],
  }
  const ceiling = {
    type: 'ceiling',
    id: 'ceiling_legacy',
    parentId: level.id,
    polygon: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    customLegacy: 42,
  }
  const original: SceneGraph = {
    nodes: Object.fromEntries(
      [site, building, level, stair, segment, roof, ceiling].map((n) => [n.id, n]),
    ),
    rootNodeIds: [site.id],
  }
  const raw = JSON.stringify(original)
  const archived = archiveArchitecture(original)
  useScene.getState().setReadOnly(false)
  applySceneGraphToEditor(original)
  expect(JSON.stringify(original)).toBe(raw)
  expect(useScene.getState().nodes).not.toHaveProperty(roof.id)
  expect(useScene.getState().nodes).not.toHaveProperty(ceiling.id)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  const loaded = useScene.getState().nodes
  useScene
    .getState()
    .applyNodeChanges({ update: updateStageStair(stair, loaded, { stepCount: 4 }) })
  const edited = useScene.getState()
  const recovered = replayScenePatch(archived, scenePatch(archived, edited))
  expect(recovered.nodes[site.id]).toMatchObject({
    metadata: {
      legacy: { architecture: { nodes: { roof_legacy: roof, ceiling_legacy: ceiling } } },
    },
  })
  applySceneGraphToEditor(recovered)
  expect(useScene.getState().nodes[segment.id]).toMatchObject({ stepCount: 4 })
  useScene.getState().applyNodeChanges({
    update: updateStageStair(
      useScene.getState().nodes[stair.id] as typeof stair,
      useScene.getState().nodes,
      { rotation: Math.PI / 2 },
    ),
  })
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes[stair.id]).toMatchObject({ rotation: 0 })
  expect(useScene.getState().nodes[site.id]?.metadata.legacy).toEqual(
    loaded[site.id]?.metadata.legacy,
  )
  useScene.getState().unloadScene()
  clearSceneHistory()
})
