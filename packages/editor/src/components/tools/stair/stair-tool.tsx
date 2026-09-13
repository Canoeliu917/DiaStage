import {
  type AnyNode,
  collectAlignmentAnchors,
  emitter,
  type GridEvent,
  type LevelNode,
  movingAlignmentAnchors,
  type NodeEvent,
  resolveAlignment,
  resolveFrozenFloorPlacementPatch,
  resolveSupportSlabPatch,
  StairNode,
  StairSegmentNode,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfxEmitter } from '../../../lib/sfx-bus'

import useAlignmentGuides from '../../../store/use-alignment-guides'
import useEditor, {
  isAlignmentGuideActive,
  isGridSnapActive,
  isMagneticSnapActive,
} from '../../../store/use-editor'

import useFacingPose from '../../../store/use-facing-pose'
import { useStairBuildPreview } from '../../../store/use-stair-build-preview'
import { CursorSphere } from '../shared/cursor-sphere'
import { getFloorStackPreviewPosition } from '../shared/floor-stack-preview'
import {
  type PointerSupportSurface,
  resolvePointerSupportSurface,
} from '../shared/pointer-support-cap'
import { createStairCommitGate, swallowFollowUpBrowserClick } from './stair-click-guard'
import {
  DEFAULT_STAIR_HEIGHT,
  DEFAULT_STAIR_LENGTH,
  DEFAULT_STAIR_STEP_COUNT,
  DEFAULT_STAIR_WIDTH,
} from './stair-defaults'

const GRID_OFFSET = 0.02
/** Figma-style alignment-snap threshold (meters), matching the move tools. */
const ALIGNMENT_THRESHOLD_M = 0.08
type ClickTriggerEvent = GridEvent | NodeEvent<AnyNode>
type MoveTriggerEvent = GridEvent | NodeEvent<AnyNode>

/**
 * Generates the step-profile geometry for the ghost preview.
 * Same algorithm as StairSystem's generateStairSegmentGeometry.
 */
function createStairPreviewGeometry(): THREE.BufferGeometry {
  const riserHeight = DEFAULT_STAIR_HEIGHT / DEFAULT_STAIR_STEP_COUNT
  const treadDepth = DEFAULT_STAIR_LENGTH / DEFAULT_STAIR_STEP_COUNT

  const shape = new THREE.Shape()
  shape.moveTo(0, 0)

  for (let i = 0; i < DEFAULT_STAIR_STEP_COUNT; i++) {
    shape.lineTo(i * treadDepth, (i + 1) * riserHeight)
    shape.lineTo((i + 1) * treadDepth, (i + 1) * riserHeight)
  }

  // Fill to floor (absoluteHeight = 0)
  shape.lineTo(DEFAULT_STAIR_LENGTH, 0)
  shape.lineTo(0, 0)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: DEFAULT_STAIR_WIDTH,
    bevelEnabled: false,
  })

  // Rotate so extrusion is along X (width), shape profile in XZ plane
  const matrix = new THREE.Matrix4()
  matrix.makeRotationY(-Math.PI / 2)
  matrix.setPosition(DEFAULT_STAIR_WIDTH / 2, 0, 0)
  geometry.applyMatrix4(matrix)

  return geometry
}

/**
 * Creates a default straight stair segment.
 */
function createDefaultStairSegment() {
  return StairSegmentNode.parse({
    width: DEFAULT_STAIR_WIDTH,
    length: DEFAULT_STAIR_LENGTH,
    height: DEFAULT_STAIR_HEIGHT,
    stepCount: DEFAULT_STAIR_STEP_COUNT,
    position: [0, 0, 0],
  })
}

function createDefaultStairNode({
  name,
  levelId,
  position,
  rotation,
  segmentId,
}: {
  name: string
  levelId: LevelNode['id']
  position: [number, number, number]
  rotation: number
  segmentId: StairSegmentNode['id']
}) {
  return StairNode.parse({
    name,
    position,
    rotation,
    parentId: levelId,
    totalRise: DEFAULT_STAIR_HEIGHT,
    metadata: { stageKind: 'stairs', representation: 'physical' },
    width: DEFAULT_STAIR_WIDTH,
    stepCount: DEFAULT_STAIR_STEP_COUNT,
    children: [segmentId],
  })
}

/**
 * Creates a stair group with one default stair segment at the given position/rotation.
 */
