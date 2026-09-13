import {
  type HandleDescriptor,
  type NodeDefinition,
  type SceneApi,
  StairNode as StairNodeSchema,
  type StairNode as StairNodeType,
  type StairSegmentNode,
  stairFootprintAABB,
} from '@pascal-app/core'
import { getStairFloorPlacedFootprints } from './floor-stack'
import { buildStairFloorplan } from './floorplan'
import { stairRotateAffordance } from './floorplan-affordances'
import { stairFloorplanMoveTarget } from './floorplan-move'
import { stairPaint } from './paint'
import { stairParametrics } from './parametrics'
import { StairNode } from './schema'
import { stairSlots } from './slots'

function segmentFor(node: StairNodeType, scene: SceneApi): StairSegmentNode | undefined {
  const child = scene.get<StairSegmentNode>(node.children[0] as never)
  return child?.type === 'stair-segment' ? child : undefined
}

function handles(): HandleDescriptor<StairNodeType>[] {
  return [
    {
      kind: 'arc-resize',
      axis: 'angular',
      shape: 'rotate',
      apply: (initial, delta) => ({ rotation: initial.rotation - delta }),
      placement: {
        position: (node, scene) => {
          const segment = segmentFor(node, scene)
          return [(segment?.width ?? node.width) / 2 + 0.4, (segment?.height ?? 0.45) / 2, -0.4]
        },
      },
    },
    {
      kind: 'tap-action',
      shape: 'move-cross',
      cursor: 'move',
      onActivate: (node, _scene, editor) => editor.engageMove(node),
      placement: {
        position: (node, scene) => [0, 0.02, (segmentFor(node, scene)?.length ?? 0.9) + 0.35],
      },
    },
  ]
}

export const stairDefinition: NodeDefinition<typeof StairNode> = {
  kind: 'stair',
  schemaVersion: 1,
  schema: StairNode,
  category: 'structure',
  snapProfile: 'structural',
  facingIndicator: { reversed: true },
  snapDraftDirectional: false,
  toolHints: [
    { key: '鼠标左键', label: '放置舞台台阶' },
    { key: 'R / T', label: '旋转' },
    { key: 'Esc', label: '取消' },
  ],
  surfaceRole: 'joinery',
  defaults: () => {
    const stub = StairNodeSchema.parse({ id: 'stair_default' as never, type: 'stair' })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },
  capabilities: {
    selectable: { hitVolume: 'bbox' },
    alignmentFootprint: (node, nodes) => {
      const aabb = stairFootprintAABB(node as StairNodeType, nodes)
      return aabb ? { shape: 'aabb', ...aabb } : null
    },
    duplicable: { subtree: true },
    deletable: true,
    floorPlaced: {
      collides: true,
      footprints: (node, ctx) =>
        ctx ? getStairFloorPlacedFootprints(node as StairNodeType, ctx.nodes) : [],
    },
    slots: (node) => stairSlots(node as StairNodeType),
    paint: stairPaint,
  },
  affordanceTools: { move: () => import('./move-tool') },
  parametrics: stairParametrics,
  handles,
  renderer: { kind: 'parametric', module: () => import('./renderer') },
  floorplan: buildStairFloorplan,
  floorplanMoveTarget: stairFloorplanMoveTarget,
  floorplanAffordances: { 'stair-rotate': stairRotateAffordance },
  presentation: {
    label: '舞台台阶',
    description: '简单舞台踏步，可调整总宽、步高、步深、级数、位置和朝向。',
    icon: { kind: 'url', src: '/icons/stairs.webp' },
    paletteSection: 'structure',
    paletteOrder: 110,
  },
  mcp: { description: 'Straight stage steps with explicit tread dimensions and count.' },
}
