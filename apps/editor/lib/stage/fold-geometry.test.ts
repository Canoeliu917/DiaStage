import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ItemNode } from '@pascal-app/core'
import { Box3, Vector3 } from 'three'
import { stageFoldGeometry } from '../../../../packages/core/src/stage/fold-geometry'
import { applyItemFoldControls } from '../../../../packages/nodes/src/item/fold-controls'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { stageContextObject } from './context'

test('legacy fold metadata keeps its stored pivot and scale while context reports actual leaves', () => {
  const node = ItemNode.parse({
    asset: {
      id: 'SCN-FOLD-03',
      category: 'scenery',
      name: '三帘组合',
      thumbnail: '',
      src: '/stage-library/models/SCN-FOLD-03.glb',
      dimensions: [0.92, 2.4, 0.94],
      boundsCenter: [0.46, 1.2, -0.45],
    },
    scale: [1.5, 2, 0.5],
    position: [1, 0, -2],
    rotation: [0.2, 0.4, -0.3],
    controls: { fold_angle_1_deg: 145, fold_angle_2_deg: 125 },
    metadata: { stageKind: 'scenic-flat' },
  })
  const before = JSON.stringify(node)
  const shape = stageFoldGeometry(node.asset.id, node.controls, node.scale)!
  const item = stageContextObject(node, { [node.id]: node }, { origin: [0, 0, 0], depthMeters: 6 })!
  expect(item.dimensionsMeters).toEqual({
    width: shape.dimensions[0],
    height: shape.dimensions[1],
    depth: shape.dimensions[2],
  })
  expect(item.collisionGeometry).toEqual(shape.collisionGeometry)
  expect(JSON.stringify(node)).toBe(before)
})

test('fold leaf volumes conservatively enclose native rounded GLBs across angles, scale and XYZ rotation', async () => {
  for (const id of ['SCN-FOLD-02', 'SCN-FOLD-03']) {
    const bytes = readFileSync(
      new URL(`../../public/stage-library/models/${id}.glb`, import.meta.url),
    )
    const root = (
      await new ItemGLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      )
    ).scene
    for (const controls of [
      {},
      { fold_angle_1_deg: 145, fold_angle_2_deg: 125 },
      { fold_angle_1_deg: 270, fold_angle_2_deg: 270 },
    ]) {
      applyItemFoldControls(root, controls)
      for (const scale of [
        [1, 1, 1],
        [1.5, 2, 0.5],
      ] as [number, number, number][]) {
        root.scale.set(...scale)
        const shape = stageFoldGeometry(id, controls, scale)!
        for (const rotation of [
          [0, 0, 0],
          [0.2, 0.4, -0.3],
        ] as [number, number, number][]) {
          root.rotation.set(...rotation)
          root.position.set(1, 0.3, -2)
          root.updateWorldMatrix(true, true)
          const actual = new Box3().setFromObject(root, true)
          const proxy = new Box3().setFromPoints(
            shape.collisionGeometry.flatMap((part) =>
              part.vertices.map((point) =>
                new Vector3(...point).applyEuler(root.rotation).add(root.position),
              ),
            ),
          )
          for (const axis of ['x', 'y', 'z'] as const) {
            expect(actual.min[axis]).toBeGreaterThanOrEqual(proxy.min[axis] - 1e-6)
            expect(actual.max[axis]).toBeLessThanOrEqual(proxy.max[axis] + 1e-6)
            // Rounded frame corners fit inside the leaf volume, without a scene-wide AABB.
            expect(actual.min[axis] - proxy.min[axis]).toBeLessThan(0.005 * Math.max(...scale))
            expect(proxy.max[axis] - actual.max[axis]).toBeLessThan(0.005 * Math.max(...scale))
            if (!Object.keys(controls).length && rotation.every((value) => value === 0)) {
              expect(proxy.min[axis]).toBeCloseTo(actual.min[axis], 5)
              expect(proxy.max[axis]).toBeCloseTo(actual.max[axis], 5)
            }
          }
        }
      }
    }
  }
})
