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
