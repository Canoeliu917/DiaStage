import { useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useStageTransform } from '@/components/stage-entry/transform-mode'
import { type DiaAppContext, DiaAppContextSchema } from './open-language'

export const DIASTAGE_CAPABILITIES: DiaAppContext['capabilities'] = [
  { id: 'scene-management', label: '新建、打开、保存与管理剧目', authority: 'manual_only' },
  { id: 'venue-settings', label: '设置舞台类型、宽度、深度与高度', authority: 'manual_only' },
  { id: 'asset-library', label: '浏览、搜索并放置 22 种标准舞台资产', authority: 'manual_only' },
  {
    id: 'object-properties',
    label: '查看并精确设置名称、尺寸、位置、锁定与显示',
    authority: 'manual_only',
  },
  {
    id: 'object-transform',
    label: '选择、移动、30 度整件旋转、缩放与复制道具',
    authority: 'manual_only',
  },
  {
    id: 'placement-snap',
    label: '网格、边缘与支撑面贴合、自由放置及同类吸附',
    authority: 'manual_only',
  },
  { id: 'linked-fold', label: '二联与三联景片保持连接的独立铰链折叠', authority: 'manual_only' },
  { id: 'view-modes', label: '三维、平面与分屏查看', authority: 'read' },
  {
    id: 'camera-navigation',
    label: '归位、观众视角、聚焦、环绕、平移、缩放与视角锁定',
    authority: 'read',
  },
  {
    id: 'display',
    label: '白模、黑匣子、材质、网格、辅助线、稳定模式与沉浸预览',
    authority: 'read',
  },
  { id: 'dia-dialogue', label: '依据结构化舞台与界面状态进行对话和解释', authority: 'read' },
  {
    id: 'dia-proposal',
    label: '生成受支持的舞台 Proposal、Ghost 与候选方案',
    authority: 'proposal_only',
  },
  {
    id: 'human-confirmation',
    label: '切换、取消或人工采用当前 Ghost；Dia 不自动采用',
    authority: 'proposal_only',
  },
  { id: 'history', label: '撤销、重做及查看版本与历史', authority: 'manual_only' },
  { id: 'remount', label: '复台映射与预览', authority: 'manual_only' },
]

export function currentDiaAppContext(): DiaAppContext {
  const editor = useEditor.getState()
  const viewer = useViewer.getState()
  const transform = useStageTransform.getState()
  const itemSnap = editor.snappingModeByContext.item
  const route =
    typeof location === 'undefined' ? '/scene' : `${location.pathname}${location.search}`
  let stableMode = true
  try {
    stableMode = localStorage.getItem('diastage:stable-mode') !== 'false'
  } catch {
    // The visible default remains stable mode when browser storage is unavailable.
  }
  return DiaAppContextSchema.parse({
    page: 'stage-editor',
    route,
    capabilities: DIASTAGE_CAPABILITIES,
    settings: {
      viewMode: editor.viewMode,
      activePanel: editor.activeSidebarPanel,
      workspaceMode: editor.workspaceMode,
      transformMode: transform.mode ?? 'select',
      rotationAxis: editor.rotationAxis,
      cameraLocked: transform.cameraLocked,
      placementMode:
        itemSnap === 'grid' ? 'grid' : itemSnap === 'lines' ? 'edge_and_support' : 'free',
      gridStepCentimeters: editor.gridSnapStep * 100,
      gridVisible: viewer.showGrid,
      guidesVisible: viewer.showGuides,
      displayMode: viewer.textures
        ? 'material_preview'
        : viewer.sceneTheme === 'night'
          ? 'black_box'
          : 'white_model',
      stableMode,
      immersiveMode: editor.isCaptureMode
        ? 'capture'
        : editor.isFirstPersonMode
          ? 'walkthrough'
          : editor.isPreviewMode
            ? 'preview'
            : 'none',
      readOnly: useScene.getState().readOnly,
    },
  })
}
