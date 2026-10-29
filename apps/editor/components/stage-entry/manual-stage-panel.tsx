'use client'

import { type AnyNodeId, getNodeLock, useScene } from '@pascal-app/core'
import {
  compileStagePlan,
  type SceneContextObject,
  STAGE_OBJECT_CATEGORIES,
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
import {
  centerFromPivot,
  edgeRunCommands,
  edgeRunRefusal,
  type FoldPlacement,
  pivotFromCenter,
  planRoomEdge,
  type StageEdge,
  settleOpening,
  snapFootprintToStageEdges,
  straightFoldShape,
} from '@/lib/stage/edge-run'
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
import {
  describeStagePoint,
  rehearsalBlock,
  rehearsalKept,
  speakSnapLabel,
} from '@/lib/stage/rehearsal-measure'
import { resetStageObjectShape } from '@/lib/stage/reset-shape'
import { SCENERY_LIBRARY } from '@/lib/stage/scenery'
import { createUUID } from '../../lib/uuid'
import { useCameraStudio } from '../camera-studio/store'
import { useSimulationSelection } from '../theatre/simulation-panel'
import { FoldStops } from './folding-panel'
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
STAGE_LIBRARY.sort(
  (a, b) =>
    STAGE_OBJECT_CATEGORIES.indexOf(a.spec.category) -
    STAGE_OBJECT_CATEGORIES.indexOf(b.spec.category),
)
export const STAGE_LIBRARY_CATEGORIES = [
  { label: '布景', sources: ['空间围合', '门窗'] },
  { label: '家具', sources: ['沙发', '桌', '椅凳'] },
  { label: '道具', sources: ['台块与支撑'] },
] as const
type PlacementDraft = {
  item: StageItemProposal
  version: number
  duplicateOf?: string
  foldPlacement?: FoldPlacement
}
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
    useStagePlacement.setState({ notice: '请先把舞台的宽和深定下来。' })
    return
  }
  const straight =
    !existing && (entry.libraryAssetId === 'SCN-FOLD-02' || entry.libraryAssetId === 'SCN-FOLD-03')
      ? straightFoldShape(entry.libraryAssetId)
      : undefined
  const foldPlacement: FoldPlacement | undefined = straight
    ? {
        angles: [180, 180],
        centerOffset: { x: straight.boundsCenter[0], z: straight.boundsCenter[2] },
      }
    : undefined
  const dimensionsMeters = straight
    ? {
        width: straight.dimensions[0],
        height: straight.dimensions[1],
        depth: straight.dimensions[2],
      }
    : entry.dimensionsMeters
  const item: StageItemProposal = {
    proposalId: createUUID(),
    existingNodeId: existing && !duplicate ? existing.id : null,
    kind: entry.kind,
    displayName: duplicate ? `${entry.name} 副本` : entry.name,
    libraryAssetId: entry.libraryAssetId,
    dimensionsMeters,
    collisionGeometry:
      existing?.collisionGeometry ??
      straight?.collisionGeometry ??
      stagePropCollisionGeometry(entry.libraryAssetId, dimensionsMeters),
    stepCount: existing?.stepCount,
    transform: existing?.transform ?? {
      position: foldPlacement
        ? pivotFromCenter(
            { x: 0, y: 0, z: context.venue.depthMeters / 2 },
            entry.kind === 'platform' || entry.name === '枕木' ? 90 : 0,
            foldPlacement.centerOffset,
          )
        : { x: 0, y: entry.kind === 'camera' ? 1.4 : 0, z: context.venue.depthMeters / 2 },
      rotationDegrees: {
        x: 0,
        y: 0,
        z: entry.kind === 'platform' || entry.name === '枕木' ? 90 : 0,
      },
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
      ...(foldPlacement ? { foldPlacement } : {}),
      ...(duplicate && existing ? { duplicateOf: existing.id } : {}),
    },
    notice: '',
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
  const yaw = state.draft.item.transform.rotationDegrees.y
  const snapped = snapStageObject(
    position,
    {
      ...state.draft.item,
      stepCount: state.draft.item.stepCount ?? undefined,
      id: state.draft.item.existingNodeId ?? state.draft.item.proposalId,
      name: state.draft.item.displayName,
      transform: {
        ...state.draft.item.transform,
        position: state.draft.foldPlacement ? position : state.draft.item.transform.position,
      },
    },
    context,
    state.snap,
  )
  let next = state.draft.foldPlacement
    ? pivotFromCenter(snapped.position, yaw, state.draft.foldPlacement.centerOffset)
    : snapped.position
  const pose = {
    ...state.draft.item,
    transform: { ...state.draft.item.transform, position: next },
  }
  const labels = snapped.labels.map(speakSnapLabel)
  if (context.venue && ['scenic-flat', 'door-flat', 'window-flat'].includes(pose.kind)) {
    const flush = snapFootprintToStageEdges(pose, context.venue)
    next = flush.position
    labels.push(...flush.labels)
    if (pose.kind === 'door-flat' || pose.kind === 'window-flat') {
      const settled = settleOpening(
        { ...pose, transform: { ...pose.transform, position: next } },
        context.objects,
        context.venue,
      )
      next = settled.position
      pose.transform = {
        ...pose.transform,
        position: next,
        rotationDegrees: { ...pose.transform.rotationDegrees, y: settled.yaw },
      }
      labels.push(...settled.labels.filter((label) => !labels.includes(label)))
    }
  }
  const rotationDegrees = {
    ...state.draft.item.transform.rotationDegrees,
    y: pose.transform.rotationDegrees.y,
  }
  next = { ...next, y: state.draft.item.transform.position.y }
  if (
    context.documentVersion === state.draft.version &&
    (['x', 'y', 'z'] as const).every(
      (axis) => state.draft!.item.transform.position[axis] === next[axis],
    ) &&
    state.draft.item.transform.rotationDegrees.y === rotationDegrees.y
  )
    return
  useStagePlacement.setState({
    draft: {
      ...state.draft,
      version: context.documentVersion,
      item: {
        ...state.draft.item,
        transform: { ...state.draft.item.transform, position: next, rotationDegrees },
      },
    },
    snapLabels: [...new Set(labels)],
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
    const reason = rehearsalKept(
      compiled.warnings.map((warning) => warning.message).join(' ') || '这里放不下。',
    )
    const spot = context.venue ? nearestLegalSpot(draft, context) : null
    useStagePlacement.setState({
      notice: spot ? `${reason}旁边大概可以放在${spot}。` : reason,
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
    : compiled.commands.map((command) =>
        command.type === 'AddScenery' && draft.foldPlacement
          ? { ...command, foldAngles: draft.foldPlacement.angles }
          : command,
      )
  const result = executeStageCommands(commands)
  if (!result.ok) {
    const reason = rehearsalKept(result.error ?? '这里放不下。')
    const spot = context.venue ? nearestLegalSpot(draft, context) : null
    useStagePlacement.setState({
      notice: spot ? `${reason}旁边大概可以放在${spot}。` : reason,
    })
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
  const overlap = compiled.warnings
    .filter((warning) => warning.code === 'collision')
    .map((warning) => rehearsalBlock(warning.message))
  useStagePlacement.setState({
    notice: overlap.length
      ? `放下了「${draft.item.displayName}」，但${overlap.join('')}红的就是碰到的那一件，挪到旁边的空位就好。`
      : `放下了「${draft.item.displayName}」。`,
  })
  return true
}

function nearestLegalSpot(
  draft: PlacementDraft,
  context: NonNullable<ReturnType<typeof currentStageContext>>,
): string | null {
  const venue = context.venue
  if (!venue) return null
  const origin = draft.foldPlacement
    ? centerFromPivot(
        draft.item.transform.position,
        draft.item.transform.rotationDegrees.y,
        draft.foldPlacement.centerOffset,
      )
    : draft.item.transform.position
  const spots: StagePoint[] = []
  for (let z = 1; z <= venue.depthMeters - 1; z += 1)
    for (let x = -Math.floor(venue.widthMeters / 2) + 1; x <= venue.widthMeters / 2 - 1; x += 1)
      spots.push({ x, y: origin.y, z })
  spots.sort(
    (a, b) =>
      Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z),
  )
  for (const center of spots.slice(0, 24)) {
    const position = draft.foldPlacement
      ? pivotFromCenter(
          center,
          draft.item.transform.rotationDegrees.y,
          draft.foldPlacement.centerOffset,
        )
      : center
    const result = compileStagePlan(
      placementPlan({
        ...draft,
        item: { ...draft.item, transform: { ...draft.item.transform, position } },
      }),
      context,
      commandMeta('manual'),
    )
    if (
      result.ok &&
      !result.warnings.some(
        (warning) => warning.code === 'collision' && warning.message.includes('穿插'),
      )
    )
      return describeStagePoint(center, venue.depthMeters)
  }
  return null
}

export function placeCurtainsAlong(edge: StageEdge) {
  cancelStagePlacement()
  if (useScene.getState().readOnly) return
  const context = currentStageContext()
  if (!context.venue) {
    useStagePlacement.setState({ notice: '请先把舞台的宽和深定下来。' })
    return
  }
  const planned = planRoomEdge(edge, context.venue)
  const refusal = edgeRunRefusal(planned.pieces, context)
  if (refusal || !planned.pieces.length) {
    useStagePlacement.setState({ notice: refusal || planned.notice })
    return
  }
  const result = executeStageCommands(edgeRunCommands(planned.pieces, commandMeta('manual')))
  useStagePlacement.setState({
    notice: result.ok ? planned.notice : rehearsalKept(result.error ?? '没排上。'),
  })
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
      // Let the editor's existing Shift cycle reach angles / lines / off.
      // Reflect native mode changes instead of immediately overwriting them.
      if (next.snappingModeByContext.item !== previous.snappingModeByContext.item) {
        const mode = next.snappingModeByContext.item
        useStagePlacement.setState({
          snap: { grid: mode === 'grid' ? next.gridSnapStep : 0, guides: mode === 'lines' },
        })
        if (next.magneticSnap !== (mode === 'lines'))
          useEditor.getState().setMagneticSnap(mode === 'lines')
      }
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
  const [selectedId, setSelectedId] = useState(STAGE_LIBRARY[0]!.menu.id)
  const previewDialog = useRef<HTMLDialogElement>(null)
  const selected = STAGE_LIBRARY.find(({ menu }) => menu.id === selectedId)
  const search = query.trim().toLocaleLowerCase()
  const visible = STAGE_LIBRARY.filter(({ menu }) =>
    search
      ? `${menu.name} ${menu.id}`.toLocaleLowerCase().includes(search)
      : STAGE_LIBRARY_CATEGORIES[category]!.sources.some((source) => menu.category === source),
  )
  const state = useStagePlacement()
  const readOnly = useScene((s) => s.readOnly)
  const position = state.draft?.item.transform.position
  const venue = currentStageContext().venue
  return (
    <section className="stage-manual stage-library" aria-label="舞台库">
      <div className="stage-library-browser">
        <header className="stage-library-heading">
          <h2>舞台库</h2>
          <span>{STAGE_LIBRARY.length} 件</span>
        </header>
        <StagePresets />
        <div className="stage-category-grid" role="group" aria-label="道具分类">
          {STAGE_LIBRARY_CATEGORIES.map(({ label, sources }, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={category === index && !search}
              onClick={() => {
                cancelStagePlacement()
                setCategory(index)
                setQuery('')
                setSelectedId(
                  STAGE_LIBRARY.find(({ menu }) =>
                    sources.some((source) => menu.category === source),
                  )!.menu.id,
                )
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="搜索道具名称或编号"
          placeholder="搜索全部 21 件道具"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="stage-edge-actions" role="group" aria-label="沿台边排直墙">
          <button type="button" disabled={readOnly} onClick={() => placeCurtainsAlong('back')}>
            贴后墙
          </button>
          <button type="button" disabled={readOnly} onClick={() => placeCurtainsAlong('left')}>
            贴左侧
          </button>
          <button type="button" disabled={readOnly} onClick={() => placeCurtainsAlong('right')}>
            贴右侧
          </button>
        </div>
        <div className="stage-quick-props" role="group" aria-label="门和窗">
          {(['SCN-DOOR-130', 'SCN-WIN-130'] as const).map((id) => {
            const found = STAGE_LIBRARY.find(({ menu }) => menu.id === id)
            return (
              <button
                key={id}
                type="button"
                disabled={readOnly || !found?.entry}
                onClick={() => {
                  if (!found?.entry) return
                  setSelectedId(id)
                  startStagePlacement(found.entry)
                }}
              >
                {id === 'SCN-DOOR-130' ? '单门' : '窗'}
              </button>
            )
          })}
        </div>
        <p className="stage-library-hint">
          点选道具，再点舞台放置；Esc
          取消。帘片放下就是直墙。贴后墙、贴左侧、贴右侧沿台边排好，对不齐就留缝。
        </p>
        <div className="stage-library-grid">
          {visible.map(({ menu, entry }) => (
            <button
              type="button"
              key={menu.id}
              data-stage-asset-id={menu.id}
              data-model-ready={entry !== null}
              draggable={!readOnly && !!entry}
              aria-pressed={selectedId === menu.id}
              onClick={() => {
                setSelectedId(menu.id)
                if (!readOnly && entry) {
                  startStagePlacement(entry)
                }
              }}
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
                sizes="140px"
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
                  setStageGrid(
                    event.target.checked ? 0 : useEditor.getState().gridSnapStep,
                    event.target.checked,
                  )
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
              {describeStagePoint(
                state.draft?.foldPlacement
                  ? centerFromPivot(
                      position,
                      state.draft.item.transform.rotationDegrees.y,
                      state.draft.foldPlacement.centerOffset,
                    )
                  : position,
                venue.depthMeters,
              )}
            </span>
            <span>{state.snapLabels.join(' · ') || '按格子落位'}</span>
            <button type="button" onClick={cancelStagePlacement}>
              取消落位
            </button>
          </div>
        )}
        <p
          className="stage-notice"
          role={
            /出了台面|会碰到|放不下|叠在一起|没排|改不了|没有改/.test(state.notice)
              ? 'alert'
              : 'status'
          }
        >
          {state.notice || (state.draft ? '移动指针查看台位，点击或释放完成落位；Esc 取消。' : '')}
        </p>
        <div className="stage-manual-actions">
          <button type="button" onClick={() => runUndo()}>
            撤销
          </button>
          <button type="button" onClick={() => runRedo()}>
            重做
          </button>
        </div>
      </div>
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
  const placementNotice = useStagePlacement((state) => state.notice)
  const selected = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)
  const readOnly = useScene((s) => s.readOnly)
  const id = nodeId ?? (selected.length === 1 ? selected[0] : undefined)
  const modelMissing = useViewer((state) => !!(id && state.itemLoadFailures[id]))
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
    if (!selectedNode)
      return (
        <section aria-label="布景属性">
          <h2>布景属性</h2>
          <p>
            {selected.length > 1
              ? `已选中 ${selected.length} 个物件，请选择其中一个继续调整。`
              : '请先在舞台或场景列表中选中一个布景，再调整名称、位置与尺寸。'}
          </p>
          {selected.length > 1 && (
            <div className="stage-manual-actions">
              {selected.map((selectedId) => (
                <button
                  key={selectedId}
                  type="button"
                  onClick={() => useViewer.getState().setSelection({ selectedIds: [selectedId] })}
                >
                  {nodes[selectedId as AnyNodeId]?.name || '未命名物件'}
                </button>
              ))}
            </div>
          )}
        </section>
      )
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
      notice: result.ok ? '改好了。' : rehearsalKept(result.error ?? '没改成。'),
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
      {modelMissing && <p role="alert">模型资源缺失，原台位已保留。</p>}
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
      <fieldset className="stage-object-transform" disabled={locked || foldingId === object.id}>
        <div className="stage-object-position">
          <span>位置</span>
          <button type="button" onClick={() => startStagePlacement(entry, object)}>
            移动落位
          </button>
        </div>
        <PropRotationControls nodeId={object.id} compact />
        <FoldStops
          nodeId={object.id}
          onNotice={(notice) => useStagePlacement.setState({ notice })}
        />
        <label className="stage-object-visibility">
          <input
            type="checkbox"
            checked={node?.visible !== false}
            onChange={(event) =>
              run({ type: 'SetObjectVisibility', visible: event.target.checked })
            }
          />
          在舞台中显示
        </label>
      </fieldset>
      <details className="stage-object-more">
        <summary>更多调整</summary>
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
        <fieldset className="stage-object-transform" disabled={locked || foldingId === object.id}>
          <PropRotationControls nodeId={object.id} />
          <details data-stage-dimensions>
            <summary>尺寸与位置</summary>
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
                  min={1}
                  label={['宽 / 厘米', '高 / 厘米', '深 / 厘米'][i]!}
                  value={object.dimensionsMeters[axis] * 100}
                  integer
                  onCommit={(value) =>
                    run({
                      type: 'ResizeObject',
                      dimensionsMeters: {
                        ...object.dimensionsMeters,
                        [axis]: value / 100,
                      },
                    })
                  }
                />
              ))}
            </div>
            {/出了台面|会碰到|没改成|还停在/.test(placementNotice) && (
              <p role="alert">{placementNotice}</p>
            )}
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
          <div className="stage-manual-actions">
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
      </details>
    </fieldset>
  )
}
