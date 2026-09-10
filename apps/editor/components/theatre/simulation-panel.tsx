'use client'

import { useScene } from '@pascal-app/core'
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { commandMeta, executeStageCommands } from '@/lib/stage/command-executor'
import { stageDirection } from '@/lib/theatre/blocking'
import { VENUE_TEMPLATES, type Vec3 } from '@/lib/theatre/schema'
import type { StageSceneDocument } from '@/lib/theatre/simulation'
import { editStageDocument, readStageDocument } from '@/lib/theatre/simulation-store'
import { useRehearsalPlayback } from './state'
import './theatre.css'

export const useSimulationSelection = create<{
  selectedId: string | null
  input: 'select' | 'position' | 'route'
  points: Vec3[]
  showRoutes: boolean
}>(() => ({ selectedId: null, input: 'select', points: [], showRoutes: true }))

export function useStageDocument() {
  const nodes = useScene((s) => s.nodes),
    roots = useScene((s) => s.rootNodeIds)
  return useMemo(() => {
    try {
      return { document: readStageDocument(nodes, roots), error: '' }
    } catch (e) {
      return { document: null, error: e instanceof Error ? e.message : '空间资料读取失败' }
    }
  }, [nodes, roots])
}

export function placeSimulationPoint(point: Vec3) {
  const state = useSimulationSelection.getState()
  if (!state.selectedId || useScene.getState().readOnly) return
  if (state.input === 'route') useSimulationSelection.setState({ points: [...state.points, point] })
  else if (state.input === 'position') {
    editStageDocument((doc) => {
      const performer = doc.rehearsalSimulation.performers.find((p) => p.id === state.selectedId)
      if (performer) performer.position = point
    })
    useSimulationSelection.setState({ input: 'select' })
  }
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (n: number) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="0.1"
        value={value ?? ''}
        placeholder={value === null ? '未测量' : undefined}
        onChange={(e) => {
          if (Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber)
        }}
      />
    </label>
  )
}

export function VenuePanel() {
  const { document, error } = useStageDocument()
  const [notice, setNotice] = useState('')
  const readOnly = useScene((s) => s.readOnly)
  const heightMeasured = useScene(
    (state) =>
      state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')?.metadata
        .stageHeightMeasured !== false,
  )
  const change = (fn: (d: StageSceneDocument) => void) => {
    try {
      editStageDocument(fn)
      setNotice('')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '修改未完成')
    }
  }
  return (
    <section className="theatre-panel" aria-label="舞台与场地">
      <h2>舞台与场地</h2>
      <p>台左与台右以演员面向观众为准；台前靠近观众，台后远离观众。</p>
      <fieldset disabled={readOnly}>
        <div className="th-templates">
          {VENUE_TEMPLATES.map((t) => (
            <button
              key={t.type}
              type="button"
              aria-pressed={document?.venue.type === t.type}
              onClick={() =>
                change((d) => {
                  d.venue = { ...t, id: d.venue.id, origin: [...t.origin] }
                })
              }
            >
              {t.name}
            </button>
          ))}
        </div>
        {document && (
          <>
            <label>
              剧目名称
              <input
                value={document.production.name}
                onChange={(e) => {
                  if (e.target.value.trim())
                    change((d) => {
                      d.production.name = e.target.value
                    })
                }}
              />
            </label>
            <div className="th-grid">
              {(['width', 'depth', 'height'] as const).map((key, i) => (
                <NumberField
                  key={key}
                  label={['宽（米）', '深（米）', '实测净高（米）'][i]!}
                  value={key === 'height' && !heightMeasured ? null : document.venue[key]}
                  onChange={(value) => {
                    const result = executeStageCommands([
                      {
                        type: 'CreateStage',
                        meta: commandMeta(),
                        venue: {
                          type: document.venue.type === 'arena' ? 'other' : document.venue.type,
                          widthMeters: key === 'width' ? value : document.venue.width,
                          depthMeters: key === 'depth' ? value : document.venue.depth,
                          heightMeters:
                            key === 'height'
                              ? value
                              : heightMeasured
                                ? document.venue.height
                                : null,
                        },
                      },
                    ])
                    setNotice(result.error ?? '')
                  }}
                />
              ))}
            </div>
            <p>中心线经过舞台中央；台口线位于舞台前沿。</p>
            {!heightMeasured && <p>净高未测量，可继续置景；进入复台预览前必须补齐实测净高。</p>}
          </>
        )}
      </fieldset>
      {(error || notice) && <p role="alert">{error || notice}</p>}
    </section>
  )
}

