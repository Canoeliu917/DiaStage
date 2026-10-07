import { type PhotoStageObject, PhotoStagePlanSchema } from './plan'

const objects: PhotoStageObject[] = []
const add = (
  id: string,
  name: string,
  kind: PhotoStageObject['kind'],
  size: [number, number, number],
  position: [number, number, number],
  color: string,
  extra: Partial<PhotoStageObject> = {},
) =>
  objects.push({
    id,
    name,
    kind,
    assetId: null,
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    position,
    rotation: [0, 0, 0],
    color,
    ...extra,
  })

add('platform', '弧形前沿主台 · 估算', 'platform', [6.8, 1.05, 3.5], [0, 0, -0.5], '#c29576', {
  profile: 'rounded-platform',
})
add(
  'platform-top',
  '弧形台面浅色铺装',
  'platform',
  [6.84, 0.055, 3.52],
  [0, 1.05, -0.5],
  '#d8cdb8',
  { profile: 'rounded-platform' },
)
add(
  'left-stair',
  '左侧向前场延伸的十级台阶',
  'stairs',
  [1.02, 1.105, 2.6],
  [-1.98, 0, 2.77942],
  '#d7cdb9',
  { stepCount: 10, rotation: [0, -Math.PI + 0.65, 0] },
)
add('left-door', '左后方门景片', 'door-flat', [1.3, 2.45, 0.28], [-2.68, 1.105, -1.88], '#e2d9c4', {
  assetId: 'SCN-DOOR-130',
})
add(
  'left-door-leaf',
  '左门深棕色门面',
  'neutral-block',
  [0.75, 2.05, 0.035],
  [-2.68, 1.105, -1.96],
  '#392b23',
)
add(
  'left-wall',
  '左后方米白景墙',
  'scenic-flat',
  [1.37, 2.6, 0.08],
  [-1.345, 1.105, -1.98],
  '#e0d6bd',
  { assetId: 'SCN-FLAT-090' },
)
add('center-opening', '中央窄门框', 'door-flat', [1.02, 2.6, 0.1], [-0.15, 1.105, -1.98], '#dbd1b9')
add(
  'center-door',
  '中央浅绿半门',
  'neutral-block',
  [0.72, 1.28, 0.055],
  [-0.17, 1.105, -1.985],
  '#a5b6a1',
)
add(
  'center-door-upper',
  '中央门上部浅色嵌板',
  'neutral-block',
  [0.65, 0.7, 0.055],
  [-0.17, 2.42, -1.985],
  '#bbc8b1',
)
add(
  'right-wall',
  '沙发后方米白景墙',
  'scenic-flat',
  [3.12, 2.6, 0.08],
  [1.92, 1.105, -1.98],
  '#e4dac2',
  { assetId: 'SCN-FLAT-090' },
)
add('wall-cap', '后墙浅色檐口', 'neutral-block', [6.62, 0.15, 0.24], [0.1, 3.705, -1.99], '#ddd2bc')
add(
  'left-return',
  '左门侧向短墙',
  'scenic-flat',
  [0.85, 2.5, 0.08],
  [-3.37, 1.105, -1.55],
  '#bdad91',
  { assetId: 'SCN-FLAT-090', rotation: [0, -Math.PI / 2, 0] },
)
add('sofa', '右后方蓝灰长沙发', 'sofa', [2.13, 0.83, 0.82], [1.78, 1.105, -1.34], '#6e8286', {
  assetId: 'SCN-SOFA-175',
})
add(
  'pillow-left',
  '沙发左侧米白靠垫',
  'neutral-block',
  [0.37, 0.38, 0.18],
  [1.1, 1.525, -1.26],
  '#ded6bf',
)
add(
  'pillow-right',
  '沙发右侧米白靠垫',
  'neutral-block',
  [0.37, 0.38, 0.18],
  [2.46, 1.525, -1.26],
  '#e8dec7',
)
add('cabinet', '左后方窄木柜', 'shelf', [0.65, 1.78, 0.39], [-1.87, 1.105, -1.52], '#937451', {
  rotation: [0, Math.PI, 0],
})
add(
  'cabinet-lower',
  '木柜下柜门',
  'neutral-block',
  [0.57, 0.73, 0.04],
  [-1.87, 1.105, -1.3],
  '#a1855d',
)
add(
  'table',
  '左侧小桌 · 库圆桌近似',
  'round-table',
  [0.79, 0.71, 0.58],
  [-1.07, 1.105, -0.58],
  '#51483d',
  { assetId: 'SCN-TABLE-090' },
)
add('stool-mint', '桌左侧浅绿小凳', 'chair', [0.4, 0.45, 0.32], [-1.78, 1.105, -0.39], '#98b6a3', {
  assetId: 'SCN-STOOL-035',
})
add('stool-dark', '桌右侧木色小凳', 'chair', [0.4, 0.44, 0.32], [-0.45, 1.105, -0.22], '#624e38', {
  assetId: 'SCN-STOOL-035',
})

