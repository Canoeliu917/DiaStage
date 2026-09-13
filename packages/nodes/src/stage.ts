import type {
  AnyNodeDefinition,
  FenceNode as FenceNodeType,
  NodeDefinition,
  Plugin,
} from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { blockDefinition } from './block/definition'
import { buildingDefinition } from './building'
import { constructionDimensionDefinition } from './construction-dimension'
import { buildDoorContextualDimensions } from './door/contextual-dimensions'
import { buildDoorFloorplan } from './door/floorplan'
import { DoorNode } from './door/schema'
import { doorSlots } from './door/slots'
import { buildFenceFloorplan } from './fence/floorplan'
import { buildFenceGeometry } from './fence/geometry'
import { FenceNode } from './fence/schema'
import { fenceSlots } from './fence/slots'
import { guideDefinition } from './guide'
import { itemDefinition } from './item'
import { levelDefinition } from './level'
import { measurementDefinition } from './measurement'
import { scanDefinition } from './scan'
import {
  buildDoorFloorplanSchedule,
  buildWindowFloorplanSchedule,
  computeDoorFloorplanLevelData,
  computeWindowFloorplanLevelData,
} from './shared/opening-documentation'
import { shelfDefinition } from './shelf'
import { siteDefinition } from './site'
import { slabDefinition } from './slab'
import { spawnDefinition } from './spawn'
import { stairDefinition } from './stair'
import { stairSegmentDefinition } from './stair-segment'
import { wallDefinition } from './wall'
import { wallFloorplanSiblingOverrides } from './wall/floorplan-overrides'
import { buildWindowContextualDimensions } from './window/contextual-dimensions'
import { buildWindowFloorplan } from './window/floorplan'
import { WindowNode } from './window/schema'
import { windowSlots } from './window/slots'
import { zoneDefinition } from './zone'

// Import rendering contributions directly: spreading the full legacy definitions
// would retain their creation, panel and interaction imports in the production graph.
const doorReadDefinition: NodeDefinition<typeof DoorNode> = {
  kind: 'door',
  schemaVersion: 2,
  schema: DoorNode,
  category: 'structure',
  surfaceRole: 'joinery',
  defaults: () => {
    const { id: _id, type: _type, ...rest } = DoorNode.parse({ id: 'door_default', type: 'door' })
    return rest
  },
  extensions: {
    'pascal:editor/floorplan': {
      contextualDimensions: buildDoorContextualDimensions,
      schedule: buildDoorFloorplanSchedule,
    } satisfies FloorplanNodeExtension<ReturnType<typeof DoorNode.parse>>,
  },
  capabilities: { hostRefFields: ['wallId'], slots: () => doorSlots() },
  renderer: { kind: 'parametric', module: () => import('./door/renderer') },
  system: { module: () => import('./door/read-system'), priority: 3 },
  floorplan: buildDoorFloorplan,
  computeFloorplanLevelData: computeDoorFloorplanLevelData,
  floorplanDependsOnSiblings: true,
  floorplanSiblingOverrides: wallFloorplanSiblingOverrides,
  presentation: {
    label: '门（历史布景）',
    icon: { kind: 'url', src: '/icons/door.webp' },
    actionMenu: false,
  },
}

const windowReadDefinition: NodeDefinition<typeof WindowNode> = {
  kind: 'window',
  schemaVersion: 3,
  schema: WindowNode,
  category: 'structure',
  defaults: () => {
    const {
      id: _id,
      type: _type,
      ...rest
    } = WindowNode.parse({ id: 'window_default', type: 'window' })
    return rest
  },
  extensions: {
    'pascal:editor/floorplan': {
      contextualDimensions: buildWindowContextualDimensions,
      schedule: buildWindowFloorplanSchedule,
    } satisfies FloorplanNodeExtension<ReturnType<typeof WindowNode.parse>>,
  },
  capabilities: { hostRefFields: ['wallId'], slots: () => windowSlots() },
  renderer: { kind: 'parametric', module: () => import('./window/renderer') },
  system: { module: () => import('./window/read-system'), priority: 3 },
  floorplan: buildWindowFloorplan,
  computeFloorplanLevelData: computeWindowFloorplanLevelData,
  floorplanDependsOnSiblings: true,
  floorplanSiblingOverrides: wallFloorplanSiblingOverrides,
  presentation: {
    label: '窗（历史布景）',
    icon: { kind: 'url', src: '/icons/window.webp' },
    actionMenu: false,
  },
}

const fenceReadDefinition: NodeDefinition<typeof FenceNode> = {
  kind: 'fence',
  schemaVersion: 2,
  schema: FenceNode,
  category: 'structure',
  surfaceRole: 'wall',
  defaults: () => {
    const {
      id: _id,
      type: _type,
      ...rest
    } = FenceNode.parse({ id: 'fence_default', type: 'fence' })
    return rest
  },
  capabilities: {
    surfaces: { sides: { faces: 'all' } },
    slots: (node) => fenceSlots(node as FenceNodeType),
  },
  relations: { linkedBy: 'endpoint-match', cascadeDelete: 'none' },
  geometry: buildFenceGeometry,
  system: { module: () => import('./fence/system'), priority: 4 },
  floorplan: buildFenceFloorplan,
  presentation: {
    label: '围栏（历史布景）',
    icon: { kind: 'url', src: '/icons/fence.webp' },
    actionMenu: false,
  },
}

export const stagePlugin: Plugin = {
  id: 'pascal:core',
  apiVersion: 1,
  nodes: [
    shelfDefinition,
    blockDefinition,
    spawnDefinition,
    wallDefinition,
    fenceReadDefinition,
    slabDefinition,
    doorReadDefinition,
    windowReadDefinition,
    itemDefinition,
    stairDefinition,
    stairSegmentDefinition,
    zoneDefinition,
    siteDefinition,
    buildingDefinition,
    levelDefinition,
    guideDefinition,
    scanDefinition,
    measurementDefinition,
    constructionDimensionDefinition,
  ] as unknown as AnyNodeDefinition[],
}
