import { type AnyNodeId, sceneRegistry, useScene } from '@pascal-app/core'
import {
  footprintHull,
  type SceneContextObject,
  stageCollisionGeometry,
  stageObjectFootprints,
} from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  type Mesh,
  type Object3D,
  Ray,
  Vector3,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'

type ContactObject = Parameters<typeof stageCollisionGeometry>[0] & {
  id: string
  transform: SceneContextObject['transform']
}
type Geometry = {
  geometry: BufferGeometry
  bvh: MeshBVH
  closed: boolean
  samples: Vector3[]
  components: Vector3[][]
}
type Part = Geometry & { local: Matrix4 }
const geometries = new WeakMap<BufferGeometry, Geometry>()
const models = new WeakMap<
  Object3D,
  {
    asset: unknown
    scale: unknown
    revision: number
    parts: Part[]
  }
>()
const proxies = new WeakMap<object, Part[]>()
const projections = new WeakMap<
  Part[],
  Map<string, { polygons: [number, number][][]; bottom: number }>
>()

function prepareGeometry(geometry: BufferGeometry): Geometry {
  const cached = geometries.get(geometry)
  if (cached) return cached
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const positions = geometry.getAttribute('position')
  const unique = new Map<string, number>()
  const vertices: Vector3[] = []
  const canonical = Array.from({ length: positions.count }, (_, i) => {
    const point = new Vector3().fromBufferAttribute(positions, i)
    const key = point.toArray().join(',')
    let id = unique.get(key)
    if (id === undefined) {
      id = vertices.length
      unique.set(key, id)
      vertices.push(point)
    }
    return id
  })
  const parents = vertices.map((_, i) => i)
  const find = (id: number): number => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]!]!
      id = parents[id]!
    }
    return id
  }
  const edges = new Map<string, number>()
  const count = geometry.index?.count ?? positions.count
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map(
      (offset) => canonical[geometry.index?.getX(i + offset) ?? i + offset]!,
    )
    for (let edge = 0; edge < 3; edge++) {
      const a = ids[edge]!,
        b = ids[(edge + 1) % 3]!
      parents[find(a)] = find(b)
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }
  const components = new Map<number, Vector3[]>()
  vertices.forEach((point, i) => {
    const id = find(i)
    if (!components.has(id)) components.set(id, [])
    components.get(id)!.push(point)
  })
  const result = {
    geometry,
    bvh: new MeshBVH(geometry, { indirect: true, maxLeafSize: 10 }),
    closed: [...edges.values()].every((count) => count === 2),
    samples: [...components.values()].map((points) => points[0]!),
    components: [...components.values()],
  }
  geometries.set(geometry, result)
  return result
}

function modelParts(item: ContactObject): Part[] | null {
  const node = useScene.getState().nodes[item.id as AnyNodeId]
  const root = sceneRegistry.nodes.get(item.id)
  if (
    node?.type !== 'item' ||
    !root ||
    root.userData.itemModelSettled !== true ||
    useViewer.getState().itemLoadFailures[item.id]
  )
    return null
  const revision = useViewer.getState().geometryRevision
  const cached = models.get(root)
  if (cached?.asset === node.asset && cached.scale === node.scale && cached.revision === revision)
    return cached.parts
  root.updateWorldMatrix(true, true)
  const inverse = root.matrixWorld.clone().invert()
  const hosted = new Set(node.children.map((id) => sceneRegistry.nodes.get(id)))
  const parts: Part[] = []
  let deformed = false
  const visit = (object: Object3D) => {
    if (!object.visible || hosted.has(object) || object.name === 'cutout') return
    const mesh = object as Mesh
    if (mesh.isMesh && mesh.geometry.getAttribute('position')?.count >= 3) {
      if (
        ('isSkinnedMesh' in mesh && mesh.isSkinnedMesh) ||
        mesh.geometry.morphAttributes.position?.length
      ) {
        deformed = true
        return
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (materials.some((material) => material.visible))
        parts.push({
          ...prepareGeometry(mesh.geometry),
          local: new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld),
        })
    }
    for (const child of object.children) visit(child)
  }
  visit(root)
  if (deformed || !parts.length) return null
  models.set(root, { asset: node.asset, scale: node.scale, revision, parts })
  return parts
}

