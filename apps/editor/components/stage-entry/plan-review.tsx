'use client'

import { getNodeLock, useScene } from '@pascal-app/core'
import {
  type SceneContextObject,
  type SceneContextSummary,
  type StageItemProposal,
  type StagePlan,
  stageLayoutObjects,
  stagePositionLabel,
  type VenueProposal,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { stageContactIds } from '@/lib/stage/contacts'
import { stageKindLabels } from '@/lib/stage/labels'
import { stageVisibleFootprints } from '@/lib/stage/model-contact'
import { useStagePlanPreview, withoutPlanTransforms } from '@/lib/stage/plan-preview'
import { DIA_COLORS } from '@/lib/visual-system'
import { useStagePlacement } from './manual-stage-panel'
import { StagePlanFoldHandles } from './stage-plan-fold-handles'
import './stage-entry.css'

export { useStagePlanPreview } from '@/lib/stage/plan-preview'
export const EMPTY_STAGE_CONTEXT: SceneContextSummary = {
  documentVersion: 0,
  venue: null,
  objects: [],
  selectedObjectIds: [],
}

export function existingProposal(object: SceneContextObject, depthShift = 0): StageItemProposal {
  return {
    proposalId: object.id,
    existingNodeId: object.id,
    kind: object.kind,
    displayName: object.name,
    libraryAssetId: null,
    dimensionsMeters: object.dimensionsMeters,
    collisionGeometry: object.collisionGeometry,
    stepCount: object.stepCount,
    transform: {
      ...object.transform,
      position: { ...object.transform.position, z: object.transform.position.z + depthShift },
    },
    certainty: 'stated',
    assumptionIds: [],
    evidenceIds: [],
  }
}

export function PlanDrawing({
  plan: sourcePlan,
  context,
  onMove,
  onCancel,
  disabled = false,
  live = false,
}: {
  plan: StagePlan
  context: SceneContextSummary
  onMove?: (id: string, x: number, z: number, commit: boolean) => void
  onCancel?: () => void
  disabled?: boolean
  live?: boolean
}) {
  const placement = useStagePlacement((state) => state.draft?.item)
  const gridStep = useEditor((state) => state.gridSnapStep)
  const showGrid = useViewer((state) => state.showGrid)
  const gridId = useId()
  const nodes = useScene((state) => state.nodes)
  const geometryRevision = useViewer((state) => state.geometryRevision)
  const plan = useMemo(() => {
    if (!placement) return sourcePlan
    const original = sourcePlan.items.find((item) =>
      placement.existingNodeId
        ? item.existingNodeId === placement.existingNodeId
        : item.proposalId === placement.proposalId,
    )
    const depthShift =
      sourcePlan.venue && context.venue
        ? (sourcePlan.venue.depthMeters - context.venue.depthMeters) / 2
        : 0
    return validateStagePlan(
      {
        ...sourcePlan,
        warnings: sourcePlan.warnings.filter(
          (warning) => !['collision', 'clearance', 'out-of-bounds'].includes(warning.code),
        ),
        relations: sourcePlan.relations.filter(
          (relation) =>
            relation.subjectId !==
            (original?.proposalId ?? placement.existingNodeId ?? placement.proposalId),
        ),
        items: [
          ...sourcePlan.items.filter((item) => item !== original),
          {
            ...placement,
            proposalId: original?.proposalId ?? placement.existingNodeId ?? placement.proposalId,
            transform: {
              ...placement.transform,
              position: {
                ...placement.transform.position,
                z: placement.transform.position.z + depthShift,
              },
            },
          },
        ],
      },
      context,
    ).plan
  }, [sourcePlan, placement, context])
  const drag = useRef<{ id: string; pointer: number; x: number; z: number; moved: boolean } | null>(
    null,
  )
  const pendingMove = useRef<{ id: string; x: number; z: number } | null>(null)
  const moveFrame = useRef(0)
  const moveCallback = useRef(onMove)
  moveCallback.current = onMove
  const clearMove = () => {
    cancelAnimationFrame(moveFrame.current)
    moveFrame.current = 0
    pendingMove.current = null
  }
  useEffect(() => () => cancelAnimationFrame(moveFrame.current), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Loaded model meshes change without changing the proposal.
  const contacts = useMemo(
    () => stageContactIds(stageLayoutObjects(context, plan)),
    [context, plan, geometryRevision],
  )
  const venue = plan.venue ?? context.venue
  if (!venue) return <p className="stage-preview-empty">填写舞台宽深后，即可查看台位预览。</p>
  const w = venue.widthMeters,
    d = venue.depthMeters
  const contextDepthShift = plan.venue && context.venue ? (d - context.venue.depthMeters) / 2 : 0
  const unit = Math.max(w, d) / 28,
    horizontalMargin = unit * 0.4,
    verticalMargin = unit * 1.8
  const changed = new Set(
    plan.items.flatMap((item) => (item.existingNodeId ? [item.existingNodeId] : [])),
  )
  const position = (svg: SVGSVGElement, event: PointerEvent) => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    )
    return { x: -point.x, z: d - point.y }
  }
  const cancel = () => {
    clearMove()
    drag.current = null
    onCancel?.()
  }
  return (
    <figure className="stage-plan-drawing">
      <svg
        viewBox={[
          -w / 2 - horizontalMargin,
          -verticalMargin,
          w + horizontalMargin * 2,
          d + verticalMargin * 2,
        ].join(' ')}
        role="group"
        aria-label="方案俯视预览，台口在下方，台右在画面左侧"
        onPointerMove={(event) => {
          const active = drag.current
          if (!active || active.pointer !== event.pointerId || disabled) return
          const p = position(event.currentTarget, event)
          active.moved = true
          pendingMove.current = { id: active.id, x: p.x + active.x, z: p.z + active.z }
          if (!moveFrame.current)
            moveFrame.current = requestAnimationFrame(() => {
              moveFrame.current = 0
              const next = pendingMove.current
              pendingMove.current = null
              if (next) moveCallback.current?.(next.id, next.x, next.z, false)
            })
        }}
        onPointerUp={(event) => {
          const active = drag.current
          if (!active || active.pointer !== event.pointerId) return
          clearMove()
          drag.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
          if (active.moved && !disabled) {
            const p = position(event.currentTarget, event)
            onMove?.(active.id, p.x + active.x, p.z + active.z, true)
          } else onCancel?.()
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          if (drag.current) cancel()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && drag.current) {
            event.preventDefault()
            event.stopPropagation()
            cancel()
          }
        }}
      >
        <rect
          x={-w / 2}
          y={0}
          width={w}
          height={d}
          fill={DIA_COLORS.ivory}
          stroke={DIA_COLORS.ink}
          strokeWidth={unit / 15}
        />
        <path
          d={`M0 0V${d}`}
          stroke={DIA_COLORS.ink}
          strokeOpacity={0.25}
          strokeWidth={unit / 20}
          strokeDasharray={`${unit / 3} ${unit / 3}`}
        />
        {showGrid && (
          <>
            <defs>
              <pattern
                id={gridId}
                patternUnits="userSpaceOnUse"
                width={gridStep}
                height={gridStep}
                y={d}
              >
                <path
                  d={`M ${gridStep} 0 H 0 V ${gridStep}`}
                  fill="none"
                  stroke={DIA_COLORS.ink}
                  strokeOpacity={0.18}
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              </pattern>
            </defs>
            <rect
              data-stage-grid-step={gridStep}
              x={-w / 2}
              y={0}
              width={w}
              height={d}
              fill={`url(#${gridId})`}
              pointerEvents="none"
            />
          </>
        )}
        {[
          ...context.objects
            .filter((item) => !changed.has(item.id))
            .map((item) => existingProposal(item, contextDepthShift)),
          ...plan.items,
        ].map((item) => {
          const itemDisabled =
            disabled || !!(item.existingNodeId && getNodeLock(nodes, item.existingNodeId, true))
          const unchanged =
            live || !plan.items.some((entry) => entry.proposalId === item.proposalId)
          const p = item.transform.position,
            size = item.dimensionsMeters,
            invalid =
              contacts.has(item.existingNodeId ?? item.proposalId) ||
              plan.warnings.some(
                (warning) => warning.blocking && warning.itemIds.includes(item.proposalId),
              )
          const outlines = stageVisibleFootprints({
            ...item,
            id: item.existingNodeId ?? item.proposalId,
          }).map((part) => part.map(([x, z]) => [p.x - x, p.z - z]))
          const appearance = {
            fill: invalid ? DIA_COLORS.error : unchanged ? DIA_COLORS.ink : DIA_COLORS.blue,
            fillOpacity: 0.35,
            stroke: invalid ? DIA_COLORS.error : unchanged ? DIA_COLORS.ink : DIA_COLORS.blue,
            strokeWidth: unit / 12,
            strokeDasharray: unchanged ? undefined : `${unit / 4} ${unit / 5}`,
          }
          return (
            <g
              key={item.proposalId}
              transform={`translate(${-p.x},${d - p.z})`}
              role="button"
              tabIndex={itemDisabled || !onMove ? -1 : 0}
              aria-label={`${item.displayName}，${invalid ? '接触或重叠' : '无碰撞'}；拖动或方向键调整`}
              aria-disabled={itemDisabled || !onMove}
              data-proposal-id={item.proposalId}
              data-existing={!!item.existingNodeId}
              data-invalid={invalid}
              className="stage-plan-handle"
              onFocus={() =>
                useStagePlanPreview.setState({
                  inspectedId: item.existingNodeId ?? item.proposalId,
                })
              }
              onPointerDown={(event) => {
                if (itemDisabled || !onMove || event.button !== 0 || drag.current) return
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.focus()
                const svg = event.currentTarget.ownerSVGElement!
                const cursor = position(svg, event)
                drag.current = {
                  id: item.proposalId,
                  pointer: event.pointerId,
                  x: p.x - cursor.x,
                  z: p.z - cursor.z,
                  moved: false,
                }
                svg.setPointerCapture(event.pointerId)
              }}
              onKeyDown={(event) => {
                if (
                  itemDisabled ||
                  !onMove ||
                  drag.current ||
                  !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
                )
                  return
                event.preventDefault()
                event.stopPropagation()
                const step = gridStep * (event.shiftKey ? 5 : 1)
                onMove(
                  item.proposalId,
                  p.x + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
                  p.z + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
                  true,
                )
              }}
            >
              <rect
                transform={`rotate(${item.transform.rotationDegrees.y})`}
                x={-size.width / 2}
                y={-size.depth / 2}
                width={size.width}
                height={size.depth}
                fill="transparent"
              />
              {outlines.map((outline, index) => (
                <polygon key={index} points={outline.join(' ')} {...appearance} />
              ))}
              <text
                textAnchor="middle"
                y={
                  Math.min(...outlines.flatMap((outline) => outline.map((point) => point[1]!))) -
                  unit / 3
                }
                fontSize={unit * 0.7}
                fill={DIA_COLORS.ink}
              >
                {item.displayName}
              </text>
            </g>
          )
        })}
        <text
          x={0}
          y={d + unit * 1.5}
          textAnchor="middle"
          fontSize={unit * 0.8}
          fill="currentColor"
        >
          台口 · 观众方向
        </text>
        <text x={-w / 2} y={-unit} textAnchor="start" fontSize={unit * 0.7} fill="currentColor">
          台右
        </text>
        <text x={w / 2} y={-unit} textAnchor="end" fontSize={unit * 0.7} fill="currentColor">
          台左
        </text>
        <StagePlanFoldHandles depthMeters={d} />
      </svg>
      <figcaption>
        {live
          ? '拖动布景，松开落位；红色表示接触或重叠，Esc 取消。'
          : '拖动布景调整提案；红色表示接触或重叠，采用后才落位。'}
      </figcaption>
    </figure>
  )
}