function commitStairPlacement(
  levelId: LevelNode['id'],
  position: [number, number, number],
  rotation: number,
  supportSurface: PointerSupportSurface | null,
): void {
  const { createNodes, nodes } = useScene.getState()
  const placementLevelId = nodes[levelId]?.type === 'level' ? levelId : null
  if (!placementLevelId) return

  const stairCount = Object.values(nodes).filter((n) => n.type === 'stair').length
  const name = `舞台台阶 ${stairCount + 1}`
  const segment = createDefaultStairSegment()

  const stair = StairNode.parse({
    ...createDefaultStairNode({
      name,
      levelId: placementLevelId,
      position,
      rotation,
      segmentId: segment.id,
    }),
    parentId: placementLevelId,
  })
  const prospectiveNodes = {
    ...nodes,
    [stair.id]: stair,
    [segment.id]: { ...segment, parentId: stair.id },
  } as Record<string, AnyNode>
  const placementPatch = supportSurface?.sourceNodeId
    ? resolveFrozenFloorPlacementPatch(stair, prospectiveNodes, {
        position,
        rotation,
        elevation: supportSurface.elevation,
        preferredSlabId: supportSurface.supportSlabId,
      })
    : {
        position,
        ...resolveSupportSlabPatch(stair, prospectiveNodes, {
          maxElevation: supportSurface?.elevation,
        }),
      }
  const committedStair = StairNode.parse({
    ...stair,
    ...placementPatch,
  })

  createNodes([
    { node: committedStair, parentId: placementLevelId },
    { node: segment, parentId: committedStair.id },
  ])

  sfxEmitter.emit('sfx:structure-build')
}

