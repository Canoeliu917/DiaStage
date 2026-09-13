import { expect, test } from 'bun:test'
import { ItemNode, LevelNode, sceneRegistry, useLiveTransforms, useScene } from '@pascal-app/core'
import { SCENE_LAYER } from '@pascal-app/viewer'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { collectBatchCandidate, collectTintedNodes } from '../shared/node-batch/candidates'

test('folding scenery retains its joint tree instead of becoming a static merged batch', () => {
  const before = useScene.getState()
  const level = LevelNode.parse({})
  const item = ItemNode.parse({
    parentId: level.id,
    asset: {
      id: 'SCN-FLAT-090',
      name: '单帘景片',
      category: 'scenery',
      thumbnail: '/flat.png',
      src: '/flat.glb',
    },
  })
  const levelRoot = new Group()
  const itemRoot = new Group()
  const material = new MeshBasicMaterial()
  const geometry = new BoxGeometry()
  const mesh = new Mesh(geometry, material)
  mesh.layers.enable(SCENE_LAYER)
  itemRoot.userData.itemModelSettled = true
  itemRoot.add(mesh)
  levelRoot.add(itemRoot)
  sceneRegistry.nodes.set(level.id, levelRoot)
  sceneRegistry.nodes.set(item.id, itemRoot)
  try {
    useScene.setState({ nodes: { ...before.nodes, [level.id]: level, [item.id]: item } })
    expect(collectBatchCandidate(item.id)?.entries).toHaveLength(1)
    useLiveTransforms.getState().set(item.id, { position: [2, 0, 3], rotation: 0 })
    expect(collectBatchCandidate(item.id)).toBeNull()
    expect(collectTintedNodes(new Set([item.id])).has(item.id)).toBe(true)
    useLiveTransforms.getState().clear(item.id)
    expect(collectBatchCandidate(item.id)?.entries).toHaveLength(1)
    for (const id of ['SCN-FOLD-02', 'SCN-FOLD-03']) {
      useScene.setState({
        nodes: {
          ...before.nodes,
          [level.id]: level,
          [item.id]: { ...item, asset: { ...item.asset, id } },
        },
      })
      expect(collectBatchCandidate(item.id)).toBeNull()
      expect(itemRoot.children).toEqual([mesh])
      expect(mesh.layers.isEnabled(SCENE_LAYER)).toBe(true)
    }
  } finally {
    useLiveTransforms.getState().clear(item.id)
    useScene.setState({ nodes: before.nodes })
    sceneRegistry.nodes.delete(level.id)
    sceneRegistry.nodes.delete(item.id)
    material.dispose()
    geometry.dispose()
  }
})
