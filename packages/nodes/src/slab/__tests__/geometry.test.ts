import { describe, expect, test } from 'bun:test'
import {
  BuildingNode,
  type GeometryContext,
  LevelNode,
  type SiteNode,
  SlabNode,
} from '@pascal-app/core'
import { Mesh } from 'three'
import { buildSlabGeometry } from '../geometry'

function geometryContext(site: ReturnType<typeof SiteNode.parse>): GeometryContext {
  const building = BuildingNode.parse({
    id: 'building_test',
    parentId: site.id,
    children: ['level_test'],
  })
  const level = LevelNode.parse({
    id: 'level_test',
    parentId: building.id,
    level: 0,
    height: 2.5,
    children: [],
  })
  const nodes = { [site.id]: site, [building.id]: building, [level.id]: level }
  return {
    resolve: (id) => nodes[id as keyof typeof nodes],
    children: [],
    siblings: [],
    parent: level,
  }
}

describe('buildSlabGeometry', () => {
  test('copies the primary UVs into uv2 for every slab mesh', () => {
    const slab = SlabNode.parse({
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    })

    const group = buildSlabGeometry(slab, undefined, 'solid', false)
    const meshes = group.children.filter((child): child is Mesh => child instanceof Mesh)

    expect(meshes).toHaveLength(2)
    for (const mesh of meshes) {
      const uv = mesh.geometry.getAttribute('uv')
      const uv2 = mesh.geometry.getAttribute('uv2')

      expect(uv2).toBeDefined()
      expect(uv2.itemSize).toBe(2)
      expect(uv2.count).toBe(uv.count)
      expect(Array.from(uv2.array)).toEqual(Array.from(uv.array))
    }
  })

  test('solid slab meshes stay at the level plane; recessed meshes sink to the elevation', () => {
    const polygon: Array<[number, number]> = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]

    const solid = SlabNode.parse({ elevation: 0.3, thickness: 0.1, polygon })
    const solidGroup = buildSlabGeometry(solid, undefined, 'solid', false)
    for (const mesh of solidGroup.children.filter(
      (child): child is Mesh => child instanceof Mesh,
    )) {
      expect(mesh.position.y).toBe(0)
    }

    const recessed = SlabNode.parse({
      elevation: 0.45,
      recessed: true,
      recessedRimElevation: 0.6,
      polygon,
    })
    const recessedGroup = buildSlabGeometry(recessed, undefined, 'solid', false)
    const recessedMeshes = recessedGroup.children.filter(
      (child): child is Mesh => child instanceof Mesh,
    )
    expect(recessedMeshes.length).toBeGreaterThan(0)
    let localTop = Number.NEGATIVE_INFINITY
    for (const mesh of recessedMeshes) {
      expect(mesh.position.y).toBeCloseTo(0.45)
      mesh.geometry.computeBoundingBox()
      localTop = Math.max(localTop, mesh.geometry.boundingBox?.max.y ?? Number.NEGATIVE_INFINITY)
    }
    expect(localTop).toBeCloseTo(0.15)
  })
})
