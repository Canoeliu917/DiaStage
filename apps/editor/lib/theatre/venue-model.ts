import type { AnyNode } from '@pascal-app/core'
import { type Vec3, type Venue, VenueSchema } from './schema'

export function theatreNodeLayer(node: AnyNode): 'venue' | 'scenery' | null {
  if (['site', 'building', 'level', 'zone', 'stair-segment'].includes(node.type)) return null
  if (
    node.type === 'scan' ||
    node.metadata.theatreKind === 'stage-floor' ||
    node.metadata.venueFixed === true ||
    ['wall', 'door', 'window'].includes(node.type)
  )
    return 'venue'
  if (['item', 'block', 'stair', 'slab', 'railing'].includes(node.type)) return 'scenery'
  return null
}

/** A read-only projection of the formal Scene; node references never duplicate geometry. */
export function deriveVenueModel(
  input: Venue,
  nodes: Record<string, AnyNode>,
  options: { heightMeasured?: boolean } = {},
) {
  const venue = VenueSchema.parse(input)
  const visible = Object.values(nodes).filter((node) => {
    const seen = new Set<string>()
    let current: AnyNode | undefined = node
    while (current) {
      if (seen.has(current.id)) throw new Error('场地节点存在循环层级')
      seen.add(current.id)
      if (current.visible === false || current.metadata.isTransient || current.metadata.isNew)
        return false
      current = current.parentId ? nodes[current.parentId] : undefined
    }
    return true
  })
  const ids = (matches: (node: AnyNode) => boolean) =>
    visible.filter(matches).map((node) => node.id)
  const [x, y, z] = venue.origin
  return {
    venue,
    heightMeasured: options.heightMeasured !== false,
    coordinateSystem: {
      groundPlane: 'XZ',
      up: '+Y',
      units: 'meters',
      rotation: 'radians',
    } as const,
    bounds: {
      min: [x - venue.width / 2, y, z - venue.depth / 2] as Vec3,
      max: [x + venue.width / 2, y + venue.height, z + venue.depth / 2] as Vec3,
    },
    stageFront: [x, y, z + venue.depth / 2] as Vec3,
    stageLeft: [1, 0, 0] as Vec3,
    stageRight: [-1, 0, 0] as Vec3,
    upstage: [0, 0, -1] as Vec3,
    entranceNodeIds: ids((node) => node.type === 'door' || node.metadata.stageKind === 'door-flat'),
    wallNodeIds: ids((node) => node.type === 'wall'),
    platformNodeIds: ids((node) => node.metadata.stageKind === 'platform'),
    stairNodeIds: ids((node) => node.type === 'stair'),
    fixedNodeIds: ids((node) => theatreNodeLayer(node) === 'venue' && node.type !== 'scan'),
    sceneryNodeIds: ids((node) => theatreNodeLayer(node) === 'scenery'),
    scanReferenceNodeIds: ids((node) => node.type === 'scan'),
  }
}

export type VenueModel = ReturnType<typeof deriveVenueModel>
