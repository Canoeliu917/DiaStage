import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ItemNode, sceneRegistry, useScene } from '@pascal-app/core'
import {
  type SceneContextObject,
  type SceneContextSummary,
  stageFootprintGap,
} from '@pascal-app/core/stage'
import { applyItemFoldControls } from '@pascal-app/nodes'
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

test('folding panels may touch outer boundaries without falsely reporting full face alignment', async () => {
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
    applyItemFoldControls(root)
    sceneRegistry.nodes.set(node.id, root)
  }
  useScene.setState({
    nodes: { ...before, ...Object.fromEntries(nodes.map((node) => [node.id, node])) },
  })
  try {
    const moving = { ...item, id: nodes[0]!.id }
    const target = { ...item, id: nodes[1]!.id }
    const point = { x: -0.98, y: 0, z: 3.04 }
    const result = snapStageObject(
      point,
      moving,
      { ...context, objects: [target] },
      { grid: 0, guides: true },
    )
    expect(result.labels).toContain('贴合 景片')
    expect(result.labels).not.toContain('景片边缘对齐')
    expect(result.position.x).toBeCloseTo(-0.94, 7)
    expect(result.position.z).toBeCloseTo(3.04, 7)
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

test('single, double and triple scenic flats share magnetic outer-edge alignment', async () => {
  const assetIds = ['SCN-FLAT-090', 'SCN-FOLD-02', 'SCN-FOLD-03'] as const
  const assets = assetIds.map(
    (assetId) => AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)!.asset,
  )
  const models = await Promise.all(
    assets.map(async (asset) => {
      const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url))
      return (
        await new ItemGLTFLoader().parseAsync(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          '',
        )
      ).scene
    }),
  )
  const nodes = assets.map((asset) =>
    ItemNode.parse({
      asset,
      metadata: { stageKind: 'scenic-flat' },
      ...(asset.id.startsWith('SCN-FOLD')
        ? { controls: { fold_angle_1_deg: 180, fold_angle_2_deg: 180 } }
        : {}),
    }),
  )
  const saved = useScene.getState().nodes
  const nodeMap = { ...saved, ...Object.fromEntries(nodes.map((node) => [node.id, node])) }
  useScene.setState({ nodes: nodeMap })
  nodes.forEach((node, index) => {
    const root = new Group()
    root.userData.itemModelSettled = true
    root.add(models[index]!)
    applyItemFoldControls(root, node.controls)
    sceneRegistry.nodes.set(node.id, root)
  })
  try {
    const frame = { origin: [0, 0, 0] as [number, number, number], depthMeters: 6 }
    const objects = nodes.map((node) => stageContextObject(node, nodeMap, frame)!)
    for (const [movingIndex, targetIndex] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const baseMoving = objects[movingIndex]!
      const baseTarget = objects[targetIndex]!
      const movingFloorY = -stageModelBottom(baseMoving)! || 0
      const targetFloorY = -stageModelBottom(baseTarget)! || 0
      const target = {
        ...baseTarget,
        transform: { ...baseTarget.transform, position: { x: 0, y: targetFloorY, z: 3 } },
      }
      const movingAtOrigin = {
        ...baseMoving,
        transform: { ...baseMoving.transform, position: { x: 0, y: movingFloorY, z: 3 } },
      }
      const targetPoints = stageVisibleFootprints(target).flat()
      const movingPoints = stageVisibleFootprints(movingAtOrigin).flat()
      const targetMaxX = Math.max(...targetPoints.map(([x]) => x))
      const movingMinX = Math.min(...movingPoints.map(([x]) => x))
      const targetCenterZ =
        (Math.max(...targetPoints.map(([, z]) => z)) +
          Math.min(...targetPoints.map(([, z]) => z))) /
        2
      const movingCenterZ =
        (Math.max(...movingPoints.map(([, z]) => z)) +
          Math.min(...movingPoints.map(([, z]) => z))) /
        2
      const aligned = {
        x: targetMaxX - movingMinX,
        y: movingFloorY,
        z: 3 + targetCenterZ - movingCenterZ,
      }
      const point = { x: aligned.x + 0.06, y: movingFloorY, z: aligned.z + 0.04 }
      const moving = {
        ...movingAtOrigin,
        transform: { ...movingAtOrigin.transform, position: point },
      }
      const result = snapStageObject(
        point,
        moving,
        { ...context, objects: [target] },
        { grid: 0, guides: true },
      )
      const placed = { ...moving, transform: { ...moving.transform, position: result.position } }
      expect(result.labels, `${assetIds[movingIndex]} -> ${assetIds[targetIndex]}`).toContain(
        '景片边缘对齐',
      )
      expect(result.position.x).toBeCloseTo(aligned.x, 7)
      expect(result.position.z).toBeCloseTo(aligned.z, 7)
      expect(stageModelContact(placed, target, true)).toBe(false)
    }
    expect(useScene.getState().nodes).toBe(nodeMap)
  } finally {
    useScene.setState({ nodes: saved })
    nodes.forEach((node) => {
      sceneRegistry.nodes.delete(node.id)
    })
    models.forEach((model) => {
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.geometry.dispose()
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          material.dispose()
      })
    })
  }
})

