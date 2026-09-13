'use client'

import { type AnyNodeId, getNodeLock, useScene } from '@pascal-app/core'
import {
  compileStagePlan,
  type SceneContextObject,
  STAGE_OBJECT_REGISTRY,
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
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { objectSnapshot } from '@/lib/remount-scene'
import { commandMeta, executeStageCommands } from '@/lib/stage/command-executor'
import { currentStageContext, stageFrame, stageKind, stageRevision } from '@/lib/stage/context'
import { useStageFolding } from '@/lib/stage/folding'
import { stageKindLabels as labels } from '@/lib/stage/labels'
import { installNativeStagePlacement } from '@/lib/stage/native-placement'
import { snapStageObject } from '@/lib/stage/placement-snap'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import {
  STAGE_PROP_MENU,
  stagePropAssetUrl,
  stagePropCollisionGeometry,
} from '@/lib/stage/prop-assets'
import { resetStageObjectShape } from '@/lib/stage/reset-shape'
import { SCENERY_LIBRARY } from '@/lib/stage/scenery'
import { useCameraStudio } from '../camera-studio/store'
import { useSimulationSelection } from '../theatre/simulation-panel'
import { FoldingPanel } from './folding-panel'
import type { PlacementSnap } from './placement-math'
import { PropRotationControls } from './rigid-prop-controls'
import { StagePresets } from './stage-presets'
import './manual-stage.css'

export type StageLibraryEntry = {
  id: string
  name: string
  kind: StageItemKind
  libraryAssetId: string | null
  dimensionsMeters: StageDimensions
}
export const STAGE_LIBRARY = STAGE_PROP_MENU.assets.map((menu) => {
  const spec = STAGE_OBJECT_REGISTRY.find((item) => item.canonicalId === menu.id)!
  const resource = SCENERY_LIBRARY.find(
    ({ kind, asset }) =>
      asset.id === spec.canonicalId && kind === spec.kind && /\.glb(?:[?#]|$)/i.test(asset.src),
  )
  const dimensions = resource?.asset.dimensions
  const entry: StageLibraryEntry | null =
    resource && dimensions?.every((value) => Number.isFinite(value) && value > 0)
      ? {
          id: spec.canonicalId,
          name: menu.name,
          kind: spec.kind,
          libraryAssetId: resource.asset.id,
          dimensionsMeters: { width: dimensions[0], height: dimensions[1], depth: dimensions[2] },
        }
      : null
  return { spec, entry, menu }
})
export const STAGE_LIBRARY_CATEGORIES = [
  { label: '景片', source: '空间围合' },
  { label: '门窗', source: '门窗' },
  { label: '台块', source: '台块与支撑' },
  { label: '桌', source: '桌' },
  { label: '椅凳', source: '椅凳' },
  { label: '沙发', source: '沙发' },
] as const
type PlacementDraft = { item: StageItemProposal; version: number; duplicateOf?: string }
export const useStagePlacement = create<{
  draft: PlacementDraft | null
  snap: PlacementSnap
  notice: string
  snapLabels: string[]
}>(() => ({ draft: null, snap: { grid: 0.1, guides: false }, notice: '', snapLabels: [] }))

export function setStageGrid(grid: PlacementSnap['grid'], guides = false) {
  useStagePlacement.setState({ snap: { grid, guides } })
  const editor = useEditor.getState()
  editor.setMagneticSnap(guides)
  editor.setSnappingMode('item', grid ? 'grid' : guides ? 'lines' : 'off')
  editor.setSnappingMode('polygon', grid ? 'grid' : guides ? 'lines' : 'off')
  if (grid) {
    editor.setGridSnapStep(grid)
    useViewer.getState().setShowGrid(true)
  }
}
const scopeTool = 'diastage-stage-placement'
let placementContext: ReturnType<typeof currentStageContext> | null = null
const ownsScope = () => {
  const scope = useInteractionScope.getState().scope
  return scope.kind === 'drafting' && scope.tool === scopeTool
}

export function cancelStagePlacement() {
  placementContext = null
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
  if (existing && getNodeLock(useScene.getState().nodes, existing.id, true)) {
    useStagePlacement.setState({ notice: '该对象已固定，请先解锁。' })
    return
  }
  const context = currentStageContext()
  placementContext = context
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
    collisionGeometry:
      existing?.collisionGeometry ??
      stagePropCollisionGeometry(entry.libraryAssetId, entry.dimensionsMeters),
    stepCount: existing?.stepCount,
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
  const context =
    placementContext?.documentVersion === stageRevision() ? placementContext : currentStageContext()
  placementContext = context
  const snapped = snapStageObject(
    position,
    {
      ...state.draft.item,
      stepCount: state.draft.item.stepCount ?? undefined,
      id: state.draft.item.existingNodeId ?? state.draft.item.proposalId,
      name: state.draft.item.displayName,
    },
    context,
    state.snap,
  )
  if (
    context.documentVersion === state.draft.version &&
    (['x', 'y', 'z'] as const).every(
      (axis) => state.draft!.item.transform.position[axis] === snapped.position[axis],
    )
  )
    return
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

export function StagePlacementRuntime() {
  useEffect(() => {
    setStageGrid(0.1)
    let ctrlTap = false
    const typing = (event: KeyboardEvent) =>
      event.target instanceof HTMLElement &&
      !!event.target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')
    const gridKeyDown = (event: KeyboardEvent) => {
      if (typing(event)) {
        ctrlTap = false
        return
      }
      if (event.key === 'Control' && !event.repeat) ctrlTap = !event.altKey && !event.shiftKey
      else if (event.key !== 'Control') ctrlTap = false
    }
    const gridKeyUp = (event: KeyboardEvent) => {
      // The stage host also owns manual and Dia drags, outside the editor's native snap context.
      if (event.key !== 'Control') return
      const clean = ctrlTap
      ctrlTap = false
      if (!clean || typing(event) || useEditor.getState().isFirstPersonMode) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setStageGrid(useEditor.getState().cycleGridSnapStep())
    }
    const clearCtrl = () => {
      ctrlTap = false
    }
    window.addEventListener('keydown', gridKeyDown, true)
    window.addEventListener('keyup', gridKeyUp, true)
    window.addEventListener('blur', clearCtrl)
    const gridCleanup = useEditor.subscribe((next, previous) => {
      if (next.gridSnapStep !== previous.gridSnapStep && useStagePlacement.getState().snap.grid)
        useStagePlacement.setState({
          snap: { ...useStagePlacement.getState().snap, grid: next.gridSnapStep },
        })
      const snap = useStagePlacement.getState().snap
      const expected = snap.grid ? 'grid' : snap.guides ? 'lines' : 'off'
      for (const context of ['item', 'polygon'] as const)
        if (next.snappingModeByContext[context] !== expected)
          useEditor.getState().setSnappingMode(context, expected)
    })
    const placementPolicyCleanup = installNativeStagePlacement(
      () => {
        const preview = useStagePlanPreview.getState()
        return useSimulationSelection.getState().showGhost ? (preview.draft ?? preview.plan) : null
      },
      () => useStagePlacement.getState().snap,
    )
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
    const sceneCleanup = useScene.subscribe((next) => {
      if (next.readOnly && useStagePlacement.getState().draft) cancelStagePlacement()
    })
    return () => {
      gridCleanup()
      window.removeEventListener('keydown', gridKeyDown, true)
      window.removeEventListener('keyup', gridKeyUp, true)
      window.removeEventListener('blur', clearCtrl)
      placementPolicyCleanup()
      window.removeEventListener('keydown', onKey, true)
      editorCleanup()
      scopeCleanup()
      sceneCleanup()
      cancelStagePlacement()
    }
  }, [])
  return null
}

export function StageLibraryPanel() {
  const [category, setCategory] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('SCN-FLAT-090')
  const previewDialog = useRef<HTMLDialogElement>(null)
  const selected = STAGE_LIBRARY.find(({ menu }) => menu.id === selectedId)
  const search = query.trim().toLocaleLowerCase()
  const visible = STAGE_LIBRARY.filter(({ menu }) =>
    search
      ? `${menu.name} ${menu.id}`.toLocaleLowerCase().includes(search)
      : menu.category === STAGE_LIBRARY_CATEGORIES[category]?.source,
  )
  const state = useStagePlacement()
  const readOnly = useScene((s) => s.readOnly)
  const position = state.draft?.item.transform.position
  const venue = currentStageContext().venue
  return (
    <section className="stage-manual stage-library" aria-label="舞台库">
      <header className="stage-library-heading">
        <h2>舞台库</h2>
        <span>22 件</span>
      </header>
      <StagePresets />
      <div className="stage-category-grid" role="group" aria-label="舞台库分类">
        {STAGE_LIBRARY_CATEGORIES.map(({ label, source }, i) => (
          <button
            type="button"
            key={label}
            aria-pressed={category === i}
            onClick={() => {
              setCategory(i)
              setQuery('')
              setSelectedId(STAGE_LIBRARY.find(({ menu }) => menu.category === source)!.menu.id)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="搜索道具名称或编号"
        placeholder="搜索名称或编号"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="stage-library-grid">
        {visible.map(({ menu, entry }) => (
          <button
            type="button"
            key={menu.id}
            data-stage-asset-id={menu.id}
            data-model-ready={entry !== null}
            draggable={!readOnly && !!entry}
            aria-pressed={selectedId === menu.id}
            onClick={() => setSelectedId(menu.id)}
            onDoubleClick={() => !readOnly && entry && startStagePlacement(entry)}
            onDragStart={(event) => {
              if (readOnly || !entry) {
                event.preventDefault()
                return
              }
              event.dataTransfer.setData('application/x-diastage-scenery', entry.id)
              event.dataTransfer.effectAllowed = 'copy'
              setSelectedId(menu.id)
              startStagePlacement(entry)
            }}
          >
            <img
              src={stagePropAssetUrl(menu.thumbnail)}
              srcSet={`${stagePropAssetUrl(menu.thumbnail)} 256w, ${stagePropAssetUrl(menu.preview)} 512w`}
              sizes="64px"
              alt=""
              draggable={false}
              loading="lazy"
              width={256}
              height={256}
            />
            {selectedId === menu.id && (
              <span className="stage-library-check" aria-hidden="true">
                ✓
              </span>
            )}
            <span className="stage-library-copy">
              <strong>{menu.name}</strong>
              <small>{menu.dimension_label}</small>
            </span>
          </button>
        ))}
      </div>
      {!visible.length && <p>没有找到匹配道具。</p>}
      {selected && (
        <section className="stage-library-preview" aria-label="道具预览">
          <button
            type="button"
            aria-label={`放大${selected.menu.name}预览`}
            onClick={() => previewDialog.current?.showModal()}
          >
            <img
              src={stagePropAssetUrl(selected.menu.preview)}
              alt={selected.menu.name}
              width={512}
              height={512}
            />
          </button>
          <div>
            <strong>{selected.menu.name}</strong>
            <small>{selected.menu.dimension_label}</small>
          </div>
          <button
            type="button"
            className="stage-library-use"
            disabled={readOnly || !selected.entry}
            onClick={() => selected.entry && startStagePlacement(selected.entry)}
          >
            <strong>{selected.entry ? '选用' : '待接入模型'}</strong>
          </button>
          <dialog
            ref={previewDialog}
            className="stage-library-dialog"
            aria-label={`${selected.menu.name}预览大图`}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') {
                event.preventDefault()
                previewDialog.current?.close()
              }
            }}
          >
            <form method="dialog">
              <strong>
                {selected.menu.name} · {selected.menu.dimension_label}
              </strong>
              <button type="submit">关闭预览</button>
            </form>
            <img
              src={stagePropAssetUrl(selected.menu.preview)}
              alt={selected.menu.name}
              width={512}
              height={512}
            />
          </dialog>
        </section>
      )}
      <details className="stage-library-snaps">
        <summary>网格与贴边说明</summary>
        <p>
          默认按画面网格落位，每小格 10 厘米；轻按并松开 Ctrl
          切换格距。工具栏末尾的“特殊：自由放置”允许离开网格。贴边开启后，靠近的景片边缘会优先贴合。
        </p>
        <div className="stage-manual-snaps">
          <label>
            网格
            <select
              aria-label="落位网格"
              value={state.snap.grid}
              onChange={(event) => {
                const grid = Number(event.target.value) as PlacementSnap['grid']
                setStageGrid(grid)
              }}
            >
              {[0.05, 0.1, 0.25, 0.5].map((step) => (
                <option value={step} key={step}>
                  {step ? `${Math.round(step * 100)} 厘米` : '关闭'}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.snap.guides}
              onChange={(event) =>
                useStagePlacement.setState({
                  snap: { ...state.snap, guides: event.target.checked },
                })
              }
            />
            景片边缘贴合
          </label>
        </div>
      </details>
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
  integer = false,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  min?: number
  integer?: boolean
}) {
  const display = integer ? Math.round(value) : Number(value.toFixed(3))
  const [text, setText] = useState(String(display))
  const edited = useRef(false)
  useEffect(() => {
    setText(String(display))
    edited.current = false
  }, [display])
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={integer ? 1 : 0.1}
        min={min}
        value={text}
        onChange={(event) => {
          edited.current = true
          setText(event.target.value)
        }}
        onBlur={() => {
          const next = Number(text)
          setText(String(display))
          if (edited.current && text.trim() && Number.isFinite(next) && next !== display)
            onCommit(next)
          edited.current = false
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}
export function StageObjectPanel({ nodeId }: { nodeId?: string } = {}) {
  const foldingId = useStageFolding((state) => state.nodeId)
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
  if (!object) {
    const selectedNode = id ? nodes[id as AnyNodeId] : undefined
    if (!selectedNode) return null
    const locked = !!getNodeLock(nodes, selectedNode.id, true)
    return (
      <fieldset className="stage-object" disabled={readOnly} aria-label="对象属性">
        <legend>{selectedNode.name || '选中对象'}</legend>
        <label>
          <input
            type="checkbox"
            checked={locked}
            disabled={locked && selectedNode.metadata.stageLocked !== true}
            onChange={(event) => {
              const result = executeStageCommands([
                {
                  type: 'SetObjectLock',
                  meta: commandMeta('manual'),
                  nodeId: selectedNode.id,
                  locked: event.target.checked,
                },
              ])
              useStagePlacement.setState({
                notice: result.ok ? '已更新，可撤销。' : (result.error ?? '无法完成修改。'),
              })
            }}
          />
          锁定位置与属性
        </label>
      </fieldset>
    )
  }
  if (['camera', 'performer-marker'].includes(object.kind)) return null
  const node = nodes[object.id as AnyNodeId]
  const locked = !!getNodeLock(nodes, object.id, true)
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
          disabled={locked && node?.metadata.stageLocked !== true}
          onChange={(event) => run({ type: 'SetObjectLock', locked: event.target.checked })}
        />
        锁定位置与属性
      </label>
      <button
        type="button"
        className="stage-shape-reset"
        disabled={locked}
        onClick={() =>
          useStagePlacement.setState({ notice: resetStageObjectShape(object.id).message })
        }
      >
        形状初始化
      </button>
      <FoldingPanel nodeId={object.id} />
      <fieldset className="stage-object-transform" disabled={locked || foldingId === object.id}>
        <PropRotationControls nodeId={object.id} />
        <details data-stage-dimensions>
          <summary>尺寸与精确位置</summary>
          <div className="stage-property-grid" data-stage-position-fields>
            {(['x', 'y', 'z'] as const).map((axis, i) => (
              <NumberInput
                key={axis}
                label={['台右位置 / 厘米', '高度 / 厘米', '距台口 / 厘米'][i]!}
                value={object.transform.position[axis] * 100}
                integer
                onCommit={(value) =>
                  run({
                    type: 'MoveObject',
                    position: { ...object.transform.position, [axis]: value / 100 },
                  })
                }
              />
            ))}
          </div>
          <div className="stage-property-grid" data-stage-size-fields>
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
        </details>
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