export function SimulationPanel() {
  const { document, error } = useStageDocument()
  const ui = useSimulationSelection()
  const [notice, setNotice] = useState('')
  const readOnly = useScene((s) => s.readOnly)
  const simulation = document?.rehearsalSimulation
  const selected = simulation?.performers.find((p) => p.id === ui.selectedId)
  const route = simulation?.paths.find((p) => p.performerId === selected?.id)
  const change = (fn: (d: StageSceneDocument) => void) => {
    try {
      editStageDocument(fn)
      setNotice('')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '修改未完成')
    }
  }
  return (
    <section className="theatre-panel" aria-label="模拟排演">
      <h2>模拟排演</h2>
      <p>添加人物，设置站位与朝向，再在舞台上记录移动路线。</p>
      <fieldset disabled={readOnly}>
        <button
          type="button"
          onClick={() =>
            change((d) => {
              const id = crypto.randomUUID()
              d.rehearsalSimulation.performers.push({
                id,
                name: `人物 ${d.rehearsalSimulation.performers.length + 1}`,
                color: '#87b7ce',
                position: [...d.venue.origin],
                facing: 0,
                visible: true,
              })
              useSimulationSelection.setState({ selectedId: id })
            })
          }
        >
          添加人物标记
        </button>
        {simulation && (
          <label>
            选择人物
            <select
              value={selected?.id ?? ''}
              onChange={(e) =>
                useSimulationSelection.setState({ selectedId: e.target.value, input: 'select' })
              }
            >
              <option value="">选择舞台上的人物</option>
              {simulation.performers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && document && (
          <>
            <label>
              人物名称
              <input
                value={selected.name}
                onChange={(e) => {
                  if (e.target.value.trim())
                    change((d) => {
                      d.rehearsalSimulation.performers.find((p) => p.id === selected.id)!.name =
                        e.target.value
                    })
                }}
              />
            </label>
            <label>
              人物颜色
              <input
                type="color"
                value={selected.color}
                onChange={(e) =>
                  change((d) => {
                    d.rehearsalSimulation.performers.find((p) => p.id === selected.id)!.color =
                      e.target.value
                  })
                }
              />
            </label>
            <p>
              位置：{stageDirection(selected.position, document.venue)} ·{' '}
              {route ? '路线已记录' : '尚无路线'}
            </p>
            <div className="th-grid">
              {selected.position.map((value, axis) => (
                <NumberField
                  key={axis}
                  label={['左右（米）', '高度（米）', '前后（米）'][axis]!}
                  value={value}
                  onChange={(n) =>
                    change((d) => {
                      d.rehearsalSimulation.performers.find((p) => p.id === selected.id)!.position[
                        axis
                      ] = n
                    })
                  }
                />
              ))}
            </div>
            <NumberField
              label="朝向（度；0 为面向观众）"
              value={(selected.facing * 180) / Math.PI}
              onChange={(n) =>
                change((d) => {
                  d.rehearsalSimulation.performers.find((p) => p.id === selected.id)!.facing =
                    (n * Math.PI) / 180
                })
              }
            />
            <div className="th-buttons">
              <button
                type="button"
                onClick={() => useSimulationSelection.setState({ input: 'position' })}
              >
                在舞台上定位
              </button>
              <button
                type="button"
                onClick={() =>
                  useSimulationSelection.setState({
                    input: 'route',
                    points: [[...selected.position]],
                  })
                }
              >
                {route ? '重新记录路线' : '记录移动'}
              </button>
            </div>
            {ui.input === 'route' && (
              <>
                <p>依次点击舞台上的位置，已记录 {ui.points.length} 个点。</p>
                <button
                  type="button"
                  disabled={ui.points.length < 2}
                  onClick={() =>
                    change((d) => {
                      d.rehearsalSimulation.paths = d.rehearsalSimulation.paths.filter(
                        (p) => p.performerId !== selected.id,
                      )
                      d.rehearsalSimulation.paths.push({
                        id: crypto.randomUUID(),
                        performerId: selected.id,
                        points: ui.points,
                        durationSeconds: 6,
                        visible: true,
                      })
                      d.rehearsalSimulation.durationSeconds = Math.max(
                        6,
                        d.rehearsalSimulation.durationSeconds,
                      )
                      useSimulationSelection.setState({ input: 'select', points: [] })
                    })
                  }
                >
                  完成路线
                </button>
              </>
            )}
            {ui.input !== 'select' && (
              <button
                type="button"
                onClick={() => useSimulationSelection.setState({ input: 'select', points: [] })}
              >
                取消
              </button>
            )}
            {route && (
              <>
                <NumberField
                  label="路线时长（秒）"
                  value={route.durationSeconds}
                  onChange={(n) =>
                    change((d) => {
                      d.rehearsalSimulation.paths.find((p) => p.id === route.id)!.durationSeconds =
                        n
                      d.rehearsalSimulation.durationSeconds = Math.max(
                        n,
                        d.rehearsalSimulation.durationSeconds,
                      )
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    change((d) => {
                      d.rehearsalSimulation.paths = d.rehearsalSimulation.paths.filter(
                        (p) => p.id !== route.id,
                      )
                    })
                  }
                >
                  删除路线
                </button>
              </>
            )}
          </>
        )}
        <label>
          <input
            type="checkbox"
            checked={ui.showRoutes}
            onChange={(e) => useSimulationSelection.setState({ showRoutes: e.target.checked })}
          />
          显示人物路线
        </label>
      </fieldset>
      {readOnly && (
        <button type="button" onClick={() => useRehearsalPlayback.getState().stop()}>
          回到开始并继续编辑
        </button>
      )}
      {(error || notice) && <p role="alert">{error || notice}</p>}
    </section>
  )
}
