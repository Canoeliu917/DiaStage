import { expect, test } from 'bun:test'
import { ZoneNode } from './zone'

test('ZoneNode keeps only stage-area data', () => {
  const zone = ZoneNode.parse({
    id: 'zone_blocking',
    name: '走位区',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 3],
    ],
  })

  expect(zone).toMatchObject({
    id: 'zone_blocking',
    name: '走位区',
  })
  expect(zone).not.toHaveProperty('autoFromWalls')
  expect(zone).not.toHaveProperty('boundaryWallIds')
  expect(zone).not.toHaveProperty('spaceRole')
  expect(zone).not.toHaveProperty('ceilingHeight')
})
