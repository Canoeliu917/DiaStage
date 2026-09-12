'use client'

import { useScene } from '@pascal-app/core'
import {
  createStageFrame,
  toFrameCoordinates,
  type Vec3,
  type VenueProfile,
} from '@pascal-app/core/remount'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import { useEffect, useMemo, useState } from 'react'
import { useCameraDirectorState } from '@/lib/camera-director'
import {
  applyRemount,
  canUndoLastRemount,
  captureProductionLayout,
  getRemountCandidates,
  initializeRemount,
  isRemountPreviewCurrent,
  prepareVersionRemount,
  previewRemount,
  reloadRemount,
  remountSourceIssues,
  saveRemountConfig,
  undoLastRemount,
  updateRemountInput,
  useRemountDraft,
} from '@/lib/remount-scene'
import { listRehearsalVersions } from '@/lib/theatre/rehearsal-versions'
import { useCameraStudio } from './camera-studio/store'
import './remount.css'

const STEPS = ['源场地', '目标场地', '空间标定', '映射预览', '应用映射', '映射记录']
const xyz = (point: Vec3) => point.map((value) => value.toFixed(3)).join(' / ')

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string
  value: number | null
  onChange: (value: number) => void
  min?: number
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])
  const number = Number(text)
  const valid =
    text.trim() !== '' && Number.isFinite(number) && (min === undefined || number >= min)
  return (
    <label className="rm-field">
      <span>{label}</span>
      <input
        type="number"
        step="0.01"
        min={min}
        value={text}
        placeholder={value === null ? '未测量' : undefined}
        aria-invalid={!valid}
        onChange={(event) => {
          const next = event.target.value
          useRemountDraft.setState({ plan: null, previewNodes: null })
          setText(next)
          if (
            next.trim() &&
            Number.isFinite(Number(next)) &&
            (min === undefined || Number(next) >= min)
          )
            onChange(Number(next))
        }}
        onBlur={() => {
          if (!valid) setText(value === null ? '' : String(value))
        }}
      />
    </label>
  )
}

function VenueFields({
  venue,
  onChange,
  heightMeasured = true,
}: {
  venue: VenueProfile
  onChange: (venue: VenueProfile, measuredHeight?: boolean) => void
  heightMeasured?: boolean
}) {
  return (
    <>
      <label className="rm-field">
        <span>场地名称</span>
        <input
          value={venue.name}
          onChange={(event) => {
            if (event.target.value.trim()) onChange({ ...venue, name: event.target.value })
          }}
        />
      </label>
      <div className="rm-grid-three">
        {(['width', 'depth', 'height'] as const).map((key, index) => (
          <NumberField
            key={key}
            label={`${['宽', '深', '实测净高'][index]} / 米`}
            value={key === 'height' && !heightMeasured ? null : venue.bounds[key]}
            min={0.01}
            onChange={(value) =>
              onChange({ ...venue, bounds: { ...venue.bounds, [key]: value } }, key === 'height')
            }
          />
        ))}
      </div>
      {!heightMeasured && (
        <p className="rm-notice">
          净高尚未测量，默认显示空间不代表实测值。请填写实测净高，才能生成 1:1 复台预览。
        </p>
      )}
    </>
  )
}

