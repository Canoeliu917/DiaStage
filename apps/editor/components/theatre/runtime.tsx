'use client'

import { emitter, useScene } from '@pascal-app/core'
import { useEditor, useFloorplanRender } from '@pascal-app/editor'
import { OVERLAY_LAYER, useViewer, ViewerErrorBoundary } from '@pascal-app/viewer'
import { type CameraControlsImpl, Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Line as ThreeLine,
  Vector2,
  Vector3,
} from 'three'
import { LineBasicNodeMaterial, LineDashedNodeMaterial } from 'three/webgpu'
import { useCameraDirectorState } from '@/lib/camera-director'
import { clearProposalGhost, useProposalGhost } from '@/lib/rehearsal-intelligence/authority'
import { sampleRehearsal } from '@/lib/theatre/blocking'
import {
  actorObservationPose,
  audienceObservationPose,
  venueAudiencePositions,
} from '@/lib/theatre/presentation'
import { activeRehearsalScene, type Vec3 } from '@/lib/theatre/schema'
import { runtimeTheatreDocument } from '@/lib/theatre/simulation'
import {
  cameraFloorplanMatrix,
  cameraPlanPoint,
  cameraPointerToPlan,
} from '../camera-studio/camera-stage-floorplan'
import { useCameraStudio } from '../camera-studio/store'
import { useSimulationDrag } from './simulation-drag'
import { placeSimulationPoint, useSimulationSelection, useStageDocument } from './simulation-panel'
import {
  rehearsalIsExclusive,
  subscribeRehearsalProtection,
  useRehearsalPlayback,
  useTheatreDocument,
} from './state'

export function applyObservationPose(
  controls: Pick<CameraControlsImpl, 'setLookAt'>,
  position: Vec3,
  target: Vec3,
  transition: boolean,
) {
  emitter.emit('camera-controls:cancel-pose', undefined)
  void controls.setLookAt(...position, ...target, transition)
}

function disableFailedProposalPreview() {
  clearProposalGhost()
  useProposalGhost.setState({
    feedbackError: '建议预览未能显示，已停止采用。手动排演与场景保存仍可使用。',
  })
}

const StageLine = memo(
  function StageLine({
    points,
    color,
    dashed = false,
    overlay = false,
  }: {
    points: Vec3[]
    color: string
    dashed?: boolean
    overlay?: boolean
  }) {
    const line = useMemo(() => {
      const object = new ThreeLine(
        new BufferGeometry().setFromPoints(points.map((point) => new Vector3(...point))),
        dashed
          ? new LineDashedNodeMaterial({ color, dashSize: 0.14, gapSize: 0.09 })
          : new LineBasicNodeMaterial({ color }),
      )
      if (dashed) object.computeLineDistances()
      if (overlay) object.layers.set(OVERLAY_LAYER)
      return object
    }, [points, color, dashed, overlay])
    useEffect(
      () => () => {
        line.geometry.dispose()
        line.material.dispose()
      },
      [line],
    )
    return <primitive object={line} raycast={() => null} />
  },
  (previous, next) =>
    previous.color === next.color &&
    previous.dashed === next.dashed &&
    previous.overlay === next.overlay &&
    previous.points.length === next.points.length &&
    previous.points.every((point, index) =>
      point.every((value, axis) => value === next.points[index]![axis]),
    ),
)

