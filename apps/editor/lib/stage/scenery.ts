import {
  type AnyNode,
  type AnyNodeId,
  BlockNode,
  type BlockTopology,
  createBoxBlockTopology,
  getScaledDimensions,
  ItemNode,
} from '@pascal-app/core'
import {
  createStageStair,
  SCENERY_ROUND_SEGMENTS,
  type StageCommand,
  StageCommandSchema,
  type StageDimensions,
  StageDimensionsSchema,
  sceneryProxyParts,
} from '@pascal-app/core/stage'
import { THEATRE_CATALOG_ITEMS } from '@pascal-app/editor'
import { AVAILABLE_STAGE_SCENERY, type SceneryLibraryItem } from './prop-assets'

type AddScenery = Extract<StageCommand, { type: 'AddScenery' }>
type Vec3 = [number, number, number]

export {
  SCENERY_ROUND_SEGMENTS,
  type SceneryProxyPart,
  sceneryProxyParts,
} from '@pascal-app/core/stage'

const ASSET_KINDS: Record<string, AddScenery['kind']> = {
  'dining-table-mo9ms5yh': 'table',
  'dining-table': 'table',
  'office-table': 'table',
  'coffee-table': 'table',
  'pool-table': 'table',
  'standing-desk-mo8wgz95': 'table',
  'livingroom-chair': 'chair',
  'dining-chair': 'chair',
  'lounge-chair': 'chair',
  'office-chair': 'chair',
  'herman-miller-aeron-mo8x36k9': 'chair',
  stool: 'chair',
  sofa: 'sofa',
  'my-leather-couch-modp80ha': 'sofa',
  bookshelf: 'shelf',
  shelf: 'shelf',
  'ikea-kallax-1x4-moa2y49n': 'shelf',
  'single-bed': 'bed',
  'double-bed': 'bed',
  bunkbed: 'bed',
  column: 'neutral-block',
  pillar: 'neutral-block',
}

export const SCENERY_LIBRARY: SceneryLibraryItem[] = [
  ...AVAILABLE_STAGE_SCENERY,
  ...THEATRE_CATALOG_ITEMS.flatMap((asset) => {
    const kind = ASSET_KINDS[asset.id]
    return kind ? [{ kind, asset }] : []
  }),
]

function cylinderTopology(width: number, height: number, depth: number): BlockTopology {
  const n = SCENERY_ROUND_SEGMENTS
  const ring = (level: number) => Array.from({ length: n }, (_, i) => `v${level * n + i}`)
  const bottom = ring(0),
    top = ring(1)
  return {
    vertices: [0, 1].flatMap((level) =>
      ring(level).map((id, i) => ({
        id,
        position: [
          (Math.cos((i * Math.PI * 2) / n) * width) / 2,
          level * height,
          (Math.sin((i * Math.PI * 2) / n) * depth) / 2,
        ] as Vec3,
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

function proxyTopology(kind: AddScenery['kind'], dimensions: StageDimensions): BlockTopology {
  const topology: BlockTopology = { vertices: [], edges: [], faces: [] }
  sceneryProxyParts(kind, dimensions).forEach(({ shape, size, position }, i) => {
    const part = shape === 'cylinder' ? cylinderTopology(...size) : createBoxBlockTopology(...size)
    const id = (value: string) => `part-${i}:${value}`
    topology.vertices.push(
      ...part.vertices.map((vertex) => ({
        id: id(vertex.id),
        position: [
          vertex.position[0] + position[0],
          vertex.position[1] - size[1] / 2 + position[1],
          vertex.position[2] + position[2],
        ] as Vec3,
      })),
    )
    topology.edges.push(
      ...part.edges.map((edge) => ({
        id: id(edge.id),
        vertexIds: [id(edge.vertexIds[0]), id(edge.vertexIds[1])] as [string, string],
      })),
    )
    topology.faces.push(
      ...part.faces.map((face) => ({
        ...face,
        id: id(face.id),
        vertexIds: face.vertexIds.map(id),
      })),
    )
  })
  return topology
}

export function makeScenery(
  input: AddScenery,
  parentId: AnyNodeId,
  worldPosition: Vec3,
  worldRotation: Vec3,
): AnyNode[] {
  const command = StageCommandSchema.parse(input)
  if (command.type !== 'AddScenery') throw new Error('该命令不是布景添加操作。')
  if (![...worldPosition, ...worldRotation].every(Number.isFinite))
    throw new Error('布景的位置和角度必须是有效数值。')
  const { width, height, depth } = command.dimensionsMeters
  const common = { name: command.name, parentId, position: worldPosition, supportSlabId: 'ground' }
  if (command.libraryAssetId !== null) {
    const entry = SCENERY_LIBRARY.find(({ asset }) => asset.id === command.libraryAssetId)
    if (!entry || entry.kind !== command.kind)
      throw new Error('所选舞台库布景不存在或与布景类型不匹配。')
    const dimensions = entry.asset.dimensions
    if (!dimensions || dimensions.some((value) => !Number.isFinite(value) || value <= 0))
      throw new Error('舞台库布景缺少有效尺寸。')
    return [
      ItemNode.parse({
        ...common,
        rotation: worldRotation,
        scale: [width / dimensions[0], height / dimensions[1], depth / dimensions[2]],
        asset: {
          ...entry.asset,
          name: command.name,
          category: 'scenery',
          tags: [command.kind],
          attachTo: undefined,
        },
        metadata: { stageKind: command.kind, representation: 'physical' },
      }),
    ]
  }
  if (Math.abs(worldRotation[0]) > 1e-8 || Math.abs(worldRotation[2]) > 1e-8)
    throw new Error('可编辑布景目前支持绕竖直轴旋转，请将俯仰和侧倾设为零。')
  if (command.kind === 'stairs') {
    const stepCount = command.stepCount ?? 3
    const { stair, segment } = createStageStair(
      {
        width,
        stepHeight: height / stepCount,
        stepDepth: depth / stepCount,
        stepCount,
        position: worldPosition,
        rotation: worldRotation[1],
      },
      parentId,
      command.name,
    )
    return [stair, segment]
  }
  return [
    BlockNode.parse({
      ...common,
      rotation: worldRotation[1],
      topology: proxyTopology(command.kind, command.dimensionsMeters),
      slotNames: { body: '布景表面' },
      metadata: { stageKind: command.kind, representation: 'proxy' },
    }),
  ]
}

export function dimensionsOf(node: ItemNode | BlockNode): StageDimensions {
  if (node.type === 'item') {
    const [width, height, depth] = getScaledDimensions(node)
    return StageDimensionsSchema.parse({
      width: Math.abs(width),
      height: Math.abs(height),
      depth: Math.abs(depth),
    })
  }
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const vertex of node.topology.vertices) {
    vertex.position.forEach((value, axis) => {
      min[axis] = Math.min(min[axis]!, value)
      max[axis] = Math.max(max[axis]!, value)
    })
  }
  return StageDimensionsSchema.parse({
    width: max[0] - min[0],
    height: max[1] - min[1],
    depth: max[2] - min[2],
  })
}
