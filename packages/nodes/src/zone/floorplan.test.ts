import { describe, expect, test } from 'bun:test'
import { type FloorplanGeometry, type GeometryContext, ZoneNode } from '@pascal-app/core'
import { buildZoneFloorplan } from './floorplan'

const context = {
  resolve: () => undefined,
  children: [],
  siblings: [],
  parent: null,
} satisfies GeometryContext

function textChildren(geometry: FloorplanGeometry | null) {
  if (geometry?.kind !== 'group') return []
  return geometry.children.filter((child) => child.kind === 'text')
}

describe('buildZoneFloorplan', () => {
  test('renders the stage-area label', () => {
    const zone = ZoneNode.parse({
      id: 'zone_landscape',
      name: 'Courtyard',
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
    })

    expect(textChildren(buildZoneFloorplan(zone, context))).toEqual([
      expect.objectContaining({ kind: 'text', text: 'Courtyard', upright: true }),
    ])
  })
})
