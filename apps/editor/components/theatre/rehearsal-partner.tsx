'use client'

import { useScene } from '@pascal-app/core'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { fetchAiWithBudgetConsent } from '@/lib/ai/budget-client'
import {
  applyHumanDecision,
  clearProposalGhost,
  makeFeedback,
  previewProposal,
  useProposalGhost,
} from '@/lib/rehearsal-intelligence/authority'
import { buildRehearsalContext } from '@/lib/rehearsal-intelligence/context'
import {
  clearFeedbackLog,
  readFeedbackLog,
  saveFeedback,
  saveInteraction,
  saveTrainingConsent,
} from '@/lib/rehearsal-intelligence/feedback'
import {
  type Interaction,
  InteractionSchema,
  type RehearsalProposal,
  type Suggestion,
  SuggestionSchema,
} from '@/lib/rehearsal-intelligence/schema'
import { readStageDocument } from '@/lib/theatre/simulation-store'
import { useRehearsalPlayback } from './state'

const ResponseSchema = z.object({ interaction: InteractionSchema })
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) })
const MOVEMENT = {
  hold: '保持位置',
  approach: '靠近对方',
  withdraw: '与对方拉开距离',
  'toward-zone': '走向舞台区域',
}
const ZONES = {
  center: '中区',
  'stage-left': '台左',
  'stage-right': '台右',
  upstage: '台后',
  downstage: '台前',
}

