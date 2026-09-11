'use client'

import { useScene } from '@pascal-app/core'
import { useEffect, useMemo, useState } from 'react'
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
import { PhoneVoiceLink } from '../stage-entry/phone-voice-link'
import { DiaRemoteBridge } from './dia-remote-bridge'
import { useSimulationSelection } from './simulation-panel'
import { useRehearsalPlayback } from './state'
import './dia-conversation.css'

const MOVEMENT = {
  hold: '保持位置',
  approach: '靠近对方',
  withdraw: '拉开距离',
  'toward-zone': '走向舞台区域',
}
const ZONES = {
  center: '中区',
  'stage-left': '台左',
  'stage-right': '台右',
  upstage: '台后',
  downstage: '台前',
}
const SHORTCUTS = [
  '帮我看看这一段',
  '给我两个排法',
  '这个人物还能怎么做',
  '为什么这样排',
  '换一种',
  '我自己来',
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
    () => new DiaConversation(sceneId, () => useSimulationSelection.getState().selectedId),
    [sceneId],
  )
  const state = useStore(controller.store)
  const professional = useSimulationSelection((s) => s.professional)
  const readOnly = useScene((s) => s.readOnly)
  const ghostId = useProposalGhost((s) => s.proposalId)
  const [consent, setConsent] = useState(false)
  const [privateNotice, setPrivateNotice] = useState('')
  const [session, setSession] = useState<CreatedRemoteVoiceSession | null>(null)
  const proposal = controller.proposal()
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
        <div>
          <h2>Dia</h2>
          <p>你说戏，我看舞台。</p>
        </div>
        <label>
          <span className="sr-only">对话信息密度</span>
          <select
            aria-label="对话模式"
            value={professional ? 'professional' : 'default'}
            onChange={(e) =>
              useSimulationSelection.setState({ professional: e.target.value === 'professional' })
            }
          >
            <option value="default">一起排</option>
            <option value="professional">专业排演</option>
          </select>
        </label>
      </header>
      {state.synthetic && (
        <p className="dia-synthetic" role="note">
          演示数据 · 非真实模型输出
        </p>
      )}
      {state.ready && !state.synthetic && !modelConfigured && (
        <p className="dia-synthetic" role="note">
          Dia 当前未连接模型服务，你仍可以使用手动排演。
        </p>
      )}
      <div className="dia-dialogue" role="log" aria-label="本场对话记录">
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
        {state.thread?.messages.map((message) => (
          <article className={`dia-message dia-message-${message.role}`} key={message.messageId}>
            <strong>
              {message.role === 'user' ? '你' : message.role === 'dia' ? 'Dia' : '舞台记录'}
            </strong>
            <p>{message.content}</p>
          </article>
        ))}
        {state.interaction && (
          <div className="dia-proposals" role="group" aria-label="本轮方案">
            {state.interaction.proposals.map((entry, index) => (
              <article
                className="dia-proposal"
                key={entry.proposalId}
                data-selected={entry.proposalId === state.thread?.selectedProposalId}
              >
                <h3>
                  方案 {String(index + 1).padStart(2, '0')} · {entry.title}
                </h3>
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
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>为什么？</summary>
                  <p>{entry.rationale}</p>
                  {entry.evidence.map((e, i) => (
                    <blockquote key={`${e.source}-${i}`}>{e.quote.slice(0, 120)}</blockquote>
                  ))}
                  {entry.alternatives.map((alternative) => (
                    <p key={alternative}>{alternative}</p>
                  ))}
                </details>
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
              </article>
            ))}
            <button
              type="button"
              disabled={state.busy}
              onClick={() => void controller.send('换几个有不同处理的方向')}
            >
              换几个方向
            </button>
          </div>
        )}
        {proposal && state.interaction && (
          <section className="dia-decision" aria-label="预演与决定">
            <h3>你的决定</h3>
            <p>{proposal.title}</p>
            <details>
              <summary>选一部分，或修改行动</summary>
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
                            移动方式
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
                                            zone: SuggestionSchema.shape.zone.parse(e.target.value),
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
                          <label>
                            幅度
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
                              <option value="small">小一些（最多0.6米）</option>
                              <option value="medium">大一些（最多1.2米）</option>
                            </select>
                          </label>
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
                                          pace: SuggestionSchema.shape.pace.parse(e.target.value),
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
                        </>
                      )}
                    </div>
                  )
                })}
                <button
                  type="button"
                  disabled={!state.suggestions.length}
                  onClick={() => void controller.preview()}
                >
                  重新预演调整
                </button>
              </fieldset>
            </details>
            <label>
              这次选择的原因（可选）
              <textarea
                rows={2}
                maxLength={1000}
                value={state.note}
                onChange={(e) => controller.patch({ note: e.target.value })}
              />
            </label>
            {ghostId === proposal.proposalId && <GhostControls controller={controller} />}
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
                {state.editing
                  ? '调整后采用'
                  : state.suggestions.length === proposal.suggestions.length
                    ? '采用'
                    : '采用一部分'}
              </button>
              <button
                type="button"
                disabled={state.busy || settled}
                onClick={() => void controller.reject()}
              >
                不成立
              </button>
            </div>
            {professional && (
              <details>
                <summary>专业分析与版本信息</summary>
                <p>Confidence：{proposal.confidence}（模型自评，非正确率）</p>
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
            )}
          </section>
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
        <PhoneVoiceLink
          sceneId={sceneId}
          sceneLabel="Dia 排演对话"
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
                    new Blob([JSON.stringify({ feedback, conversation, events }, null, 2)], {
                      type: 'application/json',
                    }),
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
                    window.location.reload()
                  })
              }}
            >
              删除本机记录
            </button>
          </div>
          <p role="status">{privateNotice}</p>
        </details>
      </div>
      <form
        className="dia-composer"
        onSubmit={(e) => {
          e.preventDefault()
          void controller.send()
        }}
      >
        <p role="status" aria-live="polite" data-dia-state={state.thread?.status ?? 'idle'}>
          {state.notice || '你的舞台，你来决定。'}
        </p>
        <GhostFeedbackError />
        <div className="dia-shortcuts">
          {SHORTCUTS.map((text) => (
            <button
              key={text}
              type="button"
              disabled={state.busy}
              onClick={() =>
                text === '我自己来'
                  ? controller.cancel('好的，继续手动排演。想讨论时再来找我。')
                  : controller.patch({ draft: text })
              }
            >
              {text}
            </button>
          ))}
        </div>
        <label>
          <span className="sr-only">你想试什么？</span>
          <textarea
            aria-label="你想试什么？"
            rows={2}
            maxLength={2000}
            value={state.draft}
            placeholder="比如：这场太平了，我想让他们之间更紧张一点。"
            onChange={(e) => controller.patch({ draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void controller.send()
              }
            }}
          />
        </label>
        <div className="dia-actions">
          <button
            className="dia-primary"
            type="submit"
            disabled={state.busy || !state.ready || !state.draft.trim()}
          >
            发送
          </button>
          {state.busy && (
            <button type="button" onClick={() => controller.cancel()}>
              停止
            </button>
          )}
        </div>
      </form>
      <DiaRemoteBridge session={session} controller={controller} />
    </section>
  )
}
