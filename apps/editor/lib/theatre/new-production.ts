import {
  type AnyNode,
  BlockNode,
  type BlockTopology,
  BuildingNode,
  createBoxBlockTopology,
  LevelNode,
  type SceneGraph,
  SiteNode,
  SlabNode,
  useScene,
} from '@pascal-app/core'
import { createEmptyTableRehearsalScene } from './presets'
import { assertTheatreWritable, readTheatreDocument, THEATRE_METADATA_KEY } from './scene-adapter'
import {
  createTheatreDocument,
  type TheatreDocument,
  TheatreDocumentSchema,
  type Vec3,
} from './schema'
import { createStageSceneDocument } from './simulation'

export function createTheatreSceneGraph(name = '未命名剧目'): SceneGraph {
  const document = createStageSceneDocument(name)
  const site = SiteNode.parse({
    name: '黑匣子 · 8 × 6 米',
    polygon: {
      type: 'polygon',
      points: [
        [-4, -3],
        [4, -3],
        [4, 3],
        [-4, 3],
      ],
    },
    metadata: { [THEATRE_METADATA_KEY]: document },
  })
  const container = BuildingNode.parse({ name: '舞台空间', parentId: site.id })
  const level = LevelNode.parse({ name: '表演区', parentId: container.id, height: 4 })
  const floor = SlabNode.parse({
    name: '表演区地面',
    parentId: level.id,
    polygon: [
      [-4, -3],
      [4, -3],
      [4, 3],
      [-4, 3],
    ],
    elevation: 0,
    thickness: 0.05,
    material: { preset: 'custom', properties: { color: '#626262', roughness: 1, metalness: 0 } },
    autoFromWalls: false,
    metadata: { theatreKind: 'stage-floor' },
  })
  site.children = [container.id]
  container.children = [level.id]
  level.children = [floor.id]
  return {
    nodes: Object.fromEntries([site, container, level, floor].map((node) => [node.id, node])),
    rootNodeIds: [site.id],
    collections: {},
    materials: {},
    installedPlugins: [],
  }
}

function cylinder(radius: number, height: number, bottom: number): BlockTopology {
  const sides = 32
  const vertices: BlockTopology['vertices'] = []
  for (let ring = 0; ring < 2; ring++) {
    for (let index = 0; index < sides; index++) {
      const angle = (index * Math.PI * 2) / sides
      vertices.push({
        id: `v${ring * sides + index}`,
        position: [Math.cos(angle) * radius, bottom + ring * height, Math.sin(angle) * radius],
      })
    }
  }
  const faces: BlockTopology['faces'] = [
    {
      id: 'bottom',
      vertexIds: Array.from({ length: sides }, (_, index) => `v${index}`),
      materialSlot: 'body',
    },
    {
      id: 'top',
      vertexIds: Array.from({ length: sides }, (_, index) => `v${2 * sides - index - 1}`),
      materialSlot: 'body',
    },
    ...Array.from({ length: sides }, (_, index) => ({
      id: `side${index}`,
      vertexIds: [
        `v${index}`,
        `v${index + sides}`,
        `v${((index + 1) % sides) + sides}`,
        `v${(index + 1) % sides}`,
      ],
      materialSlot: 'body',
    })),
  ]
  const edges = new Map<string, BlockTopology['edges'][number]>()
  for (const face of faces) {
    face.vertexIds.forEach((from, index) => {
      const to = face.vertexIds[(index + 1) % face.vertexIds.length]!
      const key = [from, to].sort().join(':')
      if (!edges.has(key)) edges.set(key, { id: `e${edges.size}`, vertexIds: [from, to] })
    })
  }
  return { vertices, edges: [...edges.values()], faces }
}

function box(width: number, height: number, depth: number, position: Vec3): BlockTopology {
  const topology = createBoxBlockTopology(width, height, depth)
  topology.vertices = topology.vertices.map((vertex) => ({
    ...vertex,
    position: vertex.position.map((value, axis) => value + position[axis]!) as Vec3,
  }))
  return topology
}

