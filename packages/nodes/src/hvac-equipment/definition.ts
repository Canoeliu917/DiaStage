import type { NodeDefinition } from '@pascal-app/core'
import { buildHvacEquipmentFloorplan } from './floorplan'
import { buildHvacEquipmentGeometry } from './geometry'
import { hvacEquipmentParametrics } from './parametrics'
import { getHvacEquipmentPorts } from './ports'
import { HvacEquipmentNode } from './schema'

/**
 * Phase 3 of the HVAC node system — equipment cabinets (furnace /
 * air handler / condenser). Furnaces and air handlers expose supply +
 * return ports, giving duct runs a real origin: the duct and fitting
 * tools snap onto these collars like any other port.
 *
 * Composition: `def.geometry` only. Yaw-only rotation, so the editor's
 * default R-rotate works on a selected unit without custom actions.
 */
export const hvacEquipmentDefinition: NodeDefinition<typeof HvacEquipmentNode> = {
  kind: 'hvac-equipment',
  schemaVersion: 1,
  schema: HvacEquipmentNode,
  category: 'utility',
  distributionRole: 'equipment',
  snapProfile: 'item',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    equipmentType: 'furnace',
    width: 0.56,
    depth: 0.71,
    height: 1.1,
    supplyShape: 'round',
    returnShape: 'round',
    supplyDiameter: 8,
    returnDiameter: 8,
    supplyWidth: 12,
    supplyHeight: 8,
    returnWidth: 14,
    returnHeight: 8,
  }),

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    movable: { axes: ['x', 'z'], gridSnap: true },
    rotatable: { axes: ['y'], snapAngles: [Math.PI / 4] },
    duplicable: true,
    deletable: true,
    floorPlaced: {
      footprint: (node) => {
        const n = node as HvacEquipmentNode
        return {
          dimensions: [n.width, n.height, n.depth],
          rotation: [0, n.rotation, 0],
        }
      },
    },
  },

  parametrics: hvacEquipmentParametrics,

  geometry: buildHvacEquipmentGeometry,
  geometryKey: (n) =>
    JSON.stringify([
      n.equipmentType,
      n.width,
      n.depth,
      n.height,
      n.supplyShape,
      n.returnShape,
      n.supplyDiameter,
      n.returnDiameter,
      n.supplyWidth,
      n.supplyHeight,
      n.returnWidth,
      n.returnHeight,
    ]),

  ports: getHvacEquipmentPorts,

  floorplan: buildHvacEquipmentFloorplan,

  tool: () => import('./tool'),
  toolHints: [
    { key: '单击', label: '放置设备' },
    { key: 'R / T', label: '旋转 ±45°' },
    { key: 'Esc', label: '退出' },
  ],

  presentation: {
    label: '暖通设备',
    description: '暖风炉、空气处理机或冷凝机，风管连接至其送回风接口。',
    icon: { kind: 'url', src: '/icons/HVAC.webp' },
    paletteSection: 'structure',
    paletteOrder: 92,
  },

  mcp: {
    description:
      'HVAC equipment cabinet (furnace, air handler, or condenser). Furnaces and air handlers have supply/return duct ports; every unit also has a refrigerant service port that a lineset run connects to. Position is level-local meters; rotation is yaw radians.',
  },
}
