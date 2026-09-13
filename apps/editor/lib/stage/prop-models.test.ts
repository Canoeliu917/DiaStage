import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  type GeometryContext,
  getItemBoundsCenter,
  ItemNode,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { worldToStagePosition, worldToStageRotation } from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { Box3, Euler, Group, Quaternion, Vector3 } from 'three'
import { applyItemFoldControls } from '../../../../packages/nodes/src/item/fold-controls'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { stageContactIds } from './contacts'
import { stageModelBelowFloor, stageModelFootprints } from './model-contact'
import { AVAILABLE_STAGE_SCENERY, STAGE_PROP_MENU } from './prop-assets'
import { centeredPropFloorplan } from './rigid-floorplan'
import { rigidRotation } from './rigid-rotation'

test('all approved GLBs load with their real dimensions, authored pivots, hierarchy and matte materials', async () => {
  let sourceParts = 0
  for (const entry of STAGE_PROP_MENU.assets) {
    const bytes = readFileSync(
      new URL(`../../public/stage-library/${entry.model}`, import.meta.url),
    )
    const gltf = await new ItemGLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
    gltf.scene.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(gltf.scene, true)
    const [min, max] = entry.bounds_m
    for (const [actual, expected] of [
      [box.min.toArray(), [min[0], min[2], -max[1]]],
      [box.max.toArray(), [max[0], max[2], -min[1]]],
    ])
      actual!.forEach((value, i) => {
        expect(value).toBeCloseTo(expected![i]!, 5)
      })
    expect(gltf.scene.children[0]!.userData.pivot).toBe(entry.pivot)
    expect(gltf.animations).toHaveLength(0)
    for (const [index, definition] of gltf.parser.json.nodes.entries()) {
      const node = await gltf.parser.getDependency('node', index)
      expect(node.position.toArray()).toEqual(definition.translation ?? [0, 0, 0])
      expect(node.scale.toArray()).toEqual(definition.scale ?? [1, 1, 1])
      node.quaternion.toArray().forEach((value: number, axis: number) => {
        expect(value).toBeCloseTo((definition.rotation ?? [0, 0, 0, 1])[axis], 8)
      })
      sourceParts += definition.extras?.source_parts?.length ?? 0
    }
    gltf.scene.traverse((node) => {
      expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true)
      if (!('isMesh' in node) || !node.isMesh || !('material' in node)) return
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) {
        expect(material.roughness).toBeGreaterThanOrEqual(0.9)
        expect(material.metalness).toBe(0)
      }
    })
  }
  expect(sourceParts).toBe(222)
})

test('folds and open doors rotate as a whole around their geometry centre without rewriting the authored origin', () => {
  for (const id of ['SCN-FOLD-02', 'SCN-FOLD-03', 'SCN-DOOR-130', 'SCN-DOOR-160']) {
    const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === id)!.asset
    const before = ItemNode.parse({ asset, position: [1, 0, -1], scale: [1, 1, 1] })
    const centre = (node: ItemNode) =>
      new Vector3(...getItemBoundsCenter(node))
        .applyQuaternion(new Quaternion().setFromEuler(new Euler(...node.rotation)))
        .add(new Vector3(...node.position))
    for (const axis of ['x', 'y', 'z'] as const) {
      const after = ItemNode.parse({ ...before, ...rigidRotation(before, axis, 30) })
      expect(centre(after).distanceTo(centre(before))).toBeCloseTo(0, 8)
      expect(after.asset).toEqual(before.asset)
      expect(after.scale).toEqual([1, 1, 1])
      expect(after.asset.offset).toEqual([0, 0, 0])
    }
  }
})

test('real round-table and fold projections match visible geometry, including tilted floor penetration', async () => {
  const previous = useScene.getState().nodes
  const revision = useViewer.getState().geometryRevision
  try {
    for (const assetId of ['SCN-TABLE-090', 'SCN-FOLD-02']) {
      const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)!.asset
      const node = ItemNode.parse({ asset })
      const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url))
      const gltf = await new ItemGLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      )
      const root = new Group()
      root.userData.itemModelSettled = true
      root.add(gltf.scene)
      sceneRegistry.nodes.set(node.id, root)
      useScene.setState({ nodes: { ...previous, [node.id]: node } })
      try {
        const [width, height, depth] = asset.dimensions!
        const item = {
          id: node.id,
          kind: 'neutral-block' as const,
          dimensionsMeters: { width, height, depth },
          transform: { position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
        }
        const outlines = stageModelFootprints(item)!
        expect(outlines.length).toBeGreaterThan(1)
        if (assetId === 'SCN-TABLE-090')
          expect(outlines.some((part) => part.length > 20)).toBe(true)
        expect(stageContactIds([item]).size).toBe(0)
        item.transform.rotationDegrees.x = 30
        expect(stageContactIds([item]).has(node.id)).toBe(true)
        root.rotation.x = Math.PI / 6
        const actual = new Box3().setFromObject(root, true)
        const points = stageModelFootprints(item)!.flat()
        expect(Math.min(...points.map(([x]) => x))).toBeCloseTo(actual.min.x, 6)
        expect(Math.max(...points.map(([, z]) => z))).toBeCloseTo(actual.max.z, 6)
        const original = structuredClone(points)
        item.transform.position.x = 3
        const moved = stageModelFootprints(item)!.flat()
        moved.forEach(([x, z], index) => {
          expect(x).toBeCloseTo(original[index]![0] + 3, 8)
          expect(z).toBeCloseTo(original[index]![1], 8)
        })
      } finally {
        sceneRegistry.nodes.delete(node.id)
      }
    }
  } finally {
    useScene.setState({ nodes: previous })
    useViewer.setState({ geometryRevision: revision })
  }
})

