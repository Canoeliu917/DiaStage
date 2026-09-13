import {
  type AnyNode,
  type AnyNodeId,
  type BlockNode,
  cloneNodesInto,
  GROUND_SUPPORT_ID,
  getNodeLock,
  getFloorPlacedElevation,
  ItemNode,
  installSceneMutationHandler,
  type NodeChanges,
  runAsSingleSceneHistoryStep,
  type StairNode,
  useScene,
} from '@pascal-app/core'
import {
  inverseRotatePoint,
  relativeRotation,
  rotatePoint,
  subtract,
} from '@pascal-app/core/remount'
import {
  type CommandMeta,
  type InputSource,
  StageCommandSchema,
  type StageItemProposal,
  type StagePlan,
  stageStairBounds,
  stageToWorldPosition,
  stageToWorldRotation,
  updateStageStair,
  validateStagePlan,
  worldToStagePosition,
  worldToStageRotation,
} from '@pascal-app/core/stage'
import { authorizeSceneNodeDrop } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { z } from 'zod'
import { create } from 'zustand'
import { validateCameraProject } from '@/components/camera-studio/model'
import { buildDiaContext } from '../rehearsal-intelligence/context'
import {
  type InteractionEnvelope,
  InteractionEnvelopeSchema,
} from '../rehearsal-intelligence/interaction-envelope'
import { objectSnapshot, worldPose } from '../remount-scene'
import { sceneContentVersion } from '../scene-signature'
import { stageFloorUpdates, THEATRE_METADATA_KEY } from '../theatre/scene-adapter'
import { runtimeTheatreDocument, StageSceneDocumentSchema } from '../theatre/simulation'
import { readStageDocument } from '../theatre/simulation-store'
import { makeVersionSource, VERSION_SOURCE_KEY } from '../theatre/version-source'
import {
  CAMERA_METADATA,
  cameraContextObject,
  cameraProject,
  currentStageContext,
  stageFrame,
  stageKind,
  stageNodeCollisionGeometry,
  stageRevision,
  stageSite,
} from './context'
import { ScriptImportSchema } from './import-metadata'
import { makeScenery, SCENERY_LIBRARY } from './scenery'

export const useStageCommandNotice = create<{ error: string }>(() => ({ error: '' }))
export type StageExecutionResult = {
  ok: boolean
  error?: string
  nodeIds: string[]
  transactionId?: string
  alreadyApplied?: boolean
}
let executing = false
const applied = new Map<string, StageExecutionResult>()
const remoteReceiptsSchema = z
  .array(
    z.strictObject({
      sessionId: z.string().uuid(),
      sequence: z.number().int().positive(),
      nodeIds: z.array(z.string()).max(1000),
    }),
  )
  .max(128)
export function commandMeta(source: InputSource = 'manual'): CommandMeta {
  return {
    commandId: crypto.randomUUID(),
    transactionId: crypto.randomUUID(),
    source,
    issuedAt: new Date().toISOString(),
    expectedDocumentVersion: stageRevision(),
  }
}
type Nodes = ReturnType<typeof useScene.getState>['nodes']
function positioned(nodes: Nodes, id: string): ItemNode | BlockNode | StairNode {
  const node = nodes[id as AnyNodeId]
  if (!node || (node.type !== 'block' && node.type !== 'item' && node.type !== 'stair'))
    throw new Error('对象不存在，或需要通过原来的布景工具编辑')
  const locked = getNodeLock(nodes, id, true)
  if (locked) throw new Error(`「${locked.name || '舞台对象'}」已锁定，请先解锁`)
  return node
}

