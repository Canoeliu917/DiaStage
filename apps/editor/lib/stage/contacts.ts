import { sceneRegistry, useScene } from '@pascal-app/core'
import { prepareStageCollision, stageCollisionsTouch } from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { stageModelBelowFloor, stageModelContact } from './model-contact'

type ContactObject = Parameters<typeof prepareStageCollision>[0] & { id: string }
const geometryKeys = new WeakMap<object, string>()
const layouts: {
  key: string
  roots: ReturnType<typeof sceneRegistry.nodes.get>[]
  settled: unknown[]
  failed: boolean[]
  ids: Set<string>
}[] = []
let sceneNodes: unknown
let modelRevision = -1
let loadFailures: unknown

function contactKey(item: ContactObject) {
  const dimensions = item.dimensionsMeters
  const position = item.transform.position
  const rotation = item.transform.rotationDegrees
  let geometry = ''
  if (item.collisionGeometry) {
    geometry = geometryKeys.get(item.collisionGeometry) ?? ''
    if (!geometry) {
      geometry = JSON.stringify(item.collisionGeometry.map((part) => [part.vertices, part.faces]))
      geometryKeys.set(item.collisionGeometry, geometry)
    }
  }
  return [
    item.id,
    item.kind,
    item.libraryAssetId ?? null,
    item.stepCount ?? null,
    dimensions.width,
    dimensions.height,
    dimensions.depth,
    position.x,
    position.y,
    position.z,
    rotation.x,
    rotation.y,
    rotation.z,
    geometry,
  ]
}

export function stageContactIds(objects: ContactObject[]): Set<string> {
  const physical = objects
    .filter((item) => item.kind !== 'camera' && item.kind !== 'performer-marker')
    .sort((a, b) => a.id.localeCompare(b.id))
  const nodes = useScene.getState().nodes
  const viewer = useViewer.getState()
  if (
    sceneNodes !== nodes ||
    modelRevision !== viewer.geometryRevision ||
    loadFailures !== viewer.itemLoadFailures
  ) {
    layouts.length = 0
    sceneNodes = nodes
    modelRevision = viewer.geometryRevision
    loadFailures = viewer.itemLoadFailures
  }
  // Each view parses its own immutable geometry objects, so equal contents must share a key.
  const key = JSON.stringify(physical.map(contactKey))
  const roots = physical.map((item) => sceneRegistry.nodes.get(item.id))
  const settled = roots.map((root) => root?.userData.itemModelSettled)
  const failed = physical.map((item) => Boolean(viewer.itemLoadFailures[item.id]))
  const cached = layouts.find(
    (layout) =>
      layout.key === key &&
      roots.every(
        (root, index) =>
          root === layout.roots[index] &&
          settled[index] === layout.settled[index] &&
          failed[index] === layout.failed[index],
      ),
  )
  if (cached) {
    layouts.splice(layouts.indexOf(cached), 1)
    layouts.push(cached)
    return new Set(cached.ids)
  }
  const prepared = physical.map(prepareStageCollision)
  const ids = new Set<string>()
  for (let i = 0; i < physical.length; i++) {
    if (stageModelBelowFloor(physical[i]!) ?? prepared[i]!.bounds[1]![0] < -1e-7)
      ids.add(physical[i]!.id)
    for (let j = i + 1; j < physical.length; j++) {
      const a = physical[i]!,
        b = physical[j]!
      const modelContact = stageModelContact(a, b)
      if (!(modelContact ?? stageCollisionsTouch(prepared[i]!, prepared[j]!))) continue
      ids.add(physical[i]!.id)
      ids.add(physical[j]!.id)
    }
  }
  layouts.push({ key, roots, settled, failed, ids })
  if (layouts.length > 4) layouts.shift()
  return new Set(ids)
}
