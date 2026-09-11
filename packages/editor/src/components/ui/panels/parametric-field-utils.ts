const FIELD_LABELS: Record<string, string> = {
  baseHeight: '底座高度',
  baseStyle: '底座样式',
  bracketStyle: '支架样式',
  columns: '列数',
  curve: '弯曲',
  curveOffset: '曲线偏移',
  depth: '深度',
  edgeInset: '边缘内缩',
  elevation: '标高',
  frameDepth: '框架深度',
  frameThickness: '框架厚度',
  groundClearance: '离地间隙',
  height: '高度',
  length: '长度',
  opacity: '不透明度',
  operationState: '开合程度',
  position: '位置',
  postCap: '立柱帽',
  postSize: '立柱尺寸',
  postSpacing: '立柱间距',
  rotation: '旋转',
  rows: '行数',
  scale: '缩放',
  showInfill: '显示填充',
  slatGap: '板条间隙',
  style: '样式',
  thickness: '厚度',
  topRailHeight: '顶部横杆高度',
  width: '宽度',
  withBack: '带背板',
  withBottom: '带底板',
  withSides: '带侧板',
}

const OPTION_LABELS: Record<string, string> = {
  bookshelf: '书架',
  cubby: '格架',
  flat: '平顶',
  floating: '悬空',
  grounded: '落地',
  hidden: '隐藏',
  horizontal: '水平',
  industrial: '工业式',
  minimal: '简约',
  none: '无',
  'open-rack': '开放架',
  privacy: '遮挡式',
  pyramid: '棱锥',
  rail: '横杆',
  slat: '板条',
  'wall-shelf': '壁架',
}

export function precisionForStep(step: number): number {
  if (step <= 0) return 0
  return Math.max(0, Math.ceil(-Math.log10(step)))
}

export function prettifyKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function prettifyEnumValue(value: string): string {
  if (OPTION_LABELS[value]) return OPTION_LABELS[value]
  return value
    .split(/[-_\s]/)
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join(' ')
}
