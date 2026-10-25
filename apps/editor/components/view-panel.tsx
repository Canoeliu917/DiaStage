'use client'

import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useState } from 'react'
import { readSavedViews, type ViewCommand } from '@/lib/rehearsal-intelligence/view-commands'
import { runViewCommand } from '@/lib/rehearsal-intelligence/view-runtime'

export function ViewPanel({ sceneId }: { sceneId: string }) {
  const [notice, setNotice] = useState('')
  const [viewName, setViewName] = useState('')
  const [savedViews, setSavedViews] = useState<ReturnType<typeof readSavedViews>>([])
  const refreshViews = useCallback(() => {
    try {
      setSavedViews(readSavedViews(sceneId, localStorage))
      setNotice('')
    } catch {
      setSavedViews([])
      setNotice('本机视角读取失败，请检查浏览器存储权限后重试。原有数据已保留。')
    }
  }, [sceneId])
  useEffect(() => {
    refreshViews()
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === `diastage:view-state:v1:${sceneId}`) refreshViews()
    }
    window.addEventListener('diastage:views-changed', refreshViews)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('diastage:views-changed', refreshViews)
      window.removeEventListener('storage', onStorage)
    }
  }, [refreshViews, sceneId])
  const run = (command: ViewCommand) => {
    try {
      setNotice(runViewCommand(sceneId, command))
    } catch {
      setNotice('视角操作未完成，请检查浏览器存储权限后重试。原有视角已保留。')
    }
  }
  const commands: [string, ViewCommand][] = [
    ['聚焦选中', { type: 'FRAME_SELECTION' }],
    ['俯视', { type: 'SET_VIEW', view: 'top' }],
    ['正面', { type: 'SET_VIEW', view: 'front' }],
    ['侧面', { type: 'SET_VIEW', view: 'stage-left' }],
    ['重置视图', { type: 'RESET_VIEW' }],
  ]
  return (
    <section className="theatre-panel" aria-label="视图">
      <h2>视图 / View</h2>
      <div className="th-buttons">
        <button
          type="button"
          onClick={() => {
            useEditor.getState().setViewMode('3d')
            useViewer.getState().setCameraMode('perspective')
          }}
        >
          透视
        </button>
        {commands.map(([label, command]) => (
          <button
            type="button"
            key={label}
            onClick={() => run(command)}
          >
            {label}
          </button>
        ))}
      </div>
      <p>中键环绕；Shift / Alt＋中键平移；滚轮缩放。WASD 移动视角，Q 下降，E 上升。</p>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h3>本机视角</h3>
        <button type="button" onClick={refreshViews}>
          刷新列表
        </button>
      </div>
      <p>视角保存在当前浏览器的此剧目中，也可以通过 Dia 保存和召回。</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (viewName.trim()) run({ type: 'SAVE_VIEW', name: viewName.trim() })
        }}
      >
        <label>
          视角名称
          <input
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            maxLength={40}
            required
            placeholder="例如：舞台全景"
          />
        </label>
        <button type="submit" disabled={!viewName.trim()}>
          保存当前视角
        </button>
      </form>
      {savedViews.length ? (
        <div className="th-buttons mt-3 flex-wrap" role="group" aria-label="已保存的本机视角">
          {savedViews.map(({ name }) => (
            <button
              key={name}
              type="button"
              className="max-w-full break-words"
              aria-label={`召回视角${name}`}
              onClick={() => run({ type: 'RECALL_CAMERA', name })}
            >
              {name}
            </button>
          ))}
        </div>
      ) : (
        <p>还没有可召回的本机视角。调整画面后，为当前视角命名并保存。</p>
      )}
      <p role="status">{notice}</p>
    </section>
  )
}
