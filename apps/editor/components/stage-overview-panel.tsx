'use client'

import { type AnyNodeId, emitter, useInteractive, useScene } from '@pascal-app/core'
import {
  routeTreeSelectionToNode,
  SitePanel,
  useEditor,
  useInteractionScope,
} from '@pascal-app/editor'
import { getSceneTheme, useViewer } from '@pascal-app/viewer'
import {
  ArrowLeft,
  Box,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Lightbulb,
  Search,
  Settings2,
  Sun,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { getCameraDirectorState, useCameraDirectorState } from '@/lib/camera-director'
import { useCameraStudio } from './camera-studio/store'
import { useLighting } from './lighting/store'
import { buildStageRows, getStageNodeSelection } from './stage-overview-data'
import { openStudioPanel } from './studio-navigation'
import './stage-overview.css'

export function StageOverviewPanel({ sceneId }: { sceneId: string }) {
  const nodes = useScene((state) => state.nodes)
  const readOnly = useScene((state) => state.readOnly)
  const selection = useViewer((state) => state.selection)
  const sceneTheme = useViewer((state) => state.sceneTheme)
  const shadows = useViewer((state) => state.shadows)
  const shading = useViewer((state) => state.shading)
  const interactiveItems = useInteractive((state) => state.items)
  const lighting = useLighting()
  const cameraBusy = useCameraStudio(
    (state) => state.recording || state.playing || state.previewing,
  )
  const directorBusy = useCameraDirectorState(sceneId).transport.status !== 'idle'
  const interactionBusy = useInteractionScope((state) => state.scope.kind !== 'idle')
  const exclusive = useEditor((state) => state.isCaptureMode || state.isFirstPersonMode)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [settings, setSettings] = useState(false)
  const [selectedLight, setSelectedLight] = useState<string | null>(null)
  const rows = useMemo(() => buildStageRows(nodes), [nodes])
  const lights = lighting.loadedSceneId === sceneId ? lighting.project.lights : []
  const theme = getSceneTheme(sceneTheme)
  const busy = cameraBusy || directorBusy || interactionBusy || exclusive
  const needle = query.trim().toLocaleLowerCase()
  const matches = (...values: string[]) => values.join(' ').toLocaleLowerCase().includes(needle)
  const presets = [
    ...theme.lights.map((light, index) => ({
      id: `directional-${index}`,
      name: `环境${light.castShadow ? '主光' : '补光'} ${index + 1}`,
      type: '方向光',
      detail: `强度 ${light.intensity} · ${light.castShadow && shadows ? '投影开启' : '无投影'}`,
    })),
    {
      id: 'ambient',
      name: '基础环境光',
      type: '环境光',
      detail: `强度 ${theme.ambient.intensity}`,
    },
    ...(theme.hemi
      ? [
          {
            id: 'hemisphere',
            name: '天空与地面补光',
            type: '半球光',
            detail: `强度 ${theme.hemi.intensity}`,
          },
        ]
      : []),
    {
      id: 'environment',
      name: '天空环境反射',
      type: '环境反射',
      detail: shading === 'rendered' ? '渲染着色中生效' : '实体着色中不生效',
    },
  ]
  const visiblePresets =
    filter !== 'objects' ? presets.filter((row) => matches(row.name, row.type, '预设灯光')) : []
  const visibleLights =
    filter !== 'objects' ? lights.filter((row) => matches(row.name, '聚光灯 布光')) : []
  const visibleNodes = rows.filter(
    (row) =>
      (filter === 'all' || (filter === 'lights' ? row.kind === 'light' : row.kind !== 'light')) &&
      matches(row.name, row.typeLabel, row.parentLabel),
  )
  const total = rows.length + lights.length + presets.length
  const shown = visibleNodes.length + visibleLights.length + visiblePresets.length

  function canAct() {
    const camera = useCameraStudio.getState()
    const editor = useEditor.getState()
    return (
      !camera.recording &&
      !camera.playing &&
      !camera.previewing &&
      getCameraDirectorState(sceneId).transport.status === 'idle' &&
      !editor.isCaptureMode &&
      !editor.isFirstPersonMode &&
      useInteractionScope.getState().scope.kind === 'idle'
    )
  }

  function selectNode(id: AnyNodeId, focus = false) {
    if (!canAct()) return
    const currentNodes = useScene.getState().nodes
    const node = currentNodes[id]
    if (!node) return
    setSelectedLight(null)
    useEditor.getState().setMode('select')
    routeTreeSelectionToNode(node)
    if (node.type === 'site') useEditor.getState().setPhase('site')
    useViewer.getState().setSelection(getStageNodeSelection(currentNodes, id))
    if (focus) emitter.emit('camera-controls:focus', { nodeId: id })
  }

  function toggleNode(id: AnyNodeId) {
    const scene = useScene.getState()
    const node = scene.nodes[id]
    if (!node || scene.readOnly || !canAct()) return
    scene.updateNode(id, { visible: node.visible === false })
  }

  function editLight(id: string) {
    if (!canAct() || useLighting.getState().loadedSceneId !== sceneId) return
    if (openStudioPanel('picture')) useLighting.getState().selectLight(id)
  }

  function editEnvironment() {
    if (canAct()) openStudioPanel('picture')
  }

  if (settings)
    return (
      <section className="stage-overview" aria-label="场地与楼层设置">
        <header className="stage-overview-heading">
          <button type="button" onClick={() => setSettings(false)}>
            <ArrowLeft size={16} />
            返回总览
          </button>
          <h2>场地与楼层</h2>
        </header>
        <div className="stage-overview-settings" inert={busy}>
          <SitePanel />
        </div>
      </section>
    )

  return (
    <section className="stage-overview" aria-label="舞台总览">
      <header className="stage-overview-heading">
        <div>
          <h2>舞台总览</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSettings(true)}
            title="场地与楼层设置"
            aria-label="场地与楼层设置"
          >
            <Settings2 size={17} />
          </button>
        </div>
        <label className="stage-overview-search">
          <Search size={15} />
          <input
            type="search"
            aria-label="搜索舞台对象"
            placeholder="搜索名称、类型或所属位置"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="stage-overview-filters" role="group" aria-label="对象类型筛选">
          {(
            [
              ['all', '全部'],
              ['objects', '场景物件'],
              ['lights', '灯光'],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
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
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">状态</span>
                <Eye size={14} />
              </th>
              <th scope="col">名称 / 所属位置</th>
              <th scope="col">类型</th>
              <th scope="col">
                <span className="sr-only">定位或设置</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiblePresets.map((row) => (
              <tr key={row.id}>
                <td>
                  <Sun size={15} aria-label="环境预设" />
                </td>
                <td>
                  <button
                    className="stage-overview-name"
                    type="button"
                    disabled={busy}
                    onClick={editEnvironment}
                    title={`${row.name} · 当前环境预设 · ${row.detail}`}
                  >
                    <span>{row.name}</span>
                    <small>环境预设 · {row.detail}</small>
                  </button>
                </td>
                <td>{row.type}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`设置${row.name}`}
                    title="打开环境设置"
                    disabled={busy}
                    onClick={editEnvironment}
                  >
                    <Settings2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {visibleLights.map((light) => (
              <tr key={`light-${light.id}`} data-selected={selectedLight === light.id}>
                <td>
                  <button
                    type="button"
                    disabled={busy || readOnly || !!lighting.draft || lighting.persistenceBlocked}
                    aria-label={`${light.enabled ? '关闭' : '开启'}${light.name}`}
                    aria-pressed={light.enabled}
                    title={light.enabled ? '关闭灯光' : '开启灯光'}
                    onClick={() => {
                      const state = useLighting.getState()
                      const current = state.project.lights.find((entry) => entry.id === light.id)
                      if (
                        canAct() &&
                        !useScene.getState().readOnly &&
                        state.loadedSceneId === sceneId &&
                        !state.persistenceBlocked &&
                        !state.draft &&
                        current
                      )
                        state.updateLight(current.id, { enabled: !current.enabled })
                    }}
                  >
                    {light.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </td>
                <td>
                  <button
                    className="stage-overview-name"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!canAct() || useLighting.getState().loadedSceneId !== sceneId) return
                      setSelectedLight(light.id)
                      useLighting.getState().selectLight(light.id)
                      useViewer.getState().setSelection({ selectedIds: [] })
                    }}
                    onDoubleClick={() => editLight(light.id)}
                    title={`${light.name} · 灯位 ${light.position.join(', ')} 米`}
                  >
                    <span>
                      <Lightbulb size={13} />
                      {light.name}
                    </span>
                    <small>布光 · {light.enabled ? '已开启' : '已关闭'}</small>
                  </button>
                </td>
                <td>聚光灯</td>
                <td>
                  <button
                    type="button"
                    aria-label={`调整${light.name}`}
                    title="调整灯位与照射点"
                    disabled={busy}
                    onClick={() => editLight(light.id)}
                  >
                    <Settings2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {visibleNodes.map((row) => {
              const node = nodes[row.id]
              const controls = node?.type === 'item' ? node.asset.interactive?.controls : undefined
              const toggleIndex = controls?.findIndex((control) => control.kind === 'toggle') ?? -1
              const lightOn =
                toggleIndex < 0 ||
                Boolean(
                  interactiveItems[row.id]?.controlValues[toggleIndex] ??
                    controls?.[toggleIndex]?.default,
                )
              const visibility = !row.effectiveVisible
                ? row.visible
                  ? '随上级隐藏'
                  : '已隐藏'
                : ''
              const status =
                row.kind === 'light'
                  ? `${lightOn ? '灯光已启用' : '灯光已关闭'}${visibility ? ` · 模型${visibility}` : ''}`
                  : visibility
              const selected =
                !selectedLight &&
                (selection.selectedIds.includes(row.id) ||
                  (selection.selectedIds.length === 0 &&
                    (selection.zoneId ?? selection.levelId ?? selection.buildingId) === row.id))
              const Icon =
                row.kind === 'light' ? Lightbulb : row.kind === 'container' ? Layers : Box
              return (
                <tr key={row.id} data-selected={selected}>
                  <td>
                    <button
                      type="button"
                      aria-label={`${row.visible ? '隐藏' : '显示'}${row.name}${row.kind === 'light' ? '的模型' : ''}`}
                      aria-pressed={row.effectiveVisible}
                      title={
                        row.kind === 'light' ? '仅切换模型显示，不改变灯光开关' : status || '显示中'
                      }
                      disabled={busy || readOnly}
                      onClick={() => toggleNode(row.id)}
                    >
                      {row.effectiveVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </td>
                  <td>
                    <button
                      className="stage-overview-name"
                      type="button"
                      disabled={busy}
                      aria-label={`选择${row.name}`}
                      onClick={() => selectNode(row.id)}
                      onDoubleClick={() => selectNode(row.id, true)}
                      title={`${row.name} · ${row.parentLabel}${status ? ` · ${status}` : ''}`}
                    >
                      <span>
                        <Icon size={13} />
                        {row.name}
                      </span>
                      <small>
                        {status ? `${status} · ` : ''}
                        {row.parentLabel}
                      </small>
                    </button>
                  </td>
                  <td title={row.typeLabel}>{row.typeLabel}</td>
                  <td>
                    <button
                      type="button"
                      aria-label={`定位${row.name}`}
                      title="在视图中定位"
                      disabled={busy || !row.effectiveVisible}
                      onClick={() => selectNode(row.id, true)}
                    >
                      <Crosshair size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown === 0 && (
          <p className="stage-overview-empty">没有匹配的对象。试试其他名称或类型。</p>
        )}
      </div>
      <footer className="stage-overview-footer">
        <span>
          {shown === total ? `${total} 个对象` : `${shown} / ${total} 个对象`} · 包含隐藏项
        </span>
        <label>
          <input
            type="checkbox"
            checked={shadows}
            disabled={busy}
            onChange={(event) => {
              if (canAct()) useViewer.getState().setShadows(event.target.checked)
            }}
          />
          显示阴影
        </label>
        {selectedLight && lights.some((light) => light.id === selectedLight) && (
          <button type="button" disabled={busy} onClick={() => editLight(selectedLight)}>
            调整所选灯光
          </button>
        )}
      </footer>
    </section>
  )
}
