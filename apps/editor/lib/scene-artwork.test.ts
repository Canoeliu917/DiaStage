import { expect, test } from 'bun:test'
import { artworkModifiedTime, sceneArtworkDimensions } from './scene-artwork'
import { createManualStageGraph } from './stage/initial-stage'

test('artwork timestamp uses the saved instant in UTC+8, including seconds and day rollover', () => {
  expect(artworkModifiedTime('2026-10-04T18:00:03.125Z')).toBe('2026.10.05  02:00:03')
  expect(artworkModifiedTime('2026-10-05T00:00:00+08:00')).toBe('2026.10.05  00:00:00')
  expect(artworkModifiedTime('invalid')).toBe('时间未记录')
})

test('dimensions use saved metres without treating an unmeasured height as known', () => {
  const graph = createManualStageGraph({
    type: 'proscenium',
    widthMeters: 9.5,
    depthMeters: 6,
    heightMeters: 4.2,
  })
  expect(sceneArtworkDimensions(graph)).toBe('9.5 × 6 × 4.2 m')
  const unknownHeight = createManualStageGraph({
    type: 'other',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: null,
  })
  expect(sceneArtworkDimensions(unknownHeight)).toBe('8 × 6 × — m')
  expect(sceneArtworkDimensions({ nodes: {}, rootNodeIds: [] })).toBeNull()
})
