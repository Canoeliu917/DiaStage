import type { StageDimensions, StageItemKind } from './schema'

export const STAGE_OBJECT_SOURCE =
  'DiaStage_置景图例与操作指南.docx · 整合版1.0 · 2026-09-13 · 第4节'
export const STAGE_OBJECT_MODEL_SOURCE =
  'DiaStage_Prop_Menu_Preview/prop-menu-manifest.json · 1.0 · bounds_m（实际米制）'
export const STAGE_OBJECT_CATEGORIES = [
  '空间围合',
  '门窗',
  '台块与支撑',
  '沙发',
  '桌',
  '椅凳',
] as const
export type StageObjectSpec = {
  canonicalId: string
  displayName: string
  aliases: string[]
  category: (typeof STAGE_OBJECT_CATEGORIES)[number]
  kind: StageItemKind
  defaultDimensions: StageDimensions | null
  modelDimensions: StageDimensions | null
  modelDimensionsSource: typeof STAGE_OBJECT_MODEL_SOURCE
  allowedDimensionRange: null
  sourceDimensions: string
  supplementalDimensions: string
  dimensionsSource: typeof STAGE_OBJECT_SOURCE
  allowedTransforms: readonly ['move', 'rotate', 'scale']
  placementRules: 'human-confirmed'
  collisionProfile: 'visible-mesh-advisory'
  articulatedParts: readonly string[]
}

type SpecRow = [
  string,
  string,
  string[],
  StageObjectSpec['category'],
  StageItemKind,
  [number, number, number] | null,
  string,
  string,
  string[]?,
]

// Folded bounds come from the supplied catalog/GLB pose, not panel width multiplied by count.
const rows: SpecRow[] = [
  [
    'SCN-FLAT-090',
    '单帘景片',
    ['单帘', '单片景片', '景片', '景墙'],
    '空间围合',
    'scenic-flat',
    [0.9, 2.4, 0.04],
    '宽0.90m',
    '深0.04m，高2.40m',
  ],
  [
    'SCN-FOLD-02',
    '二帘组合',
    ['二帘', '双折景片', '两折景片', '折叠景片'],
    '空间围合',
    'scenic-flat',
    null,
    '单片宽0.90m',
    '片厚0.04m，高2.40m；整体包围尺寸取资源目录',
    ['折叠铰链'],
  ],
  [
    'SCN-FOLD-03',
    '三帘组合',
    ['三帘', '三折景片', '折叠景片'],
    '空间围合',
    'scenic-flat',
    null,
    '单片宽0.90m',
    '片厚0.04m，高2.40m；整体包围尺寸取资源目录',
    ['折叠铰链'],
  ],
  [
    'SCN-WIN-130',
    '窗景片',
    ['普通窗景片', '窗户', '窗'],
    '门窗',
    'window-flat',
    [1.3, 2.4, 0.08],
    '宽1.30m，净宽0.90m',
    '深0.08m，高2.40m，窗台高0.90m，洞高1.20m',
  ],
  [
    'SCN-WIN-160',
    '落地窗景片',
    ['落地窗', '窗户', '窗'],
    '门窗',
    'window-flat',
    [1.6, 2.4, 0.08],
    '宽1.60m，净宽1.00m',
    '深0.08m，高2.40m，窗台高0.15m，洞高2.10m',
  ],
  [
    'SCN-DOOR-130',
    '单门景片',
    ['单门', '单扇门', '门景片', '门'],
    '门窗',
    'door-flat',
    [1.3, 2.4, 0.08],
    '宽1.30m，净宽0.75m',
    '深0.08m，高2.40m，洞高2.10m；最新资源manifest门厚0.035m（Word旧值0.04m）',
    ['门扇铰链'],
  ],
  [
    'SCN-DOOR-160',
    '双门景片',
    ['双门', '双扇门', '门景片', '门'],
    '门窗',
    'door-flat',
    [1.6, 2.4, 0.08],
    '宽1.60m，净宽1.20m',
    '深0.08m，高2.40m，洞高2.10m；最新资源manifest门厚0.035m（Word旧值0.04m）',
    ['左门扇铰链', '右门扇铰链'],
  ],
  [
    'SCN-RISER-01',
    '一号台块',
    ['1号台块', '大台块', '平台', '台块'],
    '台块与支撑',
    'platform',
    [1.8, 0.15, 0.9],
    '宽1.80m，深0.90m，高0.15m',
    '无',
  ],
  [
    'SCN-RISER-02',
    '二号台块',
    ['2号台块', '中台块', '台块', '平台'],
    '台块与支撑',
    'platform',
    [1.2, 0.15, 0.6],
    '宽1.20m，深0.60m',
    '高0.15m',
  ],
  [
    'SCN-RISER-03',
    '三号台块',
    ['3号台块', '小台块', '台块', '平台'],
    '台块与支撑',
    'platform',
    [0.9, 0.15, 0.6],
    '宽0.90m，深0.60m',
    '高0.15m',
  ],
  [
    'SCN-TIMBER-060',
    '枕木',
    ['舞台枕木'],
    '台块与支撑',
    'neutral-block',
    [0.6, 0.15, 0.3],
    '宽0.60m，深0.30m',
    '高0.15m',
  ],
  [
    'SCN-CUBE-045',
    '方墩',
    ['方凳墩'],
    '台块与支撑',
    'neutral-block',
    [0.45, 0.45, 0.45],
    '宽0.45m',
    '深0.45m，高0.45m',
  ],
  [
    'SCN-SOFA-175',
    '长沙发',
    ['双人沙发', '三人沙发', '沙发'],
    '沙发',
    'sofa',
    [1.75, 0.85, 0.8],
    '宽1.75m，深0.80m',
    '高0.85m，座高0.43m',
  ],
  [
    'SCN-SOFA-090',
    '短沙发',
    ['单人沙发', '沙发'],
    '沙发',
    'sofa',
    [0.9, 0.85, 0.8],
    '宽0.90m，深0.80m',
    '高0.85m，座高0.43m',
  ],
  [
    'SCN-DESK-120',
    '三屉桌',
    ['三抽屉桌', '桌子', '桌'],
    '桌',
    'table',
    [1.2, 0.75, 0.55],
    '宽1.20m，深0.55m',
    '高0.75m',
    ['左抽屉滑轨', '中抽屉滑轨', '右抽屉滑轨'],
  ],
  [
    'SCN-DESK-095',
    '二屉桌',
    ['两屉桌', '双抽屉桌', '桌子', '桌'],
    '桌',
    'table',
    [0.95, 0.75, 0.55],
    '宽0.95m，深0.55m',
    '高0.75m',
    ['左抽屉滑轨', '右抽屉滑轨'],
  ],
  [
    'SCN-TABLE-090',
    '圆桌',
    ['圆形桌', '圆餐桌', '桌子', '桌'],
    '桌',
    'round-table',
    [0.9, 0.75, 0.9],
    '直径0.90m',
    '高0.75m',
  ],
  [
    'SCN-TABLE-120',
    '特殊桌',
    ['长方桌', '长桌', '桌子', '桌'],
    '桌',
    'table',
    [1.2, 0.75, 0.8],
    '宽1.20m，深0.80m',
    '高0.75m',
  ],
  [
    'SCN-CHAIR-045',
    '硬椅',
    ['硬座椅', '椅子', '椅'],
    '椅凳',
    'chair',
    [0.45, 0.85, 0.4],
    '宽0.45m，深0.40m',
    '高0.85m，座高0.45m',
  ],
  [
    'SCN-CHAIR-050',
    '软椅',
    ['软座椅', '椅子', '椅'],
    '椅凳',
    'chair',
    [0.5, 0.85, 0.5],
    '宽0.50m，深0.50m',
    '高0.85m，座高0.45m',
  ],
  [
    'SCN-BENCH-100',
    '长凳',
    ['条凳', '凳子', '凳'],
    '椅凳',
    'chair',
    [1, 0.45, 0.2],
    '宽1.00m，深0.20m',
    '高0.45m',
  ],
  [
    'SCN-STOOL-035',
    '板凳',
    ['小板凳', '凳子', '凳'],
    '椅凳',
    'chair',
    [0.35, 0.42, 0.25],
    '宽0.35m，深0.25m',
    '高0.42m',
  ],
]

