import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { ItemNode, sceneRegistry, useScene } from '@pascal-app/core'
import { stageCollisionGeometry } from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial } from 'three'
import { stageContactIds } from './contacts'

let previousNodes: ReturnType<typeof useScene.getState>['nodes']
let previousViewer: ReturnType<typeof useViewer.getState>
let items: Parameters<typeof stageContactIds>[0]
let roots: Group[]
let geometry: BoxGeometry
let material: MeshBasicMaterial
let clones: ReturnType<typeof spyOn>

beforeEach(() => {
  previousNodes = useScene.getState().nodes
  previousViewer = useViewer.getState()
  geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  material = new MeshBasicMaterial()
  const nodes = [0, 1].map(() =>
    ItemNode.parse({
      asset: {
        id: 'test-model',
        name: '模型',
        category: 'scenery',
        src: '/fixture.glb',
        thumbnail: '/fixture.png',
      },
    }),
  )
  roots = nodes.map((node) => {
    const root = new Group()
    root.add(new Mesh(geometry, material))
    root.userData.itemModelSettled = true
    sceneRegistry.nodes.set(node.id, root)
    return root
  })
  useScene.setState({
    nodes: { ...previousNodes, ...Object.fromEntries(nodes.map((node) => [node.id, node])) },
  })
  items = nodes.map((node, i) => ({
    id: node.id,
    kind: 'neutral-block',
    libraryAssetId: 'test-model',
    dimensionsMeters: { width: 1, height: 1, depth: 1 },
    collisionGeometry: stageCollisionGeometry({
      kind: 'neutral-block',
      dimensionsMeters: { width: 1, height: 1, depth: 1 },
    }),
    transform: { position: { x: i * 4, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }))
  clones = spyOn(Matrix4.prototype, 'clone')
})

afterEach(() => {
  clones.mockRestore()
  for (const item of items) sceneRegistry.nodes.delete(item.id)
  useScene.setState({ nodes: previousNodes })
  useViewer.setState({
    geometryRevision: previousViewer.geometryRevision,
    itemLoadFailures: previousViewer.itemLoadFailures,
  })
  geometry.dispose()
  material.dispose()
})

test('equal fresh geometry from separate views shares results without allowing caller mutation to poison the cache', () => {
  const first = stageContactIds(items)
  expect(clones.mock.calls.length).toBeGreaterThan(0)
  first.add('caller-only')
  clones.mockClear()
  const fresh = structuredClone(items)
  fresh[0]!.transform.rotationDegrees = { z: 0, x: 0, y: 0 }
  expect(stageContactIds(fresh.reverse())).toEqual(new Set())
  expect(clones.mock.calls.length).toBe(0)
})

test('every position, rotation, dimension, step count and immutable geometry change gets a new contact calculation', () => {
  const changes: ((next: typeof items) => void)[] = [
    ...(['x', 'y', 'z'] as const).map((axis) => (next: typeof items) => {
      next[0]!.transform.position[axis] = 0.2
    }),
    ...(['x', 'y', 'z'] as const).map((axis) => (next: typeof items) => {
      next[0]!.transform.rotationDegrees[axis] = 10
    }),
    ...(['width', 'height', 'depth'] as const).map((axis) => (next: typeof items) => {
      next[0]!.dimensionsMeters[axis] = 1.2
    }),
    (next) => {
      next[0]!.stepCount = 4
    },
    (next) => {
      next[0]!.collisionGeometry![0]!.vertices[0]![0] += 0.1
    },
    (next) => {
      next[0]!.libraryAssetId = null
    },
    (next) => {
      next[0]!.kind = 'round-table'
    },
  ]
  stageContactIds(items)
  for (const change of changes) {
    const next = structuredClone(items)
    change(next)
    clones.mockClear()
    stageContactIds(next)
    expect(clones.mock.calls.length).toBeGreaterThan(0)
  }
  const touching = structuredClone(items)
  touching[1]!.transform.position.x = 0.8
  expect(stageContactIds(touching)).toEqual(new Set(items.map((item) => item.id)))
  expect(stageContactIds(items)).toEqual(new Set())
})

test('scene, geometry revision, readiness, root replacement, and load failures invalidate reuse', () => {
  const invalidations = [
    () => useScene.setState({ nodes: { ...useScene.getState().nodes } }),
    () => useViewer.getState().bumpGeometryRevision(),
    () => {
      roots[1]!.userData.itemModelSettled = false
    },
    () => {
      const next = roots[0]!.clone(true)
      sceneRegistry.nodes.set(items[0]!.id, next)
    },
    () =>
      useViewer.setState({
        itemLoadFailures: {
          ...useViewer.getState().itemLoadFailures,
          [items[0]!.id]: '/failed.glb',
        },
      }),
  ]
  for (const invalidate of invalidations) {
    for (let index = 0; index < roots.length; index++) {
      roots[index]!.userData.itemModelSettled = true
      sceneRegistry.nodes.set(items[index]!.id, roots[index]!)
    }
    useViewer.setState({ itemLoadFailures: {} })
    stageContactIds(items)
    invalidate()
    clones.mockClear()
    stageContactIds(items)
    expect(clones.mock.calls.length).toBeGreaterThan(0)
  }
})

test('only the four most recently used layouts remain cached', () => {
  const variants = [0, 1, 2, 3, 4].map((index) => {
    const next = structuredClone(items)
    next[0]!.transform.position.z = index / 10
    return next
  })
  for (const variant of variants.slice(0, 4)) stageContactIds(variant)
  clones.mockClear()
  stageContactIds(variants[0]!)
  expect(clones.mock.calls.length).toBe(0)
  stageContactIds(variants[4]!)
  clones.mockClear()
  stageContactIds(variants[0]!)
  expect(clones.mock.calls.length).toBe(0)
  stageContactIds(variants[1]!)
  expect(clones.mock.calls.length).toBeGreaterThan(0)
})
