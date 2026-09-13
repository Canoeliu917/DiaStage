'use client'

import { emitter, sceneRegistry, useScene } from '@pascal-app/core'
import {
  type DeploymentPlan,
  fromFrameCoordinates,
  getObjectCorners,
  type RemountObject,
  type Vec3,
  type VenueProfile,
} from '@pascal-app/core/remount'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import { OVERLAY_LAYER, useIsolatedFrame as useFrame, useViewer } from '@pascal-app/viewer'
import type { CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Matrix4,
  Mesh,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Sphere,
  Vector3,
} from 'three'
import { LineBasicNodeMaterial, LineDashedNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'
import { useCameraDirectorState } from '@/lib/camera-director'
import { isRemountPreviewCurrent, useRemountDraft } from '@/lib/remount-scene'
import { useCameraStudio } from './camera-studio/store'

const SOURCE_COLOR = '#60a5fa'
const TARGET_COLOR = '#4ade80'
const WARNING_COLOR = '#facc15'
const ERROR_COLOR = '#f87171'
const VENUE_COLOR = '#94a3b8'

function venueCorners(venue: VenueProfile): Vec3[] {
  const { width, height, depth } = venue.bounds
  return [-width / 2, width / 2].flatMap((x) =>
    [0, height].flatMap((y) => [0, depth].map((z) => fromFrameCoordinates([x, y, z], venue.frame))),
  )
}

function boxSegments(corners: Vec3[]): Vec3[] {
  return corners.flatMap((point, index) =>
    [1, 2, 4].filter((bit) => (index & bit) === 0).flatMap((bit) => [point, corners[index | bit]!]),
  )
}

function pathSegments(points: Vec3[]): Vec3[] {
  return points.slice(1).flatMap((point, index) => [points[index]!, point])
}

function PreviewLines({
  points,
  color,
  name,
  dashed = false,
}: {
  points: Vec3[]
  color: string
  name: string
  dashed?: boolean
}) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
    // The direct-render path has no separate overlay pass: draw after scene surfaces.
    const parameters = {
      color,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
    }
    const material = dashed
      ? new LineDashedNodeMaterial({ ...parameters, dashSize: 0.18, gapSize: 0.12 })
      : new LineBasicNodeMaterial(parameters)
    const object = new LineSegments(geometry, material)
    object.layers.set(OVERLAY_LAYER)
    object.renderOrder = 1000
    object.frustumCulled = false
    object.raycast = () => {}
    object.computeLineDistances()
    return object
  }, [points, color, dashed])

  useEffect(
    () => () => {
      line.geometry.dispose()
      line.material.dispose()
    },
    [line],
  )

  return points.length ? <primitive name={name} object={line} /> : null
}

