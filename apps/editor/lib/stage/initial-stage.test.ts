import { expect, test } from 'bun:test'
import { SiteNode, useScene } from '@pascal-app/core'
import { readStageDocument } from '../theatre/simulation-store'
import { createManualStageGraph } from './initial-stage'

test('new stage type, label, site outline and floor use the entered dimensions', () => {
  const graph = createManualStageGraph({
    type: 'proscenium',
    widthMeters: 10,
    depthMeters: 7,
    heightMeters: 5.2,
  })
  const site = SiteNode.parse(graph.nodes[graph.rootNodeIds[0]!])
  const doc = readStageDocument(graph.nodes, graph.rootNodeIds)!
  expect(doc.venue.name).toBe('镜框式 · 10 × 7 米')
  expect(site.name).toBe(doc.venue.name)
  expect(site.polygon.points).toEqual([
    [-5, -3.5],
    [5, -3.5],
    [5, 3.5],
    [-5, 3.5],
  ])
  const floor = Object.values(graph.nodes).find((node) => node.type === 'slab')
  expect(floor?.polygon).toEqual(site.polygon.points)
  expect(doc.venue.height).toBe(5.2)
  expect(site.metadata.stageHeightMeasured).toBe(true)
})

test('custom stage keeps other type and unmeasured height without touching the current project', () => {
  const current = useScene.getState().nodes
  const graph = createManualStageGraph({
    type: 'other',
    widthMeters: 9.5,
    depthMeters: 4,
    heightMeters: null,
  })
  const site = SiteNode.parse(graph.nodes[graph.rootNodeIds[0]!])
  const doc = readStageDocument(graph.nodes, graph.rootNodeIds)!
  expect(doc.venue.type).toBe('other')
  expect(doc.venue.name).toBe('自定义舞台 · 9.5 × 4 米')
  expect(site.metadata.stageHeightMeasured).toBe(false)
  expect(doc.venue.height).toBe(4)
  expect(useScene.getState().nodes).toBe(current)
})
