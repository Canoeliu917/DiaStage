import type { ItemFoldControls } from '@pascal-app/core'
import { Matrix4, type Mesh, type Object3D, Vector3 } from 'three'
import { applyItemFoldControls } from './fold-controls'

type Point = [number, number]
type Part = {
  mesh: Mesh
  panel: number
  name: string
  vertices: Vector3[]
  minY: number
  maxY: number
}
type Footprint = {
  polygon: Point[]
  minY: number
  maxY: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}
const keys = ['fold_angle_1_deg', 'fold_angle_2_deg'] as const
const epsilon = 1e-5
const partsCache = new WeakMap<Object3D, Part[]>()

function partsFor(root: Object3D): Part[] {
  const cached = partsCache.get(root)
  if (cached) return cached
  const parts: Part[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    let parent: Object3D | null = mesh.parent
    while (parent && !/^Hinge_\d+$/.test(parent.name)) parent = parent.parent
    if (!parent) return
    const panel = Number(parent.name.slice(-2))
    const sources: string[] = mesh.userData.source_parts ?? [mesh.name]
    if (sources.every((name) => name.startsWith('HingePin_'))) return
    const geometry = mesh.geometry
    const positions = geometry.getAttribute('position')
    const count = geometry.index?.count ?? positions.count
    // These two authored assets concatenate equal-tessellation rounded boxes in source_parts order.
    // Split their real board and frame vertices; a whole frame/combination box fills visible gaps.
    const perPart = count / sources.length
    sources.forEach((name, index) => {
      const vertices = new Map<string, Vector3>()
      for (let i = index * perPart; i < (index + 1) * perPart; i++) {
        const point = new Vector3().fromBufferAttribute(positions, geometry.index?.getX(i) ?? i)
        vertices.set(point.toArray().join(','), point)
      }
      const points = [...vertices.values()]
      parts.push({
        mesh,
        panel,
        name,
        vertices: hull(points.map((point) => [point.x, point.z])).map(
          ([x, z]) => new Vector3(x, 0, z),
        ),
        minY: Math.min(...points.map((point) => point.y)),
        maxY: Math.max(...points.map((point) => point.y)),
      })
    })
  })
  partsCache.set(root, parts)
  return parts
}

function hull(points: Point[]): Point[] {
  const sorted = [...new Map(points.map((point) => [point.join(','), point])).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  )
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const half = (values: Point[]) => {
    const result: Point[] = []
    for (const point of values) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, point) <= 1e-12)
        result.pop()
      result.push(point)
    }
    return result.slice(0, -1)
  }
  return [...half(sorted), ...half(sorted.reverse())]
}

function penetrates(a: Footprint, b: Footprint): boolean {
  if (Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) <= epsilon) return false
  if (Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) <= epsilon) return false
  if (Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) <= epsilon) return false
  for (const polygon of [a.polygon, b.polygon]) {
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i]!,
        end = polygon[(i + 1) % polygon.length]!
      const dx = end[0] - start[0],
        dz = end[1] - start[1]
      const length = Math.hypot(dx, dz)
      const projection = (point: Point) => (point[0] * dz - point[1] * dx) / length
      const left = a.polygon.map(projection),
        right = b.polygon.map(projection)
      if (
        Math.min(Math.max(...left), Math.max(...right)) -
          Math.max(Math.min(...left), Math.min(...right)) <=
        epsilon
      )
        return false
    }
  }
  return true
}

function jointContact(a: Part, b: Part): boolean {
  const [left, right] = a.panel < b.panel ? [a, b] : [b, a]
  // The authored connecting uprights intersect locally even at the valid default 90° pose.
  // Only that adjacent upright pair is a joint; their boards, rails and other panels still collide.
  return (
    right.panel === left.panel + 1 &&
    /^Stile_.*R$/.test(left.name) &&
    /^Stile_.*L$/.test(right.name)
  )
}

export function itemFoldSelfIntersects(root: Object3D): boolean {
  root.updateWorldMatrix(true, true)
  const inverse = root.matrixWorld.clone().invert()
  const parts = partsFor(root)
  const footprints = parts.map((part) => {
    const matrix = new Matrix4().multiplyMatrices(inverse, part.mesh.matrixWorld)
    const points = part.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix))
    // The approved models' internal folds only rotate about Y; global pose was removed above.
    return {
      polygon: points.map((point): Point => [point.x, point.z]),
      minY: new Vector3(0, part.minY, 0).applyMatrix4(matrix).y,
      maxY: new Vector3(0, part.maxY, 0).applyMatrix4(matrix).y,
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minZ: Math.min(...points.map((point) => point.z)),
      maxZ: Math.max(...points.map((point) => point.z)),
    }
  })
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (parts[i]!.panel === parts[j]!.panel || jointContact(parts[i]!, parts[j]!)) continue
      if (penetrates(footprints[i]!, footprints[j]!)) return true
    }
  }
  return false
}

export function limitItemFoldControls(
  root: Object3D,
  from: Partial<ItemFoldControls>,
  requested: Partial<ItemFoldControls>,
): { controls: ItemFoldControls; limited: boolean } {
  const clamp = (value: number) => Math.min(270, Math.max(0, value))
  const start = Object.fromEntries(
    keys.map((key) => [key, clamp(from[key] ?? 90)]),
  ) as ItemFoldControls
  const target = Object.fromEntries(
    keys.map((key) => [key, Number.isFinite(requested[key]) ? clamp(requested[key]!) : start[key]]),
  ) as ItemFoldControls
  const distance = Math.max(...keys.map((key) => Math.abs(target[key] - start[key])))
  const at = (t: number) =>
    Object.fromEntries(
      keys.map((key) => [key, start[key] + (target[key] - start[key]) * t]),
    ) as ItemFoldControls
  const valid = (controls: ItemFoldControls) => {
    applyItemFoldControls(root, controls)
    return !itemFoldSelfIntersects(root)
  }
  let safe = 0
  let hasSafe = valid(start)
  const steps = Math.max(1, Math.ceil(distance / 0.25))
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps
    if (valid(at(progress))) {
      safe = progress
      hasSafe = true
      continue
    }
    if (!hasSafe) continue // Permit opening a legacy already-intersecting state out of contact.
    let blocked = progress
    for (let iteration = 0; iteration < 12; iteration++) {
      const midpoint = (safe + blocked) / 2
      if (valid(at(midpoint))) safe = midpoint
      else blocked = midpoint
    }
    const controls = at(Math.max(0, safe - 0.001 / (distance || 1)))
    applyItemFoldControls(root, controls)
    return { controls, limited: true }
  }
  const controls = hasSafe ? target : start
  applyItemFoldControls(root, controls)
  return {
    controls,
    limited:
      !hasSafe ||
      keys.some((key) => requested[key] !== undefined && requested[key] !== target[key]),
  }
}
