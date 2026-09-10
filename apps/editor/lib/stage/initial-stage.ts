import { SiteNode, SlabNode } from '@pascal-app/core'
import { type VenueProposal, VenueProposalSchema } from '@pascal-app/core/stage'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { stageFloorUpdates, THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { runtimeTheatreDocument } from '../theatre/simulation'
import { readStageDocument } from '../theatre/simulation-store'

export function createManualStageGraph(input: VenueProposal) {
  const venue = VenueProposalSchema.parse(input),
    graph = createTheatreSceneGraph()
  const site = SiteNode.parse(graph.nodes[graph.rootNodeIds[0]!]!),
    doc = readStageDocument(graph.nodes, graph.rootNodeIds)!
  const typeName = {
    'black-box': '黑匣子',
    proscenium: '镜框式',
    thrust: '伸出式',
    classroom: '教室 / 排练厅',
    other: '自定义舞台',
  }[venue.type]
  const name = `${typeName} · ${venue.widthMeters} × ${venue.depthMeters} 米`
  doc.venue = {
    ...doc.venue,
    name,
    type: venue.type,
    width: venue.widthMeters,
    depth: venue.depthMeters,
    height: venue.heightMeters ?? 4,
  }
  site.name = name
  const [x, , z] = doc.venue.origin
  const width = venue.widthMeters / 2,
    depth = venue.depthMeters / 2
  site.polygon = {
    type: 'polygon',
    points: [
      [x - width, z - depth],
      [x + width, z - depth],
      [x + width, z + depth],
      [x - width, z + depth],
    ],
  }
  site.metadata = {
    ...site.metadata,
    [THEATRE_METADATA_KEY]: doc,
    stageHeightMeasured: venue.heightMeters !== null,
  }
  graph.nodes[site.id] = site
  for (const update of stageFloorUpdates(runtimeTheatreDocument(doc), graph.nodes, site.id))
    graph.nodes[update.id] = SlabNode.parse({ ...graph.nodes[update.id]!, ...update.data })
  return graph
}
