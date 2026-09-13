// @ts-expect-error — Bun supplies its own test types at runtime.
import { expect, test } from 'bun:test'
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  type LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three'
import { createBlackLineScene } from './black-line-scene'
import { OVERLAY_LAYER } from './layers'

test('line display follows live poses, selection and overlays without changing source assets', () => {
  const root = new Scene()
  const model = new Group()
  model.name = 'scene-renderer'
  const material = new MeshBasicMaterial({ color: '#bc8152' })
  const mesh = new Mesh(new BoxGeometry(), material)
  model.add(mesh)
  root.add(model)
  const ghost = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#60a5fa' }))
  ghost.userData.viewerLineStyle = 'colored'
  root.add(ghost)
  const conflict = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#ff3333' }))
  conflict.layers.set(OVERLAY_LAYER)
  root.add(conflict)
  const background = new Mesh(new BoxGeometry(100, 1, 100), material)
  root.add(background)
  const before = JSON.stringify(root.toJSON())
  const display = createBlackLineScene()
  display.sync(root, new Set())
  expect(display.scene.background?.getHexString()).toBe('000000')
  expect(display.scene.children.length).toBe(3)
  const line = display.scene.children[0] as LineSegments
  expect(line.geometry.getAttribute('position').count).toBe(24) // 12 box edges, no triangle diagonals.
  expect((line.material as MeshBasicMaterial).color.getHexString()).toBe('ffffff')
  expect((display.scene.children[1] as LineSegments).material.color.getHexString()).toBe('60a5fa')
  expect((display.scene.children[2] as LineSegments).material.color.getHexString()).toBe('ff3333')
  expect(JSON.stringify(root.toJSON())).toBe(before)
  display.sync(root, new Set(), new Set([model]))
  expect((line.material as MeshBasicMaterial).color.getHexString()).toBe('60a5fa')
  expect((line.material as MeshBasicMaterial).opacity).toBe(0.85)
  mesh.position.set(2, 1, 3)
  mesh.rotation.y = Math.PI / 2
  display.sync(root, new Set([model]))
  expect(line.matrix.equals(mesh.matrixWorld)).toBe(true)
  expect((line.material as MeshBasicMaterial).color.getHexString()).toBe('a8d8ff')
  const cachedEdges = line.geometry
  display.sync(root, new Set())
  expect(line.geometry).toBe(cachedEdges)
  let disposed = false
  cachedEdges.addEventListener('dispose', () => {
    disposed = true
  })
  mesh.geometry = new BoxGeometry(2, 3, 4)
  display.sync(root, new Set())
  expect(disposed).toBe(true)
  model.visible = false
  root.remove(ghost)
  display.sync(root, new Set())
  expect(display.scene.children.length).toBe(1)
  let assetDisposed = false
  material.addEventListener('dispose', () => {
    assetDisposed = true
  })
  mesh.geometry.addEventListener('dispose', () => {
    assetDisposed = true
  })
  display.dispose()
  expect(display.scene.children.length).toBe(0)
  expect(mesh.material).toBe(material)
  expect(assetDisposed).toBe(false)
})

test('instanced props keep their individual transforms and counts', () => {
  const root = new Group()
  root.name = 'scene-renderer'
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2)
  mesh.position.x = 5
  mesh.setMatrixAt(1, new Matrix4().makeTranslation(3, 0, 0))
  root.add(mesh)
  const display = createBlackLineScene()
  display.sync(root, new Set())
  expect(display.scene.children.map((line) => line.matrix.elements[12])).toEqual([5, 8])
  mesh.count = 1
  display.sync(root, new Set())
  expect(display.scene.children.length).toBe(1)
  display.dispose()
})