function assertUnlockedChanges(
  changes: NodeChanges,
  nodes: Nodes,
  lockCommands = new Set<string>(),
) {
  const reject = (id: string, descendants = false) => {
    const locked = getNodeLock(nodes, id, descendants)
    if (locked) throw new Error(`「${locked.name || '舞台对象'}」已锁定，请先解锁`)
  }
  for (const id of changes.delete ?? []) reject(id, true)
  for (const { node, parentId } of changes.create ?? []) {
    const parent = parentId ?? node.parentId
    if (parent) reject(parent)
  }
  for (const { id, data } of changes.update ?? []) {
    if (lockCommands.has(id)) continue
    reject(id)
    const original = nodes[id]
    if (
      original &&
      Object.entries(data).some(
        ([key, value]) =>
          !['id', 'name', 'metadata'].includes(key) &&
          JSON.stringify(value) !==
            JSON.stringify((original as unknown as Record<string, unknown>)[key]),
      )
    )
      reject(id, true)
  }
}
function localPose(
  node: ItemNode | BlockNode | StairNode,
  nodes: Nodes,
  position: [number, number, number],
  rotation: [number, number, number],
) {
  const parent = worldPose(node.parentId, nodes)
  const localPosition = inverseRotatePoint(subtract(position, parent.position), parent.rotation)
  const localRotation = relativeRotation(rotation, parent.rotation)
  if (
    node.type !== 'item' &&
    Math.hypot(...subtract(rotatePoint([0, 1, 0], localRotation), [0, 1, 0])) > 1e-7
  )
    throw new Error('台件暂只支持水平旋转')
  localPosition[1] -= getFloorPlacedElevation({
    node: { ...node, supportSlabId: GROUND_SUPPORT_ID },
    nodes,
    position: localPosition,
    rotation: localRotation,
  })
  if (node.type === 'stair') {
    const center = stageStairBounds(node, nodes).boundsCenter
    const offset = rotatePoint([center[0], 0, center[2]], localRotation)
    localPosition[0] -= offset[0]
    localPosition[2] -= offset[2]
  }
  const forward = rotatePoint([0, 0, 1], localRotation)
  return {
    position: localPosition,
    rotation: node.type === 'item' ? localRotation : Math.atan2(forward[0], forward[2]),
    supportSlabId: GROUND_SUPPORT_ID,
  }
}
function sceneryCenter(
  node: ItemNode | BlockNode | StairNode,
  snapshot: ReturnType<typeof objectSnapshot>,
): [number, number, number] {
  if (node.type !== 'stair') return snapshot.position
  const offset = rotatePoint(
    [snapshot.boundsCenter[0], 0, snapshot.boundsCenter[2]],
    snapshot.rotation,
  )
  return snapshot.position.map((value, axis) => value + offset[axis]!) as [number, number, number]
}
function proposal(
  node: ItemNode | BlockNode | StairNode,
  nodes: Nodes,
  frame: ReturnType<typeof stageFrame>,
  existing: boolean,
): StageItemProposal {
  const snapshot = objectSnapshot(node, nodes)
  const dimensionsMeters = {
    width: snapshot.dimensions[0],
    height: snapshot.dimensions[1],
    depth: snapshot.dimensions[2],
  }
  return {
    proposalId: node.id,
    existingNodeId: existing ? node.id : null,
    kind: stageKind(node) ?? 'neutral-block',
    displayName: node.name || '台件',
    libraryAssetId: null,
    dimensionsMeters,
    collisionGeometry: stageNodeCollisionGeometry(node, dimensionsMeters),
    ...(node.type === 'stair' ? { stepCount: node.stepCount } : {}),
    transform: {
      position: worldToStagePosition(sceneryCenter(node, snapshot), frame),
      rotationDegrees: worldToStageRotation(snapshot.rotation),
    },
    certainty: 'stated',
    assumptionIds: [],
    evidenceIds: [],
  }
}

