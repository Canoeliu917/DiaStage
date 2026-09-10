import {
  type AnyNode,
  type AnyNodeId,
  cloneNodesInto,
  getCatalogMaterialById,
  getHostRefFields,
  type LevelNode,
  nodeRegistry,
  SceneMaterial,
  useScene,
} from '@pascal-app/core'
import { createNodesWithSceneMaterials } from '@pascal-app/editor'
import { z } from 'zod'
import savedPresets from './build-presets.json'

const record = z.record(z.string(), z.unknown())
const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  thumbnailUrl: z.string().nullable(),
  rootKind: z.string(),
  source: z.enum(['library', 'community']),
  nodeData: z.object({
    root: record,
    descendants: z.array(record),
    materials: z.record(z.string(), SceneMaterial).optional(),
  }),
})

export type BuildPreset = z.infer<typeof presetSchema>
export type BuildSnapshot = {
  roots: Record<string, unknown>[]
  descendants: Record<string, unknown>[]
  materials?: Record<string, SceneMaterial>
}

// Public Pascal catalog snapshot fetched on 2026-09-09; no account data or live API dependency.
export const BUILD_PRESETS = z.array(presetSchema).parse(savedPresets as unknown)

const DRAW_PRESET_KINDS = new Set(['wall', 'fence', 'slab', 'ceiling', 'roof', 'door', 'window'])

export function buildPresetUsesTool(preset: BuildPreset): boolean {
  return (
    preset.rootKind === 'cabinet' ||
    (DRAW_PRESET_KINDS.has(preset.rootKind) &&
      (preset.nodeData.descendants.length === 0 ||
        (preset.rootKind === 'roof' &&
          preset.nodeData.descendants.length === 1 &&
          preset.nodeData.descendants[0]?.type === 'roof-segment')))
  )
}

export function buildPresetToolDefaults(preset: BuildPreset): Record<string, unknown> {
  if (preset.rootKind === 'cabinet') {
    return { nodeData: preset.nodeData, buildPresetId: preset.id }
  }
  const parameters = {
    ...preset.nodeData.root,
    ...(preset.rootKind === 'roof' ? preset.nodeData.descendants[0] : undefined),
  }
  const definition = nodeRegistry.get(preset.rootKind)
  for (const field of [
    'id',
    'type',
    'object',
    'name',
    'parentId',
    'children',
    'metadata',
    'visible',
    'camera',
    'position',
    'rotation',
    'side',
    'start',
    'end',
    'polygon',
    'holes',
    'holeMetadata',
    'supportSlabId',
    'support',
    ...(definition ? getHostRefFields(definition) : []),
  ])
    delete parameters[field]
  return { ...parameters, sceneMaterials: preset.nodeData.materials, buildPresetId: preset.id }
}

function validateMaterialReferences(
  value: unknown,
  materials: Record<string, SceneMaterial>,
): void {
  if (typeof value === 'string') {
    if (value.startsWith('scene:') && !materials[value.slice(6)])
      throw new Error(`预设缺少材质定义：${value}。`)
    if (value.startsWith('library:') && !getCatalogMaterialById(value.slice(8)))
      throw new Error(`预设所需的库材质暂不可用：${value}。`)
  } else if (Array.isArray(value)) {
    for (const child of value) validateMaterialReferences(child, materials)
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) validateMaterialReferences(child, materials)
  }
}