export const StairTool: React.FC = () => {
  const camera = useThree((state) => state.camera)
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const cursorRef = useRef<THREE.Group>(null)
  const previewRef = useRef<THREE.Group>(null)
  const rotationRef = useRef(0)
  const supportSurfaceRef = useRef<PointerSupportSurface | null>(null)
  const previousGridPosRef = useRef<[number, number] | null>(null)
  const lastCanonicalPositionRef = useRef<[number, number, number] | null>(null)
  const currentLevelId = useViewer((state) => state.selection.levelId)

  const previewGeometry = useMemo(() => createStairPreviewGeometry(), [])

  useEffect(() => {
    if (!currentLevelId) return

    // Refuses the duplicate commit triggers a single physical click produces
    // — see `stair-click-guard.ts`. Fresh per armed session.
    const commitGate = createStairCommitGate()

    // Reset rotation when tool activates
    rotationRef.current = 0
    useStairBuildPreview.getState().reset()
    if (previewRef.current) previewRef.current.rotation.y = 0
    lastCanonicalPositionRef.current = null
    supportSurfaceRef.current = null

    const buildPreviewScene = (position: [number, number, number], rotation: number) => {
      const nodes = useScene.getState().nodes
      const placementLevelId = nodes[currentLevelId]?.type === 'level' ? currentLevelId : null
      if (!placementLevelId) return null

      const segment = createDefaultStairSegment()
      const stair = createDefaultStairNode({
        name: '舞台台阶预览',
        levelId: placementLevelId,
        position,
        rotation,
        segmentId: segment.id,
      })
      const previewNodes = {
        ...nodes,
        [stair.id]: { ...stair, parentId: placementLevelId },
        [segment.id]: { ...segment, parentId: stair.id },
      } as Record<string, AnyNode>

      return { placementLevelId, previewNodes, stair }
    }

    // Dedupe the grid-snapped preview so pointer movement inside one cell does
    // not rebuild the same collision and support data repeatedly.
    let lastPreviewKey: string | null = null

    const applyDraftPreview = (
      position: [number, number, number],
      rotation: number,
      supportSurface: PointerSupportSurface | null,
    ) => {
      const key = `${position[0].toFixed(3)},${position[2].toFixed(3)},${rotation.toFixed(4)},${supportSurface?.elevation.toFixed(3) ?? 'none'},${supportSurface?.sourceNodeId ?? 'floor'}`
      if (key === lastPreviewKey) return
      lastPreviewKey = key
      useStairBuildPreview.getState().setPreview([position[0], position[2]], rotation)
      const preview = buildPreviewScene(position, rotation)
      const frozenPatch =
        preview && supportSurface?.sourceNodeId
          ? resolveFrozenFloorPlacementPatch(preview.stair, preview.previewNodes, {
              position,
              rotation,
              elevation: supportSurface.elevation,
              preferredSlabId: supportSurface.supportSlabId,
            })
          : null
      const previewPosition = frozenPatch?.position ?? position
      const previewStair = frozenPatch
        ? ({ ...preview?.stair, ...frozenPatch } as AnyNode)
        : preview?.stair
      const visualPosition =
        preview && previewStair
          ? getFloorStackPreviewPosition({
              node: previewStair,
              position: previewPosition,
              rotation,
              levelId: preview.placementLevelId,
              nodes: preview.previewNodes,
              maxElevation: supportSurface?.sourceNodeId ? null : supportSurface?.elevation,
            })
          : previewPosition
      if (cursorRef.current) {
        cursorRef.current.position.set(
          visualPosition[0],
          visualPosition[1] + GRID_OFFSET,
          visualPosition[2],
        )
      }

      if (previewRef.current) {
        previewRef.current.position.set(...visualPosition)
        previewRef.current.rotation.y = rotation
      }

      // Forward-facing triangle (editor-side overlay). The run ascends along
      // local +Z from the entry at z≈0; the stair's front is the -Z entry side,
      // so `reversed` points the triangle out of the entry (where you approach
      // from), sitting just before it — not inside the footprint or at the
      // elevated far end. Centre is the footprint mid-run (origin is the entry).
      useFacingPose.getState().set({
        position: visualPosition,
        rotationY: rotation,
        depth: DEFAULT_STAIR_LENGTH,
        center: [0, DEFAULT_STAIR_LENGTH / 2],
        reversed: true,
      })
    }

    // Alignment candidates — anchors of every alignable object; refreshed
    // after each placement. The moving stair aligns by its footprint edges so
    // users can snap the run side against walls, slabs, elevators, or another
    // stair instead of only lining up the invisible origin point.
    let alignmentCandidates = collectAlignmentAnchors(useScene.getState().nodes, '', currentLevelId)
    const resolveStairFootprintAlignment = (
      x: number,
      z: number,
      rotation: number,
    ): ReturnType<typeof resolveAlignment> | null => {
      const preview = buildPreviewScene([x, 0, z], rotation)
      const moving = preview
        ? movingAlignmentAnchors(preview.stair, preview.previewNodes, x, z, rotation)
        : []
      if (moving.length === 0) return null
      return resolveAlignment({
        moving,
        candidates: alignmentCandidates,
        threshold: ALIGNMENT_THRESHOLD_M,
      })
    }
    // The probe is the RAW cursor, not the grid-snapped point: resolving
    // against the grid point would only catch anchors that happen to sit near
    // a grid line. Matched axes use the raw probe + snap delta; unmatched axes
    // keep the normal grid snap. Guides are published in every snapping mode
    // (including Off); the magnetic pull toward them (applySnap) applies only in
    // 'lines' mode.
    const alignPoint = (
      gridX: number,
      gridZ: number,
      rawX: number,
      rawZ: number,
      bypass: boolean,
      applySnap: boolean,
    ): [number, number] => {
      if (bypass || alignmentCandidates.length === 0) {
        useAlignmentGuides.getState().clear()
        return [gridX, gridZ]
      }
      const ar = resolveStairFootprintAlignment(rawX, rawZ, rotationRef.current)
      if (!ar || ar.guides.length === 0) {
        useAlignmentGuides.getState().clear()
        return [gridX, gridZ]
      }
      if (!applySnap) {
        useAlignmentGuides.getState().set(ar.guides)
        return [gridX, gridZ]
      }
      let x = gridX
      let z = gridZ
      if (ar.snap) {
        if (ar.guides.some((guide) => guide.axis === 'x')) x = rawX + ar.snap.dx
        if (ar.guides.some((guide) => guide.axis === 'z')) z = rawZ + ar.snap.dz
      }
      const finalAlignment = resolveStairFootprintAlignment(x, z, rotationRef.current)
      useAlignmentGuides.getState().set(finalAlignment?.guides ?? ar.guides)
      return [x, z]
    }

    const resolveStairPosition = (event: MoveTriggerEvent): [number, number, number] | null => {
      const pointed = resolvePointerSupportSurface(cameraRef.current, event.position, {
        includeNodeTopSurfaces: true,
      })
      supportSurfaceRef.current = pointed
      const fallbackPosition =
        'node' in event ? lastCanonicalPositionRef.current : event.localPosition
      if (!pointed?.localPoint && !fallbackPosition) return null
      const rawX = pointed?.localPoint?.[0] ?? fallbackPosition![0]
      const rawZ = pointed?.localPoint?.[2] ?? fallbackPosition![2]
      // Grid snap follows the global mode (live step so the HUD chip is
      // honest); Off keeps the raw cursor. Shift cycles the mode centrally.
      const step = useEditor.getState().gridSnapStep
      const [gridX, gridZ] = alignPoint(
        isGridSnapActive() ? Math.round(rawX / step) * step : rawX,
        isGridSnapActive() ? Math.round(rawZ / step) * step : rawZ,
        rawX,
        rawZ,
        !isAlignmentGuideActive(),
        isMagneticSnapActive(),
      )
      return [gridX, 0, gridZ]
    }

    const onPointerMove = (event: MoveTriggerEvent) => {
      const position = resolveStairPosition(event)
      if (!position) return
      const [gridX, , gridZ] = position
      lastCanonicalPositionRef.current = position
      applyDraftPreview(position, rotationRef.current, supportSurfaceRef.current)

      if (
        (isGridSnapActive() || isMagneticSnapActive()) &&
        previousGridPosRef.current &&
        (gridX !== previousGridPosRef.current[0] || gridZ !== previousGridPosRef.current[1])
      ) {
        sfxEmitter.emit('sfx:grid-snap')
      }

      previousGridPosRef.current = [gridX, gridZ]
    }

    const commitAtCursor = (event: ClickTriggerEvent) => {
      if (!currentLevelId) return
      // One physical click can reach here twice (node click synthesized on
      // pointerup + the native browser click driving `grid:click`) — see
      // `stair-click-guard.ts`. The gate refuses anything after a single-
      // continuation commit; the swallow below eats the same gesture's
      // follow-up click while the tool stays armed (repeat continuation).
      if (!commitGate.shouldCommit()) return
      const nodeEvent = 'node' in event ? (event as NodeEvent<AnyNode>) : null
      if (nodeEvent) {
        nodeEvent.stopPropagation()
        nodeEvent.nativeEvent.stopPropagation()
        // The canvas-level `grid:click` listener is out of stopPropagation's
        // reach — without this, the browser click that follows this
        // pointerup-synthesized node click commits a second stair.
        swallowFollowUpBrowserClick()
      }

      const position = resolveStairPosition(event)
      if (!position) return

      commitStairPlacement(currentLevelId, position, rotationRef.current, supportSurfaceRef.current)
      // Commit cleared the opening preview, so force the next hover (even on the
      // same cell) to rebuild rather than dedupe against the just-placed key.
      lastPreviewKey = null
      useAlignmentGuides.getState().clear()

      // Single by default; the C-toggle ('point' context, shared with every
      // other placement tool) opts into placing more. On single, drop the tool
      // and the facing triangle so we fall back to select after one stair.
      if (useEditor.getState().getContinuation('point') === 'repeat') {
        alignmentCandidates = collectAlignmentAnchors(useScene.getState().nodes, '', currentLevelId)
      } else {
        commitGate.markExited()
        useFacingPose.getState().clear()
        useEditor.getState().setTool(null)
        // Return to select mode explicitly (matches the spawn tool's exit).
        // The selection managers route node clicks only while
        // `mode === 'select'`; exiting with `mode: 'build'` + a null tool
        // left every click dead until the user pressed Escape.
        useEditor.getState().setMode('select')
      }
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
        sfxEmitter.emit('sfx:item-rotate')
        rotationRef.current += rotationDelta
        if (lastCanonicalPositionRef.current) {
          applyDraftPreview(
            lastCanonicalPositionRef.current,
            rotationRef.current,
            supportSurfaceRef.current,
          )
        } else if (previewRef.current) {
          previewRef.current.rotation.y = rotationRef.current
        }
      }
    }

    emitter.on('grid:move', onPointerMove)
    emitter.on('grid:click', commitAtCursor)
    emitter.on('node:click', commitAtCursor)
    emitter.on('node:move', onPointerMove)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      emitter.off('grid:move', onPointerMove)
      emitter.off('grid:click', commitAtCursor)
      emitter.off('node:click', commitAtCursor)
      emitter.off('node:move', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      useAlignmentGuides.getState().clear()
      useFacingPose.getState().clear()
      useStairBuildPreview.getState().reset()
    }
  }, [currentLevelId])

  return (
    <group>
      <CursorSphere ref={cursorRef} />

      {/* 3D ghost preview — position/rotation updated imperatively. The
          forward-facing triangle is drawn by the editor-side overlay from the
          pose published in `applyDraftPreview`. */}
      <group ref={previewRef}>
        <mesh castShadow geometry={previewGeometry}>
          <meshStandardMaterial color="#818cf8" depthWrite={false} opacity={0.35} transparent />
        </mesh>
      </group>
    </group>
  )
}