export function executeStageCommands(
  input: unknown,
  scriptImport?: unknown,
  diaEnvelope?: InteractionEnvelope,
): StageExecutionResult {
  try {
    const commands = StageCommandSchema.array().min(1).max(500).parse(input)
    const meta = commands[0]!.meta,
      state = useScene.getState(),
      site = stageSite()
    const envelope =
      diaEnvelope === undefined ? undefined : InteractionEnvelopeSchema.parse(diaEnvelope)
    if (
      envelope &&
      (envelope.capability !== 'build' ||
        envelope.interactionId !== meta.transactionId ||
        envelope.status !== 'prepared')
    )
      throw new Error('搭台命令与人工确认交互不一致')
    const cacheKey = `${site.id}:${meta.transactionId}`
    const remote = /^remote:([a-f0-9-]{36}):(\d+)$/.exec(meta.transactionId)
    const receipts = remoteReceiptsSchema.parse(site.metadata.remoteCommandReceipts ?? [])
    const receipt = remote && receipts.find((r) => r.sessionId === remote[1])
    if (receipt && receipt.sequence >= Number(remote![2]))
      return {
        ok: true,
        nodeIds: receipt.nodeIds,
        transactionId: meta.transactionId,
        alreadyApplied: true,
      }
    const receiptMetadata = (ids: string[]) =>
      remote
        ? {
            remoteCommandReceipts: [
              ...receipts.filter((r) => r.sessionId !== remote[1]),
              { sessionId: remote[1]!, sequence: Number(remote[2]), nodeIds: [...new Set(ids)] },
            ].slice(-128),
          }
        : {}
    const previousResult = applied.get(cacheKey)
    if (previousResult) return { ...previousResult, alreadyApplied: true }
    if (state.readOnly) throw new Error('当前舞台只读，无法修改')
    if (meta.expectedDocumentVersion !== stageRevision())
      throw new Error('舞台在预览后发生了变化，请重新生成方案')
    if (
      new Set(commands.map((c) => c.meta.commandId)).size !== commands.length ||
      commands.some(
        (c) =>
          c.meta.transactionId !== meta.transactionId ||
          c.meta.expectedDocumentVersion !== meta.expectedDocumentVersion ||
          c.meta.source !== meta.source,
      )
    )
      throw new Error('命令批次不一致，请重新生成方案')
    const doc = structuredClone(readStageDocument())
    if (!doc) throw new Error('请先建立空舞台')
    if (commands.some((command) => command.type === 'GroupObjects')) {
      if (envelope) throw new Error('组合需要作为独立手动操作')
      if (commands.length !== 1 || commands[0]!.type !== 'GroupObjects')
        throw new Error('组合请作为独立的一轮操作提交')
      const group = commands[0]!
      const ids = [...new Set(group.nodeIds)]
      if (ids.length !== group.nodeIds.length) throw new Error('组合对象编号不能重复')
      for (const id of ids) positioned(state.nodes, id)
      runAsSingleSceneHistoryStep(useScene, () => {
        state.createCollection(group.name, ids as AnyNodeId[])
        if (remote)
          state.updateNode(site.id, { metadata: { ...site.metadata, ...receiptMetadata(ids) } })
      })
      const result = { ok: true, nodeIds: ids, transactionId: meta.transactionId }
      applied.set(cacheKey, result)
      if (applied.size > 500) applied.delete(applied.keys().next().value!)
      return result
    }
    if (scriptImport !== undefined) {
      const record = ScriptImportSchema.parse(scriptImport)
      if (meta.source !== 'script' || record.id !== meta.transactionId)
        throw new Error('剧本来源与本次确认不一致')
      doc.importMetadata = [...(doc.importMetadata ?? []), record]
    }
    const context = currentStageContext(),
      nodes = { ...state.nodes },
      aliases = new Map<string, string>()
    const cameras = cameraProject(),
      changed = new Set<AnyNodeId>(),
      spatial = new Set<AnyNodeId>(),
      virtualSpatial = new Set<string>(),
      removed = new Set<AnyNodeId>()
    const resultIds: string[] = []
    let venueChanged = false,
      clearanceMeters = context.doorClearanceMeters,
      cameraChanged = false,
      heightMeasured = false
    const actualId = (id: string) => aliases.get(id) ?? id
    const update = (node: AnyNode) => {
      nodes[node.id] = node
      changed.add(node.id)
    }
    for (const command of commands) {
      if (command.type === 'SetDoorClearance') {
        clearanceMeters = command.meters
        continue
      }
      if (command.type === 'GroupObjects') throw new Error('组合必须独立提交')
      const frame = { origin: doc.venue.origin, depthMeters: doc.venue.depth }
      if (command.type === 'CreateStage') {
        const v = command.venue
        doc.venue = {
          ...doc.venue,
          type: v.type,
          width: v.widthMeters,
          depth: v.depthMeters,
          height: v.heightMeters ?? doc.venue.height,
        }
        venueChanged = true
        if (v.heightMeters !== null) heightMeasured = true
        continue
      }
      if (command.type === 'AddScenery') {
        if (nodes[command.nodeId as AnyNodeId] || aliases.has(command.nodeId))
          throw new Error('新增布景编号重复')
        const parentId = Object.values(nodes).find(
          (n) => n.type === 'slab' && n.metadata.theatreKind === 'stage-floor',
        )?.parentId
        if (!parentId) throw new Error('未找到舞台表演区')
        const [node, ...children] = makeScenery(
          command,
          parentId as AnyNodeId,
          [0, 0, 0],
          [0, 0, 0],
        )
        if (!node) throw new Error('布景为空')
        for (const child of children) update(child)
        if (node.type !== 'item' && node.type !== 'block' && node.type !== 'stair')
          throw new Error('布景类型无效')
        const moved = {
          ...node,
          ...localPose(
            node,
            nodes,
            stageToWorldPosition(command.transform.position, frame),
            stageToWorldRotation(command.transform.rotationDegrees),
          ),
        } as AnyNode
        update(moved)
        spatial.add(moved.id)
        aliases.set(command.nodeId, moved.id)
        resultIds.push(moved.id)
        continue
      }
      if (command.type === 'AddCamera' || command.type === 'SetCamera') {
        const id = actualId(command.nodeId),
          old = cameras.shots.find((c) => c.id === id)
        if (command.type === 'SetCamera' && !old) throw new Error('摄影机不存在')
        if (old?.stageLocked) throw new Error(`「${old.name}」已锁定，请先解锁`)
        if (command.type === 'AddCamera' && old) throw new Error('摄影机编号重复')
        const keyframe = {
          id: old?.keyframes[0]?.id ?? crypto.randomUUID(),
          time: 0,
          position: stageToWorldPosition(command.transform.position, frame),
          lookAt: stageToWorldPosition(command.target, frame),
          fov: command.fieldOfViewDegrees,
        }
        if (old) old.keyframes[0] = keyframe
        else
          cameras.shots.push({
            id,
            name: command.type === 'AddCamera' ? command.name : '摄影机',
            duration: 10,
            keyframes: [keyframe],
            follow: null,
            motion: null,
          })
        resultIds.push(id)
        cameraChanged = true
        virtualSpatial.add(id)
        continue
      }
      if (command.type === 'AddPerformerMarker' || command.type === 'SetPerformerPosition') {
        const id = actualId(command.nodeId),
          old = doc.rehearsalSimulation.performers.find((p) => p.id === id)
        if (old?.stageLocked) throw new Error(`「${old.name}」已锁定，请先解锁`)
        const position = stageToWorldPosition(command.position, frame),
          facing = stageToWorldRotation({ x: 0, y: command.facingDegrees, z: 0 })[1]
        if (command.type === 'SetPerformerPosition' && !old) throw new Error('人物不存在')
        if (command.type === 'AddPerformerMarker') {
          if (old) throw new Error('人物编号重复')
          doc.rehearsalSimulation.performers.push({
            id,
            name: command.name,
            position,
            facing,
            color: command.color,
            visible: true,
          })
        } else if (old) {
          old.position = position
          old.facing = facing
        }
        resultIds.push(id)
        virtualSpatial.add(id)
        continue
      }
      const id = actualId(
        command.type === 'DuplicateObject' ? command.sourceNodeId : command.nodeId,
      )
      if (command.type === 'SetObjectLock') {
        const performer = doc.rehearsalSimulation.performers.find((p) => p.id === id)
        const shot = cameras.shots.find((c) => c.id === id)
        if (performer || shot) {
          if (performer) performer.stageLocked = command.locked
          if (shot) {
            shot.stageLocked = command.locked
            cameraChanged = true
          }
          resultIds.push(id)
          continue
        }
        const node = nodes[id as AnyNodeId]
        if (!node) throw new Error('对象不存在')
        update({ ...node, metadata: { ...node.metadata, stageLocked: command.locked } })
        resultIds.push(id)
        continue
      }
      const camera = cameras.shots.find((c) => c.id === id)
      if (camera?.stageLocked) throw new Error(`「${camera.name}」已锁定，请先解锁`)
      if (camera && command.type === 'MoveObject') {
        const next = stageToWorldPosition(command.position, frame),
          delta = subtract(next, camera.keyframes[0]!.position)
        camera.keyframes = camera.keyframes.map((k) => ({
          ...k,
          position: k.position.map((v, i) => v + delta[i]!) as [number, number, number],
          lookAt: k.lookAt.map((v, i) => v + delta[i]!) as [number, number, number],
        }))
        cameraChanged = true
        virtualSpatial.add(id)
        resultIds.push(id)
        continue
      }
      if (camera && command.type === 'RotateObject') {
        if (Math.abs(command.rotationDegrees.z) > 1e-6)
          throw new Error('当前机位暂不支持镜头横滚，请将 Z 轴角度设为 0')
        const first = camera.keyframes[0]!
        const distance = Math.hypot(...subtract(first.lookAt, first.position))
        const direction = rotatePoint([0, 0, -1], stageToWorldRotation(command.rotationDegrees))
        camera.keyframes[0] = {
          ...first,
          lookAt: first.position.map((value, axis) => value + direction[axis]! * distance) as [
            number,
            number,
            number,
          ],
        }
        cameraChanged = true
        virtualSpatial.add(id)
        resultIds.push(id)
        continue
      }
      const node = positioned(nodes, id)
      const pose = objectSnapshot(node, nodes)
      if (command.type === 'ReplaceScenery') {
        const replacement = SCENERY_LIBRARY.find(
          (entry) => entry.asset.id === command.libraryAssetId,
        )
        if (!replacement || replacement.kind !== stageKind(node))
          throw new Error('只能替换为登记库中的同类布景')
        if (node.type !== 'item')
          throw new Error('此对象是可编辑体块，请手动放入库模型；保留原编号以保护排演引用')
        if (!replacement.asset.dimensions?.every((value) => Number.isFinite(value) && value > 0))
          throw new Error('库模型缺少有效尺寸，不能保持原布景比例')
        const asset = ItemNode.shape.asset.parse({
          ...replacement.asset,
          category: 'scenery',
          tags: [replacement.kind],
          attachTo: undefined,
        })
        update({
          ...node,
          asset,
          scale: pose.dimensions.map((value, index) => value / asset.dimensions[index]!) as [
            number,
            number,
            number,
          ],
        })
        spatial.add(node.id)
      } else if (command.type === 'RenameObject') update({ ...node, name: command.name })
      else if (command.type === 'DuplicateObject') {
        if (node.type === 'stair') {
          const graph = cloneNodesInto([node, ...node.children.map((id) => nodes[id]!)], {
            rootId: node.id,
            parentId: node.parentId as AnyNodeId,
          })
          for (const child of graph.nodes) update(child)
          const made = positioned(nodes, graph.idMap.get(node.id)!)
          update({
            ...made,
            name: command.name,
            ...localPose(made, nodes, stageToWorldPosition(command.position, frame), pose.rotation),
          } as AnyNode)
          spatial.add(made.id)
          aliases.set(command.newNodeId, made.id)
          resultIds.push(made.id)
          continue
        }
        if (node.children.length) throw new Error('请先将挂接物件拆分后复制')
        const made =
          node.type === 'item'
            ? { ...node, id: `item_${crypto.randomUUID()}` as const }
            : { ...node, id: `block_${crypto.randomUUID()}` as const }
        update({
          ...made,
          name: command.name,
          ...localPose(made, nodes, stageToWorldPosition(command.position, frame), pose.rotation),
        } as AnyNode)
        spatial.add(made.id)
        aliases.set(command.newNodeId, made.id)
        resultIds.push(made.id)
      } else if (command.type === 'RemoveObject') {
        const visit = (removeId: AnyNodeId) => {
          const n = nodes[removeId]
          if (!n) return
          if ('children' in n) for (const child of n.children) visit(child as AnyNodeId)
          removed.add(removeId)
          delete nodes[removeId]
          changed.delete(removeId)
        }
        visit(node.id)
      } else if (command.type === 'MoveObject' || command.type === 'RotateObject') {
        spatial.add(node.id)
        update({
          ...node,
          ...localPose(
            node,
            nodes,
            command.type === 'MoveObject'
              ? stageToWorldPosition(command.position, frame)
              : sceneryCenter(node, pose),
            command.type === 'RotateObject'
              ? stageToWorldRotation(command.rotationDegrees)
              : pose.rotation,
          ),
        } as AnyNode)
      } else if (command.type === 'ResizeObject') {
        spatial.add(node.id)
        const d = command.dimensionsMeters,
          target = [d.width, d.height, d.depth]
        if (node.type === 'stair') {
          const count = command.stepCount ?? node.stepCount
          // A pose-only plan must not reshape a legacy multi-flight stair.
          if (
            count !== node.stepCount ||
            target.some((v, i) => Math.abs(v - pose.dimensions[i]!) > 1e-8)
          ) {
            const center = sceneryCenter(node, pose)
            for (const op of updateStageStair(node, nodes, {
              width: d.width,
              stepHeight: d.height / count,
              stepDepth: d.depth / count,
              stepCount: count,
            }))
              update({ ...nodes[op.id], ...op.data } as AnyNode)
            const resized = positioned(nodes, node.id)
            update({ ...resized, ...localPose(resized, nodes, center, pose.rotation) } as AnyNode)
          }
        } else if (node.type === 'item')
          update({
            ...node,
            scale: target.map((v, i) => v / node.asset.dimensions[i]!) as [number, number, number],
          })
        else
          update({
            ...node,
            topology: {
              ...node.topology,
              vertices: node.topology.vertices.map((v) => ({
                ...v,
                position: v.position.map((p, i) => (p * target[i]!) / pose.dimensions[i]!) as [
                  number,
                  number,
                  number,
                ],
              })),
            },
          })
      } else if (command.type === 'SetObjectVisibility') {
        update({ ...node, visible: command.visible })
        if (command.visible) spatial.add(node.id)
      } else if (command.type === 'SetScenicFinish') {
        if (node.type !== 'block')
          throw new Error('真实模型保留原有表面，基础布景表面仅用于可编辑台件')
        update({
          ...node,
          slots: {
            ...node.slots,
            body: `library:${{ neutral: 'preset-midgrey', white: 'preset-white', dark: 'preset-nearblack' }[command.finish]}`,
          },
        })
      }
      resultIds.push(node.id)
    }
    const frame = { origin: doc.venue.origin, depthMeters: doc.venue.depth }
    const virtualProposals: StageItemProposal[] = [...virtualSpatial].map((id) => {
      const camera = cameras.shots.find((item) => item.id === id)
      const performer = doc.rehearsalSimulation.performers.find((item) => item.id === id)
      if (!camera && !performer) throw new Error('人物或摄影机不存在')
      const object = camera
        ? cameraContextObject(camera, frame)
        : {
            id,
            name: performer!.name,
            kind: 'performer-marker' as const,
            transform: {
              position: worldToStagePosition(performer!.position, frame),
              rotationDegrees: worldToStageRotation([0, performer!.facing, 0]),
            },
            dimensionsMeters: { width: 0.4, height: 1.7, depth: 0.4 },
          }
      return {
        proposalId: id,
        existingNodeId: context.objects.some((item) => item.id === id) ? id : null,
        kind: object.kind,
        displayName: object.name,
        libraryAssetId: null,
        transform: object.transform,
        dimensionsMeters: object.dimensionsMeters,
        certainty: 'stated',
        assumptionIds: [],
        evidenceIds: [],
      }
    })
    const plan: StagePlan = {
      schemaVersion: 1,
      source: meta.source,
      venue: venueChanged
        ? {
            type: doc.venue.type === 'arena' ? 'other' : doc.venue.type,
            widthMeters: doc.venue.width,
            depthMeters: doc.venue.depth,
            heightMeters: doc.venue.height,
          }
        : null,
      items: [
        ...virtualProposals,
        ...[...spatial].flatMap((id) => {
          const n = nodes[id]
          return n &&
            n.visible !== false &&
            (n.type === 'item' || n.type === 'block' || n.type === 'stair')
            ? [
                proposal(
                  n,
                  nodes,
                  frame,
                  context.objects.some((o) => o.id === id),
                ),
              ]
            : []
        }),
      ],
      relations: [],
      assumptions: [],
      questions: [],
      evidence: [],
      warnings: [],
    }
    const validation = validateStagePlan(plan, {
      ...context,
      doorClearanceMeters: clearanceMeters,
      objects: context.objects.filter((n) => !removed.has(n.id as AnyNodeId)),
    })
    if (!validation.valid)
      throw new Error(
        validation.warnings
          .filter((w) => w.blocking)
          .map((w) => w.message)
          .join('；'),
      )
    const data = StageSceneDocumentSchema.parse(doc)
    const source = envelope
      ? makeVersionSource({
          source: 'dia-build',
          sceneId: envelope.sceneId,
          envelope: { ...envelope, status: 'applied' },
          resultSceneVersion: buildDiaContext(envelope.sceneId, data, nodes, {
            intention: '搭台正式结果',
            script: '',
            directorIntention: '',
            selectedPerformerId: null,
          }).sceneVersion!,
        })
      : undefined
    const changes: NodeChanges = { create: [], update: [], delete: [...removed] }
    for (const id of changed) {
      const node = nodes[id]!
      if (state.nodes[id]) changes.update!.push({ id, data: node })
      else changes.create!.push({ node })
    }
    changes.update!.push({
      id: site.id,
      data: {
        metadata: {
          ...site.metadata,
          ...receiptMetadata(resultIds),
          stageDoorClearanceMeters: clearanceMeters,
          ...(heightMeasured ? { stageHeightMeasured: true } : {}),
          [THEATRE_METADATA_KEY]: data,
          ...(cameraChanged ? { [CAMERA_METADATA]: validateCameraProject(cameras) } : {}),
          stageTransaction: {
            id: meta.transactionId,
            source: meta.source,
            issuedAt: meta.issuedAt,
          },
        },
      },
    })
    if (venueChanged)
      changes.update!.push(...stageFloorUpdates(runtimeTheatreDocument(data), nodes, site.id))
    assertUnlockedChanges(
      changes,
      state.nodes,
      new Set(
        commands.flatMap((command) =>
          command.type === 'SetObjectLock' ? [actualId(command.nodeId)] : [],
        ),
      ),
    )
    executing = true
    try {
      runAsSingleSceneHistoryStep(useScene, () => {
        state.applyNodeChanges(changes)
        if (source) {
          // Hash the normalized result (including parent children and material slots) before
          // this existing commit transaction publishes its single durable journal entry.
          const current = useScene.getState()
          const resultContentVersion = sceneContentVersion(current)
          const savedSite = current.nodes[site.id]!
          current.updateNode(site.id, {
            metadata: {
              ...savedSite.metadata,
              [VERSION_SOURCE_KEY]: { ...source, resultContentVersion },
              diastageBuildDecision: {
                eventId: meta.transactionId,
                proposalId: meta.transactionId,
                interactionId: source.interactionId,
                nodeIds: [...new Set(resultIds)],
                resultSceneVersion: source.resultSceneVersion,
                resultContentVersion,
              },
            },
          })
        }
      })
      if (removed.size) authorizeSceneNodeDrop(useScene.getState())
    } finally {
      executing = false
    }
    const result = { ok: true, nodeIds: [...new Set(resultIds)], transactionId: meta.transactionId }
    applied.set(cacheKey, result)
    if (applied.size > 500) applied.delete(applied.keys().next().value!)
    useStageCommandNotice.setState({ error: '' })
    useViewer.getState().setSelection({
      selectedIds: result.nodeIds.filter((id) =>
        Boolean(useScene.getState().nodes[id as AnyNodeId]),
      ) as AnyNodeId[],
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : '舞台操作失败，请检查方案'
    useStageCommandNotice.setState({ error: message })
    return { ok: false, error: message, nodeIds: [] }
  }
}

/** The host owns policy; framework callers retain their native cascade and history behavior. */
export function connectStageCommandExecutor() {
  return installSceneMutationHandler((changes, commit) => {
    if (executing || !readStageDocument()) {
      commit()
      return
    }
    try {
      const state = useScene.getState(),
        frame = stageFrame(),
        context = currentStageContext()
      assertUnlockedChanges(changes, state.nodes)
      // Remount validates against the calibrated destination, not the original rehearsal venue.
      if (
        changes.update?.some(
          (op) => op.id === stageSite().id && op.data.metadata?.remount !== undefined,
        )
      ) {
        commit()
        return
      }
      const nodes = { ...state.nodes },
        ids: AnyNodeId[] = []
      for (const op of changes.create ?? []) {
        nodes[op.node.id] = op.node
        ids.push(op.node.id)
      }
      for (const op of changes.update ?? []) {
        const old = nodes[op.id]
        if (old) {
          nodes[op.id] = { ...old, ...op.data } as AnyNode
          if (
            [
              'position',
              'rotation',
              'scale',
              'topology',
              'asset',
              'supportSlabId',
              'width',
              'height',
              'length',
              'stepCount',
              'totalRise',
            ].some((key) => key in op.data) ||
            op.data.visible === true
          )
            ids.push(op.id)
        }
      }
      for (const id of [...ids]) {
        const node = nodes[id]
        if (node?.type === 'stair-segment' && node.parentId) ids.push(node.parentId as AnyNodeId)
      }
      const items = [...new Set(ids)].flatMap((id) => {
        const n = nodes[id]
        if (
          !n ||
          (!n.metadata.stageKind && n.type !== 'stair') ||
          n.metadata.isTransient ||
          n.metadata.isNew ||
          n.visible === false ||
          (n.type !== 'item' && n.type !== 'block' && n.type !== 'stair')
        )
          return []
        return [
          proposal(
            n,
            nodes,
            frame,
            context.objects.some((o) => o.id === id),
          ),
        ]
      })
      if (items.length) {
        const validation = validateStagePlan(
          {
            schemaVersion: 1,
            source: 'manual',
            venue: null,
            items,
            relations: [],
            assumptions: [],
            questions: [],
            evidence: [],
            warnings: [],
          },
          context,
        )
        if (!validation.valid) {
          useStageCommandNotice.setState({
            error: validation.warnings
              .filter((w) => w.blocking)
              .map((w) => w.message)
              .join('；'),
          })
          return false
        }
      }
    } catch (cause) {
      useStageCommandNotice.setState({
        error: cause instanceof Error ? cause.message : '台件参数无效，未修改场景。',
      })
      return false
    }
    commit()
  })
}
