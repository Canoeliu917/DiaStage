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
  type StageCommand,
  StageCommandSchema,
  type StageDimensions,
  StageDimensionsSchema,
} from '@pascal-app/core/stage'
import { THEATRE_CATALOG_ITEMS } from '@pascal-app/editor'

type AddScenery = Extract<StageCommand, { type: 'AddScenery' }>
type Vec3 = [number, number, number]
type Box = [width: number, height: number, depth: number, x: number, y: number, z: number]

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

export const SCENERY_LIBRARY = THEATRE_CATALOG_ITEMS.flatMap((asset) => {
  const kind = ASSET_KINDS[asset.id]
  return kind ? [{ kind, asset }] : []
})

function proxyBoxes(kind: AddScenery['kind']): Box[] {
  switch (kind) {
    case 'door-flat':
      return [
        [0.12, 1, 1, -0.44, 0, 0],
        [0.12, 1, 1, 0.44, 0, 0],
        [0.76, 0.14, 1, 0, 0.86, 0],
      ]
    case 'window-flat':
      return [
        [0.12, 1, 1, -0.44, 0, 0],
        [0.12, 1, 1, 0.44, 0, 0],
        [0.76, 0.15, 1, 0, 0.85, 0],
        [0.76, 0.32, 1, 0, 0, 0],
        [0.04, 0.53, 0.5, 0, 0.32, 0],
      ]
    case 'rail-or-divider':
      return [
        [0.08, 1, 1, -0.46, 0, 0],
        [0.08, 1, 1, 0.46, 0, 0],
        [0.84, 0.08, 1, 0, 0.92, 0],
        [0.84, 0.06, 0.6, 0, 0.5, 0],
      ]
    case 'screen':
      return [
        [0.32, 1, 0.4, -0.34, 0, 0.3],
        [0.36, 1, 0.4, 0, 0, -0.3],
        [0.32, 1, 0.4, 0.34, 0, 0.3],
      ]
    case 'curtain':
      return Array.from({ length: 10 }, (_, i) => [
        0.1,
        1,
        0.5,
        -0.45 + i * 0.1,
        0,
        i % 2 ? 0.25 : -0.25,
      ])
    case 'table':
      return [[1, 0.1, 1, 0, 0.9, 0], ...legs(0.9)]
    case 'chair':
      return [[1, 0.1, 1, 0, 0.4, 0], [1, 0.5, 0.14, 0, 0.5, 0.43], ...legs(0.4)]
    case 'sofa':
      return [
        [1, 0.45, 1, 0, 0, 0],
        [1, 0.55, 0.2, 0, 0.45, 0.4],
        [0.12, 0.25, 0.8, -0.44, 0.45, -0.1],
        [0.12, 0.25, 0.8, 0.44, 0.45, -0.1],
      ]
    case 'counter':
      return [
        [1, 0.1, 1, 0, 0.9, 0],
        [0.1, 0.9, 0.9, -0.4, 0, 0],
        [0.1, 0.9, 0.9, 0.4, 0, 0],
        [0.7, 0.9, 0.08, 0, 0, -0.41],
      ]
    case 'shelf':
      return [
        [0.08, 1, 1, -0.46, 0, 0],
        [0.08, 1, 1, 0.46, 0, 0],
        [0.84, 1, 0.06, 0, 0, 0.47],
        ...Array.from({ length: 4 }, (_, i): Box => [0.84, 0.05, 0.94, 0, (i * 0.95) / 3, -0.03]),
      ]
    case 'bed':
      return [[1, 0.45, 0.92, 0, 0.15, -0.04], [1, 1, 0.08, 0, 0, 0.46], ...legs(0.15)]
    default:
      return [[1, 1, 1, 0, 0, 0]]
  }
}

function legs(height: number): Box[] {
  return [-0.455, 0.455].flatMap((x) =>
    [-0.455, 0.455].map((z): Box => [0.09, height, 0.09, x, 0, z]),
  )
}

function proxyTopology(kind: AddScenery['kind'], dimensions: StageDimensions): BlockTopology {
  const topology: BlockTopology = { vertices: [], edges: [], faces: [] }
  const { width, height, depth } = dimensions
  proxyBoxes(kind).forEach(([w, h, d, x, y, z], i) => {
    const box = createBoxBlockTopology(w * width, h * height, d * depth)
    const id = (value: string) => `part-${i}:${value}`
    topology.vertices.push(
      ...box.vertices.map((vertex) => ({
        id: id(vertex.id),
        position: [
          vertex.position[0] + x * width,
          vertex.position[1] + y * height,
          vertex.position[2] + z * depth,
        ] as Vec3,
      })),
    )
    topology.edges.push(
      ...box.edges.map((edge) => ({
        id: id(edge.id),
        vertexIds: [id(edge.vertexIds[0]), id(edge.vertexIds[1])] as [string, string],
      })),
    )
    topology.faces.push(
      ...box.faces.map((face) => ({ ...face, id: id(face.id), vertexIds: face.vertexIds.map(id) })),
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
