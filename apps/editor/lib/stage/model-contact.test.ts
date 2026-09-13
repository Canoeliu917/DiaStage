import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type AnyNodeId, type ItemNode, sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { stageContactIds } from './contacts'
import { stageModelContact } from './model-contact'

test('loaded model contacts preserve visible gaps and follow target poses including containment', () => {
  const previous = useScene.getState().nodes
  const revision = useViewer.getState().geometryRevision
  const id = 'item_contact-test' as AnyNodeId
  const node = {
    id,
    type: 'item',
    asset: {},
    scale: [1, 1, 1],
    children: [],
  } as unknown as ItemNode
  const nodes = { ...previous, [id]: node }
  useScene.setState({ nodes })
  const root = new Group()
  root.position.set(19, 6, -23)
  root.rotation.set(0.2, 1.1, -0.3)
  root.userData.itemModelSettled = true
  sceneRegistry.nodes.set(id, root)
  const model = {
    id,
    kind: 'neutral-block' as const,
    dimensionsMeters: { width: 1.6, height: 1.3, depth: 1.3 },
    transform: { position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
  const probe = {
    ...model,
    id: 'probe',
    dimensionsMeters: { width: 0.1, height: 0.1, depth: 0.1 },
    transform: { position: { x: 0, y: 0.3, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
  const tableGeometry = mergeGeometries([
    new BoxGeometry(1.6, 0.1, 1.3).translate(0, 1.25, 0),
    ...[-0.7, 0.7].flatMap((x) =>
      [-0.5, 0.5].map((z) => new BoxGeometry(0.1, 1.2, 0.1).translate(x, 0.6, z)),
    ),
  ])!
  root.add(new Mesh(tableGeometry, new MeshBasicMaterial()))
  const hitbox = new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial({ visible: false }))
  root.add(hitbox)
  try {
    assert.equal(
      stageModelContact(model, probe),
      false,
      'space under a table is not a solid bounding box',
    )
    assert.equal(
      stageContactIds([model, probe]).size,
      0,
      'all synchronized views use precise model contacts',
    )
    probe.transform.position.x = 0.7
    probe.transform.position.z = 0.5
    assert.equal(
      stageModelContact(model, {
        ...probe,
        dimensionsMeters: { width: 0.02, height: 0.02, depth: 0.02 },
      }),
      true,
      'small prop entirely inside a table leg is contact',
    )
    probe.transform.position.x = 0.8
    assert.equal(
      stageModelContact(model, probe),
      true,
      'touching the visible leg surface is contact',
    )
    probe.transform.position.x = 0.801
    assert.equal(
      stageModelContact(model, probe),
      false,
      'there is no minimum spacing beyond the mesh',
    )
    model.transform.position.x = 5
    model.transform.rotationDegrees.y = 90
    probe.transform.position.x = 5.5
    probe.transform.position.z = -0.7
    assert.equal(
      stageModelContact(model, probe),
      true,
      'target translation and rotation override the mounted root pose',
    )
    root.position.set(-90, 4, 150)
    root.rotation.set(0, -2, 0)
    assert.equal(
      stageModelContact(model, probe),
      true,
      'rendered movement cannot move the collision origin twice',
    )
    root.userData.itemModelSettled = false
    assert.equal(
      stageModelContact(model, probe),
      null,
      'unloaded model defers to fallback geometry',
    )
    root.userData.itemModelSettled = true
    root.children[0]!.scale.set(4, 1, 4)
    useViewer.getState().bumpGeometryRevision()
    assert.equal(
      stageModelContact(model, probe),
      false,
      'geometry readiness invalidation refreshes model-local matrices',
    )
    assert.equal(useScene.getState().nodes, nodes, 'contact feedback never writes the scene')
  } finally {
    sceneRegistry.nodes.delete(id)
    useScene.setState({ nodes: previous })
    useViewer.setState({ geometryRevision: revision })
    tableGeometry.dispose()
    hitbox.geometry.dispose()
  }
})
