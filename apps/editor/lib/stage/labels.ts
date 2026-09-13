import type { StageItemKind } from '@pascal-app/core/stage'

export const stageKindLabels: Record<StageItemKind, string> = {
  'scenic-flat': '景片',
  'door-flat': '门景片',
  'window-flat': '窗景片',
  platform: '平台',
  stairs: '舞台台阶',
  'rail-or-divider': '栏杆与隔断',
  screen: '屏风',
  curtain: '幕',
  table: '桌',
  'round-table': '圆桌',
  chair: '椅',
  sofa: '沙发',
  counter: '柜台',
  shelf: '书架',
  bed: '床',
  'neutral-block': '台块',
  camera: '摄影机',
  'performer-marker': '人物标记',
}