for (const [i, x, y, color] of [
  [0, 0.73, 2.57, '#494949'],
  [1, 1.34, 2.6, '#b8b8ab'],
  [2, 1.88, 2.88, '#676a61'],
  [3, 1.88, 2.24, '#8b806d'],
  [4, 2.4, 2.53, '#60645c'],
  [5, 2.88, 3.04, '#565d57'],
  [6, 3.0, 2.38, '#8d9084'],
] as const) {
  add(
    `poster-frame-${i}`,
    `后墙装饰画 ${i + 1} · 框`,
    'neutral-block',
    [0.43, 0.59, 0.025],
    [x, y, -1.92],
    '#7a6b51',
  )
  add(
    `poster-${i}`,
    `后墙装饰画 ${i + 1} · 色块代替画面`,
    'neutral-block',
    [0.36, 0.51, 0.015],
    [x, y + 0.04, -1.9],
    color,
  )
}
add(
  'plaque-frame',
  '前台纪念牌 · 深色外框',
  'neutral-block',
  [1.51, 0.64, 0.055],
  [1.48, 0.39, 1.143],
  '#3b302c',
  { rotation: [0, 0.2, 0] },
)
add(
  'plaque-gold',
  '纪念牌金色边框',
  'neutral-block',
  [1.4, 0.55, 0.03],
  [1.48 + Math.sin(0.2) * 0.0425, 0.435, 1.143 + Math.cos(0.2) * 0.0425],
  '#c5ad65',
  { rotation: [0, 0.2, 0] },
)
add(
  'plaque-face',
  '纪念牌牌面 · 文字未确认',
  'neutral-block',
  [1.17, 0.38, 0.02],
  [1.48 + Math.sin(0.2) * 0.0675, 0.515, 1.143 + Math.cos(0.2) * 0.0675],
  '#514432',
  { rotation: [0, 0.2, 0] },
)
add(
  'lattice-inset',
  '前台下方深色格栅底板',
  'neutral-block',
  [1.52, 0.37, 0.04],
  [-0.28, 0.18, 1.272],
  '#493e32',
)
for (let i = 0; i < 8; i++)
  add(
    `lattice-${i}`,
    `前台格栅竖条 ${i + 1}`,
    'neutral-block',
    [0.025, 0.35, 0.035],
    [-0.93 + i * 0.19, 0.19, 1.3095],
    '#a39170',
  )

add(
  'clothes-rail',
  '右侧落地晾衣架',
  'rail-or-divider',
  [1.46, 2.1, 0.09],
  [4.2, 0, -0.69],
  '#776d58',
)
for (let i = 0; i < 4; i++)
  add(
    `cloth-${i}`,
    `晾衣架浅色布片 ${i + 1}`,
    'curtain',
    [0.27, 1.63 - (i % 2) * 0.19, 0.04],
    [3.67 + i * 0.35, 0.39 + (i % 2) * 0.19, -0.625],
    i % 2 ? '#ede8d8' : '#dcdacb',
  )
add('left-wing', '左后黑色边幕', 'curtain', [1.35, 4.02, 0.12], [-4.47, 0, -2.62], '#272724')
add('right-wing', '右后黑色边幕', 'curtain', [1.15, 4.02, 0.12], [4.59, 0, -2.62], '#272724')