export function validateBuildSnapshot(
  snapshot: BuildSnapshot,
  sceneMaterials = useScene.getState().materials,
): {
  nodes: AnyNode[]
  rootIds: AnyNodeId[]
} {
  if (snapshot.roots.length === 0) throw new Error('预设没有可插入的根物体。')
  const records = [...snapshot.roots, ...snapshot.descendants]
  const materials = z.record(z.string(), SceneMaterial).parse(snapshot.materials ?? {})
  for (const [id, material] of Object.entries(materials)) {
    if (id !== material.id) throw new Error('预设材质标识不一致。')
  }
  validateMaterialReferences(records, { ...sceneMaterials, ...materials })
  const ids = new Set<string>()
  for (const value of records) {
    if (typeof value.id !== 'string' || ids.has(value.id))
      throw new Error('预设物体标识缺失或重复。')
    ids.add(value.id)
  }
  const rootIds = snapshot.roots.map((value) => value.id as AnyNodeId)
  const roots = new Set<string>(rootIds)
  const nodes = records.map((value) => {
    if (typeof value.type !== 'string' || value.type === 'streetscape:road-network') {
      throw new Error('该预设包含不支持的物体类型。')
    }
    const definition = nodeRegistry.get(value.type)
    if (!definition) throw new Error(`尚未加载预设所需的物体类型：${value.type}。`)
    const metadata = record.safeParse(value.metadata)
    const cleanedMetadata = metadata.success ? { ...metadata.data } : {}
    delete cleanedMetadata.isNew
    delete cleanedMetadata.isTransient
    const cleaned: Record<string, unknown> = {
      ...value,
      metadata: cleanedMetadata,
      camera: undefined,
    }
    if (roots.has(String(value.id))) cleaned.parentId = null
    else if (typeof value.parentId !== 'string' || !ids.has(value.parentId)) {
      throw new Error('预设子物体缺少有效的父级。')
    }
    const hostFields = getHostRefFields(definition)
    const hasInternalHost = hostFields.some(
      (field) => typeof value[field] === 'string' && ids.has(value[field]),
    )
    if (!hasInternalHost) for (const field of hostFields) delete cleaned[field]
    if (
      typeof cleaned.supportSlabId === 'string' &&
      cleaned.supportSlabId !== 'ground' &&
      !ids.has(cleaned.supportSlabId)
    ) {
      delete cleaned.supportSlabId
    }
    if (typeof cleaned.deckSlabId === 'string' && !ids.has(cleaned.deckSlabId)) {
      delete cleaned.deckSlabId
    }
    if (
      Array.isArray(cleaned.children) &&
      cleaned.children.some((id) => typeof id !== 'string' || !ids.has(id))
    ) {
      throw new Error('预设包含缺失的子物体。')
    }
    const parsed = definition.schema.safeParse(cleaned)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new Error(
        `预设参数与当前版本不兼容：${value.type}.${issue?.path.join('.') || '数据'}。`,
      )
    }
    return parsed.data as AnyNode
  })
  // Reject parent cycles before any scene mutation.
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    const visited = new Set<string>()
    let parent: AnyNode | undefined = node
    while (parent) {
      if (visited.has(parent.id)) throw new Error('预设父子关系存在循环。')
      visited.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId as AnyNodeId) : undefined
    }
  }
  return { nodes, rootIds }
}

export function insertBuildNodes(snapshot: BuildSnapshot, parentId: AnyNodeId): AnyNodeId[] {
  const scene = useScene.getState()
  if (scene.readOnly) throw new Error('当前场景为只读。')
  const level = scene.nodes[parentId]
  if (level?.type !== 'level') throw new Error('请先选择要插入的表演层。')
  if (!useScene.temporal.getState().isTracking) throw new Error('请先结束当前放置操作。')
  const validated = validateBuildSnapshot(snapshot)
  const cloned = cloneNodesInto(validated.nodes, { rootId: validated.rootIds[0]!, parentId })
  const selectedIds = validated.rootIds.map((id) => cloned.idMap.get(id)!)
  const roots = new Set<string>(selectedIds)
  const building = level.parentId ? scene.nodes[level.parentId as AnyNodeId] : undefined
  const nextLevel =
    building?.type === 'building'
      ? building.children
          .map((id) => scene.nodes[id as AnyNodeId])
          .filter((node): node is LevelNode => node?.type === 'level' && node.level > level.level)
          .sort((a, b) => a.level - b.level)[0]
      : undefined
  for (const node of cloned.nodes) {
    const definition = nodeRegistry.get(node.type)
    if (roots.has(node.id)) {
      if (definition?.floorplanScope === 'building' || node.type === 'elevator') {
        if (building?.type !== 'building') throw new Error('该预设需要表演层所属的有效舞台空间。')
        node.parentId = building.id
      } else node.parentId = parentId
    }
    if (node.type === 'stair') {
      node.fromLevelId = level.id
      node.toLevelId = nextLevel?.id ?? null
    } else if (node.type === 'elevator') {
      node.fromLevelId = level.id
      node.toLevelId = nextLevel?.id ?? level.id
      node.defaultLevelId = level.id
      node.servedLevelIds = undefined
      node.disabledLevelIds = []
      node.serviceOnlyLevelIds = []
    }
    const fields = [
      ...(definition ? getHostRefFields(definition) : []),
      'supportSlabId',
      'deckSlabId',
    ]
    for (const field of fields) {
      const value = (node as Record<string, unknown>)[field]
      if (typeof value === 'string' && cloned.idMap.has(value as AnyNodeId)) {
        ;(node as Record<string, unknown>)[field] = cloned.idMap.get(value as AnyNodeId)
      }
    }
  }
  createNodesWithSceneMaterials(
    cloned.nodes.map((node) =>
      roots.has(node.id) ? { node, parentId: node.parentId as AnyNodeId } : { node },
    ),
    snapshot.materials,
  )
  return selectedIds
}