// The authored folded/open poses differ from nominal panel/frame specifications.
const modelDimensions: Record<string, StageDimensions> = {
  'SCN-FOLD-02': { width: 0.92, height: 2.4, depth: 0.92 },
  'SCN-FOLD-03': { width: 0.92, height: 2.4, depth: 0.9400000000000002 },
  'SCN-WIN-130': { width: 1.3, height: 2.4, depth: 0.08200000000000002 },
  'SCN-WIN-160': { width: 1.6, height: 2.4000000000000004, depth: 0.08200000000000002 },
  'SCN-DOOR-130': { width: 1.3, height: 2.4, depth: 0.48669697251359767 },
  'SCN-DOOR-160': { width: 1.6, height: 2.4, depth: 0.3675313281472389 },
}

export const STAGE_OBJECT_REGISTRY: readonly StageObjectSpec[] = rows.map(
  ([
    canonicalId,
    displayName,
    aliases,
    category,
    kind,
    dimensions,
    sourceDimensions,
    supplementalDimensions,
    articulatedParts = [],
  ]) => ({
    canonicalId,
    displayName,
    aliases: [displayName, ...aliases],
    category,
    kind,
    defaultDimensions: dimensions
      ? { width: dimensions[0], height: dimensions[1], depth: dimensions[2] }
      : null,
    modelDimensions:
      modelDimensions[canonicalId] ??
      (dimensions ? { width: dimensions[0], height: dimensions[1], depth: dimensions[2] } : null),
    modelDimensionsSource: STAGE_OBJECT_MODEL_SOURCE,
    allowedDimensionRange: null,
    sourceDimensions,
    supplementalDimensions,
    dimensionsSource: STAGE_OBJECT_SOURCE,
    allowedTransforms: ['move', 'rotate', 'scale'],
    placementRules: 'human-confirmed',
    collisionProfile: 'visible-mesh-advisory',
    articulatedParts,
  }),
)

export function resolveStageObjectSpecs(name: string): StageObjectSpec[] {
  const normalized = name.trim().toLocaleLowerCase()
  return STAGE_OBJECT_REGISTRY.filter(
    (spec) =>
      spec.canonicalId.toLocaleLowerCase() === normalized ||
      spec.aliases.some((alias) => alias.toLocaleLowerCase() === normalized),
  )
}
