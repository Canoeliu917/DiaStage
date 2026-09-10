'use client'

import { useEditor } from '@pascal-app/editor'
import { useCameraStudio } from '../camera-studio/store'
import { openStudioPanel } from '../studio-navigation'
import { useRehearsalPlayback } from './state'

export function ObservePanel() {
  const camera = useCameraStudio()
  return (
    <section className="theatre-panel" aria-label="观察">
      <h2>观察</h2>
      <p>从导演、观众或实体机位查看舞台画面。</p>
      <div className="th-buttons">
        {(['director', 'audience'] as const).map((id, i) => (
          <button
            type="button"
            key={id}
            onClick={() => {
              camera.stop()
              useEditor.getState().setViewMode('3d')
              useRehearsalPlayback.setState({ observation: id })
            }}
          >
            {['导演视点', '观众视点'][i]}
          </button>
        ))}
      </div>
      <label>
        摄影机
        <select
          value={camera.selectedShotId ?? ''}
          onChange={(e) => camera.selectShot(e.target.value)}
        >
          <option value="">选择机位</option>
          {camera.project.shots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!camera.selectedShotId || !camera.runtimeReady}
        onClick={() => camera.seek(0)}
      >
        从此机位观察
      </button>
      <button type="button" onClick={() => openStudioPanel('stage-cameras')}>
        摆放舞台镜头
      </button>
      <button type="button" onClick={() => useRehearsalPlayback.getState().play()}>
        播放模拟排演
      </button>
    </section>
  )
}

export function RecordPanel() {
  return (
    <section className="theatre-panel" aria-label="记录">
      <h2>记录</h2>
      <p>在下方选择机位与画幅，播放运镜或录制无声视频。录制完成后可回放与下载。</p>
      <button type="button" onClick={() => openStudioPanel('stage-cameras')}>
        设置机位与起止位置
      </button>
      <details>
        <summary>高级记录设置</summary>
        <p>记录自由观察过程、设置镜头序列或导出逐帧图片。</p>
        <button type="button" onClick={() => openStudioPanel('camera-rehearsal')}>
          打开高级记录
        </button>
      </details>
    </section>
  )
}
