import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ItemNode, sceneRegistry, useScene } from '@pascal-app/core'
import type { SceneContextObject, SceneContextSummary } from '@pascal-app/core/stage'
import { Group, Mesh } from 'three'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { stageContextObject } from './context'
import {
  stageModelBottom,
  stageModelContact,
  stageModelTop,
  stageVisibleFootprints,
} from './model-contact'
import { snapMatchingStageObject, snapStageObject } from './placement-snap'
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

test('actual riser, timber and cube models align both flat and standing with zero surface gap', async () => {
  const saved = useScene.getState().nodes
  for (const assetId of [
    'SCN-RISER-01',
    'SCN-RISER-02',
    'SCN-RISER-03',
    'SCN-TIMBER-060',
    'SCN-CUBE-045',
  ]) {
    const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)!.asset
    const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url))
    const model = (
      await new ItemGLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      )
    ).scene
    const a = ItemNode.parse({ asset }),
      b = ItemNode.parse({ asset })
    const nodes = { ...saved, [a.id]: a, [b.id]: b }
    useScene.setState({ nodes })
    for (const node of [a, b]) {
      const root = new Group()
      root.userData.itemModelSettled = true
      root.add(model.clone(true))
      sceneRegistry.nodes.set(node.id, root)
    }
    try {
      for (const z of [0, Math.PI / 2]) {
        const frame = { origin: [0, 0, 0] as [number, number, number], depthMeters: 6 }
        const moving = stageContextObject({ ...a, rotation: [0, 0, z] }, nodes, frame)!
        moving.transform.position.y = -stageModelBottom(moving)! || 0
        const target = { ...moving, id: b.id, transform: structuredClone(moving.transform) }
        const footprint = stageVisibleFootprints(target).flat()
        const width =
          Math.max(...footprint.map(([x]) => x)) - Math.min(...footprint.map(([x]) => x))
        const point = {
          x: target.transform.position.x + width + 0.06,
          y: moving.transform.position.y,
          z: target.transform.position.z + 0.07,
        }
        const result = snapStageObject(
          point,
          moving,
          { ...context, objects: [target] },
          { grid: 0.1, guides: true },
        )
        const placed = { ...moving, transform: { ...moving.transform, position: result.position } }
        expect(result.labels).toContain('同款对齐')
        expect(result.position.x).toBeCloseTo(target.transform.position.x + width, 7)
        expect(result.position.z).toBeCloseTo(target.transform.position.z, 7)
        expect(result.position.y).toBe(moving.transform.position.y)
        expect(stageModelContact(placed, target, true)).toBe(false)
        const top = stageModelTop(target)! + target.transform.position.y
        const raised = {
          ...moving,
          transform: {
            ...moving.transform,
            position: { x: 0.07, y: top - stageModelBottom(moving)! + 0.05, z: 3.08 },
          },
        }
        const stack = snapMatchingStageObject(raised, [target], true)!
        expect(stack, `${assetId} rotation ${z}`).not.toBeNull()
        const stacked = { ...raised, transform: { ...raised.transform, position: stack.position } }
        expect(stack.position.y + stageModelBottom(stacked)!).toBeCloseTo(top, 8)
        expect(stack.position.x).toBeCloseTo(target.transform.position.x, 8)
        expect(stack.position.z).toBeCloseTo(target.transform.position.z, 8)
        expect(stageModelContact(stacked, target, true)).toBe(false)
      }
      expect(useScene.getState().nodes).toBe(nodes)
    } finally {
      for (const node of [a, b]) sceneRegistry.nodes.delete(node.id)
      useScene.setState({ nodes: saved })
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.geometry.dispose()
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          material.dispose()
      })
    }
  }
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

test('same-type props align rows and columns without lifting a lateral drag or writing Scene', () => {
  const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === 'SCN-CUBE-045')!.asset
  const a = ItemNode.parse({ asset }),
    b = ItemNode.parse({ asset })
  const saved = useScene.getState().nodes
  useScene.setState({ nodes: { ...saved, [a.id]: a, [b.id]: b } })
  const same: SceneContextObject = {
    ...item,
    id: a.id,
    kind: 'platform',
    dimensionsMeters: { width: 0.45, height: 0.45, depth: 0.45 },
    transform: { ...item.transform, position: { x: 0, y: 0, z: 3 } },
  }
  const target = { ...same, id: b.id }
  const scene = { ...context, objects: [target] }
  const before = useScene.getState().nodes
  try {
    for (const point of [
      { x: 0.51, y: 0, z: 3.08 },
      { x: 0.44, y: 0, z: 3.05 },
    ]) {
      const result = snapStageObject(point, same, scene, { grid: 0.1, guides: true })
      expect(result.position.x).toBeCloseTo(0.45, 12)
      expect(result.position.y).toBe(0)
      expect(result.position.z).toBe(3)
      expect(result.labels.join()).toContain('同款对齐')
      expect(
        snapStageObject(result.position, same, scene, { grid: 0.5, guides: true }).position,
      ).toEqual(result.position)
    }
    const raised = {
      ...same,
      transform: { ...same.transform, position: { x: 0.07, y: 0.49, z: 3.09 } },
    }
    for (const result of [
      snapMatchingStageObject(raised, [target], true)!,
      snapStageObject(raised.transform.position, raised, scene, { grid: 0.1, guides: true }),
    ]) {
      expect(result.position.x).toBeCloseTo(0, 12)
      expect(result.position.y).toBeCloseTo(0.45, 12)
      expect(result.position.z).toBeCloseTo(3, 12)
    }
    expect(snapMatchingStageObject(same, [target], true)).toBeNull()
    expect(
      snapStageObject({ x: 0.51, y: 0, z: 3.08 }, same, scene, { grid: 0, guides: false }).position,
    ).toEqual({ x: 0.51, y: 0, z: 3.08 })
    const blocker = {
      ...target,
      id: 'obstacle',
      transform: { ...target.transform, position: { x: 0.45, y: 0, z: 3 } },
    }
    expect(
      snapMatchingStageObject(
        { ...same, transform: { ...same.transform, position: { x: 0.51, y: 0, z: 3.08 } } },
        [target, blocker],
      ),
    ).toBeNull()
    expect(useScene.getState().nodes).toBe(before)
    for (const yaw of [30, 90]) {
      const angle = (yaw * Math.PI) / 180
      const turned = {
        ...target,
        transform: { ...target.transform, rotationDegrees: { x: 0, y: yaw, z: 0 } },
      }
      const moving = {
        ...turned,
        id: a.id,
        transform: {
          ...turned.transform,
          position: { x: Math.cos(angle) * 0.51, y: 0, z: 3 - Math.sin(angle) * 0.51 },
        },
      }
      const result = snapMatchingStageObject(moving, [turned])!
      expect(result.position.x).toBeCloseTo(Math.cos(angle) * 0.45, 8)
      expect(result.position.z).toBeCloseTo(3 - Math.sin(angle) * 0.45, 8)
    }
  } finally {
    useScene.setState({ nodes: saved })
  }
})

test('same-type real folding panels align outer boundaries, never internal frame members', async () => {
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
    const result = snapStageObject(
      point,
      moving,
      { ...context, objects: [target] },
      { grid: 0, guides: true },
    )
    expect(result.position).toEqual({ ...point, z: 3, y: -stageModelBottom(moving)! || 0 })
    expect(
      stageModelContact(
        { ...moving, transform: { ...moving.transform, position: result.position } },
        target,
        true,
      ),
    ).toBe(false)
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
