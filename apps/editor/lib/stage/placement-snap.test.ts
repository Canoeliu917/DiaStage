import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ItemNode, sceneRegistry, useScene } from '@pascal-app/core'
import type { SceneContextObject, SceneContextSummary } from '@pascal-app/core/stage'
import { Group, Mesh } from 'three'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { snapStageObject } from './placement-snap'
import { AVAILABLE_STAGE_SCENERY } from './prop-assets'

const item: SceneContextObject = {
  id: 'flat-moving',
  name: '景片',
  kind: 'scenic-flat',
  dimensionsMeters: { width: 0.9, height: 2.8, depth: 0.08 },
  transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
}
const context: SceneContextSummary = {
  documentVersion: 1,
  selectedObjectIds: [],
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 3 },
  objects: [{ ...item, id: 'flat-stationary' }],
}

test('scenery catches the actual touching edge without a clearance offset', () => {
  const result = snapStageObject({ x: 0.96, y: 0, z: 3 }, item, context, {
    grid: 0.1,
    guides: true,
  })
  expect(result.position.x).toBeCloseTo(0.9)
  expect(result.position.z).toBeCloseTo(3)
  expect(result.labels).toContain('贴合 景片')
})

test('free mode preserves fractional input and overlaps remain placeable', () => {
  const point = { x: 0.1274, y: 0, z: 3.031 }
  expect(snapStageObject(point, item, context, { grid: 0, guides: false }).position).toEqual(point)
  expect(
    snapStageObject({ x: 0.2, y: 0, z: 3 }, item, context, { grid: 0.1, guides: true }).position.x,
  ).toBeCloseTo(0.2)
})

test('rotated scenery snaps its footprint while preserving its dimensions and pose', () => {
  const rotated = {
    ...item,
    transform: { ...item.transform, rotationDegrees: { x: 0, y: 90, z: 0 } },
  }
  const before = JSON.stringify(rotated)
  const result = snapStageObject({ x: 0.55, y: 0, z: 3 }, rotated, context, {
    grid: 0,
    guides: true,
  })
  expect(result.position.x).toBeCloseTo(0.49)
  expect(JSON.stringify(rotated)).toBe(before)
})

test('overlapping real folding panels never snap into an internal frame member', async () => {
  const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === 'SCN-FOLD-02')!.asset
  const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url))
  const model = (
    await new ItemGLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene
  const nodes = [ItemNode.parse({ asset }), ItemNode.parse({ asset })]
  const before = useScene.getState().nodes
  for (const node of nodes) {
    const root = new Group()
    root.userData.itemModelSettled = true
    root.add(model.clone(true))
    sceneRegistry.nodes.set(node.id, root)
  }
  useScene.setState({
    nodes: { ...before, ...Object.fromEntries(nodes.map((node) => [node.id, node])) },
  })
  try {
    const moving = { ...item, id: nodes[0]!.id }
    const target = { ...item, id: nodes[1]!.id }
    const point = { x: -0.92, y: 0, z: 3.04 }
    expect(
      snapStageObject(point, moving, { ...context, objects: [target] }, { grid: 0, guides: true })
        .position,
    ).toEqual(point)
  } finally {
    useScene.setState({ nodes: before })
    for (const node of nodes) sceneRegistry.nodes.delete(node.id)
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        material.dispose()
    })
  }
})