function AnchorFields({
  venue,
  onChange,
}: {
  venue: VenueProfile
  onChange: (venue: VenueProfile) => void
}) {
  return (
    <fieldset className="rm-anchors">
      <legend>{venue.name}</legend>
      {venue.anchors.map((anchor, index) => (
        <div key={anchor.id}>
          <p>
            {['台口中点 · 中心线与台口线交点', '横向基准（默认世界 +X）', '舞台后方基准'][index]}
          </p>
          <div className="rm-grid-three">
            {(['X', 'Y', 'Z'] as const).map((axis, axisIndex) => (
              <NumberField
                key={axis}
                label={`${axis} / 米`}
                value={anchor.position[axisIndex]!}
                onChange={(value) => {
                  const anchors: VenueProfile['anchors'] = structuredClone(venue.anchors)
                  anchors[index]!.position[axisIndex] = value
                  // Keep incomplete three-point edits in the draft; preview validates the full frame.
                  let frame = venue.frame
                  try {
                    frame = createStageFrame(anchors)
                  } catch {
                    /* The next coordinate may complete the triangle. */
                  }
                  onChange({ ...venue, anchors, frame })
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  )
}

export function RemountPanel({ sceneId }: { sceneId: string }) {
  const draft = useRemountDraft()
  const nodes = useScene((state) => state.nodes)
  const roots = useScene((state) => state.rootNodeIds)
  const readOnly = useScene((state) => state.readOnly)
  const exclusive = useEditor(
    (state) => state.isCaptureMode || state.isFirstPersonMode || state.isPreviewMode,
  )
  const editing = useInteractionScope((state) => state.scope.kind !== 'idle')
  const playing = useCameraStudio((state) => state.playing || state.previewing)
  const director = useCameraDirectorState(sceneId)
  const blocked =
    readOnly || exclusive || editing || playing || director.transport.status !== 'idle'
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [pathText, setPathText] = useState('')
  const candidates = useMemo(() => {
    void nodes
    return getRemountCandidates()
  }, [nodes])
  const scans = Object.values(nodes).filter((node) => node.type === 'scan')
  const versions = useMemo(() => {
    void nodes
    try {
      return { items: listRehearsalVersions(), error: '' }
    } catch {
      return { items: [], error: '版本资料无法读取，原始记录已保留。' }
    }
  }, [nodes])
  const sourceIssues = remountSourceIssues()
  const ready = draft.sceneKey === JSON.stringify([sceneId, roots])

  useEffect(() => {
    if (roots.length === 0) return
    try {
      initializeRemount(sceneId)
      const current = useRemountDraft.getState()
      setSelected(current.layout?.objectNodeIds ?? [])
      setPathText(current.layout?.paths[0]?.points.map((point) => point.join(' ')).join('\n') ?? '')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '复台初始化失败。')
    }
  }, [sceneId, roots])

  const run = (action: () => void) => {
    setError('')
    setMessage('')
    try {
      if (blocked) throw new Error('请先结束播放、取景或编辑操作，并退出只读预览。')
      action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作未完成。')
    }
  }
  const changeVenue = (key: 'sourceVenue' | 'targetVenue', venue: VenueProfile) =>
    run(() => {
      updateRemountInput(sceneId, { [key]: venue })
      setReviewed(false)
    })
  const makePreview = () =>
    run(() => {
      previewRemount(sceneId)
      useEditor.getState().setViewMode('3d')
      setReviewed(false)
      setStep(3)
    })
  const plan = draft.plan
  const errors = plan?.conflicts.filter((conflict) => conflict.severity === 'error') ?? []
  const warnings = plan?.conflicts.filter((conflict) => conflict.severity === 'warning') ?? []
  const stale = plan !== null && !isRemountPreviewCurrent(sceneId)
  const canApply =
    ready &&
    plan !== null &&
    !stale &&
    plan.calibration.valid &&
    draft.sourceHeightMeasured &&
    errors.length === 0 &&
    sourceIssues.length === 0 &&
    reviewed &&
    !blocked

  return (
    <div className="rm-panel">
      <header className="rm-heading">
        <span>REMOUNT PREVIEW / MAPPING</span>
        <h2>复台映射预览</h2>
        <p>校准、对比与应用位置映射；正式场地暂不切换。</p>
      </header>
      <nav className="rm-steps" aria-label="复台步骤">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-current={step === index ? 'step' : undefined}
            onClick={() => setStep(index)}
          >
            <span>0{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="rm-notice rm-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="rm-notice" role="status">
          {message}
        </p>
      )}
      {blocked && (
        <p className="rm-notice">当前模式不可修改复台。请结束取景、播放或正在进行的编辑。</p>
      )}
      {ready && (
        <fieldset disabled={blocked} className="rm-content">
          <h3>
            0{step + 1} / {STEPS[step]}
          </h3>
          {step === 0 && (
            <>
              <label className="rm-field">
                <span>复台来源</span>
                <select
                  value={draft.sourceVersion?.id ?? ''}
                  onChange={(event) =>
                    run(() => {
                      if (event.target.value) prepareVersionRemount(sceneId, event.target.value)
                      else
                        captureProductionLayout(
                          sceneId,
                          candidates
                            .filter((candidate) => candidate.eligible)
                            .map((candidate) => candidate.nodeId),
                        )
                      setReviewed(false)
                    })
                  }
                >
                  <option value="">当前舞台与排演</option>
                  {versions.items.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.name} · {new Date(version.createdAt).toLocaleDateString('zh-CN')}
                    </option>
                  ))}
                </select>
              </label>
              {versions.error && <p role="alert">{versions.error}</p>}
              {draft.sourceVersion && (
                <p className="rm-notice">
                  源版本：{draft.sourceVersion.name}
                  。历史场地、布景和人物路线已读入草稿；当前场景保持原样。
                </p>
              )}
              <VenueFields
                venue={draft.sourceVenue}
                heightMeasured={draft.sourceHeightMeasured}
                onChange={(venue, measuredHeight) =>
                  run(() => {
                    updateRemountInput(sceneId, {
                      sourceVenue: venue,
                      ...(measuredHeight ? { sourceHeightMeasured: true } : {}),
                    })
                    setReviewed(false)
                  })
                }
              />
              {!draft.sourceVersion && (
                <>
                  <p className="rm-help">
                    选取本次搬运的布景与机位，当前人物与路线一并记录。子物件随组合一起记录；跟随机位须同时选入其跟随的布景。
                  </p>
                  <div className="rm-candidates">
                    {candidates.length === 0 && <p>请先在置景中放置布景或添加机位。</p>}
                    {candidates.map((candidate) => (
                      <label key={candidate.nodeId} className="rm-candidate">
                        <input
                          type="checkbox"
                          checked={selected.includes(candidate.nodeId)}
                          disabled={!candidate.eligible}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, candidate.nodeId]
                                : current.filter((id) => id !== candidate.nodeId),
                            )
                          }
                        />
                        <span>
                          {candidate.name}
                          {candidate.reason && <small>{candidate.reason}</small>}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="rm-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(
                          candidates
                            .filter((candidate) => candidate.eligible)
                            .map((candidate) => candidate.nodeId),
                        )
                      }
                    >
                      全选可搬运物件
                    </button>
                    <button type="button" onClick={() => setSelected([])}>
                      清空选择
                    </button>
                  </div>
                  <button
                    className="rm-primary"
                    type="button"
                    onClick={() =>
                      run(() => {
                        captureProductionLayout(sceneId, selected)
                        setMessage(
                          `已记录 ${useRemountDraft.getState().sourceSnapshots.length} 个物件的原始位置。`,
                        )
                        setStep(1)
                      })
                    }
                  >
                    记录演出布置 →
                  </button>
                </>
              )}
              {draft.sourceVersion && (
                <button type="button" className="rm-primary" onClick={() => setStep(1)}>
                  保留历史源，查看目标场地 →
                </button>
              )}
              {draft.layout && (
                <p className="rm-help">
                  已记录 {draft.sourceSnapshots.length} 个布景、机位与人物标记，
                  {draft.sourceRehearsal?.paths.length ?? 0} 条排演路线。
                </p>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <VenueFields
                venue={draft.targetVenue}
                onChange={(venue) => changeVenue('targetVenue', venue)}
              />
              <label className="rm-field">
                <span>目标扫描参考层（可选）</span>
                <select
                  value={draft.targetVenue.scanNodeId ?? ''}
                  onChange={(event) =>
                    changeVenue('targetVenue', {
                      ...draft.targetVenue,
                      scanNodeId: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">仅使用手工场地边界</option>
                  {scans.map((scan) => (
                    <option key={scan.id} value={scan.id}>
                      {scan.name || '扫描参考'}
                    </option>
                  ))}
                </select>
              </label>
              <p className="rm-help">
                场地宽度以中心线为中心，深度从台口线向台后延伸。扫描层仅用于目视参考。
                请开启扫描参考的模型显示，并等待加载完成。
              </p>
              <p className="rm-notice">
                目标场地是映射参考。应用后仍保留当前正式场地的身份、边界和地面，不会将其替换为这里的目标场地。
              </p>
              <div className="rm-metric">
                <span>空间映射比例</span>
                <strong>1 : 1</strong>
                <small>实际尺寸保持不变</small>
              </div>
              <button className="rm-primary" type="button" onClick={() => setStep(2)}>
                设置三个对应基准点 →
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <p className="rm-help">
                在两个场地输入同一套基准三角形：台口中点、横向基准、后方基准。默认两条基线各 1
                米，不能用不同场地的边角代替对应点。这里沿用世界 X/Z
                标定坐标，横向基准不是演员台右；Y 向上。
              </p>
              <AnchorFields
                venue={draft.sourceVenue}
                onChange={(venue) => changeVenue('sourceVenue', venue)}
              />
              <AnchorFields
                venue={draft.targetVenue}
                onChange={(venue) => changeVenue('targetVenue', venue)}
              />
              <div className="rm-grid-two">
                <NumberField
                  label="校准容差 / 米"
                  min={0}
                  value={draft.tolerance}
                  onChange={(tolerance) => run(() => updateRemountInput(sceneId, { tolerance }))}
                />
                <NumberField
                  label="安全净距 / 米"
                  min={0}
                  value={draft.clearance}
                  onChange={(clearance) => run(() => updateRemountInput(sceneId, { clearance }))}
                />
              </div>
              <p className="rm-help">
                当前只接受水平、向上的舞台坐标系。容差用于检验输入点，不代表现场测量精度。
              </p>
              <button className="rm-primary" type="button" onClick={makePreview}>
                校准并生成预览 →
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button className="rm-primary" type="button" onClick={makePreview}>
                {plan ? '重新计算并查看全景' : '生成映射预览'}
              </button>
              <div className="rm-actions" role="group" aria-label="复台视觉对比">
                {(
                  [
                    ['source', '原版本'],
                    ['overlay', '叠加对比'],
                    ['target', '目标方案'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    type="button"
                    key={mode}
                    aria-pressed={draft.comparisonMode === mode}
                    onClick={() => useRemountDraft.setState({ comparisonMode: mode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="rm-legend">
                <span data-tone="source">蓝 · 原位置</span>
                <span data-tone="safe">绿 · 可落位</span>
                <span data-tone="warning">黄 · 净距提示</span>
                <span data-tone="error">红 · 冲突</span>
                <span>灰 · 场地参考</span>
              </div>
              <p className="rm-help">
                原场地、原布景尺寸代理和人物路线以蓝色显示；新场地为灰色边界，待确认落位为彩色
                Ghost。虚线包含已保存的排演路线。尺寸代理不复刻材质；确认前不改正式场景。
              </p>
              {sourceIssues.length > 0 && (
                <p className="rm-notice rm-error" role="alert">
                  历史版本与当前舞台结构不同：{sourceIssues.join(' ')}{' '}
                  可以完整比较，暂不能应用。请先在版本面板明确恢复该版本，再复台。
                </p>
              )}
              {[...draft.sourceWarnings, ...draft.obstacleWarnings].map((warning) => (
                <p className="rm-notice" key={warning}>
                  {warning}
                </p>
              ))}
              {plan && (
                <>
                  <div className="rm-metric">
                    <span>总体校准误差（均方根）</span>
                    <strong>
                      {(plan.calibration.rmsError * 1000).toFixed(2)} <small>mm</small>
                    </strong>
                    <small>
                      最大 {(plan.calibration.maxError * 1000).toFixed(2)} mm ·{' '}
                      {plan.calibration.valid ? '通过' : '超过容差，禁止应用'}
                    </small>
                  </div>
                  <p className="rm-notice">
                    {plan.placements.length} 个物件 · {errors.length} 项冲突 · {warnings.length}{' '}
                    项提示
                  </p>
                  {stale && (
                    <p className="rm-notice rm-error">场景已变化，预览过期。请重新计算。</p>
                  )}
                  {plan.placements.map((placement) => {
                    const local = toFrameCoordinates(
                      placement.targetPosition,
                      draft.targetVenue.frame,
                    )
                    const conflicts = plan.conflicts.filter(
                      (conflict) =>
                        conflict.nodeId === placement.nodeId ||
                        conflict.otherNodeId === placement.nodeId,
                    )
                    return (
                      <details className="rm-placement" key={placement.nodeId}>
                        <summary>
                          {placement.name}
                          <span>
                            {conflicts.some((conflict) => conflict.severity === 'error')
                              ? '冲突'
                              : conflicts.length
                                ? '提示'
                                : '可落位'}
                          </span>
                        </summary>
                        <dl>
                          <dt>原位置 X / Y / Z · 米</dt>
                          <dd>{xyz(placement.sourcePosition)}</dd>
                          <dt>目标位置 X / Y / Z · 米</dt>
                          <dd>{xyz(placement.targetPosition)}</dd>
                          <dt>距中心线 / 距台口线 · 米（有向）</dt>
                          <dd>
                            {local[0].toFixed(3)} / {local[2].toFixed(3)}
                          </dd>
                          <dt>原旋转 X / Y / Z · 度</dt>
                          <dd>
                            {xyz(
                              placement.sourceRotation.map(
                                (value) => (value * 180) / Math.PI,
                              ) as Vec3,
                            )}
                          </dd>
                          <dt>目标旋转 X / Y / Z · 度</dt>
                          <dd>
                            {xyz(
                              placement.targetRotation.map(
                                (value) => (value * 180) / Math.PI,
                              ) as Vec3,
                            )}
                          </dd>
                        </dl>
                        {conflicts.map((conflict, index) => (
                          <p className="rm-notice" key={`${conflict.type}-${index}`}>
                            {conflict.message}
                          </p>
                        ))}
                      </details>
                    )
                  })}
                  <button className="rm-primary" type="button" onClick={() => setStep(4)}>
                    检查并应用映射 →
                  </button>
                </>
              )}
              {draft.layout && (
                <details className="rm-placement">
                  <summary>走位线与物件表示</summary>
                  <label className="rm-field">
                    <span>一条走位线，每行 X Y Z（米）</span>
                    <textarea
                      rows={4}
                      value={pathText}
                      placeholder={'0 0 0\n1 0 -1'}
                      onChange={(event) => {
                        setPathText(event.target.value)
                        useRemountDraft.setState({ plan: null, previewNodes: null })
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      run(() => {
                        const points = pathText.trim()
                          ? pathText
                              .trim()
                              .split(/\n/)
                              .map((line) =>
                                line
                                  .trim()
                                  .split(/[\s,，]+/)
                                  .map(Number),
                              )
                          : []
                        if (
                          points.length &&
                          (points.length < 2 ||
                            points.some(
                              (point) =>
                                point.length !== 3 ||
                                point.some((value) => !Number.isFinite(value)),
                            ))
                        )
                          throw new Error('走位线至少需要两点，每行三个有效坐标。')
                        updateRemountInput(sceneId, {
                          paths: points.length
                            ? [{ id: 'manual-path', name: '演员走位', points: points as Vec3[] }]
                            : [],
                        })
                        setMessage('走位线已更新，请重新生成预览。')
                      })
                    }
                  >
                    更新走位线
                  </button>
                  {draft.sourceSnapshots
                    .filter((snapshot) => snapshot.sourceKind === 'node')
                    .map((snapshot) => (
                      <label className="rm-field" key={snapshot.nodeId}>
                        <span>{snapshot.name}</span>
                        <select
                          value={snapshot.representation}
                          onChange={(event) =>
                            run(() =>
                              updateRemountInput(sceneId, {
                                representations: {
                                  [snapshot.nodeId]: event.target.value as
                                    | 'physical'
                                    | 'proxy'
                                    | 'virtual',
                                },
                              }),
                            )
                          }
                        >
                          <option value="physical">实体道具</option>
                          <option value="proxy">替代道具</option>
                          <option value="virtual">虚拟参考</option>
                        </select>
                      </label>
                    ))}
                </details>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <p className="rm-help">
                确认仅将布景、人物、路线和机位的位置映射作为一次操作写入场景，并保存来源版本、校准点与原始布局。时长和实体尺寸保持不变，可一次撤销。
              </p>
              <p className="rm-notice">
                正式场地的身份、边界和地面保持原样。这里不是完成新场地的正式复台或现场验收。
              </p>
              {sourceIssues.length > 0 && (
                <p role="alert" className="rm-notice rm-error">
                  当前结构与历史源不同，不能直接应用。请先在版本面板明确恢复后再复台。
                </p>
              )}
              {!plan && <p className="rm-notice">请先生成映射预览。</p>}
              {plan && (
                <>
                  <p className="rm-notice">
                    {plan.placements.length} 个物件 · 比例 1 : 1 · {errors.length} 项冲突 ·{' '}
                    {warnings.length} 项提示
                  </p>
                  {(!plan.calibration.valid || errors.length > 0 || stale) && (
                    <p className="rm-notice rm-error">
                      当前预览不可应用。请检查校准误差、冲突或过期状态。
                    </p>
                  )}
                </>
              )}
              <p className="rm-help">
                碰撞覆盖布景与墙体的尺寸包围体，人物和路线检测目标边界。墙体不扣除门洞；路线中途的动态避障、扫描和现场人员仍需人工复核。
              </p>
              {draft.obstacleWarnings.map((warning) => (
                <p className="rm-notice" key={warning}>
                  {warning}
                </p>
              ))}
              <label className="rm-candidate">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                <span>我已核对位置、尺寸、净距提示与现场条件</span>
              </label>
              <button
                className="rm-primary"
                type="button"
                disabled={!canApply}
                onClick={() =>
                  run(() => {
                    applyRemount(sceneId, blocked)
                    setMessage('已应用映射，正式场地未切换。场景自动保存中，可一次撤销。')
                    setReviewed(false)
                    setStep(5)
                  })
                }
              >
                确认应用映射
              </button>
              <button type="button" onClick={() => setStep(3)}>
                返回映射预览
              </button>
            </>
          )}
          {step === 5 && (
            <>
              <div className="rm-metric">
                <span>映射操作记录</span>
                <strong>
                  {draft.lastPlan ? `${draft.lastPlan.placements.length} 个物件` : '尚未确认'}
                </strong>
                <small>
                  {draft.lastPlan ? '已写入场景，沿用自动保存' : '完成前五步后在此查看记录'}
                </small>
              </div>
              {draft.lastPlan && (
                <p className="rm-help">
                  比例 1 : 1 · 校准误差 {(draft.lastPlan.calibration.rmsError * 1000).toFixed(2)}{' '}
                  mm。该记录仅表示位置映射，未替换正式场地，也不表示现场验收通过。
                </p>
              )}
              <button
                type="button"
                disabled={!canUndoLastRemount(sceneId)}
                onClick={() =>
                  run(() => {
                    if (undoLastRemount(sceneId, blocked))
                      setMessage('本次映射已一次撤销，原始布局仍可重新预览。')
                  })
                }
              >
                撤销本次映射
              </button>
              <p className="rm-help">
                若已继续编辑，可通过编辑器历史记录撤销。选入的机位关键帧、注视点与跟随偏移随布景一起复台，也一起撤销。
              </p>
            </>
          )}
        </fieldset>
      )}
      <footer className="rm-footer">
        <div className="rm-actions">
          <button
            type="button"
            disabled={!ready || blocked}
            onClick={() =>
              run(() => {
                saveRemountConfig(sceneId, blocked)
                setMessage('复台配置已写入场景，沿用自动保存；物件位置未改变。')
              })
            }
          >
            保存复台配置
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() =>
              run(() => {
                reloadRemount(sceneId)
                const current = useRemountDraft.getState()
                setSelected(current.layout?.objectNodeIds ?? [])
                setPathText(
                  current.layout?.paths[0]?.points.map((point) => point.join(' ')).join('\n') ?? '',
                )
                setReviewed(false)
                setMessage('已重新载入场景中的复台配置。')
              })
            }
          >
            放弃草稿并载入
          </button>
        </div>
        <p>米 / 弧度 · 确定性坐标映射 · 第一阶段</p>
      </footer>
    </div>
  )
}