async function mountedFold(check: (node: ItemNode, root: Group) => void, assetId = 'SCN-FOLD-03') {
  const previous = useScene.getState().nodes
  const revision = useViewer.getState().geometryRevision
  const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === assetId)!.asset
  const node = ItemNode.parse({ asset })
  const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url))
  const gltf = await new ItemGLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  const root = new Group()
  root.userData.itemModelSettled = true
  root.add(gltf.scene)
  sceneRegistry.nodes.set(node.id, root)
  useScene.setState({ nodes: { ...previous, [node.id]: node } })
  try {
    check(node, root)
  } finally {
    sceneRegistry.nodes.delete(node.id)
    useScene.setState({ nodes: previous })
    useViewer.setState({ geometryRevision: revision })
  }
}

function query(node: ItemNode) {
  const [width, height, depth] = node.asset.dimensions
  return {
    id: node.id,
    kind: 'neutral-block' as const,
    dimensionsMeters: { width, height, depth },
    transform: { position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
}

test('selected asymmetric fold keeps its full footprint without a central movement marker', async () => {
  await mountedFold((node, root) => {
    node.rotation = [0, Math.PI / 4, 0]
    root.rotation.set(...node.rotation)
    const actual = new Box3().setFromObject(root, true).getCenter(new Vector3())
    const geometry = centeredPropFloorplan(null, node, {
      resolve: () => undefined,
      viewState: { selected: true },
    } as GeometryContext)
    if (geometry?.kind !== 'group') throw new Error('expected real model floorplan')
    expect(geometry.children.some((child) => child.kind === 'move-handle')).toBe(false)
    const points = geometry.children.flatMap((child) =>
      child.kind === 'polygon' ? child.points : [],
    )
    expect(
      (Math.min(...points.map(([x]) => x)) + Math.max(...points.map(([x]) => x))) / 2,
    ).toBeCloseTo(actual.x, 8)
    expect(
      (Math.min(...points.map(([, z]) => z)) + Math.max(...points.map(([, z]) => z))) / 2,
    ).toBeCloseTo(actual.z, 8)
  }, 'SCN-FOLD-02')
})

test('projection cache keys use axis names rather than rotation object insertion order', async () => {
  await mountedFold((node, root) => {
    const item = query(node)
    item.transform.rotationDegrees = { x: 15, y: 30, z: 45 }
    stageModelFootprints(item)
    item.transform.rotationDegrees = { z: 15, x: 30, y: 45 }
    root.rotation.set(Math.PI / 6, Math.PI / 4, Math.PI / 12)
    const actual = new Box3().setFromObject(root, true)
    const points = stageModelFootprints(item)!.flat()
    expect(Math.min(...points.map(([x]) => x))).toBeCloseTo(actual.min.x, 8)
    expect(Math.max(...points.map(([, z]) => z))).toBeCloseTo(actual.max.z, 8)
  })
})

test('combined XYZ tilt projects identically in both coordinate frames and folding/cancel invalidates caches', async () => {
  await mountedFold((node, root) => {
    const item = query(node)
    item.transform = {
      position: { x: 0.5, y: 0.05, z: -1.4 },
      rotationDegrees: { x: -17, y: 41, z: 23 },
    }
    root.rotation.set((-17 * Math.PI) / 180, (41 * Math.PI) / 180, (23 * Math.PI) / 180)
    root.position.set(0.5, 0.05, -1.4)
    const check = () => {
      const actual = new Box3().setFromObject(root, true)
      const outlines = stageModelFootprints(item)!
      const native = outlines.flat()
      const stage = stageModelFootprints({
        ...item,
        transform: {
          position: worldToStagePosition(root.position.toArray(), {
            origin: [0, 0, 0],
            depthMeters: 6,
          }),
          rotationDegrees: worldToStageRotation([
            root.rotation.x,
            root.rotation.y,
            root.rotation.z,
          ]),
        },
      })!
        .flat()
        .map(([x, z]) => [-x, 3 - z])
      for (const points of [native, stage]) {
        expect(Math.min(...points.map(([x]) => x!))).toBeCloseTo(actual.min.x, 7)
        expect(Math.max(...points.map(([x]) => x!))).toBeCloseTo(actual.max.x, 7)
        expect(Math.min(...points.map(([, z]) => z!))).toBeCloseTo(actual.min.z, 7)
        expect(Math.max(...points.map(([, z]) => z!))).toBeCloseTo(actual.max.z, 7)
      }
      expect(stageModelBelowFloor(item)).toBe(actual.min.y < -1e-7)
      return outlines
    }
    const original = check()
    applyItemFoldControls(root, { fold_angle_1_deg: 145, fold_angle_2_deg: 125 })
    useViewer.getState().bumpGeometryRevision()
    expect(check()).not.toEqual(original)
    applyItemFoldControls(root, {})
    useViewer.getState().bumpGeometryRevision()
    expect(check()).toEqual(original)
  })
})