test('folded three-panel and two-panel end faces align flush, not merely at one touching point', async () => {
  const specs = [
    {
      assetId: 'SCN-FOLD-03',
      position: [-2.7, 4.7683716642944515e-8, -2.2],
      controls: { fold_angle_1_deg: 90, fold_angle_2_deg: 180 },
    },
    {
      assetId: 'SCN-FOLD-02',
      position: [-0.900000024, 4.7683716532726305e-8, -2.1915888814230686],
      controls: { fold_angle_1_deg: 180, fold_angle_2_deg: 90 },
    },
  ] as const
  const entries = await Promise.all(
    specs.map(async ({ assetId, position, controls }) => {
      const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)!.asset
      const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url))
      const model = (
        await new ItemGLTFLoader().parseAsync(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          '',
        )
      ).scene
      const node = ItemNode.parse({
        asset,
        controls,
        metadata: { stageKind: 'scenic-flat' },
        position,
        rotation: [-Math.PI, 1.2246467991473532e-16, -Math.PI],
      })
      const root = new Group()
      root.userData.itemModelSettled = true
      root.add(model)
      applyItemFoldControls(root, controls)
      return { model, node, root }
    }),
  )
  const saved = useScene.getState().nodes
  const nodes = { ...saved, ...Object.fromEntries(entries.map(({ node }) => [node.id, node])) }
  useScene.setState({ nodes })
  entries.forEach(({ node, root }) => {
    sceneRegistry.nodes.set(node.id, root)
  })
  try {
    const frame = { origin: [0, 0, 0] as [number, number, number], depthMeters: 6 }
    const [target, moving] = entries.map(({ node }) => stageContextObject(node, nodes, frame)!)
    const result = snapStageObject(
      moving.transform.position,
      moving,
      { ...context, objects: [target] },
      { grid: 0, guides: true },
    )
    const placed = { ...moving, transform: { ...moving.transform, position: result.position } }
    const gap = Math.min(
      ...stageVisibleFootprints(placed).flatMap((left) =>
        stageVisibleFootprints(target).map((right) => stageFootprintGap(left, right).meters),
      ),
    )
    expect(result.labels).toContain('景片边缘对齐')
    expect(result.position.x).toBeCloseTo(moving.transform.position.x, 7)
    expect(result.position.z).toBeCloseTo(target.transform.position.z, 7)
    expect(gap).toBeLessThan(1e-8)
    expect(stageModelContact(placed, target, true)).toBe(false)
    expect(useScene.getState().nodes).toBe(nodes)
    for (const yaw of [0, 30, 90]) {
      const angle = (yaw * Math.PI) / 180
      const turn = (point: typeof result.position) => ({
        x: point.x * Math.cos(angle) + point.z * Math.sin(angle),
        y: point.y,
        z: -point.x * Math.sin(angle) + point.z * Math.cos(angle),
      })
      const fixed = {
        ...target,
        transform: {
          position: turn(target.transform.position),
          rotationDegrees: { x: 0, y: yaw, z: 0 },
        },
      }
      const expected = turn(result.position)
      for (const offset of [-0.06, 0, 0.06]) {
        const point = turn({
          ...moving.transform.position,
          x: result.position.x - 0.05,
          z: target.transform.position.z + offset,
        })
        const source = {
          ...moving,
          transform: { position: point, rotationDegrees: { x: 0, y: yaw, z: 0 } },
        }
        const snapped = snapStageObject(
          point,
          source,
          { ...context, objects: [fixed] },
          { grid: 0.1, guides: true },
        )
        expect(snapped.position.x).toBeCloseTo(expected.x, 6)
        expect(snapped.position.z).toBeCloseTo(expected.z, 6)
        expect(
          stageModelContact(
            { ...source, transform: { ...source.transform, position: snapped.position } },
            fixed,
            true,
          ),
        ).toBe(false)
        expect(
          snapStageObject(
            point,
            source,
            { ...context, objects: [fixed] },
            { grid: 0, guides: false },
          ).position,
        ).toEqual(point)
      }
    }
  } finally {
    useScene.setState({ nodes: saved })
    entries.forEach(({ node, model }) => {
      sceneRegistry.nodes.delete(node.id)
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.geometry.dispose()
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          material.dispose()
      })
    })
  }
})
