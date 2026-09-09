'use client'

import { useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Camera, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { type CameraKeyframe, type Vec3, validateCameraProject } from './model'
import { newShot } from './presets'
import { useCameraStudio } from './store'
import './studio.css'

export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function VectorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: Vec3
  onChange: (v: Vec3) => void
}) {
  return (
    <fieldset className="cs-vector">
      <legend>{label}</legend>
      {value.map((v, i) => (
        <label key={['X', 'Y', 'Z'][i]}>
          <span>{['X', 'Y', 'Z'][i]}</span>
          <input
            aria-label={`${label} ${['X', 'Y', 'Z'][i]}`}
            type="number"
            step="0.05"
            value={Number(v.toFixed(3))}
            onChange={(e) => {
              if (!Number.isFinite(e.target.valueAsNumber)) return
              const next = [...value] as Vec3
              next[i] = e.target.valueAsNumber
              onChange(next)
            }}
          />
        </label>
      ))}
    </fieldset>
  )
}

export function CameraPanel() {
  const state = useCameraStudio()
  const nodes = useScene((s) => s.nodes)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    useEditor.getState().setMode('select')
  }, [])
  const shot = state.project.shots.find((s) => s.id === state.selectedShotId)
  const subjects = Object.values(nodes).filter((n) =>
    ['item', 'block', 'group', 'building'].includes(n.type),
  )
  const keyframe = shot?.keyframes.find((k) => k.id === state.selectedKeyframeId)
  const busy = state.playing || state.recording
  const patch = (values: Parameters<typeof state.updateShot>[1]) => {
    if (!shot || busy) return
    try {
      state.updateShot(shot.id, values)
    } catch (error) {
      useCameraStudio.setState({ notice: error instanceof Error ? error.message : '机位参数无效' })
    }
  }
  const updateKey = (values: Partial<CameraKeyframe>) => {
    if (shot && keyframe)
      patch({
        keyframes: shot.keyframes
          .map((k) => (k.id === keyframe.id ? { ...k, ...values } : k))
          .sort((a, b) => a.time - b.time),
      })
  }
  const capture = () => {
    if (!shot || busy) return
    const captured = state.captureCamera(state.time)
    if (!captured) return
    const existing = shot.keyframes.find((k) => Math.abs(k.time - captured.time) < 0.001)
    const next = { ...captured, id: existing?.id ?? captured.id }
    patch({
      keyframes: [...shot.keyframes.filter((k) => k.id !== next.id), next].sort(
        (a, b) => a.time - b.time,
      ),
    })
    state.selectKeyframe(next.id)
  }
  const followNodeId = shot?.follow?.nodeId ?? subjects[0]?.id ?? ''
  const monitorLabels = {
    off: '监看已关闭',
    waiting: '正在准备监看',
    live: '正在监看',
    paused: '监看已暂停',
    unavailable: '当前无法监看',
    error: '监看未完成',
  }
  return (
    <section className="cs-panel" aria-busy={state.recording}>
      <div className="cs-heading">
        <Camera size={20} />
        <div>
          <h2>机位</h2>
          <p>设置摄像机，安排连续运镜。</p>
        </div>
      </div>
      {!state.runtimeReady && (
        <button
          className="cs-button cs-wide"
          disabled={state.recording}
          onClick={() => {
            useEditor.getState().setViewMode('3d')
            useViewer.getState().setCameraMode('perspective')
          }}
        >
          切换到三维透视画面
        </button>
      )}
      {busy && (
        <p className="cs-help" role="status">
          {state.recording ? '视频录制完成后可继续调整机位。' : '暂停预演后可调整机位。'}
        </p>
      )}
      <fieldset className="min-w-0 border-0 p-0" disabled={busy}>
        <div className="cs-section-title">
          <h3>摄像机</h3>
          <button
            className="cs-button"
            aria-label="添加机位"
            disabled={!state.runtimeReady}
            onClick={() => {
              const current = useCameraStudio.getState()
              if (current.playing || current.recording) return
              const k = current.captureCamera(0)
              if (!k) {
                current.setNotice('请等待三维透视画面加载完成，再添加机位。')
                return
              }
              const s = newShot()
              s.keyframes = [k]
              current.addShot(s)
              current.focusStageCamera()
            }}
          >
            <Plus size={15} />
            添加机位
          </button>
        </div>
        <div className="cs-shots" role="group" aria-label="机位列表">
          {state.project.shots.map((s, i) => (
            <button
              key={s.id}
              aria-pressed={s.id === shot?.id}
              onClick={() => state.selectShot(s.id)}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{s.name}</strong>
              <small>{s.duration} 秒</small>
            </button>
          ))}
        </div>
        {!shot && <p className="cs-help">添加一个机位，从当前视角开始设置。</p>}
        {shot && (
          <>
            <label className="cs-field">
              机位名称
              <input
                aria-label="机位名称"
                maxLength={100}
                value={shot.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            <div className="cs-row">
              <button
                className="cs-button"
                disabled={!state.cameraUndo.length}
                onClick={state.undoCameraEdit}
              >
                撤销机位修改
              </button>
              <button
                className="cs-button"
                disabled={!state.cameraRedo.length}
                onClick={state.redoCameraEdit}
              >
                重做
              </button>
              <button
                className="cs-icon"
                aria-label="删除机位"
                title="删除机位"
                disabled={state.project.shots.length < 2}
                onClick={() => state.removeShot(shot.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <label className="cs-check">
              <input
                type="checkbox"
                checked={state.showStageCameras}
                onChange={(event) => state.setShowStageCameras(event.target.checked)}
              />
              显示舞台上的摄像机
            </label>
            <label className="cs-check">
              <input
                type="checkbox"
                checked={state.monitorVisible}
                onChange={(event) => state.setMonitorVisible(event.target.checked)}
              />
              打开独立监看
            </label>
            {state.monitorVisible && (
              <p className="cs-help" role="status">
                {state.monitorMessage || monitorLabels[state.monitorStatus]}
              </p>
            )}
            <div className="cs-row mt-4">
              <button
                className="cs-button"
                aria-pressed={state.stageTransformMode === 'translate'}
                disabled={
                  !(state.stageReady || state.floorplanReady) ||
                  !state.showStageCameras ||
                  !!shot.follow
                }
                onClick={() => state.setStageTransformMode('translate')}
              >
                移动摄像机
              </button>
              <button
                className="cs-button"
                aria-pressed={state.stageTransformMode === 'rotate'}
                disabled={
                  !(state.stageReady || state.floorplanReady) ||
                  !state.showStageCameras ||
                  !!shot.follow
                }
                onClick={() => state.setStageTransformMode('rotate')}
              >
                旋转摄像机
              </button>
              <button
                className="cs-button"
                disabled={!state.stageReady}
                onClick={state.focusStageCamera}
              >
                定位摄像机
              </button>
            </div>
            {shot.follow && (
              <p className="cs-help">正在跟随对象；关闭下方“目标跟随”后，可在舞台上拖动摄像机。</p>
            )}
            {keyframe && (
              <>
                <p className="cs-help">
                  正在编辑 {keyframe.time.toFixed(1)} 秒的关键帧，位置单位为米。
                </p>
                <VectorField
                  label="摄像机位置"
                  value={keyframe.position}
                  onChange={(position) => updateKey({ position })}
                />
                <VectorField
                  label="朝向：看向的位置"
                  value={keyframe.lookAt}
                  onChange={(lookAt) => updateKey({ lookAt })}
                />
                <label className="cs-field">
                  视角（FOV，度）
                  <input
                    aria-label="摄像机视角"
                    type="number"
                    min={10}
                    max={120}
                    value={keyframe.fov}
                    onChange={(event) => {
                      const fov = event.target.valueAsNumber
                      if (Number.isFinite(fov) && fov >= 10 && fov <= 120) updateKey({ fov })
                    }}
                  />
                </label>
                <div className="cs-row">
                  <button
                    className="cs-button"
                    disabled={!state.runtimeReady}
                    onClick={() => {
                      const captured = state.captureCamera(keyframe.time)
                      if (captured)
                        updateKey({
                          position: captured.position,
                          lookAt: captured.lookAt,
                          fov: captured.fov,
                        })
                    }}
                  >
                    从当前视角设置
                  </button>
                  <button
                    className="cs-button"
                    disabled={!state.runtimeReady}
                    onClick={() => state.seek(keyframe.time)}
                  >
                    在主画面查看
                  </button>
                </div>
              </>
            )}
            <div className="cs-section-title">
              <h3>运镜</h3>
              <span>{shot.keyframes.length} 个关键帧</span>
            </div>
            <label className="cs-field">
              运镜时长（秒）
              <input
                aria-label="机位时长"
                type="number"
                min={1}
                max={120}
                step={1}
                value={shot.duration}
                onChange={(event) => {
                  const duration = event.target.valueAsNumber
                  if (!Number.isFinite(duration) || duration < 1 || duration > 120) return
                  if (
                    shot.keyframes.some((key) => key.time > duration) ||
                    shot.motion?.keyframes.some((key) => key.time > duration)
                  ) {
                    useCameraStudio.setState({
                      notice: '时长不能短于最后一个关键帧；请先调整关键帧时间。',
                    })
                    return
                  }
                  patch({ duration })
                }}
              />
            </label>
            <div className="cs-keyframes" role="group" aria-label="运镜关键帧">
              {shot.keyframes.map((key) => (
                <button
                  key={key.id}
                  aria-pressed={state.selectedKeyframeId === key.id}
                  aria-label={`编辑 ${key.time.toFixed(1)} 秒关键帧`}
                  onClick={() => state.selectKeyframe(key.id)}
                >
                  {key.time.toFixed(1)} 秒
                </button>
              ))}
            </div>
            <button className="cs-button cs-wide" disabled={!state.runtimeReady} onClick={capture}>
              {shot.keyframes.some((key) => Math.abs(key.time - state.time) < 0.001)
                ? '更新此关键帧'
                : '添加关键帧'}{' '}
              · {state.time.toFixed(1)} 秒
            </button>
            <p className="cs-help">从当前视角保存。拖动底部时间线到新时间，即可添加下一帧。</p>
            {keyframe && (
              <>
                <label className="cs-field">
                  关键帧时间（秒）
                  <input
                    aria-label="关键帧时间"
                    type="number"
                    min={0}
                    max={shot.duration}
                    step={0.1}
                    value={keyframe.time}
                    onChange={(event) => {
                      const time = event.target.valueAsNumber
                      if (
                        Number.isFinite(time) &&
                        time >= 0 &&
                        time <= shot.duration &&
                        !shot.keyframes.some(
                          (key) => key.id !== keyframe.id && Math.abs(key.time - time) < 0.001,
                        )
                      )
                        updateKey({ time })
                    }}
                  />
                </label>
                <button
                  className="cs-link"
                  disabled={shot.keyframes.length < 2}
                  onClick={() =>
                    patch({ keyframes: shot.keyframes.filter((key) => key.id !== keyframe.id) })
                  }
                >
                  删除此关键帧
                </button>
              </>
            )}
            <h4 className="mt-6 text-xs font-semibold">目标跟随</h4>
            <label className="cs-field">
              跟随方式
              <select
                aria-label="跟随方式"
                value={shot.follow?.mode ?? 'path'}
                onChange={(e) =>
                  patch({
                    follow:
                      e.target.value === 'path'
                        ? null
                        : {
                            nodeId: followNodeId,
                            mode: e.target.value as 'lookAt' | 'offset',
                            offset: [2.4, 1.8, 3.2],
                            lookAtOffset: [0, 0.6, 0],
                          },
                  })
                }
              >
                <option value="path">按机位路径拍摄</option>
                <option value="lookAt" disabled={!subjects.length}>
                  沿路径移动，始终看向目标
                </option>
                <option value="offset" disabled={!subjects.length}>
                  与目标保持固定距离
                </option>
              </select>
            </label>
            {shot.follow && (
              <>
                <label className="cs-field">
                  跟随对象
                  <select
                    aria-label="跟随目标"
                    value={shot.follow.nodeId}
                    onChange={(e) =>
                      patch({ follow: { ...shot.follow!, nodeId: e.target.value }, motion: null })
                    }
                  >
                    {subjects.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name || n.id}
                      </option>
                    ))}
                  </select>
                </label>
                {shot.follow.mode === 'offset' && (
                  <VectorField
                    label="摄像机相对距离"
                    value={shot.follow.offset}
                    onChange={(offset) => patch({ follow: { ...shot.follow!, offset } })}
                  />
                )}
                <VectorField
                  label="目标取景偏移"
                  value={shot.follow.lookAtOffset}
                  onChange={(lookAtOffset) => patch({ follow: { ...shot.follow!, lookAtOffset } })}
                />
                <label className="cs-check">
                  <input
                    type="checkbox"
                    checked={!!shot.motion}
                    onChange={(e) => {
                      const n = nodes[shot.follow!.nodeId as keyof typeof nodes] as unknown as
                        | { position?: Vec3 }
                        | undefined
                      const p = n?.position ?? [0, 0, 0]
                      patch({
                        motion: e.target.checked
                          ? {
                              nodeId: shot.follow!.nodeId,
                              keyframes: [
                                { time: 0, position: [...p] as Vec3 },
                                { time: shot.duration, position: [p[0], p[1], p[2] - 1] },
                              ],
                            }
                          : null,
                      })
                    }}
                  />
                  让对象沿行动线移动
                </label>
                {shot.motion && (
                  <div className="cs-inset">
                    <p className="cs-help">
                      行动点相对于对象所在层级设置；只在预演中移动，停止后还原。
                    </p>
                    {shot.motion.keyframes.map((point, i) => (
                      <div className="cs-motion" key={i}>
                        <label className="cs-field">
                          行动点 {i + 1}
                          <input
                            aria-label={`行动点 ${i + 1} 时间`}
                            type="number"
                            min={0}
                            max={shot.duration}
                            step={0.1}
                            value={point.time}
                            onChange={(e) => {
                              const time = e.target.valueAsNumber
                              if (
                                !Number.isFinite(time) ||
                                time < 0 ||
                                time > shot.duration ||
                                shot.motion!.keyframes.some(
                                  (p, j) => j !== i && Math.abs(p.time - time) < 0.001,
                                )
                              )
                                return
                              patch({
                                motion: {
                                  ...shot.motion!,
                                  keyframes: shot
                                    .motion!.keyframes.map((p, j) => (j === i ? { ...p, time } : p))
                                    .sort((a, b) => a.time - b.time),
                                },
                              })
                            }}
                          />
                        </label>
                        <VectorField
                          label={`行动点 ${i + 1}`}
                          value={point.position}
                          onChange={(position) =>
                            patch({
                              motion: {
                                ...shot.motion!,
                                keyframes: shot.motion!.keyframes.map((p, j) =>
                                  j === i ? { ...p, position } : p,
                                ),
                              },
                            })
                          }
                        />
                        {shot.motion!.keyframes.length > 2 && (
                          <button
                            className="cs-link"
                            onClick={() =>
                              patch({
                                motion: {
                                  ...shot.motion!,
                                  keyframes: shot.motion!.keyframes.filter((_, j) => j !== i),
                                },
                              })
                            }
                          >
                            删除行动点
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      className="cs-button cs-wide"
                      onClick={() => {
                        const points = shot.motion!.keyframes
                        const intervals = points
                          .slice(1)
                          .map((p, i) => ({ i, gap: p.time - points[i]!.time }))
                          .sort((a, b) => b.gap - a.gap)
                        const interval = intervals[0]
                        if (!interval || interval.gap < 0.02) return
                        const a = points[interval.i],
                          b = points[interval.i + 1]
                        if (!a || !b) return
                        patch({
                          motion: {
                            ...shot.motion!,
                            keyframes: [
                              ...points,
                              {
                                time: (a.time + b.time) / 2,
                                position: a.position.map(
                                  (v, i) => (v + b.position[i]!) / 2,
                                ) as Vec3,
                              },
                            ].sort((a, b) => a.time - b.time),
                          },
                        })
                      }}
                    >
                      插入行动点
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </fieldset>
      <div className="cs-section-title">
        <h3>工程文件</h3>
        <span>自动保存在此浏览器</span>
      </div>
      <div className="cs-row">
        <button
          className="cs-button"
          onClick={() =>
            downloadFile(
              new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }),
              '咫台-机位工程.json',
            )
          }
        >
          导出机位工程
        </button>
        <button className="cs-button" disabled={busy} onClick={() => inputRef.current?.click()}>
          导入机位工程
        </button>
      </div>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            if (file.size > 2_000_000) throw new Error('机位工程不能超过 2 MB')
            const project = validateCameraProject(JSON.parse(await file.text()))
            if (useCameraStudio.getState().recording || useCameraStudio.getState().playing) {
              throw new Error('请先停止预演或录制，再导入机位工程。')
            }
            state.setProject(project)
          } catch (error) {
            useCameraStudio.setState({
              notice: error instanceof Error ? error.message : '机位工程读取失败',
            })
          }
        }}
      />
      <p className="cs-help">
        工程文件包含机位和运镜，不包含舞台模型。请与对应的场景文件一起备份。
      </p>
    </section>
  )
}