/** Domain poses are transient. Scene nodes, cameras and saved transforms are never rewritten. */
export function TheatreRuntime({ enabled }: { enabled: boolean }) {
  const { document } = useTheatreDocument()
  const time = useRehearsalPlayback((s) => s.time)
  const observation = useRehearsalPlayback((s) => s.observation)
  const invalidate = useThree((s) => s.invalidate)
  const readOnly = useScene((s) => s.readOnly)
  const ui = useSimulationSelection()
  const ghostId = useProposalGhost((s) => s.proposalId)
  const { document: stageDocument } = useStageDocument()
  const activePanel = useEditor((s) => s.activeSidebarPanel)
  const viewMode = useEditor((s) => s.viewMode)
  const three = useThree()
  const drag = useSimulationDrag(
    enabled &&
      activePanel === 'simulation' &&
      ui.input === 'select' &&
      viewMode !== '2d' &&
      !readOnly,
  )
  const scene = document ? activeRehearsalScene(document) : null
  const visible = enabled && !!scene
  const sample = useMemo(() => (scene ? sampleRehearsal(scene, time) : null), [scene, time])

  useEffect(() => {
    if (enabled && document && (observation || Number.isFinite(time))) invalidate()
  }, [time, document, enabled, observation, invalidate])
  // Apply once after view-switch effects and the old navigation interpolation's frame.
  useFrame((state) => {
    const observation = useRehearsalPlayback.getState().observation
    const controls = state.controls as CameraControlsImpl | undefined
    if (
      !document ||
      !scene ||
      !sample ||
      !observation ||
      observation === 'plan' ||
      !controls ||
      !visible ||
      useEditor.getState().viewMode === '2d' ||
      rehearsalIsExclusive(useRehearsalPlayback.getState().sceneId)
    )
      return
    if (!(state.camera instanceof PerspectiveCamera)) {
      useViewer.getState().setCameraMode('perspective')
      return
    }
    const [x, y, z] = document.venue.origin
    const span = Math.max(document.venue.width, document.venue.depth)
    if (observation === 'actor' && sample.roles[0] && scene.roles[0]) {
      const role = sample.roles[0]
      const pose = actorObservationPose(role.position, role.facing, scene.roles[0].height)
      applyObservationPose(controls, pose.position, pose.target, false)
    } else if (observation === 'director')
      applyObservationPose(controls, [x, y + 1.6, z + span * 0.9], [x, y + 0.9, z], true)
    else if (observation === 'audience') {
      const pose = audienceObservationPose(
        document.venue,
        state.camera.getEffectiveFOV(),
        state.size.width / Math.max(1, state.size.height),
      )
      applyObservationPose(controls, pose.position, pose.target, true)
    } else
      applyObservationPose(controls, [x + span * 1.2, y + span * 0.35, z], [x, y + 0.6, z], true)
    useRehearsalPlayback.setState({ observation: null })
    invalidate()
  }, 0.1)

  if (!visible || !scene || !document || !sample) return null
  const { venue } = document
  const [x, y, z] = venue.origin
  const w = venue.width / 2,
    d = venue.depth / 2
  return (
    <group name="DiaStage Rehearsal">
      <ViewerErrorBoundary
        fallback={null}
        scope="proposal-ghost"
        resetKey={ghostId}
        onError={disableFailedProposalPreview}
      >
        <ProposalGhost3D />
      </ViewerErrorBoundary>
      {activePanel === 'simulation' && ui.input !== 'select' && !readOnly && (
        <mesh
          position={[x, y + 0.08, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation()
            placeSimulationPoint([e.point.x, y, e.point.z])
          }}
        >
          <planeGeometry args={[venue.width, venue.depth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {ui.input === 'route' && ui.points.length > 1 && (
        <StageLine points={ui.points.map((p) => [p[0], p[1] + 0.1, p[2]])} color="#70b8dd" dashed />
      )}
      <StageLine
        points={[
          [x - w, y + 0.025, z - d],
          [x + w, y + 0.025, z - d],
          [x + w, y + 0.025, z + d],
          [x - w, y + 0.025, z + d],
          [x - w, y + 0.025, z - d],
        ]}
        color="#8b8b8b"
      />
      <StageLine
        points={[
          [x, y + 0.03, z - d],
          [x, y + 0.03, z + d],
        ]}
        color="#777777"
      />
      {venueAudiencePositions(venue).map((audience) => (
        <Html
          key={audience.id}
          position={audience.position}
          center
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: '#555',
            background: '#eee',
            padding: '2px 6px',
          }}
        >
          {audience.label}
        </Html>
      ))}
      {ui.showRoutes &&
        scene.paths
          .filter(
            (p) =>
              stageDocument?.rehearsalSimulation.paths.find((route) => route.id === p.id)
                ?.visible !== false,
          )
          .map((path) => (
            <StageLine
              key={path.id}
              dashed
              points={path.markIds.map((id) => {
                const m = scene.marks.find((m) => m.id === id)!
                return [m.position[0], m.position[1] + 0.06, m.position[2]]
              })}
              color={scene.roles.find((r) => r.id === path.roleId)?.color ?? '#888888'}
            />
          ))}
      {ui.showRoutes &&
        scene.marks.map((mark) => (
          <group key={mark.id} position={mark.position}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
              <ringGeometry args={[0.11, 0.14, 20]} />
              <meshBasicMaterial color="#888888" />
            </mesh>
            <Html
              center
              position={[0, 0.08, -0.22]}
              style={{
                pointerEvents: 'none',
                fontSize: 11,
                whiteSpace: 'nowrap',
                color: '#333',
                background: '#eeeeeed9',
                padding: '1px 3px',
              }}
            >
              {mark.label}
            </Html>
          </group>
        ))}
      {sample.roles.map((pose) => {
        const role = scene.roles.find((r) => r.id === pose.roleId)!
        return (
          <group
            key={role.id}
            position={ui.drag?.id === role.id ? ui.drag.position : pose.position}
            rotation={[0, pose.facing, 0]}
            onPointerDown={(e) => {
              if (activePanel !== 'simulation' || ui.input !== 'select' || readOnly) return
              e.stopPropagation()
              const controls = three.controls as CameraControlsImpl | undefined
              const previous = controls?.enabled
              if (controls) controls.enabled = false
              const ray = new Raycaster(),
                plane = new Plane(new Vector3(0, 1, 0), -pose.position[1])
              drag(
                e.nativeEvent,
                role.id,
                (clientX, clientY) => {
                  const rect = three.gl.domElement.getBoundingClientRect()
                  ray.setFromCamera(
                    new Vector2(
                      ((clientX - rect.left) / rect.width) * 2 - 1,
                      1 - ((clientY - rect.top) / rect.height) * 2,
                    ),
                    three.camera,
                  )
                  return ray.ray.intersectPlane(plane, new Vector3())?.toArray() ?? null
                },
                () => {
                  if (controls && previous !== undefined) controls.enabled = previous
                },
              )
            }}
            onClick={(e) => {
              if (activePanel === 'simulation' && ui.input === 'select') {
                e.stopPropagation()
                useSimulationSelection.setState({ selectedId: role.id })
              }
            }}
          >
            <mesh position={[0, role.height * 0.42, 0]}>
              <cylinderGeometry args={[0.17, 0.23, role.height * 0.7, 12]} />
              <meshStandardMaterial color={role.color} roughness={0.9} />
            </mesh>
            <mesh position={[0, role.height * 0.88, 0]}>
              <sphereGeometry args={[role.height * 0.11, 12, 8]} />
              <meshStandardMaterial color={role.color} roughness={0.9} />
            </mesh>
            <StageLine
              points={[
                [0, 0.07, 0.2],
                [0, 0.07, 0.55],
                [-0.08, 0.07, 0.43],
                [0, 0.07, 0.55],
                [0.08, 0.07, 0.43],
              ]}
              color={role.color}
            />
            <Html
              center
              position={[0, role.height + 0.22, 0]}
              style={{
                pointerEvents: 'none',
                background: '#181818',
                color: '#fff',
                padding: '3px 7px',
                fontSize: 12,
                whiteSpace: 'nowrap',
                borderRadius: 3,
              }}
            >
              {role.name}
            </Html>
          </group>
        )
      })}
    </group>
  )
}

export function TheatreFloorplan({ enabled }: { enabled: boolean }) {
  const context = useFloorplanRender()
  const { document } = useTheatreDocument()
  const nodes = useScene((s) => s.nodes)
  const levelId = useViewer((s) => s.selection.levelId)
  const time = useRehearsalPlayback((s) => s.time)
  const exclusive = useEditor(
    (s) =>
      s.isFirstPersonMode ||
      s.isCaptureMode ||
      s.isPreviewMode ||
      s.workspaceMode === 'studio' ||
      ['camera-studio', 'camera-rehearsal'].includes(s.activeSidebarPanel),
  )
  const ui = useSimulationSelection()
  const groupRef = useRef<SVGGElement>(null)
  const activePanel = useEditor((s) => s.activeSidebarPanel)
  const viewMode = useEditor((s) => s.viewMode)
  const ghostId = useProposalGhost((s) => s.proposalId)
  const drag = useSimulationDrag(
    enabled &&
      viewMode !== '3d' &&
      !!context &&
      !exclusive &&
      activePanel === 'simulation' &&
      ui.input === 'select',
  )
  const { document: stageDocument } = useStageDocument()
  const frame = useMemo(() => cameraFloorplanMatrix(nodes, levelId), [nodes, levelId])
  const scene = document ? activeRehearsalScene(document) : null
  if (!enabled || exclusive || !context || !frame || !scene || !document) return null
  const unit = context.unitsPerPixel,
    sample = sampleRehearsal(scene, time)
  const plan = (point: [number, number, number]) => cameraPlanPoint(point, frame)
  const v = document.venue
  const boundary: Vec3[] = [
    [v.origin[0] - v.width / 2, v.origin[1], v.origin[2] - v.depth / 2],
    [v.origin[0] + v.width / 2, v.origin[1], v.origin[2] - v.depth / 2],
    [v.origin[0] + v.width / 2, v.origin[1], v.origin[2] + v.depth / 2],
    [v.origin[0] - v.width / 2, v.origin[1], v.origin[2] + v.depth / 2],
  ]
  const rear = plan([v.origin[0], v.origin[1], v.origin[2] - v.depth / 2]),
    front = plan([v.origin[0], v.origin[1], v.origin[2] + v.depth / 2])
  return (
    <g ref={groupRef} pointerEvents="none" aria-label="模拟排演舞台图">
      <ViewerErrorBoundary
        fallback={null}
        scope="proposal-ghost-plan"
        resetKey={ghostId}
        onError={disableFailedProposalPreview}
      >
        <ProposalGhost2D plan={plan} unit={unit} />
      </ViewerErrorBoundary>
      <polygon
        points={boundary
          .map((point) => {
            const p = plan(point)
            return `${p[0]},${p[2]}`
          })
          .join(' ')}
        fill={activePanel === 'simulation' && ui.input !== 'select' ? 'transparent' : 'none'}
        pointerEvents={activePanel === 'simulation' && ui.input !== 'select' ? 'all' : 'none'}
        onClick={(e) => {
          if (!groupRef.current) return
          const point = cameraPointerToPlan(groupRef.current, e.clientX, e.clientY)
          if (!point) return
          e.stopPropagation()
          const world = new Vector3(point[0], 0, point[1]).applyMatrix4(frame)
          placeSimulationPoint([world.x, v.origin[1], world.z])
        }}
        stroke="#888"
        strokeWidth={unit}
      />
      <line
        x1={rear[0]}
        x2={front[0]}
        y1={rear[2]}
        y2={front[2]}
        stroke="#888"
        strokeWidth={unit}
        strokeDasharray={`${5 * unit} ${5 * unit}`}
      />
      {venueAudiencePositions(v).map((audience) => {
        const label = plan(audience.position)
        return (
          <text
            key={audience.id}
            x={label[0]}
            y={label[2]}
            textAnchor="middle"
            fontSize={12 * unit}
            fill={context.palette.measurementLabelText}
          >
            {audience.label}
          </text>
        )
      })}
      {ui.showRoutes &&
        scene.paths
          .filter(
            (p) =>
              stageDocument?.rehearsalSimulation.paths.find((route) => route.id === p.id)
                ?.visible !== false,
          )
          .map((path) => (
            <polyline
              key={path.id}
              points={path.markIds
                .map((id) => {
                  const p = plan(scene.marks.find((m) => m.id === id)!.position)
                  return `${p[0]},${p[2]}`
                })
                .join(' ')}
              fill="none"
              stroke={scene.roles.find((r) => r.id === path.roleId)?.color}
              strokeWidth={2 * unit}
              strokeDasharray={`${6 * unit} ${4 * unit}`}
            />
          ))}
      {ui.showRoutes &&
        scene.marks.map((mark) => {
          const p = plan(mark.position)
          return (
            <g key={mark.id} transform={`translate(${p[0]} ${p[2]})`}>
              <circle r={4 * unit} fill="none" stroke="#888" strokeWidth={unit} />
              <text
                y={-8 * unit}
                fontSize={10 * unit}
                fill={context.palette.measurementLabelText}
                textAnchor="middle"
              >
                {mark.label}
              </text>
            </g>
          )
        })}
      {sample.roles.map((pose) => {
        const role = scene.roles.find((r) => r.id === pose.roleId)!,
          p = plan(ui.drag?.id === role.id ? ui.drag.position : pose.position),
          end = plan([
            pose.position[0] + Math.sin(pose.facing) * 22 * unit,
            pose.position[1],
            pose.position[2] + Math.cos(pose.facing) * 22 * unit,
          ])
        return (
          <g
            key={role.id}
            transform={`translate(${p[0]} ${p[2]})`}
            pointerEvents={activePanel === 'simulation' && ui.input === 'select' ? 'all' : 'none'}
            style={{ touchAction: 'none', cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              drag(e.nativeEvent, role.id, (clientX, clientY) => {
                if (!groupRef.current) return null
                const point = cameraPointerToPlan(groupRef.current, clientX, clientY)
                if (!point) return null
                return new Vector3(point[0], 0, point[1]).applyMatrix4(frame).toArray()
              })
            }}
            onClick={(e) => {
              e.stopPropagation()
              useSimulationSelection.setState({ selectedId: role.id })
            }}
          >
            <circle r={22 * unit} fill="transparent" />
            <circle r={10 * unit} fill={role.color} stroke="#222" strokeWidth={unit} />
            <path
              d={`M 0 0 L ${end[0] - p[0]} ${end[2] - p[2]}`}
              stroke="#222"
              strokeWidth={2 * unit}
            />
            <text
              y={-16 * unit}
              textAnchor="middle"
              fontSize={12 * unit}
              fill={context.palette.measurementLabelText}
            >
              {role.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function useGhostSample() {
  const simulation = useProposalGhost((s) => s.simulation)
  const visible = useProposalGhost((s) => s.visible)
  const time = useProposalGhost((s) => s.time)
  const { document } = useStageDocument()
  const scene = useMemo(
    () =>
      document && simulation
        ? activeRehearsalScene(
            runtimeTheatreDocument({ ...document, rehearsalSimulation: simulation }),
          )
        : null,
    [document, simulation],
  )
  return { scene, sample: scene && visible ? sampleRehearsal(scene, time) : null }
}

function ProposalGhost3D() {
  const { scene, sample } = useGhostSample()
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => useProposalGhost.subscribe(() => invalidate()), [invalidate])
  if (!scene || !sample) return null
  return (
    <group name="AI proposal ghost" raycast={() => null}>
      {scene.paths.map((path) => (
        <StageLine
          key={path.id}
          overlay
          dashed
          color="#333333"
          points={path.markIds.map((id) => {
            const point = scene.marks.find((m) => m.id === id)!.position
            return [point[0], point[1] + 0.15, point[2]]
          })}
        />
      ))}
      {sample.roles.map((pose, index) => (
        <group key={pose.roleId} position={pose.position} rotation={[0, pose.facing, 0]}>
          <mesh layers={OVERLAY_LAYER} position={[0, 0.75, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.18, 0.25, 1.3, 10]} />
            <meshBasicMaterial color="#222222" transparent opacity={0.4} depthWrite={false} />
          </mesh>
          <mesh layers={OVERLAY_LAYER} position={[0, 1.55, 0]} raycast={() => null}>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshBasicMaterial color="#222222" transparent opacity={0.4} depthWrite={false} />
          </mesh>
          <Html
            center
            position={[0, 2, 0]}
            style={{
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              color: '#fff',
              background: '#222',
              padding: '2px 6px',
              fontSize: 12,
              border: '1px solid #fff',
              marginTop: index % 2 ? -68 : -42,
            }}
          >
            <span
              role="img"
              aria-label={`建议：${scene.roles.find((r) => r.id === pose.roleId)?.name}`}
            >
              {index + 1}
            </span>
          </Html>
        </group>
      ))}
    </group>
  )
}

function ProposalGhost2D({ plan, unit }: { plan: (point: Vec3) => Vec3; unit: number }) {
  const { scene, sample } = useGhostSample()
  if (!scene || !sample) return null
  return (
    <g aria-label="AI 建议预览" pointerEvents="none" opacity={0.7}>
      {scene.paths.map((path) => (
        <polyline
          key={path.id}
          points={path.markIds
            .map((id) => {
              const p = plan(scene.marks.find((m) => m.id === id)!.position)
              return `${p[0]},${p[2]}`
            })
            .join(' ')}
          stroke="#333"
          fill="none"
          strokeWidth={2 * unit}
          strokeDasharray={`${8 * unit} ${5 * unit}`}
        />
      ))}
      {sample.roles.map((pose, index) => {
        const p = plan(pose.position)
        return (
          <g key={pose.roleId} transform={`translate(${p[0]} ${p[2]})`}>
            <circle
              r={14 * unit}
              fill="#eee"
              stroke="#222"
              strokeWidth={2 * unit}
              strokeDasharray={`${3 * unit} ${3 * unit}`}
            />
            <text y={4 * unit} textAnchor="middle" fill="#222" fontSize={12 * unit}>
              <title>建议：{scene.roles.find((r) => r.id === pose.roleId)?.name}</title>
              {index + 1}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function RehearsalTransport({ enabled, sceneId }: { enabled: boolean; sceneId: string }) {
  const { document } = useTheatreDocument()
  const time = useRehearsalPlayback((s) => s.time)
  const playing = useRehearsalPlayback((s) => s.playing)
  const loop = useRehearsalPlayback((s) => s.loop)
  const error = useRehearsalPlayback((s) => s.error)
  const editorExclusive = useEditor(
    (s) =>
      s.isFirstPersonMode ||
      s.isCaptureMode ||
      s.isPreviewMode ||
      s.workspaceMode === 'studio' ||
      ['camera-studio', 'camera-rehearsal'].includes(s.activeSidebarPanel),
  )
  const cameraBusy = useCameraStudio((s) => s.playing || s.previewing || s.recording)
  const director = useCameraDirectorState(sceneId)
  const exclusive = editorExclusive || cameraBusy || director.transport.status !== 'idle'
  const scene = document ? activeRehearsalScene(document) : null
  const rehearsalSceneId = scene?.id
  const duration = scene?.duration
  useLayoutEffect(() => {
    useRehearsalPlayback.getState().configure(sceneId, enabled && !exclusive && !!rehearsalSceneId)
    return () => useRehearsalPlayback.getState().stop()
  }, [sceneId, rehearsalSceneId, enabled, exclusive])
  useLayoutEffect(() => subscribeRehearsalProtection(sceneId, () => {}), [sceneId])
  useEffect(() => {
    if (!playing || !enabled || exclusive || duration === undefined) return
    let frame = 0,
      previous = performance.now()
    const tick = (now: number) => {
      const state = useRehearsalPlayback.getState()
      if (!state.playing) return
      const next = Math.min(duration, state.time + Math.min(0.1, (now - previous) / 1000))
      previous = now
      state.seek(next === duration && state.loop ? 0 : next)
      if (next === duration && !state.loop) state.pause()
      if (useRehearsalPlayback.getState().playing) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, enabled, exclusive, duration])
  if (!enabled || exclusive || !scene) return null
  return (
    <div className="th-transport" role="group" aria-label="人物排演播放">
      <button
        type="button"
        onClick={() => {
          const s = useRehearsalPlayback.getState()
          if (playing) s.pause()
          else {
            if (time >= scene.duration) s.seek(0)
            s.play()
          }
        }}
      >
        {playing ? '暂停排演' : '播放排演'}
      </button>
      <button type="button" onClick={() => useRehearsalPlayback.getState().stop()}>
        复位
      </button>
      <input
        aria-label="排演时间"
        type="range"
        min={0}
        max={scene.duration}
        step={0.05}
        value={time}
        onChange={(event) => {
          useRehearsalPlayback.getState().pause()
          useRehearsalPlayback.getState().seek(Number(event.target.value))
        }}
      />
      <output>
        {time.toFixed(1)} / {scene.duration} 秒
      </output>
      <span>{scene.name}</span>
      {error && <span role="alert">{error}</span>}
      <label>
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => useRehearsalPlayback.setState({ loop: e.target.checked })}
        />
        循环
      </label>
    </div>
  )
}
