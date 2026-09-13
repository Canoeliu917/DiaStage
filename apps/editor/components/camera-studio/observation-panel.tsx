'use client'

import { useEditor } from '@pascal-app/editor'
import { useEffect } from 'react'
import { newShot } from './presets'
import { useCameraStudio } from './store'
import './studio.css'

export function CameraObservationPanel() {
  const state = useCameraStudio()
  const shot = state.project.shots.find((entry) => entry.id === state.selectedShotId)
  const busy = state.previewing || state.playing || state.recording
  useEffect(() => {
    useEditor.getState().setMode('select')
  }, [])
  return (
    <section className="cs-panel" aria-label="舞台机位">
      <div className="cs-heading">
        <div>
          <h2>舞台机位</h2>
          <p>保存当前观察位置，随时召回。</p>
        </div>
      </div>
      <button
        className="cs-button cs-wide"
        disabled={!state.runtimeReady || busy}
        onClick={() => {
          const frame = state.captureCamera(0)
          if (!frame) return
          state.addShot({
            ...newShot(),
            name: `机位 ${state.project.shots.length + 1}`,
            keyframes: [frame],
          })
        }}
      >
        保存当前机位
      </button>
      <div className="cs-shots" role="group" aria-label="机位列表">
        {state.project.shots.map((entry, index) => (
          <button
            key={entry.id}
            aria-pressed={entry.id === shot?.id}
            onClick={() => state.selectShot(entry.id)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{entry.name}</strong>
            <small>{entry.stageLocked ? '已固定' : ''}</small>
          </button>
        ))}
      </div>
      {shot && (
        <>
          <label className="cs-field">
            机位名称
            <input
              aria-label="机位名称"
              maxLength={100}
              value={shot.name}
              disabled={busy || shot.stageLocked}
              onChange={(event) => state.updateShot(shot.id, { name: event.target.value })}
            />
          </label>
          <div className="cs-row">
            <button
              className="cs-button"
              disabled={!state.runtimeReady}
              onClick={() => state.seek(0)}
            >
              从此机位观察
            </button>
            <button className="cs-button" onClick={state.stop} disabled={!state.previewing}>
              返回自由观察
            </button>
          </div>
          <div className="cs-row">
            <button
              className="cs-button"
              aria-pressed={!!shot.stageLocked}
              disabled={busy}
              onClick={() => state.updateShot(shot.id, { stageLocked: !shot.stageLocked })}
            >
              {shot.stageLocked ? '解除固定' : '固定机位'}
            </button>
            <button
              className="cs-button"
              disabled={busy || shot.stageLocked}
              onClick={() => state.removeShot(shot.id)}
            >
              删除机位
            </button>
          </div>
          <div className="cs-row">
            <button
              className="cs-button"
              disabled={busy || shot.stageLocked || !(state.stageReady || state.floorplanReady)}
              aria-pressed={state.stageTransformMode === 'translate'}
              onClick={() => state.setStageTransformMode('translate')}
            >
              移动机位
            </button>
            <button
              className="cs-button"
              disabled={busy || shot.stageLocked || !(state.stageReady || state.floorplanReady)}
              aria-pressed={state.stageTransformMode === 'rotate'}
              onClick={() => state.setStageTransformMode('rotate')}
            >
              调整朝向
            </button>
          </div>
        </>
      )}
      <label className="cs-check">
        <input
          type="checkbox"
          checked={state.showStageCameras}
          onChange={(event) => state.setShowStageCameras(event.target.checked)}
        />
        显示舞台机位
      </label>
      <label className="cs-check">
        <input
          type="checkbox"
          checked={state.monitorVisible}
          onChange={(event) => state.setMonitorVisible(event.target.checked)}
        />
        独立监看
      </label>
      {state.notice && (
        <p role="status" className="cs-help">
          {state.notice}
        </p>
      )}
    </section>
  )
}
