import {
  type AnyNode,
  BlockNode,
  type BlockTopology,
  createBoxBlockTopology,
  generateSceneMaterialId,
  ItemNode,
  type SceneGraph,
  SceneMaterial,
  SiteNode,
} from '@pascal-app/core'
import { apiGraphSchema } from '../graph-schema'
import { createManualStageGraph } from '../stage/initial-stage'
import { makeScenery } from '../stage/scenery'
import { THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { readStageDocument } from '../theatre/simulation-store'
import { type PhotoStageObject, type PhotoStagePlan, PhotoStagePlanSchema } from './plan'

const ITEM_COLOR_SLOTS = [
  'body',
  'frame',
  'component',
  'top',
  'upholstery',
  'metal',
  'handle',
  'platform',
  'opening',
  'floor',
]

function profileTopology(object: PhotoStageObject): BlockTopology {
  const { width, height, depth } = object.dimensions
  if (object.profile === 'box') return createBoxBlockTopology(width, height, depth)
  const points: [number, number][] =
    object.profile === 'cylinder'
      ? Array.from({ length: 24 }, (_, i) => [
          (Math.cos((i * Math.PI) / 12) * width) / 2,
          (Math.sin((i * Math.PI) / 12) * depth) / 2,
        ])
      : [
          [width / 2, -depth / 2],
          ...Array.from({ length: 25 }, (_, i): [number, number] => {
            const angle = (i * Math.PI) / 24
            return [(Math.cos(angle) * width) / 2, depth * 0.1 + Math.sin(angle) * depth * 0.4]
          }),
          [-width / 2, -depth / 2],
        ]
  const n = points.length
  const bottom = points.map((_, i) => `v${i}`)
  const top = points.map((_, i) => `v${n + i}`)
  return {
    vertices: [0, height].flatMap((y, ring) =>
      points.map(([x, z], i) => ({
        id: `v${ring * n + i}`,
        position: [x, y, z] as [number, number, number],
      })),
    ),
    edges: bottom.flatMap((id, i) => [
      { id: `b${i}`, vertexIds: [id, bottom[(i + 1) % n]!] as [string, string] },
      { id: `t${i}`, vertexIds: [top[i]!, top[(i + 1) % n]!] as [string, string] },
      { id: `s${i}`, vertexIds: [id, top[i]!] as [string, string] },
    ]),
    faces: [
      { id: 'bottom', vertexIds: bottom, materialSlot: 'body' },
      { id: 'top', vertexIds: [...top].reverse(), materialSlot: 'body' },
      ...bottom.map((id, i) => ({
        id: `side${i}`,
        vertexIds: [id, top[i]!, top[(i + 1) % n]!, bottom[(i + 1) % n]!],
        materialSlot: 'body',
      })),
    ],
  }
}

export function compilePhotoStagePlan(
  input: PhotoStagePlan,
  sourceImageDataUrl?: string,
): SceneGraph {
  const plan = PhotoStagePlanSchema.parse(input)
  if (
    sourceImageDataUrl !== undefined &&
    (sourceImageDataUrl.length > 6 * 1024 * 1024 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(sourceImageDataUrl))
  )
    throw new Error('参考照片须为不超过 6 MiB 的 JPEG、PNG 或 WebP 内嵌图片。')
  const graph = createManualStageGraph({
    type: 'other',
    widthMeters: plan.stage.width,
    depthMeters: plan.stage.depth,
    heightMeters: null,
  })
  const site = SiteNode.parse(graph.nodes[graph.rootNodeIds[0]!]!)
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const document = readStageDocument(graph.nodes, graph.rootNodeIds)!
  document.production.name = plan.name
  document.venue.name = plan.name
  site.name = plan.name
  site.metadata = {
    ...site.metadata,
    [THEATRE_METADATA_KEY]: document,
    photoStage: { version: 1, sourceImage: sourceImageDataUrl, plan, scaleStatus: 'estimated' },
    stageDimensionsMeasured: false,
  }
  graph.nodes[site.id] = site
  const floor = Object.values(graph.nodes).find((node) => node.type === 'slab')!
  if (floor.type === 'slab')
    floor.material = {
      preset: 'custom',
      properties: {
        color: '#c9bea8',
        roughness: 1,
        metalness: 0,
        opacity: 1,
        transparent: false,
        side: 'front',
      },
    }
  const issuedAt = new Date().toISOString()
  for (const object of plan.objects) {
    const [x, y, z] = object.position
    const nodes: AnyNode[] = makeScenery(
      {
        type: 'AddScenery',
        meta: {
          commandId: object.id,
          transactionId: 'photo-stage',
          source: 'manual',
          issuedAt,
          expectedDocumentVersion: 0,
        },
        nodeId: object.id,
        name: object.name,
        kind: object.kind,
        libraryAssetId: object.assetId,
        dimensionsMeters: object.dimensions,
        stepCount: object.stepCount,
        transform: {
          position: { x, y, z },
          rotationDegrees: {
            x: (object.rotation[0] * 180) / Math.PI,
            y: (object.rotation[1] * 180) / Math.PI,
            z: (object.rotation[2] * 180) / Math.PI,
          },
        },
      },
      level.id,
      object.position,
      object.rotation,
    )
    let primary = nodes[0]!
    if (object.profile && primary.type === 'block')
      primary = BlockNode.parse({ ...primary, topology: profileTopology(object) })
    if (object.hingeAngles && primary.type === 'item')
      primary = ItemNode.parse({
        ...primary,
        controls: {
          fold_angle_1_deg: object.hingeAngles[0],
          fold_angle_2_deg: object.hingeAngles[1] ?? 90,
        },
      })
    if (object.color) {
      const id = generateSceneMaterialId()
      const material = SceneMaterial.parse({
        id,
        name: `${object.name} · 照片估色`,
        material: {
          preset: 'custom',
          properties: { color: object.color, roughness: 0.9, metalness: 0 },
        },
      })
      graph.materials![id] = material
      const keys =
        primary.type === 'item'
          ? ITEM_COLOR_SLOTS
          : primary.type === 'stair'
            ? ['body', 'treads']
            : ['body']
      if (primary.type === 'item' || primary.type === 'block' || primary.type === 'stair')
        primary.slots = Object.fromEntries(keys.map((key) => [key, `scene:${id}`]))
    }
    nodes[0] = primary
    for (const node of nodes) {
      node.metadata = {
        ...node.metadata,
        photoStage: {
          objectId: object.id,
          scaleStatus: 'estimated',
          source: 'photo-interpretation',
          ...(object.profile ? { profile: object.profile } : {}),
        },
      }
      graph.nodes[node.id] = node
    }
    if (level.type === 'level') level.children.push(primary.id as (typeof level.children)[number])
  }
  apiGraphSchema.parse(graph)
  return graph
}