const planters = [
  { x: -4.6, z: 1.25, width: 1.08, height: 0.72 },
  { x: -4.05, z: 2.54, width: 1.65, height: 0.42 },
  { x: -3.5, z: 3.14, width: 1.6, height: 0.15 },
  { x: -0.33, z: 1.6, width: 1.72, height: 0.08 },
  { x: 1.6, z: 2.1, width: 1.76, height: 0.4 },
  { x: 3.65, z: 1.72, width: 1.47, height: 0.6 },
]
for (const [index, planter] of planters.entries()) {
  const { x, z, width, height } = planter
  add(
    `planter-base-${index}`,
    `前景花台 ${index + 1} · 米色基座`,
    'neutral-block',
    [width + 0.16, height, 0.57],
    [x, 0, z],
    '#c9bba0',
  )
  add(
    `planter-box-${index}`,
    `前景花台 ${index + 1} · 青绿花箱`,
    'neutral-block',
    [width, 0.2, 0.44],
    [x, height, z],
    '#79a9a0',
  )
  for (let cluster = 0; cluster < 3; cluster++) {
    const dx = x + (cluster - 1) * width * 0.3
    add(
      `leaves-${index}-${cluster}`,
      `花台 ${index + 1} · 绿叶簇 ${cluster + 1}`,
      'neutral-block',
      [width * 0.28, 0.2 + (cluster % 2) * 0.08, 0.4],
      [dx, height + 0.2, z],
      '#728764',
      { profile: 'cylinder' },
    )
    add(
      `flowers-${index}-${cluster}`,
      `花台 ${index + 1} · ${cluster % 2 ? '米白' : '暖黄'}花簇 ${cluster + 1}`,
      'neutral-block',
      [width * 0.22, 0.14, 0.25],
      [dx, height + 0.4 + (cluster % 2) * 0.08, z + 0.05],
      cluster % 2 ? '#f0e5bd' : '#dabd5b',
      { profile: 'cylinder' },
    )
  }
}
add(
  'sunflower-stem',
  '右前景向日葵 · 茎',
  'neutral-block',
  [0.035, 0.95, 0.035],
  [3.12, 0, 2.15],
  '#6f8355',
  { profile: 'cylinder' },
)
add(
  'sunflower-petals',
  '右前景向日葵 · 花冠',
  'neutral-block',
  [0.36, 0.33, 0.1],
  [3.12, 0.95, 2.15],
  '#ddbd52',
  { profile: 'cylinder' },
)
add(
  'sunflower-center',
  '右前景向日葵 · 花心',
  'neutral-block',
  [0.16, 0.16, 0.035],
  [3.12, 1.035, 2.2175],
  '#67503b',
  { profile: 'cylinder' },
)
add(
  'wall-cross-vertical',
  '左墙木十字 · 竖杆',
  'neutral-block',
  [0.035, 0.57, 0.025],
  [-1.5, 2.99, -1.91],
  '#a27649',
)
add(
  'wall-cross-horizontal',
  '左墙木十字 · 横杆',
  'neutral-block',
  [0.34, 0.035, 0.025],
  [-1.5, 3.36, -1.885],
  '#a27649',
)
add(
  'wall-red-decoration',
  '左墙红色装饰',
  'neutral-block',
  [0.3, 0.34, 0.025],
  [-0.77, 2.99, -1.91],
  '#ba3e2e',
)
export const PHOTO_STAGE_EXAMPLE = PhotoStagePlanSchema.parse({
  name: '照片复原 · 花开庭院（估算）',
  summary:
    '依据参考照片下半张人工解读的可编辑示例：弧形高台、左侧台阶、米白后墙、蓝灰沙发、晾衣架与前景花台。此示例由助手编排，不是自动视觉分析结果。',
  stage: { width: 11, depth: 7 },
  uncertainties: [
    '所有尺寸和位置均为单张照片的比例估算，未经现场测量；整体按约 11 × 7 米排布。',
    '仅参考照片下半张暖色舞台；透视遮挡后的背面、台阶级数与门窗细节需要人工核对。',
    '纪念牌文字无法可靠确认，装饰画、花朵和布料使用可编辑基础形体近似。',
    '当前库模型保留其原生结构，照片中的材质与细节通过色彩近似；舞台灯光并未从照片测量。',
  ],
  objects,
})
