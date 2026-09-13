import { useScene } from '@pascal-app/core'
import { assertTheatreWritable, stageFloorUpdates, THEATRE_METADATA_KEY } from './scene-adapter'
import { type Vec3, Vec3Schema } from './schema'
import {
  assertPerformerLocks,
  createStageSceneDocument,
  migrateStageDocument,
  runtimeTheatreDocument,
  type StageSceneDocument,
  StageSceneDocumentSchema,
} from './simulation'

export function readStageDocument(
  nodes = useScene.getState().nodes,
  roots = useScene.getState().rootNodeIds,
): StageSceneDocument | null {
  const site = roots.map((id) => nodes[id]).find((node) => node?.type === 'site')
  const raw = site?.metadata[THEATRE_METADATA_KEY]
  return raw === undefined ? null : migrateStageDocument(raw)
}

export function writeStageDocument(input: StageSceneDocument) {
  assertTheatreWritable()
  const document = StageSceneDocumentSchema.parse(input)
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')
  if (!site) throw new Error('请等待舞台载入')
  const previous = readStageDocument()
  if (previous) assertPerformerLocks(previous, document)
  state.applyNodeChanges({
    update: [
      { id: site.id, data: { metadata: { ...site.metadata, [THEATRE_METADATA_KEY]: document } } },
      ...(!previous || JSON.stringify(previous.venue) !== JSON.stringify(document.venue)
        ? stageFloorUpdates(runtimeTheatreDocument(document), state.nodes, site.id)
        : []),
    ],
  })
}

export function editStageDocument(change: (document: StageSceneDocument) => void) {
  const next = structuredClone(readStageDocument() ?? createStageSceneDocument())
  change(next)
  writeStageDocument(next)
}

export function moveSimulationPerformer(id: string, position: Vec3) {
  Vec3Schema.parse(position)
  editStageDocument((document) => {
    const performer = document.rehearsalSimulation.performers.find((p) => p.id === id)
    if (!performer) throw new Error('人物已不存在')
    const delta = position.map((value, axis) => value - performer.position[axis]!)
    performer.position = [...position]
    const path = document.rehearsalSimulation.paths.find((p) => p.performerId === id)
    if (path)
      path.points = path.points.map((p) => p.map((value, axis) => value + delta[axis]!) as Vec3)
  })
}
