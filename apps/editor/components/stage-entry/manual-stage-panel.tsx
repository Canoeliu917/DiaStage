'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import {
  compileStagePlan,
  type SceneContextObject,
  type StageDimensions,
  type StageItemKind,
  type StageItemProposal,
  type StagePlan,
  type StagePoint,
  stagePositionLabel,
  worldToStagePosition,
  worldToStageRotation,
} from '@pascal-app/core/stage'
import { runRedo, runUndo, useEditor, useInteractionScope } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { objectSnapshot } from '@/lib/remount-scene'
import { commandMeta, executeStageCommands } from '@/lib/stage/command-executor'
import { currentStageContext, stageFrame, stageKind } from '@/lib/stage/context'
import { stageKindLabels as labels } from '@/lib/stage/labels'
import { SCENERY_LIBRARY } from '@/lib/stage/scenery'
import { useCameraStudio } from '../camera-studio/store'
import { useSimulationSelection } from '../theatre/simulation-panel'
import { type PlacementSnap, snapStagePlacement } from './placement-math'
import './manual-stage.css'

export type StageLibraryEntry = {
  id: string
  name: string
  kind: StageItemKind
  libraryAssetId: string | null
  dimensionsMeters: StageDimensions
}
const defaults: [StageItemKind, number, number, number][] = [
  ['neutral-block', 1, 1, 1],
  ['scenic-flat', 2, 2.4, 0.12],
  ['door-flat', 0.9, 2.1, 0.15],
  ['window-flat', 1.2, 2.1, 0.15],
  ['curtain', 3, 2.5, 0.12],
  ['screen', 2, 1.8, 0.3],
  ['rail-or-divider', 2, 1, 0.15],
  ['platform', 2, 0.3, 2],
  ['stairs', 1.2, 0.6, 1.5],
  ['table', 1.2, 0.75, 0.8],
  ['chair', 0.5, 0.9, 0.5],
  ['sofa', 2, 0.85, 0.9],
  ['counter', 1.6, 1, 0.6],
  ['shelf', 1, 1.8, 0.35],
  ['bed', 1.5, 0.8, 2],
  ['performer-marker', 0.4, 1.7, 0.4],
  ['camera', 0.35, 0.25, 0.5],
]
export const STAGE_LIBRARY: StageLibraryEntry[] = [
  ...defaults.map(([kind, width, height, depth]) => ({
    id: kind,
    name: labels[kind],
    kind,
    libraryAssetId: null,
    dimensionsMeters: { width, height, depth },
  })),
  ...SCENERY_LIBRARY.flatMap(({ kind, asset }, index) => {
    const dimensions = asset.dimensions
    if (!dimensions?.every((value) => Number.isFinite(value) && value > 0)) return []
    return [
      {
        id: asset.id,
        name: `${labels[kind]} · ${index + 1}`,
        kind,
        libraryAssetId: asset.id,
        dimensionsMeters: {
          width: dimensions[0],
          height: dimensions[1],
          depth: dimensions[2],
        },
      },
    ]
  }),
]
const categories: { name: string; kinds: StageItemKind[] }[] = [
  { name: '基础台面', kinds: ['neutral-block'] },
  {
    name: '景片与开口',
    kinds: ['scenic-flat', 'door-flat', 'window-flat', 'curtain', 'screen', 'rail-or-divider'],
  },
  { name: '平台与台阶', kinds: ['platform', 'stairs'] },
  { name: '大型舞台布景', kinds: ['table', 'chair', 'sofa', 'counter', 'shelf', 'bed'] },
  { name: '人物标记', kinds: ['performer-marker'] },
  { name: '舞台镜头', kinds: ['camera'] },
]
type PlacementDraft = { item: StageItemProposal; version: number; duplicateOf?: string }
export const useStagePlacement = create<{
  draft: PlacementDraft | null
  snap: PlacementSnap
  notice: string
  snapLabels: string[]
}>(() => ({ draft: null, snap: { grid: 0.25, guides: true }, notice: '', snapLabels: [] }))
const scopeTool = 'diastage-stage-placement'
const ownsScope = () => {
  const scope = useInteractionScope.getState().scope
  return scope.kind === 'drafting' && scope.tool === scopeTool
}

