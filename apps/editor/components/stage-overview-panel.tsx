'use client'

import { type AnyNodeId, emitter, useScene } from '@pascal-app/core'
import { routeTreeSelectionToNode, useEditor, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Crosshair, Eye, EyeOff, Search, Settings2 } from 'lucide-react'
import { memo, useMemo, useState, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { editStageDocument } from '@/lib/theatre/simulation-store'
import { useCameraStudio } from './camera-studio/store'
import { buildStageRows, getStageNodeSelection } from './stage-overview-data'
import { openStudioPanel } from './studio-navigation'
import { useSimulationSelection, useStageDocument } from './theatre/simulation-panel'
import './stage-overview.css'
import { getCameraDirectorState, subscribeCameraDirector } from '@/lib/camera-director'

export const StageOverviewPanel = memo(function StageOverviewPanel({
  sceneId,
}: {
  sceneId: string
}) {
  const nodes = useScene((s) => s.nodes)
  const readOnly = useScene((s) => s.readOnly)
  const selection = useViewer((s) => s.selection)
  const camera = useCameraStudio(
    useShallow((s) => ({
      project: s.project,
      showStageCameras: s.showStageCameras,
      recording: s.recording,
      playing: s.playing,
      previewing: s.previewing,
      selectShot: s.selectShot,
      focusStageCamera: s.focusStageCamera,
      setShowStageCameras: s.setShowStageCameras,
    })),
  )
  const { document } = useStageDocument()
  const exclusive = useEditor((s) => s.isCaptureMode || s.isFirstPersonMode)
  const interactionBusy = useInteractionScope((s) => s.scope.kind !== 'idle')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const rows = useMemo(() => buildStageRows(nodes), [nodes])
  const directorBusy = useSyncExternalStore(
    (listener) => subscribeCameraDirector(sceneId, listener),
    () => getCameraDirectorState(sceneId).transport.status !== 'idle',
    () => false,
  )
  const busy =
    directorBusy ||
    exclusive ||
    interactionBusy ||
    camera.recording ||
    camera.playing ||
    camera.previewing
  const objects = [
    ...rows.map((row) => ({ ...row, kind: 'scenery' })),
    ...(document?.rehearsalSimulation.performers ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      kind: 'performer',
      typeLabel: '人物',
      parentLabel: '模拟排演',
      visible: p.visible,
      effectiveVisible: p.visible,
    })),
    ...camera.project.shots.map((s) => ({
      id: s.id,
      name: s.name,
      kind: 'camera',
      typeLabel: '摄影机',
      parentLabel: '舞台镜头',
      visible: camera.showStageCameras,
      effectiveVisible: camera.showStageCameras,
    })),
  ]
  const visible = objects.filter(
    (row) =>
      (filter === 'all' || filter === row.kind) &&
      (row.name + row.typeLabel).toLowerCase().includes(query.trim().toLowerCase()),
  )
  function locked() {
    const editor = useEditor.getState(),
      camera = useCameraStudio.getState()
    return (
      editor.isCaptureMode ||
      editor.isFirstPersonMode ||
      camera.playing ||
      camera.previewing ||
      camera.recording ||
      useInteractionScope.getState().scope.kind !== 'idle' ||
      getCameraDirectorState(sceneId).transport.status !== 'idle'
    )
  }
  function select(id: string, kind: string, focus = false) {
    if (locked()) return
    if (kind === 'camera') {
      openStudioPanel('stage-cameras')
      camera.selectShot(id)
      if (focus) camera.focusStageCamera()
      return
    }
    if (kind === 'performer') {
      openStudioPanel('simulation')
      useSimulationSelection.setState({ selectedId: id })
      return
    }
    const node = useScene.getState().nodes[id as AnyNodeId]
    if (!node) return
    useEditor.getState().setMode('select')
    routeTreeSelectionToNode(node)
    useViewer.getState().setSelection(getStageNodeSelection(nodes, id))
    if (focus) emitter.emit('camera-controls:focus', { nodeId: node.id })
  }
  return (
    <section className="stage-overview" aria-label="舞台总览" data-scene-id={sceneId}>
      <header className="stage-overview-heading">
        <div>
          <h2>舞台总览</h2>
          <button
            type="button"
            aria-label="舞台与场地设置"
            disabled={busy}
            onClick={() => openStudioPanel('theatre-venue')}
          >
            <Settings2 size={17} />
          </button>
        </div>
        <label className="stage-overview-search">
          <Search size={15} />
          <input
            type="search"
            aria-label="搜索舞台对象"
            placeholder="搜索名称或类型"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="stage-overview-filters" role="group" aria-label="对象类型筛选">
          {[
            ['all', '全部'],
            ['scenery', '布景'],
            ['performer', '人物'],
            ['camera', '摄影机'],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id!)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="stage-overview-scroll">
        <table aria-label="舞台对象列表">
          <thead>
            <tr>
              <th>显示</th>
              <th>名称</th>
              <th>类型</th>
              <th>定位</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} data-selected={selection.selectedIds.includes(row.id as AnyNodeId)}>
                <td>
                  <button
                    type="button"
                    disabled={busy || readOnly}
                    aria-label={`${row.visible ? '隐藏' : '显示'}${row.name}`}
                    onClick={() => {
                      try {
                        if (locked() || useScene.getState().readOnly) return
                        if (row.kind === 'camera')
                          camera.setShowStageCameras(!camera.showStageCameras)
                        else if (row.kind === 'performer')
                          editStageDocument((d) => {
                            d.rehearsalSimulation.performers.find((p) => p.id === row.id)!.visible =
                              !row.visible
                          })
                        else
                          useScene
                            .getState()
                            .updateNode(row.id as AnyNodeId, { visible: !row.visible })
                        setNotice('')
                      } catch (e) {
                        setNotice(e instanceof Error ? e.message : '修改未完成')
                      }
                    }}
                  >
                    {row.effectiveVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </td>
                <td>
                  <button
                    className="stage-overview-name"
                    type="button"
                    disabled={busy}
                    onClick={() => select(row.id, row.kind)}
                  >
                    <span>{row.name}</span>
                    <small>
                      {row.visible
                        ? row.effectiveVisible
                          ? row.parentLabel
                          : '随上级隐藏'
                        : '已隐藏'}
                    </small>
                  </button>
                </td>
                <td>{row.typeLabel}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`定位${row.name}`}
                    disabled={busy}
                    onClick={() => select(row.id, row.kind, true)}
                  >
                    <Crosshair size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="stage-overview-empty">暂无匹配对象。可在置景中添加布景或摄影机。</p>
        )}
      </div>
      <footer className="stage-overview-footer">
        {visible.length} 个对象{notice && <span role="alert">{notice}</span>}
      </footer>
    </section>
  )
})
