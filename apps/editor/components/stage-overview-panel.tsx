'use client'

import { type AnyNodeId, emitter, getNodeLock, useScene } from '@pascal-app/core'
import { routeTreeSelectionToNode, useEditor, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  Crosshair,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  Search,
  Settings2,
} from 'lucide-react'
import { memo, useMemo, useState, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { commandMeta, executeStageCommands } from '@/lib/stage/command-executor'
import { useCameraStudio } from './camera-studio/store'
import { buildStageRows, getStageNodeSelection } from './stage-overview-data'
import { openStudioPanel } from './studio-navigation'
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
    ...rows.map((row) => ({
      ...row,
      kind: 'scenery',
      stageLocked: !!getNodeLock(nodes, row.id),
      inheritedLock: !!getNodeLock(nodes, row.id) && nodes[row.id]?.metadata.stageLocked !== true,
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
  function select(id: string, focus = false, properties = false) {
    if (locked()) return
    const node = useScene.getState().nodes[id as AnyNodeId]
    if (!node) return
    useEditor.getState().setMode('select')
    routeTreeSelectionToNode(node)
    useViewer.getState().setSelection(getStageNodeSelection(nodes, id))
    if (focus) emitter.emit('camera-controls:focus', { nodeId: node.id })
    if (properties) openStudioPanel('build')
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
          <colgroup>
            <col className="stage-overview-state-column" />
            <col />
            <col className="stage-overview-type-column" />
            <col className="stage-overview-action-column" />
            <col className="stage-overview-action-column" />
          </colgroup>
          <thead>
            <tr>
              <th>显示</th>
              <th>名称</th>
              <th>类型</th>
              <th>定位</th>
              <th>固定</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                data-selected={selection.selectedIds.includes(row.id as AnyNodeId)}
                onDoubleClick={(event) => {
                  const button = (event.target as HTMLElement).closest('button')
                  if (button && !button.classList.contains('stage-overview-name')) return
                  select(row.id, false, true)
                }}
              >
                <td>
                  <button
                    type="button"
                    disabled={busy || readOnly || row.stageLocked}
                    aria-label={`${row.visible ? '隐藏' : '显示'}${row.name}`}
                    onClick={() => {
                      try {
                        if (locked() || useScene.getState().readOnly) return
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
                    title="双击打开属性"
                    onClick={() => select(row.id)}
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
                    onClick={() => select(row.id, true)}
                  >
                    <Crosshair size={14} />
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`${row.stageLocked ? '解锁' : '固定'}${row.name}`}
                    aria-pressed={row.stageLocked}
                    title={
                      row.inheritedLock
                        ? '随上级固定，请先解锁上级对象'
                        : row.stageLocked
                          ? '解锁后可修改'
                          : '固定位置与属性，避免误触'
                    }
                    disabled={busy || readOnly || row.inheritedLock}
                    onClick={() => {
                      if (locked() || useScene.getState().readOnly) return
                      const result = executeStageCommands([
                        {
                          type: 'SetObjectLock',
                          nodeId: row.id,
                          locked: !row.stageLocked,
                          meta: commandMeta('manual'),
                        },
                      ])
                      setNotice(result.ok ? '' : (result.error ?? '固定状态未更新'))
                    }}
                  >
                    {row.stageLocked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="stage-overview-empty">暂无匹配对象。可在置景中添加布景。</p>
        )}
      </div>
      <footer className="stage-overview-footer">
        {visible.length} 个对象{notice && <span role="alert">{notice}</span>}
      </footer>
    </section>
  )
})