export function cancelStagePlacement() {
  useStagePlacement.setState({ draft: null, snapLabels: [] })
  useInteractionScope
    .getState()
    .endIf((scope) => scope.kind === 'drafting' && scope.tool === scopeTool)
}
export function startStagePlacement(
  entry: StageLibraryEntry,
  existing?: SceneContextObject,
  duplicate = false,
) {
  cancelStagePlacement()
  if (useScene.getState().readOnly) return
  const context = currentStageContext()
  if (!context.venue) {
    useStagePlacement.setState({ notice: '请先设置舞台宽度与深度。' })
    return
  }
  const item: StageItemProposal = {
    proposalId: crypto.randomUUID(),
    existingNodeId: existing && !duplicate ? existing.id : null,
    kind: entry.kind,
    displayName: duplicate ? `${entry.name} 副本` : entry.name,
    libraryAssetId: entry.libraryAssetId,
    dimensionsMeters: entry.dimensionsMeters,
    transform: existing?.transform ?? {
      position: { x: 0, y: entry.kind === 'camera' ? 1.4 : 0, z: context.venue.depthMeters / 2 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
    },
    certainty: 'stated',
    assumptionIds: [],
    evidenceIds: [],
  }
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)
  useInteractionScope.getState().begin({ kind: 'drafting', tool: scopeTool })
  useStagePlacement.setState({
    draft: {
      item,
      version: context.documentVersion,
      ...(duplicate && existing ? { duplicateOf: existing.id } : {}),
    },
    notice: '移动指针查看台位，点击或释放完成落位；Esc 取消。',
    snapLabels: [],
  })
}
export function placementPlan(draft: PlacementDraft): StagePlan {
  return {
    schemaVersion: 1,
    source: 'manual',
    venue: null,
    items: [draft.item],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
}
export function updateStagePlacement(position: StagePoint) {
  const state = useStagePlacement.getState()
  if (!state.draft || !ownsScope()) return
  const context = currentStageContext()
  const snapped = snapStagePlacement(
    position,
    state.draft.item.dimensionsMeters,
    state.draft.item.transform.rotationDegrees.y,
    context,
    state.snap,
    state.draft.item.existingNodeId ?? undefined,
  )
  useStagePlacement.setState({
    draft: {
      ...state.draft,
      version: context.documentVersion,
      item: {
        ...state.draft.item,
        transform: { ...state.draft.item.transform, position: snapped.position },
      },
    },
    snapLabels: snapped.labels,
  })
}
export function commitStagePlacement() {
  const draft = useStagePlacement.getState().draft
  if (!draft || !ownsScope()) return false
  const context = currentStageContext()
  if (draft.version !== context.documentVersion) {
    useStagePlacement.setState({ notice: '舞台刚刚发生变化，请移动预览后重新确认落位。' })
    return false
  }
  const meta = commandMeta('manual')
  const compiled = compileStagePlan(placementPlan(draft), context, meta)
  if (!compiled.ok) {
    useStagePlacement.setState({
      notice: compiled.warnings.map((warning) => warning.message).join(' '),
    })
    return false
  }
  const commands = draft.duplicateOf
    ? [
        {
          type: 'DuplicateObject',
          meta,
          sourceNodeId: draft.duplicateOf,
          newNodeId: draft.item.proposalId,
          name: draft.item.displayName,
          position: draft.item.transform.position,
        },
      ]
    : compiled.commands
  const result = executeStageCommands(commands)
  if (!result.ok) {
    useStagePlacement.setState({ notice: result.error ?? '未能完成落位，请调整后重试。' })
    return false
  }
  cancelStagePlacement()
  const selected = result.nodeIds[0]
  if (selected) {
    if (draft.item.kind === 'performer-marker')
      useSimulationSelection.setState({ selectedId: selected })
    else if (draft.item.kind === 'camera') useCameraStudio.getState().selectShot(selected)
    else useViewer.getState().setSelection({ selectedIds: [selected] })
  }
  useStagePlacement.setState({ notice: `已落位「${draft.item.displayName}」，可继续调整或撤销。` })
  return true
}

export function StageLibraryPanel() {
  const [category, setCategory] = useState(0)
  const state = useStagePlacement()
  const readOnly = useScene((s) => s.readOnly)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && useStagePlacement.getState().draft) {
        event.preventDefault()
        cancelStagePlacement()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const editorCleanup = useEditor.subscribe((next, previous) => {
      if (
        next.activeSidebarPanel !== previous.activeSidebarPanel ||
        next.isFirstPersonMode ||
        next.isCaptureMode ||
        next.isPreviewMode ||
        next.viewMode !== previous.viewMode
      )
        cancelStagePlacement()
    })
    const scopeCleanup = useInteractionScope.subscribe(() => {
      if (useStagePlacement.getState().draft && !ownsScope())
        useStagePlacement.setState({ draft: null, snapLabels: [] })
    })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      editorCleanup()
      scopeCleanup()
      cancelStagePlacement()
    }
  }, [])
  const position = state.draft?.item.transform.position
  const venue = currentStageContext().venue
  return (
    <section className="stage-manual" aria-label="舞台库">
      <h2>舞台库</h2>
      <p>拖入布景，或点选后点击舞台落位。</p>
      <div className="stage-category-grid" role="group" aria-label="舞台库分类">
        {categories.map((entry, i) => (
          <button
            type="button"
            key={entry.name}
            aria-pressed={category === i}
            onClick={() => setCategory(i)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className="stage-manual-snaps">
        <label>
          网格
          <select
            aria-label="落位网格"
            value={state.snap.grid}
            onChange={(event) => {
              const grid = Number(event.target.value) as PlacementSnap['grid']
              useStagePlacement.setState({ snap: { ...state.snap, grid } })
              if (grid) useEditor.getState().setGridSnapStep(grid)
            }}
          >
            {[0.1, 0.25, 0.5, 0].map((step) => (
              <option value={step} key={step}>
                {step ? `${step} 米` : '关闭'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.snap.guides}
            onChange={(event) =>
              useStagePlacement.setState({ snap: { ...state.snap, guides: event.target.checked } })
            }
          />
          基准线与边缘吸附
        </label>
      </div>
      <div className="stage-library-grid">
        {STAGE_LIBRARY.filter((entry) => categories[category]!.kinds.includes(entry.kind)).map(
          (entry) => (
            <button
              type="button"
              key={entry.id}
              disabled={readOnly}
              draggable={!readOnly}
              aria-pressed={
                state.draft?.item.kind === entry.kind &&
                state.draft.item.libraryAssetId === entry.libraryAssetId
              }
              onClick={() => startStagePlacement(entry)}
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-diastage-scenery', entry.id)
                event.dataTransfer.effectAllowed = 'copy'
                startStagePlacement(entry)
              }}
            >
              <strong>{entry.name}</strong>
              <span>
                {entry.dimensionsMeters.width} × {entry.dimensionsMeters.depth} 米
              </span>
              <small>
                {entry.libraryAssetId
                  ? '舞台模型'
                  : ['camera', 'performer-marker'].includes(entry.kind)
                    ? '舞台标记'
                    : '可编辑台件'}
              </small>
            </button>
          ),
        )}
      </div>
      {position && venue && (
        <div className="stage-placement-readout" aria-live="polite">
          <strong>{stagePositionLabel(position, venue.depthMeters)}</strong>
          <span>
            距中心线 {Math.abs(position.x).toFixed(2)} 米 · 距台口 {position.z.toFixed(2)} 米
          </span>
          <span>{state.snapLabels.join(' · ') || '自由落位'}</span>
          <button type="button" onClick={cancelStagePlacement}>
            取消落位
          </button>
        </div>
      )}
      <p className="stage-notice" role="status">
        {state.notice}
      </p>
      <div className="stage-manual-actions">
        <button type="button" onClick={() => runUndo()}>
          撤销
        </button>
        <button type="button" onClick={() => runRedo()}>
          重做
        </button>
      </div>
    </section>
  )
}

function NumberInput({
  label,
  value,
  onCommit,
  min,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  min?: number
}) {
  const [text, setText] = useState(String(Number(value.toFixed(3))))
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value])
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min={min}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = Number(text)
          setText(String(Number(value.toFixed(3))))
          if (text.trim() && Number.isFinite(next) && next !== value) onCommit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}
export function StageObjectPanel({ nodeId }: { nodeId?: string } = {}) {
  const selected = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)
  const readOnly = useScene((s) => s.readOnly)
  const id = nodeId ?? (selected.length === 1 ? selected[0] : undefined)
  const object = useMemo(() => {
    if (!id) return null
    const found = currentStageContext().objects.find((item) => item.id === id)
    if (found) return found
    const node = nodes[id as AnyNodeId]
    const kind = node && stageKind(node)
    if (!node || !kind || (node.type !== 'item' && node.type !== 'block')) return null
    try {
      const pose = objectSnapshot(node, nodes)
      return {
        id,
        name: node.name || labels[kind],
        kind,
        dimensionsMeters: {
          width: pose.dimensions[0],
          height: pose.dimensions[1],
          depth: pose.dimensions[2],
        },
        transform: {
          position: worldToStagePosition(pose.position, stageFrame()),
          rotationDegrees: worldToStageRotation(pose.rotation),
        },
      }
    } catch {
      return null
    }
  }, [id, nodes])
  if (!object || ['camera', 'performer-marker'].includes(object.kind)) return null
  const node = nodes[object.id as AnyNodeId]
  const locked = node?.metadata.stageLocked === true
  const finish = node?.type === 'item' || node?.type === 'block' ? node.slots?.body : undefined
  const run = (command: Record<string, unknown>) => {
    const result = executeStageCommands([
      { ...command, meta: commandMeta('manual'), nodeId: object.id },
    ])
    useStagePlacement.setState({
      notice: result.ok ? '已更新，可撤销。' : (result.error ?? '无法完成修改。'),
    })
  }
  const entry: StageLibraryEntry = {
    id: object.id,
    name: object.name,
    kind: object.kind,
    dimensionsMeters: object.dimensionsMeters,
    libraryAssetId: node?.type === 'item' ? node.asset.id : null,
  }
  return (
    <fieldset className="stage-object" disabled={readOnly} aria-label="布景属性">
      <legend>选中布景</legend>
      <label>
        名称
        <input
          key={`${object.id}:${object.name}`}
          type="text"
          defaultValue={object.name}
          disabled={locked}
          maxLength={120}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim()
            event.currentTarget.value = object.name
            if (name && name !== object.name) run({ type: 'RenameObject', name })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={locked}
          onChange={(event) => run({ type: 'SetObjectLock', locked: event.target.checked })}
        />
        锁定位置与属性
      </label>
      <fieldset className="stage-object-transform" disabled={locked}>
        <div className="stage-property-grid">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <NumberInput
              key={axis}
              label={['台右位置 / 米', '高度 / 米', '距台口 / 米'][i]!}
              value={object.transform.position[axis]}
              onCommit={(value) =>
                run({
                  type: 'MoveObject',
                  position: { ...object.transform.position, [axis]: value },
                })
              }
            />
          ))}
        </div>
        <div className="stage-property-grid">
          {(['width', 'height', 'depth'] as const).map((axis, i) => (
            <NumberInput
              key={axis}
              min={0.01}
              label={['宽 / 米', '高 / 米', '深 / 米'][i]!}
              value={object.dimensionsMeters[axis]}
              onCommit={(value) =>
                run({
                  type: 'ResizeObject',
                  dimensionsMeters: { ...object.dimensionsMeters, [axis]: value },
                })
              }
            />
          ))}
        </div>
        <NumberInput
          label="角度 / 度"
          value={object.transform.rotationDegrees.y}
          onCommit={(value) =>
            run({
              type: 'RotateObject',
              rotationDegrees: { ...object.transform.rotationDegrees, y: value },
            })
          }
        />
        {node?.type === 'block' && (
          <label>
            布景表面
            <select
              aria-label="布景表面"
              value={
                finish === 'library:preset-white'
                  ? 'white'
                  : finish === 'library:preset-nearblack'
                    ? 'dark'
                    : 'neutral'
              }
              onChange={(event) => run({ type: 'SetScenicFinish', finish: event.target.value })}
            >
              <option value="neutral">中性灰</option>
              <option value="white">哑光白</option>
              <option value="dark">炭黑</option>
            </select>
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={node?.visible === false}
            onChange={(event) =>
              run({ type: 'SetObjectVisibility', visible: !event.target.checked })
            }
          />
          隐藏
        </label>
        <div className="stage-manual-actions">
          <button type="button" onClick={() => startStagePlacement(entry, object)}>
            移动落位
          </button>
          <button type="button" onClick={() => startStagePlacement(entry, object, true)}>
            复制后落位
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`删除「${object.name}」？删除后可以撤销。`))
                run({ type: 'RemoveObject' })
            }}
          >
            删除
          </button>
        </div>
      </fieldset>
    </fieldset>
  )
}
