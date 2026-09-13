'use client'

import { useScene } from '@pascal-app/core'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useProposalGhost } from '@/lib/rehearsal-intelligence/authority'
import { DiaConversation } from '@/lib/rehearsal-intelligence/conversation-controller'
import {
  readConversation,
  readProductEvents,
} from '@/lib/rehearsal-intelligence/conversation-storage'
import {
  clearFeedbackLog,
  readFeedbackLog,
  saveTrainingConsent,
} from '@/lib/rehearsal-intelligence/feedback'
import { SuggestionSchema } from '@/lib/rehearsal-intelligence/schema'
import type { CreatedRemoteVoiceSession } from '@/lib/remote-voice/client'
import type { VoiceState } from '../stage-entry/command-input'
import { LiveStagePlan } from '../stage-entry/live-stage-plan'
import { PhoneVoiceLink } from '../stage-entry/phone-voice-link'
import { StagePlanReview } from '../stage-entry/plan-review'
import { openStudioPanel } from '../studio-navigation'
import { DiaRecords } from './dia-records'
import { DiaRemoteBridge } from './dia-remote-bridge'
import { SceneLayersPanel, useSimulationSelection } from './simulation-panel'
import { useRehearsalPlayback } from './state'
import './dia-conversation.css'

const VoiceRecorder = dynamic(
  () => import('../stage-entry/voice-recorder').then((m) => m.VoiceRecorder),
  { ssr: false },
)

const MOVEMENT = {
  hold: '保持位置',
  approach: '靠近对方',
  withdraw: '拉开距离',
  'toward-zone': '走向舞台区域',
  'stand-near-object': '站在布景旁',
}
const ZONES = {
  center: '中区',
  'stage-left': '台左',
  'stage-right': '台右',
  upstage: '台后',
  downstage: '台前',
}
const SHORTCUTS = [
  { label: '搭建构思', items: ['一张圆桌，两把硬椅', '两块单帘景片'] },
  { label: '排演构思', items: ['给我两个排法', '这个人物还能怎么做'] },
  { label: '为什么／换一种', items: ['为什么这样排', '换一种', '我自己来'] },
]

function GhostControls({ controller }: { controller: DiaConversation }) {
  const ghostVisible = useProposalGhost((s) => s.visible)
  const ghostTime = useProposalGhost((s) => s.time)
  const ghostPlaying = useProposalGhost((s) => s.playing)

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

  return (
    <div className="dia-ghost-controls">
      <p>建议预演 · {ghostTime.toFixed(1)} 秒 · 尚未采用</p>
      <div className="dia-actions">
        <button type="button" onClick={() => useProposalGhost.setState({ visible: !ghostVisible })}>
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
        <button
          type="button"
          onClick={() => controller.cancel('已清除预演，采用前需要重新预演。', 'proposal-ready')}
        >
          清除预演
        </button>
      </div>
      <input
        aria-label="建议预览进度"
        type="range"
        min={0}
        max={useProposalGhost.getState().simulation?.durationSeconds ?? 20}
        step={0.1}
        value={ghostTime}
        onChange={(e) =>
          useProposalGhost.setState({ time: e.target.valueAsNumber, playing: false })
        }
      />
    </div>
  )
}

function GhostFeedbackError() {
  const feedbackError = useProposalGhost((s) => s.feedbackError)
  return feedbackError ? <p role="alert">{feedbackError}</p> : null
}

