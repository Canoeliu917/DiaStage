import {
  type AnyNodeId,
  collectAlignmentAnchors,
  emitter,
  type FenceNode,
  type GridEvent,
  type LevelNode,
  movingAlignmentAnchors,
  nodeRegistry,
  resolveAlignment,
  resolveSupportSlabPatch,
  type StairNode,
  sceneRegistry,
  useLiveTransforms,
  useScene,
  type WallNode,
} from '@pascal-app/core'
import {
  CursorSphere,
  commitFreshPlacementSubtree,
  consumePlacementDragRelease,
  DragBoundingBox,
  getFloorStackPreviewPosition,
  isMagneticSnapActive,
  resolvePlanarCursorPosition,
  snapFenceDraftPoint,
  stripPlacementMetadataFlags,
  triggerSFX,
  useAlignmentGuides,
  useEditor,
  useFreshPlacementVisibility,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/** Figma-style alignment-snap threshold (meters), matching the other tools. */
const ALIGNMENT_THRESHOLD_M = 0.08

function disableRaycastDuringDrag(root: THREE.Object3D | undefined): () => void {
  if (!root) return () => {}

  const originals: Array<[THREE.Object3D, THREE.Object3D['raycast']]> = []
  root.traverse((child) => {
    originals.push([child, child.raycast])
    child.raycast = () => {}
  })

  return () => {
    for (const [child, raycast] of originals) {
      child.raycast = raycast
    }
  }
}

export const MoveStairTool: React.FC<{
  node: StairNode
}> = ({ node: movingNode }) => {
  const {
    isFreshPlacement,
    previewVisible: cursorVisible,
    revealFreshPlacement,
    useAbsoluteCursorPlacement,
  } = useFreshPlacementVisibility({
    node: movingNode,
    enabled: true,
  })
  const exitMoveMode = useCallback(() => {
    useEditor.getState().setMovingNode(null)
  }, [])

  const previousGridPosRef = useRef<[number, number] | null>(null)
  const dragAnchorRef = useRef<[number, number] | null>(null)

  const [previewRotation, setPreviewRotation] = useState<number>(() => movingNode.rotation)
  const [cursorWorldPos, setCursorWorldPos] = useState<[number, number, number]>(() => {
    const obj = sceneRegistry.nodes.get(movingNode.id)
    if (obj) {
      const worldPos = obj.getWorldPosition(new THREE.Vector3())
      // Cursor renders inside the building-local ToolManager group, so convert
      // world → building-local to honor any building rotation.
      const buildingId = useViewer.getState().selection.buildingId
      const buildingObj = buildingId ? sceneRegistry.nodes.get(buildingId as AnyNodeId) : null
      if (buildingObj) buildingObj.worldToLocal(worldPos)
      return [worldPos.x, worldPos.y, worldPos.z]
    }
    return [movingNode.position[0], movingNode.position[1], movingNode.position[2]]
  })

  useEffect(() => {
    useScene.temporal.getState().pause()
    dragAnchorRef.current = null
    previousGridPosRef.current = null

    const isNew = isFreshPlacement
    const committedMeta = stripPlacementMetadataFlags(movingNode.metadata) as StairNode['metadata']

    const original = {
      position: [...movingNode.position] as [number, number, number],
      rotation: movingNode.rotation,
      parentId: movingNode.parentId,
      metadata: movingNode.metadata,
    }

    // Drag previews never mutate the saved scene.
    let wasCommitted = false
    let wasCancelled = false
    let hasMoved = false

    // Track pending rotation — no store updates during drag
    let pendingRotation: number = movingNode.rotation as number
    let lastLocalPosition: [number, number, number] = [
      movingNode.position[0],
      movingNode.position[1],
      movingNode.position[2],
    ]
    const movingObject = sceneRegistry.nodes.get(movingNode.id)
    const restoreRaycasts = disableRaycastDuringDrag(movingObject)

    const levelId = movingNode.parentId ?? null
    const isFloorPlaced = nodeRegistry.get(movingNode.type)?.capabilities?.floorPlaced !== undefined
    const getPreviewPosition = (
      position: [number, number, number],
      rotation = pendingRotation,
    ): [number, number, number] => {
      if (!isFloorPlaced) return position
      return getFloorStackPreviewPosition({
        node: movingNode,
        position,
        rotation,
        levelId,
        nodes: useScene.getState().nodes,
      })
    }
    const levelNode =
      levelId && useScene.getState().nodes[levelId as AnyNodeId]?.type === 'level'
        ? (useScene.getState().nodes[levelId as AnyNodeId] as LevelNode)
        : null
    const levelChildren = levelNode?.children ?? []
    const levelWalls = levelChildren
      .map((childId) => useScene.getState().nodes[childId as AnyNodeId])
      .filter((node): node is WallNode => node?.type === 'wall')
    const levelFences = levelChildren
      .map((childId) => useScene.getState().nodes[childId as AnyNodeId])
      .filter((node): node is FenceNode => node?.type === 'fence')

    const alignmentCandidates = collectAlignmentAnchors(
      useScene.getState().nodes,
      movingNode.id,
      levelId,
    )
    const alignLocalPoint = (lx: number, lz: number, bypass: boolean): [number, number] => {
      if (bypass || alignmentCandidates.length === 0) {
        useAlignmentGuides.getState().clear()
        return [lx, lz]
      }
      const moving = movingAlignmentAnchors(
        movingNode,
        useScene.getState().nodes,
        lx,
        lz,
        pendingRotation,
      )
      const ar = resolveAlignment({
        moving:
          moving.length > 0 ? moving : [{ nodeId: movingNode.id, kind: 'corner', x: lx, z: lz }],
        candidates: alignmentCandidates,
        threshold: ALIGNMENT_THRESHOLD_M,
      })
      useAlignmentGuides.getState().set(ar.guides)
      return ar.snap && isMagneticSnapActive() ? [lx + ar.snap.dx, lz + ar.snap.dz] : [lx, lz]
    }

    const onGridMove = (event: GridEvent) => {
      hasMoved = true
      revealFreshPlacement()

      const bypassSnap = event.nativeEvent?.shiftKey === true
      const snappedLocal = snapFenceDraftPoint({
        point: [event.localPosition[0], event.localPosition[2]],
        walls: levelWalls,
        fences: levelFences,
        bypassSnap: bypassSnap,
        magnetic: !bypassSnap && isMagneticSnapActive(),
      })
      const [rawLocalX, rawLocalZ] = snappedLocal
      const resolved = resolvePlanarCursorPosition({
        cursor: [rawLocalX, rawLocalZ],
        original: [movingNode.position[0], movingNode.position[2]],
        anchor: dragAnchorRef.current,
        mode: useAbsoluteCursorPlacement ? 'absolute' : 'relative',
      })
      dragAnchorRef.current = resolved.anchor
      let [localX, localZ] = resolved.point

      {
        const aligned = alignLocalPoint(
          localX,
          localZ,
          event.nativeEvent?.altKey === true || event.nativeEvent?.shiftKey === true,
        )
        localX = aligned[0]
        localZ = aligned[1]
      }

      if (
        event.nativeEvent?.shiftKey !== true &&
        previousGridPosRef.current &&
        (localX !== previousGridPosRef.current[0] || localZ !== previousGridPosRef.current[1])
      ) {
        triggerSFX('sfx:grid-snap')
      }

      previousGridPosRef.current = [localX, localZ]

      lastLocalPosition = [localX, movingNode.position[1], localZ]
      const previewPosition = getPreviewPosition(lastLocalPosition)
      setCursorWorldPos(previewPosition)

      // Directly update the Three.js mesh — no store update during drag
      const mesh = sceneRegistry.nodes.get(movingNode.id)
      if (mesh) {
        if (isFloorPlaced) {
          mesh.position.set(...previewPosition)
        } else {
          mesh.position.x = localX
          mesh.position.z = localZ
        }
      }

      // Publish canonical position so the 2D floorplan can track the drag.
      // Floor-placed parents (stairs) stay in their committed local frame;
      // the lifted Y remains presentation-only in the 3D view.
      useLiveTransforms.getState().set(movingNode.id, {
        position: lastLocalPosition,
        rotation: pendingRotation,
      })
    }

    const onGridClick = (event: GridEvent) => {
      if (wasCommitted) return
      if (!hasMoved) return
      const [localX, , localZ] = lastLocalPosition

      useAlignmentGuides.getState().clear()

      const position: [number, number, number] = [localX, movingNode.position[1], localZ]
      const effectiveNode = {
        ...movingNode,
        position,
        rotation: pendingRotation,
      } as typeof movingNode
      const supportPatch = isFloorPlaced
        ? resolveSupportSlabPatch(effectiveNode, {
            ...useScene.getState().nodes,
            [movingNode.id]: effectiveNode,
          })
        : {}

      let committedId = movingNode.id as AnyNodeId
      if (isNew) {
        committedId =
          commitFreshPlacementSubtree(movingNode.id as AnyNodeId, {
            position,
            rotation: pendingRotation,
            metadata: committedMeta,
            visible: true,
            ...supportPatch,
          }) ?? committedId
      } else {
        // The store still holds the original values (we didn't update during drag).
        // Resume temporal and apply the final state as a single undoable step.
        useScene.temporal.getState().resume()
        useScene.getState().updateNode(movingNode.id, {
          position,
          rotation: pendingRotation,
          metadata: committedMeta,
          ...supportPatch,
        })
        useScene.temporal.getState().pause()
      }

      const saved = useScene.getState().nodes[committedId]
      wasCommitted =
        saved?.type === 'stair' &&
        saved.rotation === pendingRotation &&
        saved.position.every((value, axis) => value === position[axis])
      if (!wasCommitted) {
        const mesh = sceneRegistry.nodes.get(movingNode.id)
        if (mesh) {
          mesh.position.set(...getPreviewPosition(original.position, original.rotation))
          mesh.rotation.y = original.rotation
        }
        useLiveTransforms.getState().clear(movingNode.id)
        useScene.getState().markDirty(movingNode.id)
        if (!useScene.getState().nodes[movingNode.id]) exitMoveMode()
        return
      }
      triggerSFX('sfx:item-place')
      useViewer.getState().setSelection({ selectedIds: [committedId] })
      useLiveTransforms.getState().clear(movingNode.id)
      useEditor.getState().setMovingNodeOrigin('3d')
      exitMoveMode()
      event.nativeEvent?.stopPropagation?.()
    }

    const onPlacementDragPointerUp = (event: PointerEvent) => {
      if (!consumePlacementDragRelease(event)) return
      onGridClick({ nativeEvent: event } as unknown as GridEvent)
    }

    const onCancel = () => {
      wasCancelled = true
      useLiveTransforms.getState().clear(movingNode.id)
      useAlignmentGuides.getState().clear()
      if (isNew) {
        useScene.getState().deleteNode(movingNode.id)
      } else {
        useScene.getState().updateNode(movingNode.id, {
          position: original.position,
          rotation: original.rotation,
          metadata: original.metadata,
        })
      }
      useScene.temporal.getState().resume()
      exitMoveMode()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      const ROTATION_STEP = Math.PI / 4
      let rotationDelta = 0
      if (event.key === 'r' || event.key === 'R') rotationDelta = ROTATION_STEP
      else if (event.key === 't' || event.key === 'T') rotationDelta = -ROTATION_STEP

      if (rotationDelta !== 0) {
        event.preventDefault()
        triggerSFX('sfx:item-rotate')

        pendingRotation += rotationDelta
        setPreviewRotation(pendingRotation)

        // Directly update the Three.js mesh — no store update during drag
        const mesh = sceneRegistry.nodes.get(movingNode.id)
        if (mesh) {
          mesh.rotation.y = pendingRotation
          if (isFloorPlaced) {
            const previewPosition = getPreviewPosition(lastLocalPosition, pendingRotation)
            mesh.position.set(...previewPosition)
            setCursorWorldPos(previewPosition)
          }
        }

        // Update live transform rotation for 2D floorplan
        const currentLive = useLiveTransforms.getState().get(movingNode.id)
        if (currentLive) {
          useLiveTransforms.getState().set(movingNode.id, {
            ...currentLive,
            rotation: pendingRotation,
          })
        }
      }
    }

    emitter.on('grid:move', onGridMove)
    emitter.on('grid:click', onGridClick)
    emitter.on('tool:cancel', onCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerup', onPlacementDragPointerUp)

    return () => {
      restoreRaycasts()

      // Clear ephemeral live transform + any alignment guides
      useLiveTransforms.getState().clear(movingNode.id)
      useAlignmentGuides.getState().clear()

      // Skip restore when the 2D floor-plan overlay claimed teardown
      // ownership — same contract `FloorplanRegistryMoveOverlay` uses to
      // decide whether to revert its own apply() writes. Without this,
      // a stair move committed in the floor plan unmounts this
      // tool with `wasCommitted === false` (this tool's own grid-click
      // never fired), and the restore below stomps the just-committed
      // position back to the snapshot.
      const finalisedBy2D = useEditor.getState().movingNodeOrigin === '2d'

      if (!(wasCommitted || wasCancelled || isNew || finalisedBy2D)) {
        useScene.getState().updateNode(movingNode.id, {
          position: original.position,
          rotation: original.rotation,
          metadata: original.metadata,
        })
      }
      useScene.temporal.getState().resume()
      emitter.off('grid:move', onGridMove)
      emitter.off('grid:click', onGridClick)
      emitter.off('tool:cancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerup', onPlacementDragPointerUp)
    }
  }, [movingNode, exitMoveMode, isFreshPlacement, revealFreshPlacement, useAbsoluteCursorPlacement])

  return (
    <group visible={cursorVisible}>
      <CursorSphere position={cursorWorldPos} showTooltip={false} />

      <DragBoundingBox
        nodeId={movingNode.id}
        position={cursorWorldPos}
        rotationY={previewRotation}
      />
    </group>
  )
}

export default MoveStairTool
