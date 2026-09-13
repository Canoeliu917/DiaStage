import { type AnyNode, type BlockTopology, getItemBoundsCenter, useScene } from '@pascal-app/core'
import { rotatePoint } from '@pascal-app/core/remount'
import {
  type SceneContextObject,
  type SceneContextSummary,
  SceneContextSummarySchema,
  type StageCollisionGeometry,
  type StageCoordinateFrame,
  type StageDimensions,
  type StageItemKind,
  StageItemKindSchema,
  stageCollisionGeometry,
  worldToStagePosition,
  worldToStageRotation,
} from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { type Shot, validateCameraProject } from '@/components/camera-studio/model'
import { useCameraStudio } from '@/components/camera-studio/store'
import { isLegacyLight } from '../legacy-lighting'
import { objectSnapshot } from '../remount-scene'
import { readStageDocument } from '../theatre/simulation-store'

export const CAMERA_METADATA = 'diastageCameraStudio'
type State = ReturnType<typeof useScene.getState>
let lastNodes: State['nodes'] | undefined
let lastMaterials: State['materials'] | undefined
let revision = 0
export function stageRevision() {
  const state = useScene.getState()
  if (lastNodes !== state.nodes || lastMaterials !== state.materials) {
    lastNodes = state.nodes
    lastMaterials = state.materials
    revision++
  }
  return revision
}
export function stageSite(state = useScene.getState()) {
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((n) => n?.type === 'site')
  if (!site) throw new Error('请先打开舞台')
  return site
}
export function cameraProject(nodes = useScene.getState().nodes) {
  const roots = useScene.getState().rootNodeIds
  const site = roots.map((id) => nodes[id]).find((n) => n?.type === 'site')
  return validateCameraProject(
    site?.metadata[CAMERA_METADATA] ?? useCameraStudio.getState().project,
  )
}
export function stageFrame() {
  const doc = readStageDocument()
  if (!doc) throw new Error('当前剧目尚未定义舞台')
  return { origin: doc.venue.origin, depthMeters: doc.venue.depth }
}
export function stageKind(node: AnyNode): StageItemKind | null {
  if (isLegacyLight(node)) return null
  const kind = StageItemKindSchema.safeParse(node.metadata.stageKind)
  if (kind.success) return kind.data
  if (node.type === 'stair') return 'stairs'
  if (node.type === 'block') return 'neutral-block'
  if (node.type !== 'item') return null
  const text = `${node.asset.id} ${node.name ?? node.asset.name}`
  for (const [pattern, value] of [
    [/sofa|沙发/, 'sofa'],
    [/chair|椅/, 'chair'],
    [/table|桌/, 'table'],
    [/shelf|架/, 'shelf'],
    [/bed|床/, 'bed'],
  ] as const)
    if (pattern.test(text)) return value
  return 'neutral-block'
}

export function cameraContextObject(camera: Shot, frame: StageCoordinateFrame): SceneContextObject {
  const first = camera.keyframes[0]!
  const position = worldToStagePosition(first.position, frame)
  const target = worldToStagePosition(first.lookAt, frame)
  const dx = target.x - position.x,
    dy = target.y - position.y,
    dz = target.z - position.z
  const length = Math.hypot(dx, dy, dz)
  // Invert XYZ rotation of camera forward (0, 0, -1), using the no-roll representation.
  return {
    id: camera.id,
    name: camera.name,
    kind: 'camera',
    transform: {
      position,
      rotationDegrees: {
        x: Math.hypot(dy, dz) < 1e-10 ? 0 : (Math.atan2(dy, -dz) * 180) / Math.PI,
        y: (Math.asin(Math.max(-1, Math.min(1, -dx / length))) * 180) / Math.PI,
        z: 0,
      },
    },
    dimensionsMeters: { width: 0.35, height: 0.25, depth: 0.5 },
  }
}

