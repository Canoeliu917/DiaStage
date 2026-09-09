import type { NodeDefinition } from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { buildStructuralGridFloorplan } from './floorplan'
import { StructuralGridNode } from './schema'

export const structuralGridDefinition: NodeDefinition<typeof StructuralGridNode> = {
  kind: 'structural-grid',
  bake: 'strip',
  schemaVersion: 1,
  schema: StructuralGridNode,
  category: 'structure',
  extensions: {
    'pascal:editor/floorplan': {
      tool: () => import('./floorplan-tool'),
      availableModes: ['expert'],
      preferredView: '2d',
    } satisfies FloorplanNodeExtension<StructuralGridNode>,
  },
  snapProfile: 'structural',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    start: [0, 0],
    end: [0, 5],
    label: '1',
    showStartBubble: true,
    showEndBubble: true,
  }),

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    deletable: true,
    presettable: false,
  },

  dirtyTracking: false,
  floorplan: buildStructuralGridFloorplan,
  toolHints: [
    { key: '鼠标左键', label: '设置轴线起点' },
    { key: '鼠标左键', label: '完成轴线' },
    { key: 'Alt', label: '临时忽略吸附' },
    { key: 'Esc', label: '取消' },
  ],

  presentation: {
    label: '结构轴网',
    description: '带轴号圆标、可保存的建筑结构轴线。',
    icon: { kind: 'url', src: '/icons/structural-grid.webp' },
    paletteSection: 'structure',
    paletteOrder: 72,
  },

  mcp: {
    description:
      'A floor-plan structural datum axis defined by two level-local points and a grid identifier.',
  },
}
