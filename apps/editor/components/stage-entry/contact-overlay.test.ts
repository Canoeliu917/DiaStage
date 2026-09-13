import { expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Plane } from 'three'
import { ClippingGroup } from 'three/webgpu'
import { createStageContactOverlay } from './contact-overlay'

test('contact overlays follow visible geometry and release only their own material', () => {
  const overlay = createStageContactOverlay()
  const source = new Group()
  const geometry = new BoxGeometry()
  const original = new MeshBasicMaterial({ color: '#707070' })
  const mesh = new Mesh(geometry, original)
  source.add(mesh)
  source.position.set(3, 1, -2)
  source.rotation.y = Math.PI / 4
  const sources = new Map([['door', source]])
  const ids = new Set(['door'])
  const snapshot = {}
  let traversals = 0
  const traverse = source.traverseVisible.bind(source)
  source.traverseVisible = (callback) => {
    traversals++
    traverse(callback)
  }
  let sourceDisposals = 0
  geometry.addEventListener('dispose', () => sourceDisposals++)
  original.addEventListener('dispose', () => sourceDisposals++)
  overlay.sync(ids, sources, 0, snapshot)
  const red = overlay.group.children[0]!.children[0] as Mesh
  overlay.group.updateWorldMatrix(true, true)
  expect(red.geometry).toBe(geometry)
  expect(red.material).not.toBe(original)
  expect(mesh.material).toBe(original)
  expect(red.matrixWorld.elements).toEqual(mesh.matrixWorld.elements)
  expect(red.layers.mask).toBe(2)
  expect(red.castShadow).toBe(false)
  for (let i = 0; i < 100; i++) overlay.sync(ids, sources, 0, snapshot)
  expect(traversals).toBe(1)

  source.position.x = 5
  source.rotation.z = 0.3
  overlay.sync(ids, sources, 0, {})
  overlay.group.updateWorldMatrix(true, true)
  expect(red.matrixWorld.elements).toEqual(mesh.matrixWorld.elements)
  expect(traversals).toBe(1)
  const loaded = new Group()
  const nested = new Mesh(new BoxGeometry(2, 2, 2), original)
  loaded.add(nested)
  source.remove(mesh)
  source.add(loaded)
  source.userData.itemModelSettled = true
  overlay.sync(ids, sources, 0, snapshot)
  expect((overlay.group.children[0]!.children[0] as Mesh).geometry).toBe(nested.geometry)
  const newGeometry = new BoxGeometry(3, 1, 1)
  nested.geometry = newGeometry
  overlay.sync(ids, sources, 1, snapshot)
  expect((overlay.group.children[0]!.children[0] as Mesh).geometry).toBe(newGeometry)
  source.visible = false
  overlay.sync(ids, sources, 1, snapshot)
  expect(overlay.group.children).toHaveLength(0)
  source.visible = true
  overlay.sync(ids, sources, 1, snapshot)
  expect(overlay.group.children).toHaveLength(1)
  overlay.sync(new Set(), sources, 1, snapshot)
  expect(overlay.group.children).toHaveLength(0)
  overlay.sync(ids, sources, 1, snapshot)
  let tintDisposals = 0
  const tint = (overlay.group.children[0]!.children[0] as Mesh).material as MeshBasicMaterial
  tint.addEventListener('dispose', () => tintDisposals++)
  overlay.dispose()
  expect(overlay.group.children).toHaveLength(0)
  expect(tintDisposals).toBe(1)
  expect(sourceDisposals).toBe(0)
  expect(nested.material).toBe(original)
})

test('red feedback inherits live section planes instead of restoring the hidden upper model', () => {
  const overlay = createStageContactOverlay()
  const source = new Group()
  const section = new ClippingGroup()
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  section.clippingPlanes = [new Plane()]
  section.add(mesh)
  source.add(section)
  const sources = new Map([['panel', source]])
  const ids = new Set(['panel'])
  const snapshot = {}
  overlay.sync(ids, sources, 0, snapshot)
  const feedback = overlay.group.children[0] as ClippingGroup
  expect(feedback.enabled).toBe(true)
  expect(feedback.clippingPlanes).toBe(section.clippingPlanes)
  section.enabled = false
  overlay.sync(ids, sources, 0, snapshot)
  expect(feedback.enabled).toBe(false)
  overlay.dispose()
  mesh.geometry.dispose()
  mesh.material.dispose()
})