export function RehearsalPartner({
  sceneId,
  selectedId,
  professional,
}: {
  sceneId: string
  selectedId: string | null
  professional: boolean
}) {
  const [intention, setIntention] = useState('')
  const [script, setScript] = useState('')
  const [directorIntention, setDirectorIntention] = useState('')
  const [interaction, setInteraction] = useState<Interaction | null>(null)
  const [proposalId, setProposalId] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [consent, setConsent] = useState(false)
  const [settled, setSettled] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const locked = useRef(false)
  const mounted = useRef(true)
  const ghostId = useProposalGhost((s) => s.proposalId)
  const ghostVisible = useProposalGhost((s) => s.visible)
  const ghostTime = useProposalGhost((s) => s.time)
  const ghostPlaying = useProposalGhost((s) => s.playing)
  const feedbackError = useProposalGhost((s) => s.feedbackError)
  const readOnly = useScene((s) => s.readOnly)
  const proposal = interaction?.proposals.find((p) => p.proposalId === proposalId)

  useEffect(() => {
    if (!ghostPlaying || !ghostVisible) return
    let frame = 0,
      previous = performance.now()
    const tick = (now: number) => {
      const ghost = useProposalGhost.getState()
      if (!ghost.playing || !ghost.simulation) return
      if (now - previous >= 1000 / 24) {
        const time = Math.min(
          ghost.simulation.durationSeconds,
          ghost.time + Math.min(0.1, (now - previous) / 1000),
        )
        previous = now
        useProposalGhost.setState({ time, playing: time < ghost.simulation.durationSeconds })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ghostPlaying, ghostVisible])

  useEffect(() => {
    mounted.current = true
    void readFeedbackLog(sceneId)
      .then((log) => {
        const saved = log.consent.at(-1)
        if (mounted.current)
          setConsent(
            !!saved &&
              typeof saved === 'object' &&
              'trainingAuthorized' in saved &&
              saved.trainingAuthorized === true,
          )
      })
      .catch(() => {
        if (mounted.current) setNotice('无法读取本机反馈。手动排演仍可使用。')
      })
    const stop = useScene.subscribe((next, previous) => {
      if (next.nodes !== previous.nodes) clearProposalGhost()
    })
    return () => {
      mounted.current = false
      controller.current?.abort()
      clearProposalGhost()
      stop()
    }
  }, [sceneId])

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    controller.current = new AbortController()
    setBusy(true)
    setNotice('')
    try {
      await action(controller.current.signal)
    } catch (error) {
      if (mounted.current)
        setNotice(
          controller.current.signal.aborted
            ? '操作已取消；已提交的排演可在版本中检查。'
            : error instanceof z.ZodError
              ? '资料超出排演伙伴的范围。请使用不超过24个人物、每条64个路线点，并缩短选段后重试。'
              : error instanceof Error
                ? error.message
                : '操作未完成，请重试。手动排演仍可使用。',
        )
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const choose = (entry: RehearsalProposal) => {
    clearProposalGhost()
    setProposalId(entry.proposalId)
    setSuggestions(structuredClone(entry.suggestions))
    setEditing(false)
    setSettled(false)
    setNote('')
  }
  const generate = () =>
    run(async (signal) => {
      const document = readStageDocument()
      if (!document) throw new Error('请先建立剧目并添加人物')
      if (!document.rehearsalSimulation.performers.length)
        throw new Error('请先添加人物，再告诉我你想试什么。')
      const history = await readFeedbackLog(sceneId)
      if (history.interactions.length >= 200)
        throw new Error('本机已有200次排演记录，请先导出并清空反馈记录后继续。项目不受影响。')
      const context = buildRehearsalContext(sceneId, document, useScene.getState().nodes, {
        intention,
        script,
        directorIntention,
        selectedPerformerId: selectedId,
      })
      const { response } = await fetchAiWithBudgetConsent('/api/rehearsal/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
        signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
      })
      const body: unknown = await response.json()
      if (!response.ok)
        throw new Error(
          ErrorSchema.safeParse(body).data?.error.message ?? '无法取得建议，请稍后重试',
        )
      const next = ResponseSchema.parse(body).interaction
      if (next.sceneId !== sceneId || JSON.stringify(next.inputContext) !== JSON.stringify(context))
        throw new Error('排演返回资料不匹配，请重新生成')
      await saveInteraction(next)
      signal.throwIfAborted()
      setInteraction(next)
      choose(next.proposals[0]!)
      setNotice('建议已保存在本机。先预览，再选择是否采用。')
    })
  const updateSuggestion = (id: string, patch: Partial<Suggestion>) => {
    clearProposalGhost()
    setSuggestions((items) => items.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    setEditing(true)
  }
  const adopted = () =>
    run(async (signal) => {
      if (!interaction || !proposal) return
      const decision = editing
        ? 'edit'
        : suggestions.length === proposal.suggestions.length
          ? 'adopt'
          : 'partial'
      await applyHumanDecision(interaction, proposal, decision, suggestions, note, signal)
      setSettled(true)
      setNotice('已采用，本机已保存。可用撤销恢复到采用前。')
    })
  const exportLog = () =>
    run(async () => {
      const log = await readFeedbackLog(sceneId)
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = 'DiaStage-private-feedback.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('已导出私有反馈备份，包含选段原文，请自行保管。')
    })
  return (
    <section className="rehearsal-partner" aria-label="AI 排演伙伴" aria-busy={busy}>
      <h3>AI 排演伙伴</h3>
      <p>你决定怎么演。DiaStage 陪你尝试不同可能。</p>
      <label>
        告诉 DiaStage 你想试什么
        <textarea
          rows={3}
          maxLength={2000}
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          placeholder="这里我希望她想靠近，但最后还是忍住。"
        />
      </label>
      <details>
        <summary>补充选段与导演意图（可选）</summary>
        <label>
          只粘贴本次讨论的剧本选段
          <textarea
            rows={5}
            maxLength={12000}
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
        </label>
        <label>
          希望观众看到什么
          <textarea
            rows={2}
            maxLength={2000}
            value={directorIntention}
            onChange={(e) => setDirectorIntention(e.target.value)}
          />
        </label>
      </details>
      <p>
        生成时将发送以上文字、当前人物与路线、布景边界摘要给模型服务。反馈保存在本机，默认不用于训练。
      </p>
      <div className="th-buttons">
        <button type="button" disabled={busy || !intention.trim()} onClick={generate}>
          {busy ? '处理中…' : '生成排演可能'}
        </button>
        {busy && (
          <button type="button" onClick={() => controller.current?.abort()}>
            取消
          </button>
        )}
      </div>
      {interaction && (
        <div className="th-buttons" role="group" aria-label="切换排演方案">
          {interaction.proposals.map((p) => (
            <button
              key={p.proposalId}
              disabled={busy}
              type="button"
              aria-pressed={proposalId === p.proposalId}
              onClick={() => choose(p)}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
      {proposal && interaction && (
        <article className="rehearsal-proposal">
          <h4>可以试试：{proposal.title}</h4>
          <p>{proposal.intention}</p>
          <p>
            <strong>为什么：</strong>
            {proposal.rationale}
          </p>
          <fieldset disabled={busy || settled}>
            <legend>勾选想采用的部分</legend>
            {proposal.suggestions.map((original) => {
              const current = suggestions.find((s) => s.id === original.id)
              return (
                <div key={original.id} className="rehearsal-suggestion">
                  <label className="rehearsal-choice">
                    <input
                      type="checkbox"
                      checked={!!current}
                      onChange={(e) => {
                        clearProposalGhost()
                        setSuggestions((items) =>
                          e.target.checked
                            ? [...items, structuredClone(original)].sort(
                                (a, b) =>
                                  proposal.suggestions.findIndex((s) => s.id === a.id) -
                                  proposal.suggestions.findIndex((s) => s.id === b.id),
                              )
                            : items.filter((s) => s.id !== original.id),
                        )
                      }}
                    />
                    {original.intention}
                  </label>
                  {editing && current && (
                    <>
                      <label>
                        移动方式
                        <select
                          value={current.movement}
                          onChange={(e) => {
                            const movement = SuggestionSchema.shape.movement.parse(e.target.value)
                            updateSuggestion(current.id, {
                              movement,
                              targetPerformerId: null,
                              zone: movement === 'toward-zone' ? 'center' : null,
                            })
                          }}
                        >
                          {Object.entries(MOVEMENT).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {['approach', 'withdraw'].includes(current.movement) && (
                        <label>
                          与谁互动
                          <select
                            value={current.targetPerformerId ?? ''}
                            onChange={(e) =>
                              updateSuggestion(current.id, {
                                targetPerformerId: e.target.value || null,
                              })
                            }
                          >
                            <option value="">选择人物</option>
                            {interaction.inputContext.performers
                              .filter((p) => p.id !== current.performerId && p.visible)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      {current.movement === 'toward-zone' && (
                        <label>
                          走向
                          <select
                            value={current.zone ?? 'center'}
                            onChange={(e) =>
                              updateSuggestion(current.id, {
                                zone: SuggestionSchema.shape.zone.parse(e.target.value),
                              })
                            }
                          >
                            {Object.entries(ZONES).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        幅度
                        <select
                          value={current.extent}
                          onChange={(e) =>
                            updateSuggestion(current.id, {
                              extent: SuggestionSchema.shape.extent.parse(e.target.value),
                            })
                          }
                        >
                          <option value="small">小一些（最多0.6米）</option>
                          <option value="medium">大一些（最多1.2米）</option>
                        </select>
                      </label>
                      <label>
                        节奏
                        <select
                          value={current.pace}
                          onChange={(e) =>
                            updateSuggestion(current.id, {
                              pace: SuggestionSchema.shape.pace.parse(e.target.value),
                            })
                          }
                        >
                          <option value="slow">缓慢</option>
                          <option value="natural">自然</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )
            })}
            <label>
              我的想法（可选）
              <textarea
                maxLength={1000}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="th-buttons">
              <button
                type="button"
                disabled={!suggestions.length}
                onClick={() =>
                  run(async (signal) => {
                    useRehearsalPlayback.getState().stop()
                    await previewProposal(interaction, { ...proposal, suggestions }, signal)
                    setNotice('半透明人物与虚线为建议预览，正式排演未改动。')
                  })
                }
              >
                预览
              </button>
              <button
                type="button"
                onClick={() => {
                  clearProposalGhost()
                  setEditing(true)
                }}
              >
                修改
              </button>
              <button
                type="button"
                disabled={readOnly || ghostId !== proposalId || !suggestions.length}
                onClick={adopted}
              >
                {editing
                  ? '调整后采用'
                  : suggestions.length === proposal.suggestions.length
                    ? '采用'
                    : '采用一部分'}
              </button>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    await saveFeedback({
                      ...makeFeedback(interaction, proposal, 'reject'),
                      optionalUserNote: note,
                    })
                    clearProposalGhost()
                    setSettled(true)
                    setNotice('已记录“不成立”，正式排演未改动。')
                  })
                }
              >
                不成立
              </button>
            </div>
          </fieldset>
          {ghostId === proposalId && (
            <div className="rehearsal-ghost-controls">
              <p>建议预览 · {ghostTime.toFixed(1)} 秒</p>
              <p>
                预览编号：
                {interaction.inputContext.performers
                  .filter((p) => p.visible)
                  .map((p, index) => `${index + 1} ${p.name}`)
                  .join('；')}
              </p>
              <div className="th-buttons">
                <button
                  type="button"
                  onClick={() => useProposalGhost.setState({ visible: !ghostVisible })}
                >
                  {ghostVisible ? '隐藏预览' : '显示预览'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ghost = useProposalGhost.getState()
                    useProposalGhost.setState({
                      playing: !ghostPlaying,
                      visible: true,
                      time: ghost.time >= (ghost.simulation?.durationSeconds ?? 0) ? 0 : ghost.time,
                    })
                  }}
                >
                  {ghostPlaying ? '暂停建议' : '播放建议'}
                </button>
                <button
                  type="button"
                  onClick={() => useProposalGhost.setState({ time: 0, playing: false })}
                >
                  预览复位
                </button>
                <button type="button" onClick={clearProposalGhost}>
                  清除预览
                </button>
              </div>
              <input
                type="range"
                aria-label="建议预览进度"
                min={0}
                max={useProposalGhost.getState().simulation?.durationSeconds ?? 20}
                step={0.1}
                value={ghostTime}
                onChange={(e) =>
                  useProposalGhost.setState({ time: e.target.valueAsNumber, playing: false })
                }
              />
            </div>
          )}
          {proposal.alternatives.length > 0 && (
            <details>
              <summary>还可以怎么试</summary>
              {proposal.alternatives.map((a) => (
                <p key={a}>{a}</p>
              ))}
              <button type="button" disabled={busy} onClick={generate}>
                换一种
              </button>
            </details>
          )}
          <details>
            <summary>这条建议基于什么</summary>
            {proposal.evidence.map((e, i) => (
              <blockquote key={`${e.source}:${i}`}>{e.quote}</blockquote>
            ))}
            {!proposal.evidence.length && <p>没有逐字证据，请作为待验证的尝试。</p>}
          </details>
          {professional && (
            <details>
              <summary>专业分析与版本信息</summary>
              <p>Confidence：{proposal.confidence}（模型自评，非正确率）</p>
              <p>
                {proposal.modelVersion} · {proposal.promptVersion} · {proposal.ontologyVersion}
              </p>
              {interaction.dramaticState.map((s, i) => (
                <dl key={`${s.character}:${i}`}>
                  <dt>人物</dt>
                  <dd>
                    {interaction.inputContext.performers.find((p) => p.id === s.character)?.name}
                  </dd>
                  {(
                    [
                      'objective',
                      'tactic',
                      'action',
                      'relationship',
                      'conflict',
                      'spatialRelationship',
                      'stateChange',
                    ] as const
                  ).map((key) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{s[key]}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </details>
          )}
        </article>
      )}
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {feedbackError && <p role="alert">{feedbackError}</p>}
      <details>
        <summary>私有反馈与训练授权</summary>
        <p>
          生成记录包含本次选段、人物资料、原建议及你的选择，保存于当前浏览器。不会自动上传训练池。导出文件包含私有原文。
        </p>
        <label className="rehearsal-choice">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => {
              const value = e.target.checked
              void run(async () => {
                await saveTrainingConsent(sceneId, value)
                setConsent(value)
                setNotice(
                  value
                    ? '已记录授权意向。未来仍需匿名化审核；当前不会上传或训练。'
                    : '已撤销训练授权。',
                )
              })
            }}
          />
          允许未来匿名化后的反馈用于训练（默认关闭，可撤销）
        </label>
        <div className="th-buttons">
          <button type="button" disabled={busy} onClick={exportLog}>
            导出本机私有反馈
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const log = await readFeedbackLog(sceneId)
                const latest = log.interactions.at(-1)
                if (!latest) throw new Error('本机尚无排演建议')
                setInteraction(latest)
                choose(latest.proposals[0]!)
                const lastConsent = log.consent.at(-1)
                setConsent(
                  !!lastConsent &&
                    typeof lastConsent === 'object' &&
                    'trainingAuthorized' in lastConsent &&
                    lastConsent.trainingAuthorized === true,
                )
                setNotice('已载入本机最近建议。若舞台已变化，需要重新生成。')
              })
            }
          >
            载入最近建议
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  '删除当前项目在此浏览器的 AI 反馈记录？正式舞台不受影响。建议先导出备份。',
                )
              )
                void run(async () => {
                  await clearFeedbackLog(sceneId)
                  setConsent(false)
                  setInteraction(null)
                  clearProposalGhost()
                  setNotice('本机反馈已删除，正式舞台保留。')
                })
            }}
          >
            删除本机反馈
          </button>
        </div>
      </details>
    </section>
  )
}
