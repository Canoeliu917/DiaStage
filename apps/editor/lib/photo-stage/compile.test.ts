import { describe, expect, test } from 'bun:test'
import {
  AnyNode,
  getBlockFaceNormal,
  inspectBlockTopology,
  SiteNode,
  useScene,
} from '@pascal-app/core'
import { apiGraphSchema } from '../graph-schema'
import { SCENERY_LIBRARY } from '../stage/scenery'
import { readStageDocument } from '../theatre/simulation-store'
import { compilePhotoStagePlan } from './compile'
import { PHOTO_STAGE_EXAMPLE } from './example'
import { PhotoStageObjectSchema, type PhotoStagePlan, PhotoStagePlanSchema } from './plan'

const object = {
  id: 'platform',
  name: '照片台块',
  kind: 'platform' as const,
  assetId: null,
  dimensions: { width: 3, height: 1, depth: 2 },
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  color: '#c9a785',
  profile: 'rounded-platform' as const,
}
const plan: PhotoStagePlan = {
  name: '照片测试',
  summary: '尺寸均为估算。',
  stage: { width: 10, depth: 8 },
  uncertainties: ['缺少测量比例。'],
  objects: [object],
}

describe('photo stage compilation', () => {
  test('rejects non-finite, oversized, unknown and incompatible input before scene creation', () => {
    for (const patch of [
      { dimensions: { width: Infinity, height: 1, depth: 2 } },
      { dimensions: { width: 101, height: 1, depth: 2 } },
      { position: [0, -1, 0] },
      { position: [0, 0, NaN] },
      { rotation: [0.1, 0, 0] },
      { kind: 'camera' },
      { assetId: 'https://example.com/model.glb' },
      { assetId: 'SCN-SOFA-175' },
      { color: 'url(https://example.com)' },
      { stepCount: 3 },
      { hingeAngles: [90] },
    ])
      expect(PhotoStageObjectSchema.safeParse({ ...object, ...patch }).success).toBe(false)
    expect(PhotoStagePlanSchema.safeParse({ ...plan, objects: [] }).success).toBe(false)
    expect(PhotoStagePlanSchema.safeParse({ ...plan, objects: [object, object] }).success).toBe(
      false,
    )
    expect(
      PhotoStagePlanSchema.safeParse({ ...plan, objects: [{ ...object, position: [90, 0, 90] }] })
        .success,
    ).toBe(false)
    expect(
      PhotoStagePlanSchema.safeParse({ ...plan, unexpected: 'discard silently' }).success,
    ).toBe(false)
    expect(() => compilePhotoStagePlan(plan, 'https://example.com/photo.jpg')).toThrow('参考照片')
    expect(() =>
      compilePhotoStagePlan(plan, `data:image/png;base64,${'A'.repeat(6 * 1024 * 1024)}`),
    ).toThrow('参考照片')
  })

  test('all 22 catalogue entries remain native items with their transforms, color and folding controls', () => {
    expect(SCENERY_LIBRARY).toHaveLength(22)
    const before = JSON.stringify(SCENERY_LIBRARY)
    const cataloguePlan = PhotoStagePlanSchema.parse({
      ...plan,
      stage: { width: 20, depth: 20 },
      objects: SCENERY_LIBRARY.map(({ kind, asset }, i) => ({
        id: asset.id,
        name: asset.name,
        kind,
        assetId: asset.id,
        dimensions: {
          width: asset.dimensions![0],
          height: asset.dimensions![1],
          depth: asset.dimensions![2],
        },
        position: [(i % 6) * 2.5 - 6, 0, Math.floor(i / 6) * 2.5 - 5],
        rotation: [0, 0.35, 0],
        color: '#86745b',
        ...(asset.id === 'SCN-FOLD-02'
          ? { hingeAngles: [135] }
          : asset.id === 'SCN-FOLD-03'
            ? { hingeAngles: [125, 230] }
            : {}),
      })),
    })
    const graph = compilePhotoStagePlan(cataloguePlan)
    expect(apiGraphSchema.safeParse(graph).success).toBe(true)
    const items = Object.values(graph.nodes).filter((node) => node.type === 'item')
    expect(items).toHaveLength(22)
    for (const item of items) {
      const asset = SCENERY_LIBRARY.find((entry) => entry.asset.id === item.asset.id)!.asset
      expect(item.id.startsWith('item_')).toBe(true)
      expect(item.asset.src).toBe(asset.src)
      expect(item.asset.offset).toEqual(asset.offset)
      expect(item.asset.rotation).toEqual(asset.rotation)
      expect(item.scale).toEqual([1, 1, 1])
      expect(item.rotation).toEqual([0, 0.35, 0])
      const materialId = item.slots!.upholstery!.slice('scene:'.length)
      expect(
        graph.materials![materialId as keyof typeof graph.materials]!.material.properties!.color,
      ).toBe('#86745b')
      expect(item.supportSlabId).toBe('ground')
    }
    expect(items.find((item) => item.asset.id === 'SCN-FOLD-03')!.controls).toEqual({
      fold_angle_1_deg: 125,
      fold_angle_2_deg: 230,
    })
    expect(items.find((item) => item.asset.id === 'SCN-FOLD-02')!.controls).toEqual({
      fold_angle_1_deg: 135,
      fold_angle_2_deg: 90,
    })
    expect(JSON.stringify(SCENERY_LIBRARY)).toBe(before)
  })

  test('rounded and cylindrical blocks have closed topology, outward faces and editable dimensions', () => {
    for (const profile of ['rounded-platform', 'cylinder', 'box'] as const) {
      const graph = compilePhotoStagePlan({ ...plan, objects: [{ ...object, profile }] })
      const block = Object.values(graph.nodes).find((node) => node.type === 'block')!
      if (block.type !== 'block') throw new Error('Expected a native block')
      expect(inspectBlockTopology(block.topology)).toEqual([])
      const edges = new Map<string, number>()
      for (const face of block.topology.faces) {
        face.vertexIds.forEach((id, i) => {
          const key = [id, face.vertexIds[(i + 1) % face.vertexIds.length]!].sort().join(':')
          edges.set(key, (edges.get(key) ?? 0) + 1)
        })
        if (face.id.endsWith('top'))
          expect(getBlockFaceNormal(block.topology, face)![1]).toBeCloseTo(1)
        if (face.id.endsWith('bottom'))
          expect(getBlockFaceNormal(block.topology, face)![1]).toBeCloseTo(-1)
      }
      expect([...edges.values()].every((value) => value === 2)).toBe(true)
      expect(Math.min(...block.topology.vertices.map((vertex) => vertex.position[1]))).toBe(0)
      expect(Math.max(...block.topology.vertices.map((vertex) => vertex.position[1]))).toBe(1)
      expect(block.slots.body?.startsWith('scene:mat_')).toBe(true)
      if (profile === 'rounded-platform') {
        expect(block.topology.vertices.filter((vertex) => vertex.position[2] === -1)).toHaveLength(
          4,
        )
        expect(
          block.topology.vertices.filter((vertex) => vertex.position[2] > 0.2).length,
        ).toBeGreaterThan(40)
      }
    }
  })

  test('example faces the native +Z audience and stairs rise toward the left rear', () => {
    const graph = compilePhotoStagePlan(PHOTO_STAGE_EXAMPLE)
    const find = (id: string) => PHOTO_STAGE_EXAMPLE.objects.find((entry) => entry.id === id)!
    expect(find('left-door').position[0]).toBeLessThan(0)
    expect(find('right-wall').position[0]).toBeGreaterThan(0)
    expect(find('right-wall').position[2]).toBeLessThan(0)
    expect(find('sofa').rotation[1]).toBe(0)
    expect(find('poster-0').position[2]).toBeGreaterThan(find('right-wall').position[2])
    expect(find('plaque-face').position[2]).toBeGreaterThan(0)
    expect(find('sunflower-stem').position[2]).toBeGreaterThan(0)
    const leftDoor = find('left-door')
    const leftWall = find('left-wall')
    const centerOpening = find('center-opening')
    const rightWall = find('right-wall')
    const leftReturn = find('left-return')
    expect(leftReturn.position[0] + leftReturn.dimensions.depth / 2).toBeCloseTo(
      leftDoor.position[0] - leftDoor.dimensions.width / 2,
      7,
    )
    expect(leftDoor.position[0] + leftDoor.dimensions.width / 2).toBeCloseTo(
      leftWall.position[0] - leftWall.dimensions.width / 2,
      7,
    )
    expect(leftWall.position[0] + leftWall.dimensions.width / 2).toBeCloseTo(
      centerOpening.position[0] - centerOpening.dimensions.width / 2,
      7,
    )
    expect(centerOpening.position[0] + centerOpening.dimensions.width / 2).toBeCloseTo(
      rightWall.position[0] - rightWall.dimensions.width / 2,
      7,
    )
    const stair = Object.values(graph.nodes).find((node) => node.type === 'stair')!
    if (stair.type !== 'stair') throw new Error('Expected native stairs')
    const segment = graph.nodes[stair.children[0]!]!
    if (segment.type !== 'stair-segment') throw new Error('Expected native stair segment')
    const topX = stair.position[0] + Math.sin(stair.rotation) * segment.length
    const topZ = stair.position[2] + Math.cos(stair.rotation) * segment.length
    expect(stair.position[2]).toBeGreaterThan(0)
    expect(topX).toBeLessThan(stair.position[0])
    expect(topZ).toBeLessThan(stair.position[2])
    expect(stair.position[1] + segment.height).toBeCloseTo(
      find('platform-top').position[1] + find('platform-top').dimensions.height,
    )
  })

  test('curated example round-trips with native parents, portable reference and estimated scale without touching live state', () => {
    const state = useScene.getState()
    const before = JSON.stringify(PHOTO_STAGE_EXAMPLE)
    const source = 'data:image/png;base64,aGVsbG8='
    const graph = compilePhotoStagePlan(PHOTO_STAGE_EXAMPLE, source)
    const saved = JSON.parse(JSON.stringify(graph))
    expect(apiGraphSchema.safeParse(saved).success).toBe(true)
    for (const node of Object.values(graph.nodes)) {
      expect(AnyNode.safeParse(saved.nodes[node.id]).success).toBe(true)
      expect(node.id.startsWith(`${node.type === 'stair-segment' ? 'sseg' : node.type}_`)).toBe(
        true,
      )
      if (node.parentId) expect(saved.nodes[node.parentId].children).toContain(node.id)
    }
    const site = SiteNode.parse(saved.nodes[saved.rootNodeIds[0]])
    expect(site.metadata.photoStage).toEqual({
      version: 1,
      sourceImage: source,
      plan: PHOTO_STAGE_EXAMPLE,
      scaleStatus: 'estimated',
    })
    expect(site.metadata.stageHeightMeasured).toBe(false)
    expect(site.metadata.stageDimensionsMeasured).toBe(false)
    const document = readStageDocument(graph.nodes, graph.rootNodeIds)!
    expect(document.production.name).toBe(PHOTO_STAGE_EXAMPLE.name)
    expect(document.venue.width).toBe(PHOTO_STAGE_EXAMPLE.stage.width)
    expect(document.venue.depth).toBe(PHOTO_STAGE_EXAMPLE.stage.depth)
    const stair = Object.values(graph.nodes).find((node) => node.type === 'stair')!
    expect(stair.type === 'stair' && stair.stepCount).toBe(10)
    expect(Object.values(graph.nodes).some((node) => node.type === 'slab')).toBe(true)
    expect(PHOTO_STAGE_EXAMPLE.summary).toContain('不是自动视觉分析')
    expect(JSON.stringify(PHOTO_STAGE_EXAMPLE)).toBe(before)
    expect(useScene.getState()).toBe(state)
    const nextGraph = compilePhotoStagePlan(plan)
    expect(Object.keys(nextGraph.nodes).some((id) => id in graph.nodes)).toBe(false)
  })
})