export function buildPresetSnapshot(preset: BuildPreset): BuildSnapshot {
  return {
    roots: [preset.nodeData.root],
    descendants: preset.nodeData.descendants,
    materials: preset.nodeData.materials,
  }
}

const LIBRARY_LABELS: Record<string, string> = {
  '2x2 Window': '四格窗',
  'A Frame': '人字支架',
  'Arch window': '拱形窗',
  'Awning Window': '上悬窗',
  Bay: '凸窗',
  'Bay Window': '组合凸窗',
  Beam: '横梁',
  Bookshelf: '书架',
  'Box Frame': '箱形框架',
  'Casement Window': '平开窗',
  Chimney: '烟囱',
  'Cubby unit': '格子收纳架',
  Cupola: '屋顶小塔',
  'Curved Stairs': '弧形楼梯',
  'Cutback stairs': '折返楼梯',
  Dormer: '老虎窗',
  Elevator: '电梯',
  'Eyebrow vent': '眉形通风口',
  Fence: '围栏',
  'Flat roof': '平屋顶',
  'Futuristic Window': '组合分格窗',
  'Gable roof': '双坡屋顶',
  'Gambrel roof': '折线屋顶',
  Gutter: '檐沟',
  'Kallax 2x4': 'Kallax 两列四层',
  'Kallax 4x2': 'Kallax 四列两层',
  'Kallax 6x4': 'Kallax 六列四层',
  'Left Rail Stairs': '左侧栏杆楼梯',
  'Mansard roof': '复折屋顶',
  'Modular Kitchen Cabinet': '模块化橱柜',
  'Modular Kitchen Island': '模块化厨房中岛',
  'Open rack': '开放置物架',
  'Open stairs': '开放踏步楼梯',
  'Portal Frame': '门式框架',
  'Privacy Fence': '遮挡围栏',
  'Rail Fence': '横杆围栏',
  'Rectangular column': '矩形柱',
  'Rounded Column': '圆柱',
  'Shed roof': '单坡屋顶',
  'Simple stair': '简式楼梯',
  'Simple Window': '简式窗',
  'Single Hung': '单悬窗',
  'Single Strut': '斜撑',
  Skylight: '天窗',
  'Slab 15cm': '十五厘米楼板',
  'Slat Window': '百叶窗',
  'Sliding Window': '推拉窗',
  'Small Fence': '矮围栏',
  'Solar panel': '太阳能板',
  'Spiral Stairs': '螺旋楼梯',
  'Square Window': '方窗',
  'Squared Antic Column': '古典方柱',
  'Storage Shelf': '储物架',
  'Straight Stairs': '直跑楼梯',
  'Switchback stairs': '双跑折返楼梯',
  'Tall Slat Fence': '高竖条围栏',
  Trestle: '双腿支架',
  Tripod: '三脚支架',
  'V Support': 'V形支撑',
  Wall: '墙体',
  'Wall shelf': '壁挂搁板',
  'X Support': 'X形支撑',
  'Y Support': 'Y形支撑',
  'Ceiling · Follow storey': '天花板 · 随层高',
  'Default Block': '基础体块',
  'Hinged Door': '单扇平开门',
  Bathtub: '浴缸',
  'Ceiling · 2.4 m': '天花板 · 2.4米',
  'Double Door': '双扇门',
  'Thick wall 30cm': '三十厘米厚墙',
  'Ceiling · 2.7 m': '天花板 · 2.7米',
  'Curved wall': '弧形墙',
  'L-Block': 'L形体块',
  'Sliding Door': '推拉门',
  'Ceiling · 3.0 m': '天花板 · 3米',
  'Commercial steel door': '商用钢门',
  'Long Bench': '长凳',
  'Low wall': '矮墙',
  'Shower Glass Panel': '淋浴玻璃隔板',
  'Folding Door': '折叠门',
  Frame: '框架',
  'Barn Door': '谷仓门',
  'French Door': '法式双扇门',
  'Pocket Door': '暗藏推拉门',
  'Garage door': '车库门',
  'Rollup garage door': '卷帘车库门',
  'Arch opening': '拱形门洞',
}

export function buildPresetLabel(preset: BuildPreset): string {
  const label = preset.source === 'library' ? (LIBRARY_LABELS[preset.name] ?? preset.name) : preset.name
  return label.replaceAll('楼梯', '台阶').replaceAll('墙体', '景片').replaceAll('厚墙', '厚景片').replaceAll('弧形墙', '弧形景片').replaceAll('矮墙', '矮景片').replaceAll('围栏', '栏杆').replaceAll('体块', '台块').replaceAll('搁板', '置物架')
}