function ScanReference({ nodeId }: { nodeId: string }) {
  const preview = useMemo(() => {
    const group = new Group()
    group.layers.set(OVERLAY_LAYER)
    group.raycast = () => {}
    return {
      group,
      material: new MeshBasicNodeMaterial({
        color: VENUE_COLOR,
        transparent: true,
        opacity: 0.18,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
      meshes: new Map<Mesh, Mesh>(),
      current: new Set<Mesh>(),
      inverseParent: new Matrix4(),
      nodes: undefined as unknown,
      revision: -1,
      source: undefined as Object3D | undefined,
      children: -1,
      visible: false,
    }
  }, [])

  useFrame(() => {
    const source = sceneRegistry.nodes.get(nodeId)
    let visible = Boolean(source)
    for (let ancestor: Object3D | null | undefined = source; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) visible = false
    }
    const nodes = useScene.getState().nodes
    if (
      preview.nodes === nodes &&
      preview.revision === sceneRegistry.revision &&
      preview.source === source &&
      preview.children === (source?.children.length ?? 0) &&
      preview.visible === visible
    )
      return
    preview.nodes = nodes
    preview.revision = sceneRegistry.revision
    preview.source = source
    preview.children = source?.children.length ?? 0
    preview.visible = visible
    preview.current.clear()
    preview.group.updateWorldMatrix(true, false)
    preview.inverseParent.copy(preview.group.matrixWorld).invert()
    if (source && visible) {
      source.updateWorldMatrix(true, true)
      source.traverseVisible((child) => {
        if (!(child instanceof Mesh)) return
        preview.current.add(child)
        let mesh = preview.meshes.get(child)
        if (!mesh) {
          // Borrow only geometry: the loader and original materials retain their ownership.
          mesh = new Mesh(child.geometry, preview.material)
          mesh.matrixAutoUpdate = false
          mesh.layers.set(OVERLAY_LAYER)
          mesh.renderOrder = 900
          mesh.raycast = () => {}
          mesh.frustumCulled = false
          preview.meshes.set(child, mesh)
          preview.group.add(mesh)
        }
        mesh.geometry = child.geometry
        mesh.matrix.copy(preview.inverseParent).multiply(child.matrixWorld)
        mesh.matrixWorldNeedsUpdate = true
      })
    }
    for (const [sourceMesh, mesh] of preview.meshes) {
      if (preview.current.has(sourceMesh)) continue
      preview.group.remove(mesh)
      preview.meshes.delete(sourceMesh)
    }
  })

  useEffect(
    () => () => {
      preview.group.clear()
      preview.meshes.clear()
      preview.current.clear()
      preview.material.dispose()
    },
    [preview],
  )

  return <primitive dispose={null} name="remount-target-scan" object={preview.group} />
}

function RemountGhosts({
  plan,
  sourceVenue,
  targetVenue,
  sourceReferences,
  comparisonMode,
}: {
  plan: DeploymentPlan
  sourceVenue: VenueProfile
  targetVenue: VenueProfile
  sourceReferences: RemountObject[]
  comparisonMode: 'overlay' | 'source' | 'target'
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as CameraControlsImpl | null
  const invalidate = useThree((state) => state.invalidate)
  const geometry = useMemo(() => {
    const source: Vec3[] = sourceReferences.flatMap((object) =>
      boxSegments(getObjectCorners(object)),
    )
    const target = new Map<string, Vec3[]>([
      [TARGET_COLOR, []],
      [WARNING_COLOR, []],
      [ERROR_COLOR, []],
    ])
    const severities = new Map<string, 'warning' | 'error'>()
    for (const conflict of plan.conflicts) {
      for (const id of [conflict.nodeId, conflict.otherNodeId]) {
        if (id && severities.get(id) !== 'error') severities.set(id, conflict.severity)
      }
    }
    const framingPoints = [...venueCorners(sourceVenue), ...venueCorners(targetVenue), ...source]
    for (const placement of plan.placements) {
      const original = getObjectCorners({
        ...placement,
        position: placement.sourcePosition,
        rotation: placement.sourceRotation,
      })
      const moved = getObjectCorners({
        ...placement,
        position: placement.targetPosition,
        rotation: placement.targetRotation,
      })
      source.push(...boxSegments(original))
      const severity = severities.get(placement.nodeId)
      const color =
        severity === 'error' ? ERROR_COLOR : severity === 'warning' ? WARNING_COLOR : TARGET_COLOR
      target.get(color)!.push(...boxSegments(moved))
      framingPoints.push(...original, ...moved)
    }
    const sourcePaths = plan.paths.flatMap((path) => pathSegments(path.sourcePoints))
    const targetPaths = plan.paths.flatMap((path) => pathSegments(path.targetPoints))
    framingPoints.push(...sourcePaths, ...targetPaths)
    const { width, depth } = targetVenue.bounds
    const stageLines: Vec3[] = [
      [0, 0, 0],
      [0, 0, depth],
      [-width / 2, 0, 0],
      [width / 2, 0, 0],
    ]
    return {
      source,
      target,
      sourcePaths,
      targetPaths,
      venue: boxSegments(venueCorners(targetVenue)),
      sourceVenue: boxSegments(venueCorners(sourceVenue)),
      stageLines: stageLines.map((point) => fromFrameCoordinates(point, targetVenue.frame)),
      framingPoints,
    }
  }, [plan, sourceVenue, targetVenue, sourceReferences])

  useEffect(() => {
    if (!controls?.setLookAt) return
    // This bounds calculation frames the display only; deployment geometry stays in core.
    const sphere = new Box3()
      .setFromPoints(geometry.framingPoints.map((point) => new Vector3(...point)))
      .getBoundingSphere(new Sphere())
    const radius = Math.max(sphere.radius, 1) * 1.15
    const distance =
      camera instanceof PerspectiveCamera ? controls.getDistanceToFitSphere(radius) : radius * 3
    const position = new Vector3(0.35, 0.6, 1)
      .normalize()
      .multiplyScalar(distance)
      .add(sphere.center)
    emitter.emit('camera-controls:cancel-pose', undefined)
    void controls.setLookAt(...position.toArray(), ...sphere.center.toArray(), false)
    if (camera instanceof OrthographicCamera) {
      void controls.zoomTo(
        Math.min(camera.right - camera.left, camera.top - camera.bottom) / (radius * 2),
        false,
      )
    }
    controls.update(0)
    invalidate()
  }, [camera, controls, geometry, invalidate])

  return (
    <group layers={OVERLAY_LAYER} name="remount-preview" raycast={() => {}}>
      {targetVenue.scanNodeId && (
        <ScanReference key={targetVenue.scanNodeId} nodeId={targetVenue.scanNodeId} />
      )}
      <PreviewLines color={VENUE_COLOR} name="remount-target-venue" points={geometry.venue} />
      <PreviewLines
        color={VENUE_COLOR}
        dashed
        name="remount-target-cl-pl"
        points={geometry.stageLines}
      />
      {comparisonMode !== 'target' && (
        <PreviewLines
          color={SOURCE_COLOR}
          name="remount-source-venue"
          points={geometry.sourceVenue}
          dashed
        />
      )}
      {comparisonMode !== 'target' && (
        <PreviewLines color={SOURCE_COLOR} name="remount-source-boxes" points={geometry.source} />
      )}
      {comparisonMode !== 'source' &&
        [...geometry.target].map(([color, points]) => (
          <PreviewLines color={color} key={color} name="remount-target-boxes" points={points} />
        ))}
      {comparisonMode !== 'target' && (
        <PreviewLines
          color={SOURCE_COLOR}
          dashed
          name="remount-source-paths"
          points={geometry.sourcePaths}
        />
      )}
      {comparisonMode !== 'source' && (
        <PreviewLines
          color={TARGET_COLOR}
          dashed
          name="remount-target-paths"
          points={geometry.targetPaths}
        />
      )}
    </group>
  )
}

export function RemountPreviewSystem({ sceneId }: { sceneId: string }) {
  const draft = useRemountDraft()
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  // Recheck validity on scene edits without treating saved camera framing as an edit.
  useScene((state) => state.nodes)
  const readOnly = useScene((state) => state.readOnly)
  const interactionBusy = useInteractionScope((state) => state.scope.kind !== 'idle')
  const active = useEditor(
    (state) =>
      state.activeSidebarPanel === 'remount' &&
      state.workspaceMode === 'edit' &&
      state.viewMode !== '2d' &&
      !state.isPreviewMode &&
      !state.isCaptureMode &&
      !state.isFirstPersonMode,
  )
  const renderPaused = useViewer((state) => state.renderPaused)
  const isExporting = useViewer((state) => state.isExporting)
  const cameraBusy = useCameraStudio((state) => state.playing || state.previewing)
  const director = useCameraDirectorState(sceneId)
  if (
    !active ||
    readOnly ||
    interactionBusy ||
    renderPaused ||
    isExporting ||
    cameraBusy ||
    director.transport.status !== 'idle' ||
    !draft.plan ||
    !isRemountPreviewCurrent(sceneId) ||
    draft.sceneKey !== JSON.stringify([sceneId, rootNodeIds])
  ) {
    return null
  }
  return (
    <RemountGhosts
      plan={draft.plan}
      sourceVenue={draft.sourceVenue}
      targetVenue={draft.targetVenue}
      sourceReferences={draft.sourceReferences}
      comparisonMode={draft.comparisonMode}
    />
  )
}