export function RehearsalPartner({
  sceneId,
  modelConfigured,
}: {
  sceneId: string
  modelConfigured: boolean
}) {
  const controller = useMemo(
    () =>
      new DiaConversation(
        sceneId,
        () => useSimulationSelection.getState().selectedId,
        (panel) => {
          // Build stays in Dia; opening the sidebar would close it on tablets.
          if (panel !== 'items') openStudioPanel(panel)
        },
      ),
    [sceneId],
  )
  const state = useStore(controller.store)
  const professional = useSimulationSelection((s) => s.professional)
  const readOnly = useScene((s) => s.readOnly)
  const ghostId = useProposalGhost((s) => s.proposalId)
  const [consent, setConsent] = useState(false)
  const [privateNotice, setPrivateNotice] = useState('')
  const [session, setSession] = useState<CreatedRemoteVoiceSession | null>(null)
  const [voice, setVoice] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceError, setVoiceError] = useState('')
  const [drawingContainer, setDrawingContainer] = useState<HTMLDivElement | null>(null)
  const [editingProposal, setEditingProposal] = useState(false)
  const voiceBusy =
    voice && ['requesting-permission', 'recording', 'transcribing'].includes(voiceState)
  const build = controller.buildProposal()
  const proposal = controller.proposal()
  const currentProposals = useRef<HTMLDivElement>(null)
  const decision = useRef<HTMLElement>(null)
  const dialogue = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: A different proposal starts with its editor closed.
  useEffect(() => setEditingProposal(false), [state.thread?.selectedProposalId])
  useEffect(() => {
    if (build?.id) dialogue.current?.scrollTo(0, 0)
  }, [build?.id])
  const interactionId = state.thread?.activeInteractionId
  const diaStatus = state.thread?.status
  useEffect(() => {
    if (interactionId) currentProposals.current?.scrollIntoView({ block: 'start' })
  }, [interactionId])
  useEffect(() => {
    if (diaStatus === 'waiting-human') decision.current?.scrollIntoView({ block: 'start' })
  }, [diaStatus])
  const settled = ['applied', 'rejected'].includes(state.thread?.status ?? '')
  const stale = state.thread?.status === 'stale'
  const preview = async (id: string) => {
    if (state.thread?.selectedProposalId !== id) controller.choose(id)
    useRehearsalPlayback.getState().stop()
    await controller.preview()
  }

  useEffect(() => {
    void controller.load()
    let active = true
    void readFeedbackLog(sceneId)
      .then((log) => {
        const last = log.consent.at(-1)
        if (active)
          setConsent(
            !!last &&
              typeof last === 'object' &&
              'trainingAuthorized' in last &&
              last.trainingAuthorized === true,
          )
      })
      .catch(() => {})
    return () => {
      active = false
      controller.dispose()
    }
  }, [controller, sceneId])

  const privateAction = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch {
      setPrivateNotice('本机记录未能读写，请检查存储空间。正式排演不受影响。')
    }
  }

  return (
    <section className="dia-panel" aria-label="Dia 排演对话">
      <header className="dia-panel-header">
        <h2 className="dia-notation">DIA</h2>
        <span className="dia-header-note">{state.synthetic ? '示例对话' : '舞台对话'}</span>
      </header>
      <div
        ref={setDrawingContainer}
        className="dia-pinned-plan stage-plan-review stage-plan-compact"
        role="region"
        aria-label="Dia预演"
      >
        {(!build || settled || stale) && <LiveStagePlan />}
      </div>
      <div ref={dialogue} className="dia-dialogue" role="region" aria-label="本场对话记录">
        {build && (
          <section className="dia-proposals" aria-label="Dia预演确认">
            <p className="dia-section-label">
              <span className="dia-notation">PROPOSAL</span> 当前提案
            </p>
            {settled || stale ? (
              <p>
                {stale
                  ? '舞台已更新，图中显示当前台位。'
                  : build.status === 'applied'
                    ? '已采用，可撤销或继续调整。'
                    : '已放下这个方向，正式舞台未改变。'}
              </p>
            ) : (
              <StagePlanReview
                compact
                drawingContainer={drawingContainer}
                key={build.id}
                plan={build.plan}
                context={build.context}
                onChange={(plan) => controller.editBuild(plan)}
                onPreview={(plan) => {
                  useRehearsalPlayback.getState().stop()
                  void controller.previewBuild(plan)
                }}
                onConfirm={async (plan) => {
                  useRehearsalPlayback.getState().stop()
                  await controller.adoptBuild(plan)
                }}
                onBack={() => void controller.reject()}
                busy={state.busy || stale || readOnly}
              />
            )}
          </section>
        )}
        {!state.thread?.messages.length && (
          <div className="dia-welcome">
            <h3>你想试什么？</h3>
            <p>
              {state.synthetic
                ? '两个人在告别。A 想走，B 不想让他走。你想让这一段发生什么？'
                : '说说你想改变的关系或行动。我们先在舞台上试，再由你决定。'}
            </p>
          </div>
        )}
        <DiaRecords sceneId={sceneId} controller={controller} />
        {state.interaction && !build && (
          <div ref={currentProposals} className="dia-proposals" role="group" aria-label="本轮方案">
            <p className="dia-section-label">
              <span className="dia-notation">PROPOSAL</span> 当前提案
            </p>
            {state.interaction.proposals.map((entry) => (
              <article
                className="dia-proposal"
                key={entry.proposalId}
                data-selected={entry.proposalId === state.thread?.selectedProposalId}
                hidden={entry.proposalId !== state.thread?.selectedProposalId}
              >
                <h3>{entry.title}</h3>
                <p>{entry.intention}</p>
                <ul>
                  {entry.suggestions.map((suggestion) => (
                    <li key={suggestion.id}>
                      {
                        state.interaction!.inputContext.performers.find(
                          (p) => p.id === suggestion.performerId,
                        )?.name
                      }
                      ：{MOVEMENT[suggestion.movement]}
                      {suggestion.zone ? ` · ${ZONES[suggestion.zone]}` : ''}
                      {suggestion.movement === 'stand-near-object' &&
                        ` · ${state.interaction!.inputContext.obstacles.find((object) => object.id === suggestion.targetObjectId)?.name ?? '请选择布景'} · 净距 ${suggestion.extent === 'small' ? '0.5' : '1'} 米`}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>提案依据</summary>
                  <p>{entry.rationale}</p>
                  {entry.evidence.map((e, i) => (
                    <blockquote key={`${e.source}-${i}`}>{e.quote.slice(0, 120)}</blockquote>
                  ))}
                  {entry.alternatives.map((alternative) => (
                    <p key={alternative}>{alternative}</p>
                  ))}
                </details>
                {ghostId !== entry.proposalId && !editingProposal && (
                  <button
                    type="button"
                    className="dia-primary"
                    disabled={
                      state.busy ||
                      stale ||
                      (settled && entry.proposalId === state.thread?.selectedProposalId)
                    }
                    onClick={() => void preview(entry.proposalId)}
                  >
                    在舞台上试试
                  </button>
                )}
              </article>
            ))}
            <details className="dia-secondary">
              <summary>本轮其他方向</summary>
              {state.interaction.proposals.map((entry, index) => (
                <button
                  type="button"
                  key={entry.proposalId}
                  aria-pressed={entry.proposalId === state.thread?.selectedProposalId}
                  disabled={state.busy || stale || settled}
                  onClick={() => controller.choose(entry.proposalId)}
                >
                  {String(index + 1).padStart(2, '0')} · {entry.title}
                </button>
              ))}
              <button
                type="button"
                disabled={state.busy}
                onClick={() => void controller.send('换几个有不同处理的方向')}
              >
                换几个方向
              </button>
            </details>
          </div>
        )}
        {proposal &&
          state.interaction &&
          !build &&
          !settled &&
          (ghostId === proposal.proposalId || editingProposal) && (
            <section ref={decision} className="dia-decision" aria-label="预演与决定">
              <h3>预演后，由你决定</h3>
              <details
                open={editingProposal}
                onToggle={(event) => setEditingProposal(event.currentTarget.open)}
              >
                <summary>修改提案内容</summary>
                <fieldset disabled={state.busy || settled || stale}>
                  {proposal.suggestions.map((original) => {
                    const current = state.suggestions.find((s) => s.id === original.id)
                    return (
                      <div className="dia-suggestion" key={original.id}>
                        <label className="dia-choice">
                          <input
                            type="checkbox"
                            checked={!!current}
                            onChange={(e) =>
                              controller.edit(
                                e.target.checked
                                  ? proposal.suggestions.filter(
                                      (s) =>
                                        s.id === original.id ||
                                        state.suggestions.some((p) => p.id === s.id),
                                    )
                                  : state.suggestions.filter((s) => s.id !== original.id),
                                state.editing,
                              )
                            }
                          />
                          {
                            state.interaction!.inputContext.performers.find(
                              (p) => p.id === original.performerId,
                            )?.name
                          }{' '}
                          · {original.intention}
                        </label>
                        {current && (
                          <>
                            <label>
                              行动方式
                              <select
                                value={current.movement}
                                onChange={(e) => {
                                  const movement = SuggestionSchema.shape.movement.parse(
                                    e.target.value,
                                  )
                                  controller.edit(
                                    state.suggestions.map((s) =>
                                      s.id === current.id
                                        ? {
                                            ...s,
                                            movement,
                                            zone: movement === 'toward-zone' ? 'center' : null,
                                            targetPerformerId: null,
                                            targetObjectId: null,
                                          }
                                        : s,
                                    ),
                                    true,
                                  )
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
                                    controller.edit(
                                      state.suggestions.map((s) =>
                                        s.id === current.id
                                          ? { ...s, targetPerformerId: e.target.value || null }
                                          : s,
                                      ),
                                      true,
                                    )
                                  }
                                >
                                  <option value="">选择人物</option>
                                  {state
                                    .interaction!.inputContext.performers.filter(
                                      (p) => p.id !== current.performerId && p.visible,
                                    )
                                    .map((p) => (
                                      <option value={p.id} key={p.id}>
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
                                    controller.edit(
                                      state.suggestions.map((s) =>
                                        s.id === current.id
                                          ? {
                                              ...s,
                                              zone: SuggestionSchema.shape.zone.parse(
                                                e.target.value,
                                              ),
                                            }
                                          : s,
                                      ),
                                      true,
                                    )
                                  }
                                >
                                  {Object.entries(ZONES).map(([id, label]) => (
                                    <option value={id} key={id}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {current.movement === 'stand-near-object' && (
                              <label>
                                靠近哪件布景
                                <select
                                  value={current.targetObjectId ?? ''}
                                  onChange={(e) =>
                                    controller.edit(
                                      state.suggestions.map((s) =>
                                        s.id === current.id
                                          ? { ...s, targetObjectId: e.target.value || null }
                                          : s,
                                      ),
                                      true,
                                    )
                                  }
                                >
                                  <option value="">选择布景</option>
                                  {state.interaction!.inputContext.obstacles.map((object) => (
                                    <option value={object.id} key={object.id}>
                                      {object.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <label>
                              {current.movement === 'stand-near-object' ? '与布景净距' : '幅度'}
                              <select
                                value={current.extent}
                                onChange={(e) =>
                                  controller.edit(
                                    state.suggestions.map((s) =>
                                      s.id === current.id
                                        ? {
                                            ...s,
                                            extent: SuggestionSchema.shape.extent.parse(
                                              e.target.value,
                                            ),
                                          }
                                        : s,
                                    ),
                                    true,
                                  )
                                }
                              >
                                <option value="small">
                                  {current.movement === 'stand-near-object'
                                    ? '0.5米'
                                    : '小一些（最多0.6米）'}
                                </option>
                                <option value="medium">
                                  {current.movement === 'stand-near-object'
                                    ? '1米'
                                    : '大一些（最多1.2米）'}
                                </option>
                              </select>
                            </label>
                            {current.movement === 'stand-near-object' ? (
                              <p>
                                调整初始站位，保留朝向并清除该人物原有路线。按人物半径0.25米估算净距，
                                选择距原位置最近的布景外侧；遇到边界或碰撞会提示你调整。
                              </p>
                            ) : (
                              <label>
                                节奏
                                <select
                                  value={current.pace}
                                  onChange={(e) =>
                                    controller.edit(
                                      state.suggestions.map((s) =>
                                        s.id === current.id
                                          ? {
                                              ...s,
                                              pace: SuggestionSchema.shape.pace.parse(
                                                e.target.value,
                                              ),
                                            }
                                          : s,
                                      ),
                                      true,
                                    )
                                  }
                                >
                                  <option value="slow">缓慢</option>
                                  <option value="natural">自然</option>
                                </select>
                              </label>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    className="dia-primary"
                    disabled={!state.suggestions.length}
                    onClick={() => void controller.preview()}
                  >
                    在舞台上试试
                  </button>
                </fieldset>
              </details>
              <details className="dia-secondary">
                <summary>选择原因（可选）</summary>
                <label>
                  留下一句记录
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={state.note}
                    onChange={(e) => controller.patch({ note: e.target.value })}
                  />
                </label>
              </details>
              {ghostId === proposal.proposalId && (
                <details className="dia-secondary">
                  <summary>预演控制</summary>
                  <GhostControls controller={controller} />
                </details>
              )}
              <div className="dia-actions">
                <button
                  className="dia-primary"
                  type="button"
                  disabled={
                    state.busy ||
                    settled ||
                    stale ||
                    readOnly ||
                    ghostId !== proposal.proposalId ||
                    !state.suggestions.length
                  }
                  onClick={() => void controller.adopt()}
                >
                  {state.suggestions.length === proposal.suggestions.length ? '采用' : '部分采用'}
                </button>
                <button
                  type="button"
                  disabled={state.busy || settled || stale || readOnly}
                  onClick={() => setEditingProposal(true)}
                >
                  修改
                </button>
                <button
                  type="button"
                  disabled={state.busy || settled}
                  onClick={() => void controller.reject()}
                >
                  放弃
                </button>
              </div>
              <details className="dia-secondary">
                <summary>分析与版本详情</summary>
                <p>参考置信度：{proposal.confidence}（非正确率）</p>
                <p>
                  模型：{proposal.modelVersion}
                  <br />
                  提示词：{proposal.promptVersion}
                  <br />
                  Ontology：{proposal.ontologyVersion}
                  <br />
                  舞台版本：{state.interaction.sceneVersion}
                  <br />
                  Proposal Revision：{proposal.revision?.revisionId ?? '原始方案'}
                </p>
                <p>ACTIVE Dimensions：{proposal.activeDimensions.join(' · ')}</p>
                <h4>当前站位与路线</h4>
                {state.interaction.inputContext.performers.map((p) => (
                  <p key={p.id}>
                    {p.name} · {p.position.map((v) => v.toFixed(2)).join(', ')} 米；路线{' '}
                    {state.interaction!.inputContext.paths.find((path) => path.performerId === p.id)
                      ?.points.length ?? 0}{' '}
                    个点
                  </p>
                ))}
                {state.interaction.dramaticState.map((s) => (
                  <dl key={s.character}>
                    <dt>人物</dt>
                    <dd>
                      {
                        state.interaction!.inputContext.performers.find((p) => p.id === s.character)
                          ?.name
                      }
                    </dd>
                    {(
                      [
                        'objective',
                        'relationship',
                        'action',
                        'tactic',
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
            </section>
          )}
        <details className="dia-secondary dia-settings">
          <summary>详情与设置</summary>
          <label>
            对话信息密度
            <select
              aria-label="对话模式"
              value={professional ? 'professional' : 'default'}
              onChange={(event) =>
                useSimulationSelection.setState({
                  professional: event.target.value === 'professional',
                })
              }
            >
              <option value="default">一起排</option>
              <option value="professional">专业排演</option>
            </select>
          </label>
          {state.synthetic && <p role="note">演示数据 · 非真实模型输出</p>}
          {state.ready && !state.synthetic && !modelConfigured && (
            <p role="note">本机舞台口令可用。开放式排演讨论尚未连接模型服务。</p>
          )}
          <details className="dia-context">
            <summary>{professional ? '剧本选段与导演意图' : '补充这一段（可选）'}</summary>
            <label>
              只粘贴本次讨论的剧本选段
              <textarea
                rows={4}
                maxLength={12000}
                value={state.script}
                onChange={(e) => controller.patch({ script: e.target.value })}
              />
            </label>
            <label>
              希望观众看到什么
              <textarea
                rows={2}
                maxLength={2000}
                value={state.directorIntention}
                onChange={(e) => controller.patch({ directorIntention: e.target.value })}
              />
            </label>
            <p>
              发送时只提供当前文字、人物与路线、布景边界和最近相关对话。正式舞台以你的手动操作为准。
            </p>
          </details>
          {professional && <SceneLayersPanel />}
          <nav className="dia-actions" aria-label="舞台版本与复台">
            <button type="button" onClick={() => openStudioPanel('versions')}>
              查看与保留版本
            </button>
            <button type="button" onClick={() => openStudioPanel('remount')}>
              把这一版带去复台
            </button>
          </nav>
          {state.synthetic && (
            <nav className="dia-demo-actions" aria-label="示例与自己的排演">
              <a href="/demo">重新开始示例</a>
              <a href="/">返回首页</a>
              <a href="/?entry=manual#stage-tools">开始自己的项目</a>
            </nav>
          )}
          <PhoneVoiceLink
            sceneId={sceneId}
            sceneLabel="Dia · 搭台到复台"
            storageKey={`dia:${sceneId}`}
            canLoad={false}
            onSessionChange={setSession}
            onTranscript={async (_command, report) => {
              await report('rejected', '请在手机 Dia 对话中发送排演想法；这里不会执行舞台口令。')
            }}
          />
          <details>
            <summary>私有记录与训练授权</summary>
            <p>
              对话、建议和选择保存在当前浏览器。训练授权默认关闭；将来还需确认内容权利，当前不上传或训练。
            </p>
            <label className="dia-choice">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  const value = e.target.checked
                  void privateAction(async () => {
                    await saveTrainingConsent(sceneId, value)
                    setConsent(value)
                    setPrivateNotice(
                      value
                        ? '只记录授权意向，内容权利尚未确认，不具备训练资格。'
                        : '已撤销训练授权。',
                    )
                  })
                }}
              />
              允许未来另行审核后的反馈用于训练
            </label>
            <div className="dia-actions">
              <button
                type="button"
                onClick={() =>
                  void privateAction(async () => {
                    const [feedback, conversation, events] = await Promise.all([
                      readFeedbackLog(sceneId),
                      readConversation(sceneId),
                      readProductEvents(sceneId),
                    ])
                    const url = URL.createObjectURL(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              feedback,
                              conversation,
                              events,
                              favorites: JSON.parse(
                                localStorage.getItem(`diastage:favorite-proposals:${sceneId}`) ??
                                  '[]',
                              ),
                            },
                            null,
                            2,
                          ),
                        ],
                        {
                          type: 'application/json',
                        },
                      ),
                    )
                    const link = document.createElement('a')
                    link.href = url
                    link.download = 'DiaStage-private-conversation.json'
                    link.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                    setPrivateNotice('已导出私有记录，包含原文，请自行保管。')
                  })
                }
              >
                导出本机记录
              </button>
              <button
                type="button"
                disabled={state.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      '删除当前场景在本机的对话和 AI 反馈？正式舞台保留。建议先导出备份。',
                    )
                  )
                    void privateAction(async () => {
                      controller.dispose()
                      await clearFeedbackLog(sceneId)
                      localStorage.removeItem(`diastage:favorite-proposals:${sceneId}`)
                      window.location.reload()
                    })
                }}
              >
                删除本机记录
              </button>
            </div>
            <p role="status">{privateNotice}</p>
          </details>
        </details>
      </div>
      <form
        className="dia-composer"
        onSubmit={(e) => {
          e.preventDefault()
          if (!voiceBusy) void controller.send()
        }}
      >
        <p role="status" aria-live="polite" data-dia-state={state.thread?.status ?? 'idle'}>
          {state.notice || '说说你想怎么调整。'}
        </p>
        <GhostFeedbackError />
        <details className="dia-input-examples" open>
          <summary>试着这样说</summary>
          <div className="dia-shortcut-rows">
            {SHORTCUTS.map(({ label, items }) => (
              <section key={label}>
                <strong>{label}</strong>
                <div className="dia-shortcuts">
                  {items.map((text) => (
                    <button
                      key={text}
                      type="button"
                      disabled={state.busy}
                      onClick={() =>
                        text === '我自己来'
                          ? controller.cancel('好的，继续手动排演。')
                          : controller.patch({ draft: text })
                      }
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>
        <label>
          <span className="sr-only">你想试什么？</span>
          <textarea
            aria-label="你想试什么？"
            rows={2}
            maxLength={2000}
            value={state.draft}
            placeholder="说说想调整的台位、关系或行动…"
            onChange={(e) => controller.patch({ draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (!voiceBusy) void controller.send()
              }
            }}
          />
        </label>
        <div className="dia-actions">
          <button
            className="dia-primary"
            type="submit"
            disabled={state.busy || voiceBusy || !state.ready || !state.draft.trim()}
          >
            发送
          </button>
          <button
            type="button"
            disabled={state.busy}
            aria-expanded={voice}
            onClick={() => setVoice(!voice)}
          >
            {voice ? '收起录音' : '说一句'}
          </button>
          {state.busy && (
            <button type="button" onClick={() => controller.cancel()}>
              停止
            </button>
          )}
        </div>
        {voice && (
          <div>
            <VoiceRecorder
              state={voiceState}
              setState={setVoiceState}
              onError={setVoiceError}
              onTranscript={(text) => {
                controller.patch({ draft: text.slice(0, 2000) })
                if (text.length > 2000) setVoiceError('已保留前 2000 字，请校对并精简后发送。')
              }}
            />
            <p>转写填入输入框，请校对后再发送给 Dia。</p>
            {voiceError && <p role="alert">{voiceError}</p>}
          </div>
        )}
      </form>
      <DiaRemoteBridge session={session} controller={controller} />
    </section>
  )
}
