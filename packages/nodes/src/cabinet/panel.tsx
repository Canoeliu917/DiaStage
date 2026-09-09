'use client'

import type {
  AnyNode,
  AnyNodeId,
  CabinetModuleNode as CabinetModuleNodeType,
  CabinetNode as CabinetNodeType,
} from '@pascal-app/core'
import { createSceneApi, useScene } from '@pascal-app/core'
import {
  ActionButton,
  PanelSection,
  PanelWrapper,
  SegmentedControl,
  SliderControl,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { AlertTriangle, Pause, Play, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CompartmentCard } from './compartment-card'
import {
  animateCabinetOperationState,
  isCabinetAnimationRunning,
  onCabinetAnimationChange,
  stopCabinetAnimation,
} from './interaction'
import { cabinetModulePanelContext } from './panel-context'
import {
  cabinetModuleSupportsPresets,
  cabinetModuleSupportsTopFinish,
  cabinetModuleUsesFixedApplianceWidth,
} from './panel-visibility'
import { CABINET_PRESETS, type CabinetPresetId } from './presets'
import {
  CABINET_REVEAL_GAPS,
  type CabinetRevealGapId,
  cabinetRevealGapById,
  cabinetRevealGapId,
} from './reveals'
import {
  addWallChildAbove,
  applyCabinetModuleFrontPatch,
  backAlignZ,
  type CabinetRunStylePatch,
  cabinetCeilingGap,
  cabinetModuleCeilingOverflow,
  cabinetModulesForRun,
  resolveCabinetType,
  runModuleBaseY,
  switchCabinetToBase,
  switchCabinetToTall,
  syncCornerRunsFromSourceModule,
  syncCornerStyleGroupFromRun,
  wallChildOf,
} from './run-ops'
import {
  bumpRunLayoutRevisionViaStore,
  type CabinetEditableNode,
  CabinetRunPanel,
  reflowRunModules,
} from './run-panel'
import {
  backAnchoredModuleZ,
  type CabinetCompartment,
  clampCabinetCarcassHeightForStack,
  isFridgeCompartmentType,
  isHoodCompartmentType,
  minCabinetCarcassHeightForStack,
  newCabinetCompartment,
  normalizeCabinetStack,
  removeCabinetCompartmentStack,
  resizeCabinetCompartmentStack,
  stackForCabinet,
} from './stack'
import { resolveCompartmentTransition } from './stack-transitions'
import { validateCabinetRun } from './validation'
import {
  CABINET_WALL_HEIGHT_PRESETS,
  type CabinetWallHeightPresetId,
  cabinetWallHeightPresetById,
  cabinetWallHeightPresetId,
} from './wall-height-presets'
import {
  CABINET_STANDARD_WIDTHS,
  type CabinetStandardWidthId,
  cabinetStandardWidthById,
  cabinetStandardWidthId,
} from './widths'

const HANDLE_STYLE_OPTIONS = [
  { value: 'bar', label: '条形拉手' },
  { value: 'knob', label: '旋钮' },
  { value: 'cutout', label: '开孔' },
  { value: 'hole', label: '孔洞' },
  { value: 'none', label: '无' },
] as const

const HANDLE_POSITION_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'top', label: '顶部' },
  { value: 'center', label: '中心' },
] as const

const FRONT_OVERLAY_OPTIONS = [
  { value: 'full', label: '覆盖式' },
  { value: 'inset', label: '内嵌式' },
] as const

const FRONT_STYLE_OPTIONS = [
  { value: 'slab', label: '平板' },
  { value: 'shaker', label: '框板式' },
  { value: 'raised-arch', label: '凸起拱形' },
] as const

const CABINET_TIER_OPTIONS = [
  { value: 'base', label: '地柜' },
  { value: 'tall', label: '高柜' },
] as const

const TOP_FINISH_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'top-cabinet', label: '吊柜' },
  { value: 'trim', label: '饰条／封顶板' },
] as const

const EMPTY_MODULES: CabinetModuleNodeType[] = []
const EMPTY_MODULE_IDS: AnyNodeId[] = []

const PRESET_BUTTON_CLASS =
  'flex h-9 items-center justify-center rounded-md border border-border/40 bg-[#252527] px-3 py-2 text-center text-xs font-medium text-foreground transition-colors hover:border-border/70 hover:bg-[#303033]'
const REFLOW_REJECTED_MESSAGE = '此柜列空间不足；地柜缩减后仍无法容纳该物件。'

