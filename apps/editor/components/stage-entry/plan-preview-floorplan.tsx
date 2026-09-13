'use client'

import { useScene } from '@pascal-app/core'
import {
  footprintHull,
  stageFootprintGap,
  stageLayoutObjects,
  stageToWorldPosition,
} from '@pascal-app/core/stage'
import {
  formatLinearMeasurement,
  useEditor,
  useFloorplanRender,
  useMovingNode,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useMemo } from 'react'
import { stageContactIds } from '@/lib/stage/contacts'
import { stageFrame } from '@/lib/stage/context'
import { useLiveStageContext } from '@/lib/stage/live-context'
import { stageVisibleFootprints } from '@/lib/stage/model-contact'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import { DIA_COLORS } from '@/lib/visual-system'
import { cameraFloorplanMatrix, cameraPlanPoint } from '../camera-studio/camera-stage-floorplan'
import { useSimulationSelection } from '../theatre/simulation-panel'
import { placementPlan, useStagePlacement } from './manual-stage-panel'
import { NativePlanFoldHandles } from './stage-plan-fold-handles'

export function StagePlanPreviewFloorplan({ enabled }: { enabled: boolean }) {
  const plan = useStagePlanPreview((state) => state.draft ?? state.plan)
  const inspectedId = useStagePlanPreview((state) => state.inspectedId)
  const placement = useStagePlacement((state) => state.draft)
  const movingNode = useMovingNode()
  const context = useFloorplanRender()
  const nodes = useScene((state) => state.nodes)
  const scene = useLiveStageContext()
  const loaded = useScene((state) => state.rootNodeIds.length > 0)
  const levelId = useViewer((state) => state.selection.levelId)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const measurementUnit = useViewer((state) => state.unit)
  const metricNotation = useViewer((state) => state.metricNotation)
  const showMeasurements = useViewer((state) => state.showMeasurements)
  const showGhost = useSimulationSelection((state) => state.showGhost)
  const split = useEditor((state) => state.viewMode === 'split')
  const frame = useMemo(() => cameraFloorplanMatrix(nodes, levelId), [nodes, levelId])
  useEffect(() => {
    useStagePlanPreview.setState({ inspectedId: selectedIds[0] ?? null })
  }, [selectedIds])
  if (!enabled || !loaded || !context || !frame) return null
  if (!scene.venue) return null
  const visiblePlan = showGhost ? plan : null
  const stage = {
    ...stageFrame(),
    ...(visiblePlan?.venue ? { depthMeters: visiblePlan.venue.depthMeters } : {}),
  }
  const project = (x: number, z: number): [number, number] => {
    const p = cameraPlanPoint(stageToWorldPosition({ x, y: 0, z }, stage), frame)
    return [p[0], p[2]]
  }
  const unit = context.unitsPerPixel
  const layoutPlan = placement
    ? {
        ...(visiblePlan ?? placementPlan(placement)),
        items: [
          ...(visiblePlan?.items.filter(
            (item) =>
              !placement.item.existingNodeId ||
              item.existingNodeId !== placement.item.existingNodeId,
          ) ?? []),
          {
            ...placement.item,
            transform: {
              ...placement.item.transform,
              position: {
                ...placement.item.transform.position,
                z:
                  placement.item.transform.position.z +
                  (stage.depthMeters - scene.venue.depthMeters) / 2,
              },
            },
          },
        ],
      }
    : visiblePlan
  const props = stageLayoutObjects(scene, layoutPlan).filter(
    (item) => item.kind !== 'camera' && item.kind !== 'performer-marker',
  )
  const contacts = stageContactIds(props)
  const footprints = props.map(stageVisibleFootprints)
  const focusId =
    placement?.item.existingNodeId ??
    placement?.item.proposalId ??
    movingNode?.id ??
    inspectedId ??
    selectedIds[0]
  const focus = props.find((item) => item.id === focusId)
  type Gap = ReturnType<typeof stageFootprintGap> & {
    left: (typeof props)[number]
    right: (typeof props)[number]
  }
  const pairs: Gap[] = []
  const nearest = new Map<string, Gap>()
  for (let i = 0; split && showMeasurements && i < props.length; i++) {
    const left = props[i]!
    for (let j = i + 1; j < props.length; j++) {
      const right = props[j]!
      if (focus && left.id !== focus.id && right.id !== focus.id) continue
      const gap = footprints[i]!.flatMap((a) =>
        footprints[j]!.map((b) => stageFootprintGap(a, b)),
      ).reduce((nearest, next) => (next.meters < nearest.meters ? next : nearest))
      const pair = { left, right, ...gap }
      pairs.push(pair)
      for (const item of [left, right]) {
        const previous = nearest.get(item.id)
        if (!previous || pair.meters < previous.meters) nearest.set(item.id, pair)
      }
    }
  }
  const gaps = focus ? pairs : [...new Set(nearest.values())]
  const rotate = ([x, y]: [number, number], degrees: number): [number, number] => {
    const angle = (degrees * Math.PI) / 180
    return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]
  }
  const stageCorners = [
    project(-scene.venue.widthMeters / 2, 0),
    project(scene.venue.widthMeters / 2, 0),
    project(-scene.venue.widthMeters / 2, stage.depthMeters),
    project(scene.venue.widthMeters / 2, stage.depthMeters),
  ].map((point) => rotate(point, context.sceneRotationDeg))
  const hint = rotate(
    [
      Math.min(...stageCorners.map((point) => point[0])),
      Math.min(...stageCorners.map((point) => point[1])) - 14 * unit,
    ],
    -context.sceneRotationDeg,
  )
  const labels: [number, number][] = []
  return (
    <g pointerEvents="none" aria-label="搭台方案平面预览">
      {visiblePlan?.venue && (
        <polygon
          points={[
            project(-visiblePlan.venue.widthMeters / 2, 0),
            project(visiblePlan.venue.widthMeters / 2, 0),
            project(visiblePlan.venue.widthMeters / 2, visiblePlan.venue.depthMeters),
            project(-visiblePlan.venue.widthMeters / 2, visiblePlan.venue.depthMeters),
          ].join(' ')}
          fill="none"
          stroke={DIA_COLORS.blue}
          strokeWidth={unit}
        />
      )}
      {[
        ...(visiblePlan?.items ?? []),
        ...props
          .filter(
            (item) =>
              contacts.has(item.id) &&
              !visiblePlan?.items.some(
                (proposal) => (proposal.existingNodeId ?? proposal.proposalId) === item.id,
              ),
          )
          .map((item) => ({ ...item, proposalId: item.id, existingNodeId: item.id })),
      ].map((item) => {
        const outlines = stageVisibleFootprints({
          ...item,
          id: item.existingNodeId ?? item.proposalId,
        })
        const points = footprintHull(outlines.flat())
          .map(([x, z]) => project(x, z))
          .join(' ')
        const invalid =
          contacts.has(item.existingNodeId ?? item.proposalId) ||
          visiblePlan?.warnings.some(
            (warning) => warning.blocking && warning.itemIds.includes(item.proposalId),
          )
        return (
          <g key={item.proposalId}>
            <polygon data-plan-proposal-id={item.proposalId} points={points} fill="none" />
            {outlines.map((part, index) => (
              <polygon
                key={index}
                points={part.map(([x, z]) => project(x, z)).join(' ')}
                fill={invalid ? DIA_COLORS.error : DIA_COLORS.blue}
                fillOpacity={0.18}
                stroke={invalid ? DIA_COLORS.error : DIA_COLORS.blue}
                strokeWidth={2 * unit}
                strokeDasharray={`${5 * unit} ${3 * unit}`}
              />
            ))}
          </g>
        )
      })}
      {split && showMeasurements && props.length > 1 && (
        <text
          data-stage-gap-hint=""
          x={hint[0]}
          y={hint[1]}
          transform={`rotate(${-context.sceneRotationDeg} ${hint[0]} ${hint[1]})`}
          fontSize={11 * unit}
          fill={DIA_COLORS.ink}
          stroke="#f7f7f2"
          strokeWidth={4 * unit}
          paintOrder="stroke"
        >
          {focus ? `${focus.name} · 与其他布景的净距` : '相邻净距 · 点选布景查看全部间距'}
        </text>
      )}
      <g data-stage-gap-scope={focus ? 'focused' : 'adjacent'}>
        {gaps.map((gap) => {
          const { left, right } = gap
          const start = project(...gap.start),
            end = project(...gap.end)
          const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
          const [x, midpointY] = rotate(midpoint, context.sceneRotationDeg)
          let labelY = midpointY
          while (
            labels.some(
              ([lx, ly]) => Math.abs(lx - x) < 48 * unit && Math.abs(ly - labelY) < 15 * unit,
            )
          )
            labelY -= 16 * unit
          labels.push([x, labelY])
          const label = rotate([x, labelY], -context.sceneRotationDeg)
          const color = gap.meters < 1e-6 ? DIA_COLORS.error : DIA_COLORS.ink
          const text = formatLinearMeasurement(gap.meters, measurementUnit, metricNotation)
          return (
            <g
              key={`${left.id}:${right.id}`}
              data-stage-gap={`${left.id}:${right.id}`}
              data-gap-meters={gap.meters}
              aria-label={`${left.name} 与 ${right.name}：间距 ${text}`}
            >
              <line
                x1={start[0]}
                y1={start[1]}
                x2={end[0]}
                y2={end[1]}
                stroke={color}
                strokeWidth={unit}
                strokeDasharray={`${3 * unit} ${2 * unit}`}
                opacity={0.6}
              />
              {[start, end].map(([cx, cy], endpoint) => (
                <circle key={endpoint} cx={cx} cy={cy} r={2 * unit} fill={color} />
              ))}
              {labelY !== midpointY && (
                <line
                  x1={midpoint[0]}
                  y1={midpoint[1]}
                  x2={label[0]}
                  y2={label[1]}
                  stroke={color}
                  strokeWidth={unit / 2}
                />
              )}
              <text
                x={label[0]}
                y={label[1]}
                transform={`rotate(${-context.sceneRotationDeg} ${label[0]} ${label[1]})`}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11 * unit}
                fill={color}
                stroke="#f7f7f2"
                strokeWidth={4 * unit}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {text}
              </text>
            </g>
          )
        })}
      </g>
      <NativePlanFoldHandles frame={frame} unitsPerPixel={unit} />
    </g>
  )
}