function proxyParts(item: ContactObject): Part[] {
  const key = item.collisionGeometry ?? item
  const cached = proxies.get(key)
  if (cached) return cached
  const parts = stageCollisionGeometry(item).map((part) => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(part.vertices.flat(), 3))
    geometry.setIndex(
      part.faces.flatMap((face) =>
        face.slice(1, -1).flatMap((_, i) => [face[0]!, face[i + 1]!, face[i + 2]!]),
      ),
    )
    return { ...prepareGeometry(geometry), local: new Matrix4() }
  })
  proxies.set(key, parts)
  return parts
}

function pose(item: ContactObject) {
  const p = item.transform.position,
    r = item.transform.rotationDegrees
  return new Matrix4()
    .makeRotationFromEuler(
      new Euler((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180),
    )
    .setPosition(p.x, p.y, p.z)
}

function projectModel(item: ContactObject) {
  const parts = modelParts(item)
  if (!parts) return null
  const { x, y, z } = item.transform.rotationDegrees
  const rotation = [x, y, z].join(',')
  const cache =
    projections.get(parts) ?? new Map<string, { polygons: [number, number][][]; bottom: number }>()
  const cached = cache.get(rotation)
  if (cached) return cached
  const orientation = pose(item).setPosition(0, 0, 0)
  let bottom = Infinity
  const polygons = parts.flatMap((part) => {
    const matrix = orientation.clone().multiply(part.local)
    return part.components
      .map((component) =>
        footprintHull(
          component.map((vertex): [number, number] => {
            const point = vertex.clone().applyMatrix4(matrix)
            bottom = Math.min(bottom, point.y)
            return [point.x, point.z]
          }),
        ),
      )
      .filter((polygon) => polygon.length >= 3)
  })
  const result = { polygons, bottom }
  // Mini and native plans use different coordinate frames; retain both projections.
  if (cache.size >= 2) cache.delete(cache.keys().next().value!)
  cache.set(rotation, result)
  projections.set(parts, cache)
  return result
}

export function stageModelFootprints(item: ContactObject): [number, number][][] | null {
  const projected = projectModel(item)
  if (!projected?.polygons.length) return null
  const { x, z } = item.transform.position
  return projected.polygons.map((polygon) => polygon.map(([px, pz]) => [px + x, pz + z]))
}

export function stageVisibleFootprints(item: ContactObject): [number, number][][] {
  return stageModelFootprints(item) ?? stageObjectFootprints(item)
}

export function stageModelBelowFloor(item: ContactObject): boolean | null {
  const projected = projectModel(item)
  return projected ? projected.bottom + item.transform.position.y < -1e-7 : null
}

function inside(part: Geometry, point: Vector3): boolean {
  if (!part.closed || !part.geometry.boundingBox!.containsPoint(point)) return false
  const hits = part.bvh.raycast(
    new Ray(point, new Vector3(0.931, 0.317, 0.179).normalize()),
    DoubleSide,
  )
  const distances = hits.map((hit) => hit.distance).sort((a, b) => a - b)
  return (
    distances.filter((distance, i) => i === 0 || distance - distances[i - 1]! > 1e-7).length % 2 ===
    1
  )
}

export function stageModelContact(left: ContactObject, right: ContactObject): boolean | null {
  const leftModel = modelParts(left),
    rightModel = modelParts(right)
  if (!leftModel && !rightModel) return null
  const leftPose = pose(left),
    rightPose = pose(right)
  for (const a of leftModel ?? proxyParts(left)) {
    const aWorld = leftPose.clone().multiply(a.local)
    const aBox = a.geometry.boundingBox!.clone().applyMatrix4(aWorld)
    for (const b of rightModel ?? proxyParts(right)) {
      const bWorld = rightPose.clone().multiply(b.local)
      if (!aBox.intersectsBox(new Box3().copy(b.geometry.boundingBox!).applyMatrix4(bWorld)))
        continue
      const bToA = aWorld.clone().invert().multiply(bWorld)
      if (
        a.bvh.bvhcast(b.bvh, bToA, {
          intersectsTriangles: (left, right) => left.intersectsTriangle(right),
        })
      )
        return true
      if (b.samples.some((point) => inside(a, point.clone().applyMatrix4(bToA)))) return true
      const aToB = bToA.invert()
      if (a.samples.some((point) => inside(b, point.clone().applyMatrix4(aToB)))) return true
    }
  }
  return false
}
