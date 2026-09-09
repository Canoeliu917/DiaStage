import { measurementAnchorReferenceNodeIds, type NodeDefinition } from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { resolveConstructionDimensionForDrawing } from './drawing-coordination'
import { buildConstructionDimensionFloorplan } from './floorplan'
import {
  moveConstructionDimensionBaselineAffordance,
  moveConstructionDimensionWitnessAffordance,
} from './floorplan-affordances'
import { constructionDimensionParametrics } from './parametrics'
import { ConstructionDimensionNode } from './schema'

export const constructionDimensionDefinition: NodeDefinition<typeof ConstructionDimensionNode> = {
  kind: 'construction-dimension',
  bake: 'strip',
  schemaVersion: 7,
  schema: ConstructionDimensionNode,
  category: 'analysis',
  extensions: {
    'pascal:editor/floorplan': {
      tool: () => import('./floorplan-tool'),
      availableModes: ['expert'],
      resolveForDrawing: resolveConstructionDimensionForDrawing,
    } satisfies FloorplanNodeExtension<ConstructionDimensionNode>,
  },
  snapProfile: 'item',
  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    anchors: [
      [0, 0, 0],
      [1, 0, 0],
    ],
    baseline: { origin: [0, 0.6], direction: [1, 0] },
    chainMode: 'point-to-point',
    mode: 'linear',
    featureCount: 1,
    showCenterMark: true,
    prefix: '',
    suffix: '',
    textOverride: null,
    datumPolicy: 'centerline',
    terminator: 'architectural-tick',
    textPosition: 'above',
    imperialPrecision: '1/16',
    metricNotation: 'meters',
    extensionStartGap: 0.075,
    extensionOvershoot: 0.12,
    drawingType: 'floor-plan',
    drawingOverrides: [],
    controllingDimensionId: null,
  }),
  capabilities: {
    selectable: { hitVolume: 'bbox' },
    deletable: true,
    duplicable: true,
    presettable: false,
  },

  dirtyTracking: false,
  parametrics: constructionDimensionParametrics,
  floorplan: buildConstructionDimensionFloorplan,
  floorplanDependencies: (node) => [
    ...measurementAnchorReferenceNodeIds(node.anchors),
    ...(node.controllingDimensionId ? [node.controllingDimensionId] : []),
  ],
  floorplanAffordances: {
    'move-construction-dimension-baseline': moveConstructionDimensionBaselineAffordance,
    'move-construction-dimension-witness': moveConstructionDimensionWitnessAffordance,
  },
  toolHints: [
    { key: '鼠标左键', label: '拾取尺寸界线点' },
    { key: 'Enter', label: '完成多点尺寸界线' },
    { key: '鼠标左键', label: '按需放置尺寸线' },
    { key: 'Backspace', label: '移除上一个界线点' },
    { key: 'Esc', label: '退回上一步或取消' },
  ],

  presentation: {
    label: '建筑尺寸标注',
    description: '关联式线性、曲线、圆形、角度或坐标平面尺寸标注。',
    icon: { kind: 'iconify', name: 'lucide:ruler-dimension-line' },
    hidden: true,
    actionMenu: false,
  },

  mcp: {
    description:
      'An associative construction dimension with linear, curved, circular, angular, and coordinate modes, semantic witness anchors, document notation overrides, and coordinated plan-view presentation.',
  },
}