function combine(parts: BlockTopology[]): BlockTopology {
  return {
    vertices: parts.flatMap((part, index) =>
      part.vertices.map((vertex) => ({ ...vertex, id: `${index}:${vertex.id}` })),
    ),
    edges: parts.flatMap((part, index) =>
      part.edges.map((edge) => ({
        ...edge,
        id: `${index}:${edge.id}`,
        vertexIds: edge.vertexIds.map((id) => `${index}:${id}`) as [string, string],
      })),
    ),
    faces: parts.flatMap((part, index) =>
      part.faces.map((face) => ({
        ...face,
        id: `${index}:${face.id}`,
        vertexIds: face.vertexIds.map((id) => `${index}:${id}`),
      })),
    ),
  }
}

export function addEmptyTableExample(): TheatreDocument {
  assertTheatreWritable()
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')
  if (!site) throw new Error('场地尚未载入，请稍后重试')
  const current = readTheatreDocument() ?? createTheatreDocument('未命名剧目')
  const scene = createEmptyTableRehearsalScene()
  scene.number = String(current.scenes.length + 1)
  const origin = current.venue.origin
  const offset = (point: Vec3): Vec3 => [
    point[0] + origin[0],
    point[1] + origin[1],
    point[2] + origin[2],
  ]
  scene.roles = scene.roles.map((role) => ({ ...role, position: offset(role.position) }))
  scene.marks = scene.marks.map((mark) => ({ ...mark, position: offset(mark.position) }))
  scene.props = scene.props.map((prop) => ({
    ...prop,
    presetPosition: offset(prop.presetPosition),
    transfers: prop.transfers.map((transfer) => ({
      ...transfer,
      ...(transfer.position ? { position: offset(transfer.position) } : {}),
    })),
  }))
  const container = BuildingNode.parse({
    name: '空桌 · 排演布置',
    parentId: site.id,
    position: origin,
  })
  const level = LevelNode.parse({
    name: '空桌 · 表演区',
    parentId: container.id,
    height: current.venue.height,
  })
  container.children = [level.id]
  const makeBlock = (
    name: string,
    position: Vec3,
    topology: BlockTopology,
    kind: string,
    rotation = 0,
  ) =>
    BlockNode.parse({
      name,
      parentId: level.id,
      position,
      rotation,
      topology,
      metadata: { theatreKind: kind, rehearsalSceneId: scene.id },
    })
  const chair = combine([
    box(0.46, 0.06, 0.46, [0, 0.42, 0]),
    box(0.46, 0.48, 0.06, [0, 0.48, -0.2]),
    ...[-0.18, 0.18].flatMap((x) => [-0.18, 0.18].map((z) => box(0.045, 0.42, 0.045, [x, 0, z]))),
  ])
  const objects = [
    makeBlock(
      '圆桌 · 直径 1.3 米',
      [0, 0, 0],
      combine([cylinder(0.65, 0.06, 0.72), cylinder(0.1, 0.72, 0), cylinder(0.32, 0.04, 0)]),
      'furniture',
    ),
    makeBlock('送信方座椅', [1.1, 0, 0], chair, 'furniture', -Math.PI / 2),
    makeBlock('离开方座椅', [-1.1, 0, 0], chair, 'furniture', Math.PI / 2),
    makeBlock(
      '实用门 · 排练代理',
      [-3, 0, -2.3],
      combine([
        box(0.08, 2.18, 0.12, [-0.49, 0, 0]),
        box(0.08, 2.18, 0.12, [0.49, 0, 0]),
        box(1.06, 0.08, 0.12, [0, 2.1, 0]),
        box(0.9, 2.05, 0.035, [0, 0.025, 0]),
      ]),
      'scenic-unit',
    ),
  ]
  const letter = makeBlock(
    '未拆开的信',
    [0, 0.78, 0],
    createBoxBlockTopology(0.22, 0.006, 0.11),
    'prop',
  )
  objects.push(letter)
  scene.props[0]!.nodeId = letter.id
  level.children = objects.map((node) => node.id)
  const document = TheatreDocumentSchema.parse({
    ...current,
    scenes: [...current.scenes, scene],
    activeSceneId: scene.id,
  })
  const nodes: AnyNode[] = [container, level, ...objects]
  state.applyNodeChanges({
    create: nodes.map((node) => ({ node })),
    update: [
      { id: site.id, data: { metadata: { ...site.metadata, [THEATRE_METADATA_KEY]: document } } },
    ],
  })
  return document
}