export default function CabinetPanel() {
  const selectedId = useViewer((s) => s.selection.selectedIds[0])
  const setSelection = useViewer((s) => s.setSelection)
  const [isAnimating, setIsAnimating] = useState(false)
  const [reflowNotice, setReflowNotice] = useState<{ message: string } | null>(null)
  const node = useScene((s) =>
    selectedId ? (s.nodes[selectedId as AnyNodeId] as CabinetEditableNode | undefined) : undefined,
  )
  const parentRun = useScene((s) => {
    if (!selectedId) return undefined
    const selected = s.nodes[selectedId as AnyNodeId]
    return selected?.type === 'cabinet-module'
      ? (cabinetModulePanelContext(selected, s.nodes)?.parentRun ?? undefined)
      : undefined
  })
  const moduleIds = useScene((s) => {
    if (!selectedId) return EMPTY_MODULE_IDS
    const selected = s.nodes[selectedId as AnyNodeId] as CabinetEditableNode | undefined
    const panelContext =
      selected?.type === 'cabinet-module' ? cabinetModulePanelContext(selected, s.nodes) : null
    const parent =
      selected?.type === 'cabinet'
        ? selected
        : panelContext?.reflowModule
          ? panelContext.parentRun
          : undefined
    if (parent?.type !== 'cabinet') return EMPTY_MODULE_IDS
    return (parent.children ?? EMPTY_MODULE_IDS) as AnyNodeId[]
  })
  // Select just the run's modules — subscribing to the whole `s.nodes` record
  // re-rendered the panel on every scene mutation anywhere in the scene.
  const modules = useScene(
    useShallow((s) => {
      if (moduleIds.length === 0) return EMPTY_MODULES
      const found = moduleIds
        .map((id) => s.nodes[id as AnyNodeId] as CabinetModuleNodeType | undefined)
        .filter((child): child is CabinetModuleNodeType => child?.type === 'cabinet-module')
      return found.length === 0 ? EMPTY_MODULES : found
    }),
  )
  const wallChild = useScene((s) => {
    const selected = selectedId ? s.nodes[selectedId as AnyNodeId] : undefined
    return selected?.type === 'cabinet-module'
      ? wallChildOf(selected, s.nodes as Record<string, CabinetEditableNode | undefined>)
      : undefined
  })
  const parentIsModule = useScene((s) => {
    const selected = selectedId ? s.nodes[selectedId as AnyNodeId] : undefined
    return (
      selected?.type === 'cabinet-module' &&
      selected.parentId != null &&
      s.nodes[selected.parentId as AnyNodeId]?.type === 'cabinet-module'
    )
  })
  const showReflowRejected = useCallback(() => {
    setReflowNotice({ message: REFLOW_REJECTED_MESSAGE })
  }, [])

  useEffect(() => {
    if (selectedId) setReflowNotice(null)
  }, [selectedId])

  useEffect(() => {
    if (!reflowNotice) return
    const timeout = window.setTimeout(() => setReflowNotice(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [reflowNotice])

  const updateNode = useCallback(
    (patch: Partial<CabinetEditableNode>) => {
      if (!selectedId) return
      const scene = useScene.getState()
      const liveBeforeUpdate = scene.nodes[selectedId as AnyNodeId] as
        | CabinetEditableNode
        | undefined
      const nextPatch = { ...patch }
      const panelContext =
        liveBeforeUpdate?.type === 'cabinet-module'
          ? cabinetModulePanelContext(liveBeforeUpdate, scene.nodes)
          : null
      if (
        liveBeforeUpdate?.type === 'cabinet-module' &&
        typeof nextPatch.carcassHeight === 'number'
      ) {
        nextPatch.carcassHeight = clampCabinetCarcassHeightForStack(
          liveBeforeUpdate,
          nextPatch.carcassHeight,
          nextPatch.stack,
        )
      }
      if (liveBeforeUpdate?.type === 'cabinet-module') {
        const frontPatch: CabinetRunStylePatch = {}
        if ('frontStyle' in nextPatch) frontPatch.frontStyle = nextPatch.frontStyle
        if ('frontOverlay' in nextPatch) frontPatch.frontOverlay = nextPatch.frontOverlay
        if ('handleStyle' in nextPatch) frontPatch.handleStyle = nextPatch.handleStyle
        if ('handlePosition' in nextPatch) frontPatch.handlePosition = nextPatch.handlePosition
        if (Object.keys(frontPatch).length > 0) {
          applyCabinetModuleFrontPatch({
            module: liveBeforeUpdate,
            patch: frontPatch,
            sceneApi: createSceneApi(useScene),
          })
        }
      }
      if (
        liveBeforeUpdate?.type === 'cabinet-module' &&
        liveBeforeUpdate.parentId &&
        parentRun?.type === 'cabinet' &&
        typeof nextPatch.frontGap === 'number'
      ) {
        const frontGap = nextPatch.frontGap
        scene.updateNode(parentRun.id as AnyNodeId, { frontGap })
        for (const module of modules) {
          scene.updateNode(module.id as AnyNodeId, { frontGap })
          const wallChild = wallChildOf(
            module,
            scene.nodes as Record<string, CabinetEditableNode | undefined>,
          )
          if (wallChild) scene.updateNode(wallChild.id as AnyNodeId, { frontGap })
        }
        bumpRunLayoutRevisionViaStore(scene, parentRun)
        syncCornerStyleGroupFromRun({
          run: parentRun,
          patch: { frontGap },
          sceneApi: createSceneApi(useScene),
        })
        return
      }
      if (
        liveBeforeUpdate?.type === 'cabinet-module' &&
        liveBeforeUpdate.parentId &&
        panelContext?.reflowModule &&
        'width' in nextPatch &&
        typeof nextPatch.width === 'number'
      ) {
        const applied = reflowRunModules({
          modules,
          parentRun: panelContext.parentRun,
          patch: nextPatch as Partial<CabinetModuleNodeType>,
          scene,
          selected: panelContext.reflowModule,
        })
        if (applied) setReflowNotice(null)
        else showReflowRejected()
        return
      }
      if (
        liveBeforeUpdate?.type === 'cabinet-module' &&
        liveBeforeUpdate.parentId &&
        parentRun?.type === 'cabinet' &&
        typeof nextPatch.depth === 'number'
      ) {
        const patchPosition = nextPatch.position as CabinetModuleNodeType['position'] | undefined
        nextPatch.position = [
          patchPosition?.[0] ?? liveBeforeUpdate.position[0],
          patchPosition?.[1] ?? liveBeforeUpdate.position[1],
          backAnchoredModuleZ(
            liveBeforeUpdate.position[2],
            liveBeforeUpdate.depth,
            nextPatch.depth,
          ),
        ]
      }
      scene.updateNode(selectedId as AnyNodeId, nextPatch)
      const liveNode = scene.nodes[selectedId as AnyNodeId] as CabinetEditableNode | undefined
      if (liveNode?.type === 'cabinet-module' && liveNode.parentId) {
        scene.markDirty(liveNode.parentId as AnyNodeId)
        const parent = scene.nodes[liveNode.parentId as AnyNodeId] as
          | CabinetEditableNode
          | undefined
        const affectsRunLayout =
          'stack' in nextPatch ||
          'carcassHeight' in nextPatch ||
          'cabinetType' in nextPatch ||
          'position' in nextPatch ||
          'depth' in nextPatch ||
          'width' in nextPatch
        if (parent?.type === 'cabinet' && affectsRunLayout) {
          bumpRunLayoutRevisionViaStore(scene, parent)
          if (liveNode?.type === 'cabinet-module') {
            syncCornerRunsFromSourceModule({
              module: liveNode,
              previousModule:
                liveBeforeUpdate?.type === 'cabinet-module' ? liveBeforeUpdate : undefined,
              run: parent,
              sceneApi: createSceneApi(useScene),
            })
          }
        }
      }
      // Keep a nested wall cabinet's back flush with its base when the base depth changes.
      if ('depth' in nextPatch && liveNode?.type === 'cabinet-module') {
        const wallChild = wallChildOf(
          liveNode,
          scene.nodes as Record<string, CabinetEditableNode | undefined>,
        )
        if (wallChild) {
          scene.updateNode(wallChild.id as AnyNodeId, {
            position: [
              wallChild.position[0],
              wallChild.position[1],
              backAlignZ(liveNode.depth, wallChild.depth),
            ],
          })
          scene.markDirty(liveNode.id as AnyNodeId)
        }
      }
    },
    [modules, parentRun, selectedId, showReflowRejected],
  )

  const close = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  // Selecting the run as the sole selection is enough: the selection-manager's
  // parent-frame routing keeps clicks on child modules targeting the run while
  // it stays the single selected node.
  const backToRun = useCallback(() => {
    if (node?.type === 'cabinet-module' && node.parentId) {
      setSelection({ selectedIds: [node.parentId] })
    }
  }, [node, setSelection])

  // Animation lives in ./interaction.ts, shared with the registry E-key
  // action; the panel only mirrors its running state for the Play button.
  const stopAnimation = useCallback(() => {
    if (selectedId) stopCabinetAnimation(selectedId as AnyNodeId)
  }, [selectedId])

  const animateOperationState = useCallback(
    (target: 0 | 1) => {
      if (selectedId) animateCabinetOperationState(selectedId as AnyNodeId, target)
    },
    [selectedId],
  )

  useEffect(() => {
    setIsAnimating(selectedId ? isCabinetAnimationRunning(selectedId as AnyNodeId) : false)
    return onCabinetAnimationChange((nodeId, running) => {
      if (nodeId === selectedId) setIsAnimating(running)
    })
  }, [selectedId])

  if (!node || (node.type !== 'cabinet' && node.type !== 'cabinet-module')) return null

  const stack = stackForCabinet(node)
  const planningRun = node.type === 'cabinet' ? node : parentRun
  const planningReports = planningRun
    ? (() => {
        const reports = []
        const pending = [planningRun]
        const seen = new Set<AnyNodeId>()
        while (pending.length > 0) {
          const run = pending.pop()!
          if (seen.has(run.id as AnyNodeId)) continue
          seen.add(run.id as AnyNodeId)
          reports.push(
            validateCabinetRun(run, cabinetModulesForRun(run, useScene.getState().nodes), {
              nodes: useScene.getState().nodes,
            }),
          )
          for (const childId of run.children ?? []) {
            const child = useScene.getState().nodes[childId as AnyNodeId]
            if (child?.type === 'cabinet') pending.push(child)
            if (child?.type === 'cabinet-module') {
              for (const nestedId of child.children ?? []) {
                const nested = useScene.getState().nodes[nestedId as AnyNodeId]
                if (nested?.type === 'cabinet') pending.push(nested)
              }
            }
          }
        }
        return reports
      })()
    : []
  const planningReport = planningReports.length
    ? {
        valid: planningReports.every((report) => report.valid),
        errors: planningReports.flatMap((report) => report.errors),
        warnings: planningReports.flatMap((report) => report.warnings),
      }
    : null
  const isHoodOnlyNode =
    stack.length > 0 && stack.every((compartment) => isHoodCompartmentType(compartment.type))
  const isFridgeModule =
    node.type === 'cabinet-module' &&
    stack.some((compartment) => isFridgeCompartmentType(compartment.type))
  const ceilingOverflow =
    node.type === 'cabinet-module'
      ? cabinetModuleCeilingOverflow(node, useScene.getState().nodes as Record<AnyNodeId, AnyNode>)
      : 0
  const normalized = normalizeCabinetStack(node)
  const rowHeights = new Map(normalized.map((row) => [row.index, row.height]))
  const rows = stack.map((compartment, index) => ({ compartment, index })).reverse()

  const removeWallChildForTallPatch = (
    patch: Partial<CabinetModuleNodeType>,
    scene: ReturnType<typeof useScene.getState>,
    target: CabinetEditableNode = node,
  ) => {
    if (target.type !== 'cabinet-module' || patch.cabinetType !== 'tall') return
    const child = wallChildOf(
      target,
      scene.nodes as Record<string, CabinetEditableNode | undefined>,
    )
    if (child) scene.deleteNode(child.id as AnyNodeId)
  }

  const commitStack = (
    next: CabinetCompartment[],
    extraPatch: Partial<CabinetModuleNodeType> = {},
  ) => {
    const patch = { ...extraPatch, stack: next }
    const minCarcassHeight = minCabinetCarcassHeightForStack({ ...node, stack: next })
    const targetCarcassHeight = patch.carcassHeight ?? node.carcassHeight
    if (targetCarcassHeight < minCarcassHeight) patch.carcassHeight = minCarcassHeight
    const scene = useScene.getState()
    const panelContext =
      node.type === 'cabinet-module' ? cabinetModulePanelContext(node, scene.nodes) : null
    if (node.type === 'cabinet-module' && panelContext?.reflowModule && patch.width) {
      const applied = reflowRunModules({
        modules,
        parentRun: panelContext.parentRun,
        patch,
        scene,
        selected: panelContext.reflowModule,
      })
      if (!applied) {
        showReflowRejected()
        return
      }
      setReflowNotice(null)
      removeWallChildForTallPatch(patch, scene, panelContext.reflowModule)
      return
    }
    removeWallChildForTallPatch(patch, scene)
    updateNode(patch)
  }
  const replaceAt = (index: number, next: CabinetCompartment) => {
    const transition = resolveCompartmentTransition({ node, parentRun, index, next })
    commitStack(transition.stack, transition.modulePatch)
  }
  const resizeAt = (index: number, height: number) =>
    commitStack(resizeCabinetCompartmentStack(node, index, height))
  const removeAt = (index: number) => {
    const result = removeCabinetCompartmentStack(node, index)
    commitStack(result.stack, result.carcassHeight == null ? {} : result)
  }
  const addCompartment = () => commitStack([...stack, newCabinetCompartment('shelf')])
  const moveCompartment = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= stack.length) return
    const next = stack.slice()
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    commitStack(next)
  }

  // Structural run mutations live in run-ops.ts, shared with the quick-action
  // menu so the two surfaces can't drift.
  const runOpsApi = () => createSceneApi(useScene)

  const addWallCabinetOrHoodAbove = (kind: 'cabinet' | 'hood') => {
    if (node?.type !== 'cabinet-module' || parentRun?.type !== 'cabinet') return
    const id = addWallChildAbove({ kind, module: node, run: parentRun, sceneApi: runOpsApi() })
    if (id) setSelection({ selectedIds: [id] })
  }

  const addWallCabinetAbove = () => addWallCabinetOrHoodAbove('cabinet')
  const addHoodAbove = () => addWallCabinetOrHoodAbove('hood')

  const removeWallCabinet = () => {
    if (node?.type !== 'cabinet-module') return
    const scene = useScene.getState()
    const wall = wallChildOf(node, scene.nodes)
    if (!wall) return
    scene.deleteNode(wall.id as AnyNodeId)
    scene.markDirty(node.id as AnyNodeId)
    setSelection({ selectedIds: [node.id] })
  }

  const switchToTall = () => {
    if (node?.type !== 'cabinet-module' || parentRun?.type !== 'cabinet') return
    if (switchCabinetToTall({ module: node, run: parentRun, sceneApi: runOpsApi() })) {
      setSelection({ selectedIds: [node.id] })
    }
  }

  const switchToBase = () => {
    if (node?.type !== 'cabinet-module' || parentRun?.type !== 'cabinet') return
    if (switchCabinetToBase({ module: node, run: parentRun, sceneApi: runOpsApi() })) {
      setSelection({ selectedIds: [node.id] })
    }
  }

  const hasWallCabinet = node?.type === 'cabinet-module' ? Boolean(wallChild) : false

  const isWallChildModule = node?.type === 'cabinet-module' && parentIsModule
  const isWallCabinetModule =
    node?.type === 'cabinet-module' && (isWallChildModule || parentRun?.runTier === 'wall')
  const wallHeightPreset = isWallCabinetModule ? cabinetWallHeightPresetId(node) : 'custom'
  const applyWallHeightPreset = (presetId: CabinetWallHeightPresetId) => {
    if (!isWallCabinetModule) return
    updateNode({ carcassHeight: cabinetWallHeightPresetById(presetId).value })
  }
  const canAddTopFinish =
    node.type === 'cabinet-module' &&
    !isHoodOnlyNode &&
    cabinetModuleSupportsTopFinish({
      module: node,
      parentIsModule,
      parentRun,
    })

  const applyPreset = (presetId: CabinetPresetId) => {
    if (node?.type !== 'cabinet-module' || !cabinetModuleSupportsPresets(node)) return
    const scene = useScene.getState()
    const preset = CABINET_PRESETS.find((entry) => entry.id === presetId)
    if (!preset) return

    const patch = preset.createPatch(parentRun)
    const panelContext = cabinetModulePanelContext(node, scene.nodes)
    const reflowModule = panelContext?.reflowModule

    const nextPatch: Partial<CabinetModuleNodeType> = {
      ...patch,
      position: [
        node.position[0],
        reflowModule ? runModuleBaseY(panelContext.parentRun) : node.position[1],
        typeof patch.depth === 'number'
          ? backAnchoredModuleZ(node.position[2], node.depth, patch.depth)
          : node.position[2],
      ],
    }

    if (reflowModule) {
      const applied = reflowRunModules({
        modules,
        parentRun: panelContext.parentRun,
        patch: nextPatch,
        scene,
        selected: reflowModule,
      })
      if (!applied) {
        showReflowRejected()
        return
      }
      setReflowNotice(null)
      removeWallChildForTallPatch(patch, scene, reflowModule)
    } else {
      removeWallChildForTallPatch(patch, scene)
      updateNode(nextPatch)
    }
    setSelection({ selectedIds: [node.id] })
  }

  const standardWidth =
    node.type === 'cabinet-module' ? cabinetStandardWidthId(node.width) : 'custom'
  const usesFixedApplianceWidth =
    node.type === 'cabinet-module' && cabinetModuleUsesFixedApplianceWidth(node)

  if (node.type === 'cabinet' && modules.length > 0) {
    return <CabinetRunPanel modules={modules} node={node} onClose={close} />
  }

  return (
    <PanelWrapper
      icon="/icons/item.webp"
      onBack={node.type === 'cabinet-module' ? backToRun : undefined}
      onClose={close}
      title={node.name || '模块化橱柜'}
      width={320}
    >
      {node.type === 'cabinet-module' &&
        parentRun?.type === 'cabinet' &&
        cabinetModuleSupportsPresets(node) && (
          <PanelSection title="预设">
            <div className="grid grid-cols-2 gap-2 px-1 pb-2">
              {CABINET_PRESETS.map((preset) => (
                <button
                  className={PRESET_BUTTON_CLASS}
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  type="button"
                >
                  <span className="truncate">{preset.label}</span>
                </button>
              ))}
            </div>
          </PanelSection>
        )}

      <PanelSection title="尺寸">
        {node.type === 'cabinet-module' && !isHoodOnlyNode && (
          <div className="space-y-1 px-1 pb-2">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              标准宽度
            </div>
            <SegmentedControl
              disabled={usesFixedApplianceWidth}
              mixed={standardWidth === 'custom'}
              onChange={(value) =>
                updateNode({
                  width: cabinetStandardWidthById(value as CabinetStandardWidthId).value,
                })
              }
              options={CABINET_STANDARD_WIDTHS.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
              value={standardWidth === 'custom' ? '600' : standardWidth}
            />
          </div>
        )}
        {isWallCabinetModule && !isHoodOnlyNode && (
          <div className="space-y-1 px-1 pb-2">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              高度预设
            </div>
            <SegmentedControl
              mixed={wallHeightPreset === 'custom'}
              onChange={(value) => applyWallHeightPreset(value as CabinetWallHeightPresetId)}
              options={CABINET_WALL_HEIGHT_PRESETS.map((preset) => ({
                label: (
                  <span className="flex flex-col items-center leading-3">
                    <span>{preset.label}</span>
                    <span className="text-[9px] text-muted-foreground">{preset.metricLabel}</span>
                  </span>
                ),
                value: preset.id,
              }))}
              value={wallHeightPreset === 'custom' ? '18' : wallHeightPreset}
            />
            <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
              常用吊柜高度；使用下方滑块可自定义高度。
            </p>
          </div>
        )}
        <SliderControl
          label="宽度"
          max={3}
          min={0.3}
          onChange={(value) => updateNode({ width: value })}
          precision={2}
          step={0.05}
          unit="m"
          value={node.width}
        />
        {!isHoodOnlyNode && (
          <>
            <SliderControl
              label="深度"
              max={1.2}
              min={0.3}
              onChange={(value) => updateNode({ depth: value })}
              precision={2}
              step={0.01}
              unit="m"
              value={node.depth}
            />
            <SliderControl
              label="柜体高度"
              max={
                node.type === 'cabinet-module' && resolveCabinetType(node, parentRun) === 'tall'
                  ? 2.4
                  : 1.4
              }
              min={
                node.type === 'cabinet-module'
                  ? Math.max(0.4, minCabinetCarcassHeightForStack(node))
                  : 0.4
              }
              onChange={(value) => updateNode({ carcassHeight: value })}
              precision={2}
              step={0.01}
              unit="m"
              value={node.carcassHeight}
            />
          </>
        )}
      </PanelSection>

      {node.type === 'cabinet-module' && parentRun?.type === 'cabinet' && !isHoodOnlyNode && (
        <PanelSection title="橱柜类型">
          <div className="space-y-2 px-1 pb-2">
            <SegmentedControl
              onChange={(value) => {
                if (value === 'tall') {
                  switchToTall()
                  return
                }
                switchToBase()
              }}
              options={CABINET_TIER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={resolveCabinetType(node, parentRun)}
            />
            {resolveCabinetType(node, parentRun) === 'base' &&
              (hasWallCabinet ? (
                <ActionButton label="移除吊柜" onClick={removeWallCabinet} />
              ) : (
                <>
                  <ActionButton label="添加吊柜" onClick={addWallCabinetAbove} />
                  <ActionButton label="添加抽油烟机" onClick={addHoodAbove} />
                </>
              ))}
          </div>
        </PanelSection>
      )}

      {canAddTopFinish && (
        <PanelSection title="顶部／天花板">
          <div className="space-y-2 px-1 pb-2">
            <div>
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                饰面
              </div>
              <SegmentedControl
                onChange={(value) =>
                  updateNode({
                    topFinish: value as CabinetModuleNodeType['topFinish'],
                    ...(value !== 'none' && node.topFinish === 'none'
                      ? { topFinishDepth: node.depth }
                      : {}),
                  })
                }
                options={TOP_FINISH_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                value={node.topFinish ?? 'none'}
              />
            </div>
            {node.topFinish !== 'none' && (
              <>
                <ActionButton
                  label="填充至天花板"
                  onClick={() =>
                    updateNode({
                      topFinishHeight: cabinetCeilingGap(
                        node,
                        useScene.getState().nodes as Record<AnyNodeId, AnyNode>,
                      ),
                    })
                  }
                />
                <SliderControl
                  label="顶部高度"
                  max={1.2}
                  min={0}
                  onChange={(value) => updateNode({ topFinishHeight: value })}
                  precision={2}
                  step={0.01}
                  unit="m"
                  value={node.topFinishHeight}
                />
                <SliderControl
                  label="顶部深度"
                  max={1.2}
                  min={0.15}
                  onChange={(value) => updateNode({ topFinishDepth: value })}
                  precision={2}
                  step={0.01}
                  unit="m"
                  value={node.topFinishDepth}
                />
              </>
            )}
            {ceilingOverflow > 1e-4 && (
              <div className="flex gap-1.5 px-1 text-xs leading-5 text-red-300">
                <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" />
                <span>
                  完成面高度超出 {(ceilingOverflow * 1000).toFixed(0)} 毫米（相对天花板）。
                </span>
              </div>
            )}
          </div>
        </PanelSection>
      )}

      {planningReport &&
        (planningReport.errors.length > 0 || planningReport.warnings.length > 0) && (
          <PanelSection title="布局检查">
            <div className="space-y-1 px-1 pb-2 text-xs leading-5">
              {planningReport.errors.map((planningIssue) => (
                <div
                  className="flex gap-1.5 text-red-300"
                  key={`${planningIssue.severity}-${planningIssue.code}-${planningIssue.nodeIds.join('-')}`}
                >
                  <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" />
                  <span>{planningIssue.message}</span>
                </div>
              ))}
              {planningReport.warnings.map((planningIssue) => (
                <div
                  className={`flex gap-1.5 ${planningIssue.code === 'ceiling-overflow' ? 'text-red-300' : 'text-amber-300'}`}
                  key={`${planningIssue.severity}-${planningIssue.code}-${planningIssue.nodeIds.join('-')}`}
                >
                  <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" />
                  <span>{planningIssue.message}</span>
                </div>
              ))}
            </div>
          </PanelSection>
        )}

      {!isHoodOnlyNode && (
        <PanelSection title="开合动画">
          <div className="flex items-center gap-2 px-1">
            <div className="min-w-0 flex-1">
              <SliderControl
                label="打开"
                max={100}
                min={0}
                onChange={(value) => {
                  if (isAnimating) stopAnimation()
                  updateNode({ operationState: value / 100 })
                }}
                step={1}
                unit="%"
                value={Math.round((node.operationState ?? 0) * 100)}
              />
            </div>
            <button
              aria-label={
                isAnimating
                  ? '停止动画'
                  : (node.operationState ?? 0) >= 0.99
                    ? '关闭柜门'
                    : '打开柜门'
              }
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border/40 bg-[#2C2C2E] px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-[#3e3e3e]"
              onClick={() => {
                if (isAnimating) {
                  stopAnimation()
                  return
                }
                animateOperationState((node.operationState ?? 0) >= 0.99 ? 0 : 1)
              }}
              title={
                isAnimating
                  ? '停止动画'
                  : (node.operationState ?? 0) >= 0.99
                    ? '关闭柜门'
                    : '播放动画'
              }
              type="button"
            >
              {isAnimating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span>
                {isAnimating ? '停止' : (node.operationState ?? 0) >= 0.99 ? '关闭' : '播放'}
              </span>
            </button>
          </div>
        </PanelSection>
      )}

      <PanelSection title="分隔单元">
        {reflowNotice ? (
          <p
            aria-live="polite"
            className="px-1 pb-2 text-xs leading-5 text-amber-400"
            role="status"
          >
            {reflowNotice.message}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 px-1 pb-2">
          {rows.map(({ compartment, index }, displayIndex) => (
            <CompartmentCard
              allowHood={isWallChildModule}
              wallCabinet={isWallChildModule}
              compartment={compartment}
              carcassHeight={node.carcassHeight}
              displayIndex={displayIndex}
              index={index}
              key={compartment.id}
              onMove={(delta) => moveCompartment(index, delta)}
              onRemove={() => removeAt(index)}
              onReplace={(next) => replaceAt(index, next)}
              onResizeHeight={(height) => resizeAt(index, height)}
              resolvedHeight={
                rowHeights.get(index) ?? node.carcassHeight / Math.max(stack.length, 1)
              }
              total={rows.length}
              width={node.width}
            />
          ))}
        </div>
        <div className="px-1 pb-1">
          <ActionButton
            icon={<Plus className="h-4 w-4" />}
            label="添加分隔单元"
            onClick={addCompartment}
          />
        </div>
      </PanelSection>

      {!isHoodOnlyNode && (
        <>
          {isFridgeModule && (
            <PanelSection title="电器面板">
              <div className="space-y-2 px-1 pb-2">
                <div>
                  <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    可安装饰板
                  </div>
                  <SegmentedControl
                    onChange={(value) => updateNode({ panelReady: value === 'on' })}
                    options={[
                      { value: 'off', label: '电器' },
                      { value: 'on', label: '橱柜饰板' },
                    ]}
                    value={node.panelReady ? 'on' : 'off'}
                  />
                </div>
                {node.panelReady && (
                  <p className="px-1 text-xs leading-5 text-muted-foreground">
                    使用下方橱柜面板样式、缝隙、拉手和面板材质设置。
                  </p>
                )}
              </div>
            </PanelSection>
          )}
          <PanelSection title="面板">
            <div className="space-y-2 px-1 pb-2">
              <div>
                <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  样式
                </div>
                <SegmentedControl
                  onChange={(value) =>
                    updateNode({ frontStyle: value as CabinetNodeType['frontStyle'] })
                  }
                  options={FRONT_STYLE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  value={node.frontStyle ?? 'slab'}
                />
              </div>
              <div>
                <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  安装方式
                </div>
                <SegmentedControl
                  onChange={(value) =>
                    updateNode({ frontOverlay: value as CabinetNodeType['frontOverlay'] })
                  }
                  options={FRONT_OVERLAY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  value={node.frontOverlay ?? 'full'}
                />
              </div>
              <div>
                <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  面板缝隙
                </div>
                <SegmentedControl
                  mixed={cabinetRevealGapId(node.frontGap) === 'custom'}
                  onChange={(value) =>
                    updateNode({
                      frontGap: cabinetRevealGapById(value as CabinetRevealGapId).value,
                    })
                  }
                  options={CABINET_REVEAL_GAPS.map((gap) => ({
                    value: gap.id,
                    label: gap.label,
                  }))}
                  value={
                    cabinetRevealGapId(node.frontGap) === 'custom'
                      ? '3'
                      : cabinetRevealGapId(node.frontGap)
                  }
                />
              </div>
            </div>
          </PanelSection>

          <PanelSection title="拉手">
            <div className="space-y-2 px-1 pb-2">
              <div>
                <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  样式
                </div>
                <SegmentedControl
                  onChange={(value) =>
                    updateNode({ handleStyle: value as CabinetNodeType['handleStyle'] })
                  }
                  options={HANDLE_STYLE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  value={node.handleStyle}
                />
              </div>
              {(node.handleStyle === 'bar' || node.handleStyle === 'knob') && (
                <div>
                  <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    位置
                  </div>
                  <SegmentedControl
                    onChange={(value) =>
                      updateNode({ handlePosition: value as CabinetNodeType['handlePosition'] })
                    }
                    options={HANDLE_POSITION_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    value={node.handlePosition ?? 'auto'}
                  />
                </div>
              )}
            </div>
          </PanelSection>
        </>
      )}
    </PanelWrapper>
  )
}
