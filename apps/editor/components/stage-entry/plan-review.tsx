'use client'

import {
  type SceneContextSummary,
  type StageItemProposal,
  type StagePlan,
  stagePositionLabel,
  type VenueProposal,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { useEffect, useMemo, useState } from 'react'
import { stageKindLabels } from '@/lib/stage/labels'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import './stage-entry.css'

export { useStagePlanPreview } from '@/lib/stage/plan-preview'
export const EMPTY_STAGE_CONTEXT: SceneContextSummary = {
  documentVersion: 0,
  venue: null,
  objects: [],
  selectedObjectIds: [],
}

export function PlanDrawing({ plan, context }: { plan: StagePlan; context: SceneContextSummary }) {
  const venue = plan.venue ?? context.venue
  if (!venue) return <p className="stage-preview-empty">填写舞台宽深后，即可查看台位预览。</p>
  const w = venue.widthMeters,
    d = venue.depthMeters
  const contextDepthShift = plan.venue && context.venue ? (d - context.venue.depthMeters) / 2 : 0
  const unit = Math.max(w, d) / 28,
    margin = unit * 3
  const changed = new Set(
    plan.items.flatMap((item) => (item.existingNodeId ? [item.existingNodeId] : [])),
  )
  return (
    <figure className="stage-plan-drawing">
      <svg
        viewBox={[-w / 2 - margin, -margin, w + margin * 2, d + margin * 2].join(' ')}
        role="img"
        aria-label="方案俯视预览，台口在下方，台右在画面左侧"
      >
        <rect
          x={-w / 2}
          y={0}
          width={w}
          height={d}
          fill="#f1f1ed"
          stroke="#999"
          strokeWidth={unit / 15}
        />
        <path
          d={`M0 0V${d}`}
          stroke="#aaa"
          strokeWidth={unit / 20}
          strokeDasharray={`${unit / 3} ${unit / 3}`}
        />
        {context.objects
          .filter((item) => !changed.has(item.id))
          .map((item) => (
            <rect
              key={item.id}
              x={-item.transform.position.x - item.dimensionsMeters.width / 2}
              y={
                d - item.transform.position.z - contextDepthShift - item.dimensionsMeters.depth / 2
              }
              width={item.dimensionsMeters.width}
              height={item.dimensionsMeters.depth}
              fill="#aaa"
              fillOpacity={0.25}
              stroke="#aaa"
              strokeWidth={unit / 20}
              transform={`rotate(${item.transform.rotationDegrees.y},${-item.transform.position.x},${d - item.transform.position.z - contextDepthShift})`}
            />
          ))}
        {plan.items.map((item) => {
          const p = item.transform.position,
            size = item.dimensionsMeters,
            invalid = plan.warnings.some(
              (warning) => warning.blocking && warning.itemIds.includes(item.proposalId),
            )
          return (
            <g key={item.proposalId} transform={`translate(${-p.x},${d - p.z})`}>
              <rect
                transform={`rotate(${item.transform.rotationDegrees.y})`}
                x={-size.width / 2}
                y={-size.depth / 2}
                width={size.width}
                height={size.depth}
                fill={invalid ? '#b36860' : '#6e8e80'}
                fillOpacity={0.35}
                stroke={invalid ? '#973e35' : '#345d49'}
                strokeWidth={unit / 12}
                strokeDasharray={`${unit / 4} ${unit / 5}`}
              />
              <text
                textAnchor="middle"
                y={-size.depth / 2 - unit / 3}
                fontSize={unit * 0.7}
                fill="#222"
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
      </svg>
      <figcaption>虚线轮廓为待确认布景；灰色为现有布景。确认前不会修改舞台。</figcaption>
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
}: {
  plan: StagePlan
  context: SceneContextSummary
  onChange: (plan: StagePlan) => void
  onConfirm: (plan: StagePlan) => void
  onBack: () => void
  onAnswer?: (questionId: string, answer: string) => void
  busy: boolean
  error?: string
  onPreview?: (plan: StagePlan) => void
}) {
  const [excluded, setExcluded] = useState<string[]>([])
  const included = useMemo(
    () => ({
      ...plan,
      items: plan.items.filter((item) => !excluded.includes(item.proposalId)),
      relations: plan.relations.filter(
        (relation) =>
          !excluded.includes(relation.subjectId) &&
          (!relation.referenceId || !excluded.includes(relation.referenceId)),
      ),
    }),
    [plan, excluded],
  )
  const result = useMemo(() => validateStagePlan(included, context), [included, context])
  const previewed = useStagePlanPreview((state) => state.plan)
  const previewMatches = !onPreview || JSON.stringify(previewed) === JSON.stringify(result.plan)
  useEffect(() => {
    if (!onPreview && context.documentVersion > 0)
      useStagePlanPreview.setState({ plan: result.plan })
    return () => {
      if (!onPreview && context.documentVersion > 0) useStagePlanPreview.setState({ plan: null })
    }
  }, [result.plan, context.documentVersion, onPreview])
  const update = (next: StagePlan) =>
    onChange({
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
  return (
    <section className="stage-plan-review" aria-label="舞台方案审阅">
      <h2>先看台位，再确认搭台</h2>
      <PlanDrawing plan={result.plan} context={context} />
      <fieldset disabled={busy}>
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
                  setVenue({ heightMeters: event.target.value ? Number(event.target.value) : null })
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
        <section>
          <h3>系统采用的默认值</h3>
          <ul>
            {plan.assumptions.map((a) => (
              <li key={a.id}>{a.message}</li>
            ))}
          </ul>
        </section>
      )}
      {result.warnings.length > 0 && (
        <div role="status" className="stage-entry-warning">
          {result.warnings.map((warning, i) => (
            <p key={`${warning.code}:${i}`}>{warning.message}</p>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="stage-entry-actions">
        {onPreview && (
          <button
            type="button"
            disabled={busy || !result.valid}
            onClick={() => onPreview(result.plan)}
          >
            在舞台上试试搭台
          </button>
        )}
        <button type="button" onClick={onBack} disabled={busy}>
          返回修改
        </button>
        <button
          type="button"
          disabled={
            busy ||
            !previewMatches ||
            !result.valid ||
            (!result.plan.items.length && !result.plan.venue)
          }
          onClick={() => onConfirm(result.plan)}
        >
          {busy ? '正在处理…' : '确认搭台'}
        </button>
      </div>
    </section>
  )
}