function Metric({
  label,
  value,
  update,
  min = 0.01,
}: {
  label: string
  value: number
  update: (value: number) => void
  min?: number
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={min}
        max={1000}
        value={Number(value.toFixed(3))}
        onChange={(event) => {
          if (event.target.value !== '' && event.currentTarget.validity.valid)
            update(Number(event.target.value))
        }}
      />
    </label>
  )
}

export function StagePlanReview({
  plan,
  context,
  onChange,
  onConfirm,
  onBack,
  onAnswer,
  busy,
  error,
  onPreview,
  compact = false,
  drawingContainer,
}: {
  plan: StagePlan
  context: SceneContextSummary
  onChange: (plan: StagePlan) => void
  onConfirm: (plan: StagePlan) => void | Promise<void>
  onBack: () => void
  onAnswer?: (questionId: string, answer: string) => void
  busy: boolean
  error?: string
  onPreview?: (plan: StagePlan) => void | Promise<void>
  compact?: boolean
  drawingContainer?: HTMLElement | null
}) {
  const [excluded, setExcluded] = useState<string[]>([])
  const [dragPlan, setDragPlan] = useState<StagePlan | null>(null)
  const ownedDraft = useRef<StagePlan | null>(null)
  const ownedPlan = useRef<StagePlan | null>(null)
  useEffect(() => () => useStagePlanPreview.setState({ inspectedId: null }), [])
  const included = useMemo(
    () => ({
      ...(dragPlan ?? plan),
      items: (dragPlan ?? plan).items.filter((item) => !excluded.includes(item.proposalId)),
      relations: (dragPlan ?? plan).relations.filter(
        (relation) =>
          !excluded.includes(relation.subjectId) &&
          (!relation.referenceId || !excluded.includes(relation.referenceId)),
      ),
    }),
    [plan, dragPlan, excluded],
  )
  const result = useMemo(() => validateStagePlan(included, context), [included, context])
  const previewed = useStagePlanPreview((state) => state.plan)
  const previewMatches = !onPreview || JSON.stringify(previewed) === JSON.stringify(result.plan)
  useLayoutEffect(() => {
    if (!busy && context.documentVersion > 0) {
      ownedDraft.current = result.plan
      useStagePlanPreview.setState({ draft: result.plan })
    } else if (useStagePlanPreview.getState().draft === ownedDraft.current) {
      ownedDraft.current = null
      useStagePlanPreview.setState({ draft: null })
    }
  }, [result.plan, context.documentVersion, busy])
  useLayoutEffect(() => {
    if (!onPreview && context.documentVersion > 0) {
      ownedPlan.current = result.plan
      useStagePlanPreview.setState({ plan: result.plan })
    } else if (useStagePlanPreview.getState().plan === ownedPlan.current) {
      ownedPlan.current = null
      useStagePlanPreview.setState({ plan: null })
    }
  }, [result.plan, context.documentVersion, onPreview])
  useEffect(
    () => () => {
      const current = useStagePlanPreview.getState()
      useStagePlanPreview.setState({
        ...(current.draft === ownedDraft.current ? { draft: null } : {}),
        ...(current.plan === ownedPlan.current ? { plan: null } : {}),
      })
    },
    [],
  )
  const clearSpatialWarnings = (next: StagePlan): StagePlan => ({
    ...next,
    warnings: next.warnings.filter(
      (warning) =>
        !['collision', 'clearance', 'out-of-bounds', 'missing-venue'].includes(warning.code),
    ),
  })
  const updateItem = (id: string, change: Partial<StageItemProposal>, position = false) =>
    update({
      ...plan,
      items: plan.items.map((item) => (item.proposalId === id ? { ...item, ...change } : item)),
      relations: position
        ? plan.relations.filter((relation) => relation.subjectId !== id)
        : plan.relations,
    })
  const update = (next: StagePlan) => onChange(clearSpatialWarnings(next))
  const moveItem = (id: string, x: number, z: number, commit: boolean) => {
    const existing = context.objects.find((item) => item.id === id)
    const original =
      result.plan.items.find((item) => item.proposalId === id) ??
      (existing && existingProposal(existing))
    if (!original) return
    const moved = {
      ...original,
      transform: { ...original.transform, position: { ...original.transform.position, x, z } },
    }
    const next = {
      ...plan,
      items: plan.items.some((item) => item.proposalId === id)
        ? plan.items.map((item) => (item.proposalId === id ? moved : item))
        : [...plan.items, moved],
      relations: plan.relations.filter((relation) => relation.subjectId !== id),
    }
    if (commit) {
      update(next)
      setDragPlan(null)
    } else setDragPlan(clearSpatialWarnings(next))
  }
  const venue = plan.venue ?? context.venue
  const setVenue = (change: Partial<VenueProposal>) =>
    update({
      ...plan,
      venue: {
        type: 'proscenium',
        widthMeters: 8,
        depthMeters: 6,
        heightMeters: null,
        ...venue,
        ...change,
      },
      questions: plan.questions.filter(
        (question) => !/width|depth|venue|舞台尺寸/.test(question.id),
      ),
    })
  const groups =
    plan.source === 'script'
      ? [
          {
            label: '剧本明确写出',
            items: plan.items.filter((item) => item.certainty === 'stated'),
          },
          { label: '系统推测', items: plan.items.filter((item) => item.certainty === 'inferred') },
        ]
      : [{ label: '准备放入的布景', items: plan.items }]
  const drawing = (
    <>
      <h2>{compact ? 'Dia预演：' : '先看台位，再确认搭台'}</h2>
      <PlanDrawing
        plan={result.plan}
        context={context}
        onMove={moveItem}
        onCancel={() => setDragPlan(null)}
        disabled={busy}
      />
    </>
  )
  const visibleWarnings = result.warnings.filter(
    (warning) => !compact || warning.code !== 'collision',
  )
  return (
    <section
      className={`stage-plan-review${compact ? ' stage-plan-compact' : ''}`}
      aria-label="舞台方案审阅"
    >
      {drawingContainer ? createPortal(drawing, drawingContainer) : drawing}
      {(!compact || visibleWarnings.length > 0) && (
        <div role="status" className="stage-plan-status" aria-live="polite">
          {visibleWarnings.length > 0 ? (
            visibleWarnings.map((warning, i) => (
              <p key={`${warning.code}:${i}`}>{warning.message}</p>
            ))
          ) : (
            <p>当前没有接触或重叠。</p>
          )}
        </div>
      )}
      {!compact && (
        <fieldset className="stage-plan-venue" disabled={busy}>
          <legend>准备建立的舞台</legend>
          <label>
            舞台类型
            <select
              value={venue?.type ?? 'proscenium'}
              onChange={(event) => setVenue({ type: event.target.value as VenueProposal['type'] })}
            >
              <option value="proscenium">镜框式</option>
              <option value="black-box">黑匣子</option>
              <option value="thrust">伸出式</option>
              <option value="classroom">教室</option>
              <option value="other">其他</option>
            </select>
          </label>
          <div className="stage-entry-metrics">
            <Metric
              label="宽 / 米"
              value={venue?.widthMeters ?? 8}
              update={(widthMeters) => setVenue({ widthMeters })}
            />
            <Metric
              label="深 / 米"
              value={venue?.depthMeters ?? 6}
              update={(depthMeters) => setVenue({ depthMeters })}
            />
            <label>
              高 / 米（选填）
              <input
                aria-label="舞台高度"
                type="number"
                min={1}
                max={1000}
                step=".1"
                placeholder="尚未测量"
                value={venue?.heightMeters ?? ''}
                onChange={(event) => {
                  if (event.currentTarget.validity.valid)
                    setVenue({
                      heightMeters: event.target.value ? Number(event.target.value) : null,
                    })
                }}
              />
            </label>
          </div>
          {!venue && (
            <button type="button" onClick={() => setVenue({})}>
              采用 8 × 6 米舞台
            </button>
          )}
          {venue?.heightMeters === null && <p>高度未测量，暂按 4 米显示；正式复台前需补齐测量。</p>}
        </fieldset>
      )}
      <div className={plan.source === 'script' ? 'stage-script-groups' : 'stage-plan-groups'}>
        {groups.map((group) => (
          <section key={group.label}>
            <h3>{group.label}</h3>
            {!group.items.length && <p>暂无布景。</p>}
            {group.items.map((original) => {
              const item =
                result.plan.items.find(
                  (candidate) => candidate.proposalId === original.proposalId,
                ) ?? original
              return (
                <fieldset className="stage-plan-item" key={item.proposalId} disabled={busy}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!excluded.includes(item.proposalId)}
                      onChange={(event) =>
                        setExcluded((old) =>
                          event.target.checked
                            ? old.filter((id) => id !== item.proposalId)
                            : [...old, item.proposalId],
                        )
                      }
                    />
                    {item.displayName}
                    {item.existingNodeId ? ' · 调整现有布景' : ''}
                  </label>
                  {!compact && (
                    <>
                      <small>类型：{stageKindLabels[item.kind]}</small>
                      <p>
                        {stagePositionLabel(item.transform.position, venue?.depthMeters ?? 6)} ·
                        距中心线 {Math.abs(item.transform.position.x).toFixed(2)} 米 · 距台口{' '}
                        {item.transform.position.z.toFixed(2)} 米
                      </p>
                      <div className="stage-entry-metrics">
                        {(['width', 'depth', 'height'] as const).map((key, i) => (
                          <Metric
                            key={key}
                            label={['宽 / 米', '深 / 米', '高 / 米'][i]!}
                            value={item.dimensionsMeters[key]}
                            update={(value) =>
                              updateItem(item.proposalId, {
                                dimensionsMeters: { ...item.dimensionsMeters, [key]: value },
                              })
                            }
                          />
                        ))}
                      </div>
                      <details>
                        <summary>调整台位与角度</summary>
                        <div className="stage-entry-metrics">
                          {(['x', 'y', 'z'] as const).map((axis, i) => (
                            <Metric
                              key={axis}
                              label={['台右位置 / 米', '高度 / 米', '距台口 / 米'][i]!}
                              min={axis === 'y' ? 0 : -1000}
                              value={item.transform.position[axis]}
                              update={(value) =>
                                updateItem(
                                  item.proposalId,
                                  {
                                    transform: {
                                      ...item.transform,
                                      position: { ...item.transform.position, [axis]: value },
                                    },
                                  },
                                  true,
                                )
                              }
                            />
                          ))}
                          <Metric
                            label="角度 / 度"
                            min={-360}
                            value={item.transform.rotationDegrees.y}
                            update={(value) =>
                              updateItem(item.proposalId, {
                                transform: {
                                  ...item.transform,
                                  rotationDegrees: { ...item.transform.rotationDegrees, y: value },
                                },
                              })
                            }
                          />
                        </div>
                      </details>
                      {!!item.evidenceIds.length && (
                        <details>
                          <summary>提案依据</summary>
                          {item.evidenceIds.map((id) => {
                            const evidence = plan.evidence.find((e) => e.id === id)
                            return evidence ? (
                              <blockquote key={id}>
                                <small>
                                  {evidence.page !== null
                                    ? `第 ${evidence.page} 页`
                                    : `第 ${evidence.paragraph} 段`}
                                </small>
                                <p>{evidence.excerpt}</p>
                              </blockquote>
                            ) : null
                          })}
                        </details>
                      )}
                    </>
                  )}
                </fieldset>
              )
            })}
          </section>
        ))}
        {(plan.questions.length > 0 || plan.source === 'script') && (
          <section aria-label="需要确认">
            <h3>需要确认</h3>
            {!plan.questions.length && <p>没有待确认的问题，可以检查台位后搭台。</p>}
            {plan.questions.slice(0, 3).map((question) => (
              <fieldset key={question.id}>
                <legend>{question.message}</legend>
                <div className="stage-entry-actions">
                  {question.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={busy || !onAnswer}
                      onClick={() => onAnswer?.(question.id, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <form
                  className="stage-question-answer"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const answer = String(
                      new FormData(event.currentTarget).get('answer') ?? '',
                    ).trim()
                    if (answer) onAnswer?.(question.id, answer)
                  }}
                >
                  <label>
                    补充说明
                    <input
                      name="answer"
                      maxLength={1000}
                      required
                      disabled={busy || !onAnswer}
                      placeholder="例如：台右，间距 30 厘米"
                    />
                  </label>
                  <button type="submit" disabled={busy || !onAnswer}>
                    提交说明
                  </button>
                </form>
              </fieldset>
            ))}
            {plan.questions.length > 3 && <p>先完成这三项，再继续确认余下信息。</p>}
          </section>
        )}
      </div>
      {plan.assumptions.length > 0 && (
        <details className="stage-plan-assumptions">
          <summary>提案中的假设</summary>
          <ul>
            {plan.assumptions.map((a) => (
              <li key={a.id}>{a.message}</li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="stage-entry-actions">
        {onPreview && (!compact || !previewMatches) && (
          <button
            type="button"
            className="dia-primary"
            disabled={busy || !result.valid}
            onClick={() => void withoutPlanTransforms(() => onPreview(result.plan))}
          >
            在舞台上试试
          </button>
        )}
        {(!compact || previewMatches) && (
          <button
            type="button"
            className="dia-primary"
            disabled={
              busy ||
              !previewMatches ||
              !result.valid ||
              (!result.plan.items.length && !result.plan.venue)
            }
            onClick={() => void withoutPlanTransforms(() => onConfirm(result.plan))}
          >
            {busy
              ? '正在处理…'
              : compact
                ? excluded.length > 0
                  ? '部分采用'
                  : '采用'
                : '确认搭台'}
          </button>
        )}
        {compact && previewMatches && onPreview && (
          <button type="button" disabled={busy} onClick={() => update(result.plan)}>
            修改
          </button>
        )}
        <button type="button" onClick={onBack} disabled={busy}>
          {compact ? '放弃' : '返回修改'}
        </button>
      </div>
    </section>
  )
}