const blockGeometry = new WeakMap<BlockTopology, StageCollisionGeometry>()
export function stageNodeCollisionGeometry(node: AnyNode, dimensionsMeters: StageDimensions) {
  if (node.type === 'item') {
    const center = getItemBoundsCenter(node)
    const offset = [center[0], center[1] - dimensionsMeters.height / 2, center[2]]
    const geometry = stageCollisionGeometry({ kind: 'neutral-block', dimensionsMeters })
    if (offset.every((value) => value === 0)) return geometry
    return geometry.map((part) => ({
      ...part,
      vertices: part.vertices.map(
        (point) => point.map((value, axis) => value + offset[axis]!) as [number, number, number],
      ),
    }))
  }
  if (node.type !== 'block') return undefined
  const cached = blockGeometry.get(node.topology)
  if (cached) return cached
  const vertices = new Map(node.topology.vertices.map((vertex) => [vertex.id, vertex.position]))
  const neighbors = new Map<string, Set<string>>()
  for (const face of node.topology.faces) {
    for (const [i, id] of face.vertexIds.entries()) {
      const next = face.vertexIds[(i + 1) % face.vertexIds.length]!
      if (!neighbors.has(id)) neighbors.set(id, new Set())
      if (!neighbors.has(next)) neighbors.set(next, new Set())
      neighbors.get(id)!.add(next)
      neighbors.get(next)!.add(id)
    }
  }
  const remaining = new Set(neighbors.keys())
  const parts: StageCollisionGeometry = []
  while (remaining.size) {
    const ids = [remaining.values().next().value!]
    remaining.delete(ids[0]!)
    for (let i = 0; i < ids.length; i++) {
      for (const next of neighbors.get(ids[i]!)!) {
        if (remaining.delete(next)) ids.push(next)
      }
    }
    const indices = new Map(ids.map((id, i) => [id, i]))
    parts.push({
      vertices: ids.map((id) => vertices.get(id)!),
      faces: node.topology.faces
        .filter((face) => indices.has(face.vertexIds[0]!))
        .map((face) => face.vertexIds.map((id) => indices.get(id)!)),
    })
  }
  blockGeometry.set(node.topology, parts)
  return parts
}

export function currentStageContext(
  selectedObjectIds = useViewer.getState().selection.selectedIds,
  includeTransient = false,
): SceneContextSummary {
  const doc = readStageDocument()
  if (!doc)
    return { documentVersion: stageRevision(), venue: null, objects: [], selectedObjectIds: [] }
  const frame = stageFrame(),
    state = useScene.getState()
  const objects: SceneContextSummary['objects'] = []
  for (const node of Object.values(state.nodes)) {
    const kind = stageKind(node)
    if (
      !kind ||
      node.visible === false ||
      (!includeTransient && (node.metadata.isTransient || node.metadata.isNew)) ||
      (node.type !== 'item' && node.type !== 'block' && node.type !== 'stair')
    )
      continue
    try {
      const item = stageContextObject(node, state.nodes, frame)
      if (item) objects.push(item)
    } catch {
      // Hosted legacy geometry remains editable by its original tool, never guessed into world coordinates.
    }
  }
  for (const performer of doc.rehearsalSimulation.performers)
    objects.push({
      id: performer.id,
      name: performer.name,
      kind: 'performer-marker',
      transform: {
        position: worldToStagePosition(performer.position, frame),
        rotationDegrees: worldToStageRotation([0, performer.facing, 0]),
      },
      dimensionsMeters: { width: 0.4, height: 1.7, depth: 0.4 },
    })
  for (const camera of cameraProject().shots) objects.push(cameraContextObject(camera, frame))
  return SceneContextSummarySchema.parse({
    doorClearanceMeters: stageSite().metadata.stageDoorClearanceMeters ?? 0,
    documentVersion: stageRevision(),
    venue: {
      type: doc.venue.type === 'arena' ? 'other' : doc.venue.type,
      widthMeters: doc.venue.width,
      depthMeters: doc.venue.depth,
      heightMeters: stageSite().metadata.stageHeightMeasured === false ? null : doc.venue.height,
    },
    objects,
    selectedObjectIds,
  })
}

export function stageContextObject(
  node: AnyNode,
  nodes: State['nodes'],
  frame: StageCoordinateFrame,
): SceneContextObject | null {
  const kind = stageKind(node)
  if (!kind || (node.type !== 'item' && node.type !== 'block' && node.type !== 'stair')) return null
  const pose = objectSnapshot(node, nodes)
  if (node.type === 'stair') {
    const offset = rotatePoint([pose.boundsCenter[0], 0, pose.boundsCenter[2]], pose.rotation)
    pose.position = pose.position.map((value, axis) => value + offset[axis]!) as [
      number,
      number,
      number,
    ]
  }
  const dimensionsMeters = {
    width: pose.dimensions[0],
    height: pose.dimensions[1],
    depth: pose.dimensions[2],
  }
  return {
    id: node.id,
    name: node.name || (node.type === 'item' ? node.asset.name : '台件'),
    kind,
    ...(node.type === 'stair' ? { stepCount: node.stepCount } : {}),
    transform: {
      position: worldToStagePosition(pose.position, frame),
      rotationDegrees: worldToStageRotation(pose.rotation),
    },
    dimensionsMeters,
    collisionGeometry: stageNodeCollisionGeometry(node, dimensionsMeters),
  }
}
