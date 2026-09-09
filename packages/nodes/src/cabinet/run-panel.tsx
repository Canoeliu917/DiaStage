'use client'

import type {
  AnyNode,
  AnyNodeId,
  CabinetModuleNode as CabinetModuleNodeType,
  CabinetNode as CabinetNodeType,
} from '@pascal-app/core'
import { createSceneApi, resolveLevelId, useScene } from '@pascal-app/core'
import {
  ActionButton,
  PanelSection,
  PanelWrapper,
  SegmentedControl,
  SliderControl,
  ToggleControl,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Copy, Equal as EqualIcon, Plus, Trash } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  metadataForSelectedWidth,
  metadataWithPresetWidthDebt,
  presetNominalWidth,
  presetWidthDebt,
  recordedPresetNominalWidth,
} from './preset-width-debt'
import {
  CABINET_DIMENSION_PROFILES,
  type CabinetDimensionProfileId,
  cabinetDimensionProfileById,
  cabinetDimensionProfileId,
} from './profiles'
import { MAX_CABINET_WIDTH } from './resize-limits'
import {
  CABINET_REVEAL_GAPS,
  type CabinetRevealGapId,
  cabinetRevealGapById,
  cabinetRevealGapId,
} from './reveals'
import { runWallConstraints } from './run-layout'
import {
  addCabinetModuleSide,
  backAlignZ,
  bumpCabinetRunLayoutRevision,
  cabinetMetadataRecord,
  cabinetRunArrayPlan,
  cabinetRunWidthEqualizationPlan,
  duplicateCabinetModuleAlongRun,
  equalizeCabinetRunWidths,
  nestedCornerRunPositionOverrides,
  resolveCabinetType,
  runModuleBaseY,
  syncCornerRunsFromRunSources,
  syncCornerStyleGroupFromRun,
  wallChildOf,
} from './run-ops'
import {
  backAnchoredModuleZ,
  minCabinetCarcassHeightForStack,
  reflowCabinetRunModules,
  stackForCabinet,
} from './stack'
import {
  CABINET_WALL_HEIGHT_PRESETS,
  type CabinetWallHeightPresetId,
  cabinetWallHeightPresetById,
  cabinetWallHeightPresetId,
} from './wall-height-presets'

export type CabinetEditableNode = CabinetNodeType | CabinetModuleNodeType

const RUN_POSITION_PATCH_KEYS = new Set<keyof CabinetNodeType>(['showPlinth', 'plinthHeight'])
const RUN_MODULE_SYNC_PATCH_KEYS = new Set<keyof CabinetNodeType>([
  'frontStyle',
  'frontOverlay',
  'handleStyle',
  'handlePosition',
  'frontGap',
])
const RUN_DEPTH_PATCH_KEY = 'depth'
const MIN_TRIMMED_CORNER_PRESET_WIDTH = 0.05

function selectCabinetRunPlanningNodes(
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
  runId: AnyNodeId,
): AnyNode[] {
  const run = nodes[runId]
  if (run?.type !== 'cabinet') return []

  const relevantIds = new Set<AnyNodeId>()
  const addWithAncestors = (node: AnyNode | undefined) => {
    let current = node
    const visited = new Set<AnyNodeId>()
    while (current && !visited.has(current.id as AnyNodeId)) {
      const currentId = current.id as AnyNodeId
      visited.add(currentId)
      relevantIds.add(currentId)
      current = current.parentId ? nodes[current.parentId as AnyNodeId] : undefined
    }
  }

  addWithAncestors(run)
  for (const childId of run.children ?? []) addWithAncestors(nodes[childId as AnyNodeId])

  const levelId = resolveLevelId(run, nodes as Record<string, AnyNode>)
  for (const candidate of Object.values(nodes)) {
    if (
      candidate?.type === 'wall' &&
      resolveLevelId(candidate, nodes as Record<string, AnyNode>) === levelId
    ) {
      addWithAncestors(candidate)
    }
  }

  return [...relevantIds].flatMap((id) => {
    const node = nodes[id]
    return node ? [node] : []
  })
}

const FRONT_STYLE_OPTIONS = [
  { value: 'slab', label: '平板' },
  { value: 'shaker', label: '框板式' },
  { value: 'raised-arch', label: '凸起拱形' },
] as const

const FRONT_OVERLAY_OPTIONS = [
  { value: 'full', label: '覆盖式' },
  { value: 'inset', label: '内嵌式' },
] as const

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

function moduleSummary(module: CabinetModuleNodeType) {
  if ((module.cabinetType ?? 'base') === 'tall') return '高柜'
  const stack = stackForCabinet(module)
  if (stack.length === 0) return '空'
  if (stack.length === 1) return stack[0]!.type
  return `${stack.length} 个分隔单元`
}

export function bumpRunLayoutRevisionViaStore(
  scene: ReturnType<typeof useScene.getState>,
  run: CabinetNodeType,
) {
  bumpCabinetRunLayoutRevision(createSceneApi(useScene), run)
  scene.markDirty(run.id as AnyNodeId)
}

function canDonatePresetWidth(module: CabinetModuleNodeType, run: CabinetNodeType): boolean {
  return (
    resolveCabinetType(module, run) === 'base' &&
    stackForCabinet(module).every(
      (compartment) =>
        compartment.type === 'door' ||
        compartment.type === 'drawer' ||
        compartment.type === 'shelf',
    )
  )
}

function hasLinkedCornerRun(module: CabinetModuleNodeType): boolean {
  const value = cabinetMetadataRecord(module.metadata).cabinetCornerSourceLink
  return (
    Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
    Array.isArray((value as { linkedRunIds?: unknown }).linkedRunIds) &&
    (value as { linkedRunIds: unknown[] }).linkedRunIds.length > 0
  )
}

export function reflowRunModules({
  modules,
  parentRun,
  patch,
  scene,
  selected,
}: {
  modules: CabinetModuleNodeType[]
  parentRun: CabinetNodeType
  patch: Partial<CabinetModuleNodeType>
  scene: ReturnType<typeof useScene.getState>
  selected: CabinetModuleNodeType
}): boolean {
  const wallConstraints = runWallConstraints(
    parentRun,
    modules,
    scene.nodes as Record<AnyNodeId, AnyNode>,
    { widthGrowth: Math.max(0, (patch.width ?? selected.width) - selected.width) },
  )
  const sortedModules = [...modules].sort((a, b) => a.position[0] - b.position[0])
  const leftCornerAnchored = Boolean(sortedModules[0] && hasLinkedCornerRun(sortedModules[0]))
  const rightCornerAnchored = Boolean(
    sortedModules.at(-1) && hasLinkedCornerRun(sortedModules.at(-1)!),
  )
  const effectiveWallConstraints = {
    left:
      leftCornerAnchored && wallConstraints.left.constrained
        ? { constrained: true, slack: 0 }
        : wallConstraints.left,
    right:
      rightCornerAnchored && wallConstraints.right.constrained
        ? { constrained: true, slack: 0 }
        : wallConstraints.right,
  }
  const eligibleDonorIds = new Set(
    modules.filter((module) => canDonatePresetWidth(module, parentRun)).map((module) => module.id),
  )
  const preserveExtent =
    effectiveWallConstraints.left.constrained && effectiveWallConstraints.right.constrained
  const selectedWillShrink = (patch.width ?? selected.width) < selected.width - 1e-4
  const nominalWidthById = new Map(
    modules.map((module) => [module.id, recordedPresetNominalWidth(module)]),
  )
  const maximumWidthById = new Map(modules.map((module) => [module.id, presetNominalWidth(module)]))
  const originalDonorIds = new Set(
    modules
      .filter(
        (module) => eligibleDonorIds.has(module.id) && presetWidthDebt(module, selected.id) > 1e-4,
      )
      .map((module) => module.id),
  )
  if (preserveExtent && selectedWillShrink) {
    const sorted = [...modules].sort((a, b) => a.position[0] - b.position[0])
    const selectedIndex = sorted.findIndex((module) => module.id === selected.id)
    const fallbackCandidates = sorted
      .map((module, index) => ({ index, module }))
      .filter(({ module }) => module.id !== selected.id && eligibleDonorIds.has(module.id))
      .sort((a, b) => {
        const distance = Math.abs(a.index - selectedIndex) - Math.abs(b.index - selectedIndex)
        return distance !== 0 ? distance : b.index - a.index
      })
    const freedWidth = selected.width - (patch.width ?? selected.width)
    const ordinaryCapacity = fallbackCandidates.reduce((total, { module }) => {
      const maximumWidth = maximumWidthById.get(module.id) ?? MAX_CABINET_WIDTH
      return total + Math.max(0, maximumWidth - module.width)
    }, 0)
    let extraCapacity = Math.max(0, freedWidth - ordinaryCapacity)
    const extensionCandidates = [...fallbackCandidates].sort((a, b) => {
      const donorOrder =
        Number(originalDonorIds.has(a.module.id)) - Number(originalDonorIds.has(b.module.id))
      return donorOrder !== 0 ? donorOrder : 0
    })
    for (const { module } of extensionCandidates) {
      if (extraCapacity <= 1e-4) break
      const nominalWidth = maximumWidthById.get(module.id) ?? MAX_CABINET_WIDTH
      const addedCapacity = Math.min(extraCapacity, MAX_CABINET_WIDTH - nominalWidth)
      maximumWidthById.set(module.id, nominalWidth + addedCapacity)
      extraCapacity -= addedCapacity
    }
  }
  const reflowed = reflowCabinetRunModules(modules, selected.id, patch.width ?? selected.width, {
    wallConstraints: effectiveWallConstraints,
    eligibleDonorIds,
    minimumWidthById: new Map(
      modules
        .filter(hasLinkedCornerRun)
        .map((module) => [module.id, MIN_TRIMMED_CORNER_PRESET_WIDTH]),
    ),
    maximumWidth: MAX_CABINET_WIDTH,
    maximumWidthById,
    nominalWidthById,
    restorableWidthById: new Map(
      modules.map((module) => [module.id, presetWidthDebt(module, selected.id)]),
    ),
  })
  if (reflowed.length === 0) return false

  const reflowById = new Map(reflowed.map((entry) => [entry.id, entry]))
  for (const module of [...modules].sort((a, b) => a.position[0] - b.position[0])) {
    const reflow = reflowById.get(module.id)
    if (!reflow) continue
    const isSelected = module.id === selected.id
    const nextPatch: Partial<CabinetModuleNodeType> = isSelected
      ? { ...patch, width: reflow.width }
      : { width: reflow.width }
    const widthDelta = reflow.width - module.width
    if (isSelected && Math.abs(widthDelta) > 1e-4) {
      nextPatch.metadata = metadataForSelectedWidth(module, reflow.width, nextPatch.metadata)
    }
    if (!isSelected && Math.abs(widthDelta) > 1e-4) {
      nextPatch.metadata = metadataWithPresetWidthDebt(module, selected.id, widthDelta)
    }
    const nextPosition: CabinetModuleNodeType['position'] = [
      reflow.position[0],
      isSelected && patch.position ? patch.position[1] : reflow.position[1],
      isSelected && typeof patch.depth === 'number'
        ? backAnchoredModuleZ(module.position[2], module.depth, patch.depth)
        : reflow.position[2],
    ]

    if (isSelected) {
      const cabinetType = patch.cabinetType ?? module.cabinetType
      const convertsToBase =
        cabinetType === 'base' && resolveCabinetType(module, parentRun) !== 'base'
      if (convertsToBase) {
        nextPatch.depth = patch.depth ?? parentRun.depth
        nextPatch.carcassHeight = patch.carcassHeight ?? parentRun.carcassHeight
        nextPatch.plinthHeight = patch.plinthHeight ?? parentRun.plinthHeight
        nextPatch.toeKickDepth = patch.toeKickDepth ?? parentRun.toeKickDepth
        nextPatch.countertopThickness = patch.countertopThickness ?? parentRun.countertopThickness
        nextPatch.countertopOverhang = patch.countertopOverhang ?? parentRun.countertopOverhang
      }
    }

    nextPatch.position = nextPosition
    const nestedCornerOverrides = nestedCornerRunPositionOverrides(
      module,
      nextPosition,
      scene.nodes as Readonly<Partial<Record<AnyNodeId, AnyNode>>>,
    )
    scene.updateNode(module.id as AnyNodeId, nextPatch)
    for (const [id, override] of nestedCornerOverrides) {
      scene.updateNode(id, override)
    }

    const wallChild = wallChildOf(
      module,
      scene.nodes as Record<string, CabinetEditableNode | undefined>,
    )
    if (wallChild) {
      scene.updateNode(wallChild.id as AnyNodeId, {
        position: [
          0,
          wallChild.position[1],
          backAlignZ(nextPatch.depth ?? module.depth, wallChild.depth),
        ],
        width: reflow.width,
      })
      scene.markDirty(module.id as AnyNodeId)
    }
  }

  syncCornerRunsFromRunSources({
    baseLayout: 'width-only',
    previousModules: modules,
    run: (useScene.getState().nodes[parentRun.id] as CabinetNodeType | undefined) ?? parentRun,
    sceneApi: createSceneApi(useScene),
  })
  bumpRunLayoutRevisionViaStore(scene, parentRun)
  return true
}

export function updateCabinetRun({
  modules,
  node,
  patch,
}: {
  modules: CabinetModuleNodeType[]
  node: CabinetNodeType
  patch: Partial<CabinetNodeType>
}) {
  const scene = useScene.getState()
  const sceneApi = createSceneApi(useScene)
  const nextPatch = { ...patch }
  if (typeof nextPatch.carcassHeight === 'number') {
    const minModuleHeight = Math.max(
      0.4,
      ...modules.map((module) => minCabinetCarcassHeightForStack(module)),
    )
    nextPatch.carcassHeight = Math.max(nextPatch.carcassHeight, minModuleHeight)
  }
  const nextNode = { ...node, ...nextPatch }
  scene.updateNode(node.id, nextPatch)

  const shouldSyncDepth = RUN_DEPTH_PATCH_KEY in nextPatch
  const shouldSyncHeight = 'carcassHeight' in nextPatch
  const shouldSyncPosition = Object.keys(nextPatch).some((key) =>
    RUN_POSITION_PATCH_KEYS.has(key as keyof CabinetNodeType),
  )
  const shouldSyncModules = Object.keys(nextPatch).some((key) =>
    RUN_MODULE_SYNC_PATCH_KEYS.has(key as keyof CabinetNodeType),
  )
  if (!shouldSyncDepth && !shouldSyncHeight && !shouldSyncPosition && !shouldSyncModules) return

  const stylePatch: Partial<CabinetNodeType> = {}
  if ('frontStyle' in nextPatch) stylePatch.frontStyle = nextNode.frontStyle
  if ('frontOverlay' in nextPatch) stylePatch.frontOverlay = nextNode.frontOverlay
  if ('handleStyle' in nextPatch) stylePatch.handleStyle = nextNode.handleStyle
  if ('handlePosition' in nextPatch) stylePatch.handlePosition = nextNode.handlePosition
  if ('frontGap' in nextPatch) stylePatch.frontGap = nextNode.frontGap

  for (const module of modules) {
    const modulePatch: Partial<CabinetModuleNodeType> = {}
    if (shouldSyncDepth) {
      modulePatch.depth = nextNode.depth
    }
    if (shouldSyncHeight) {
      modulePatch.carcassHeight = Math.max(
        nextNode.carcassHeight,
        minCabinetCarcassHeightForStack(module),
      )
    }
    if (shouldSyncPosition) {
      modulePatch.position = [module.position[0], runModuleBaseY(nextNode), module.position[2]]
    }
    if (shouldSyncModules) {
      if ('frontStyle' in nextPatch) modulePatch.frontStyle = nextNode.frontStyle
      if ('frontOverlay' in nextPatch) modulePatch.frontOverlay = nextNode.frontOverlay
      if ('handleStyle' in nextPatch) modulePatch.handleStyle = nextNode.handleStyle
      if ('handlePosition' in nextPatch) modulePatch.handlePosition = nextNode.handlePosition
      if ('frontGap' in nextPatch) modulePatch.frontGap = nextNode.frontGap
    }
    scene.updateNode(module.id, modulePatch)

    if (shouldSyncModules) {
      const wallChild = wallChildOf(
        module,
        scene.nodes as Record<string, CabinetEditableNode | undefined>,
      )
      if (wallChild) {
        scene.updateNode(wallChild.id, {
          frontStyle: nextNode.frontStyle,
          frontOverlay: nextNode.frontOverlay,
          handleStyle: nextNode.handleStyle,
          handlePosition: nextNode.handlePosition,
          ...('frontGap' in nextPatch ? { frontGap: nextNode.frontGap } : {}),
        })
      }
    }
  }

  if (shouldSyncModules) {
    syncCornerStyleGroupFromRun({
      run: nextNode,
      patch: stylePatch,
      sceneApi,
    })
  } else {
    syncCornerRunsFromRunSources({ run: nextNode, sceneApi })
  }
}

export function CabinetRunPanel({
  node,
  modules,
  onClose,
}: {
  node: CabinetNodeType
  modules: CabinetModuleNodeType[]
  onClose: () => void
}) {
  const setSelection = useViewer((s) => s.setSelection)
  const planningNodeList = useScene(
    useShallow((state) =>
      selectCabinetRunPlanningNodes(
        state.nodes as Record<AnyNodeId, AnyNode>,
        node.id as AnyNodeId,
      ),
    ),
  )
  const planningNodes = useMemo(
    () =>
      Object.fromEntries(planningNodeList.map((planningNode) => [planningNode.id, planningNode])),
    [planningNodeList],
  ) as Record<AnyNodeId, AnyNode>
  const planningNode = (planningNodes[node.id as AnyNodeId] as CabinetNodeType | undefined) ?? node
  const sortedModules = useMemo(
    () => [...modules].sort((a, b) => a.position[0] - b.position[0]),
    [modules],
  )
  const [arraySourceId, setArraySourceId] = useState<AnyNodeId | null>(null)
  const [arrayCopyCount, setArrayCopyCount] = useState(2)
  const [arraySpacing, setArraySpacing] = useState(0)
  const [arrayDirection, setArrayDirection] = useState<'left' | 'right'>('right')
  const widthEqualization = useMemo(
    () => cabinetRunWidthEqualizationPlan(planningNode, planningNodes),
    [planningNode, planningNodes],
  )
  const arraySource = useMemo(
    () =>
      sortedModules.find(
        (module) => module.id === arraySourceId && module.moduleKind !== 'corner-filler',
      ) ?? sortedModules.find((module) => module.moduleKind !== 'corner-filler'),
    [arraySourceId, sortedModules],
  )
  const arrayPlan = useMemo(
    () =>
      cabinetRunArrayPlan(planningNode, planningNodes, {
        copyCount: arrayCopyCount,
        direction: arrayDirection,
        sourceModuleId: arraySource?.id ?? null,
        spacing: arraySpacing,
      }),
    [arrayCopyCount, arrayDirection, arraySource?.id, arraySpacing, planningNode, planningNodes],
  )

  const updateRun = useCallback(
    (patch: Partial<CabinetNodeType>) => updateCabinetRun({ modules, node, patch }),
    [modules, node],
  )

  const addModule = useCallback(
    (side: 'left' | 'right') => {
      const id = addCabinetModuleSide({
        anchorModule: null,
        run: node,
        sceneApi: createSceneApi(useScene),
        side,
      })
      if (id) setSelection({ selectedIds: [id] })
    },
    [node, setSelection],
  )

  const equalizeWidths = useCallback(() => {
    equalizeCabinetRunWidths({ run: node, sceneApi: createSceneApi(useScene) })
  }, [node])

  const equalizeWidthsTitle = !widthEqualization.ok
    ? widthEqualization.reason === 'not-enough-modules'
      ? '至少需要两个标准地柜'
      : '柜列可用宽度无法满足橱柜宽度限制'
    : widthEqualization.changed
      ? '均分此柜列中所有可调整标准地柜的宽度'
      : '可调整的橱柜宽度已相等'

  const duplicateAlongRun = useCallback(() => {
    if (!arraySource) return
    const copiedIds = duplicateCabinetModuleAlongRun({
      copyCount: arrayCopyCount,
      direction: arrayDirection,
      run: node,
      sceneApi: createSceneApi(useScene),
      sourceModuleId: arraySource.id as AnyNodeId,
      spacing: arraySpacing,
    })
    if (copiedIds?.length) setSelection({ selectedIds: [node.id as AnyNodeId] })
  }, [arrayCopyCount, arrayDirection, arraySpacing, arraySource, node, setSelection])

  const duplicateAlongRunTitle = !arrayPlan.ok
    ? arrayPlan.reason === 'no-source'
      ? '请选择标准柜或电器柜模块作为源'
      : arrayPlan.reason === 'invalid-options'
        ? '副本数量请选择 1 至 20，间距请选择 0 至 2 米'
        : '此柜列没有足够空间容纳所需阵列'
    : `创建 ${arrayCopyCount} 个 ${arraySource?.name || '模块'} 副本`

  const dimensionProfile = cabinetDimensionProfileId(node)
  const wallHeightPreset = cabinetWallHeightPresetId(node)
  const applyWallHeightPreset = useCallback(
    (presetId: CabinetWallHeightPresetId) => {
      updateRun({ carcassHeight: cabinetWallHeightPresetById(presetId).value })
    },
    [updateRun],
  )
  const applyDimensionProfile = useCallback(
    (profileId: CabinetDimensionProfileId) => {
      const profile = cabinetDimensionProfileById(profileId)
      updateRun({
        carcassHeight: profile.carcassHeight,
        countertopThickness: profile.countertopThickness,
        depth: profile.depth,
        plinthHeight: profile.plinthHeight,
      })
    },
    [updateRun],
  )

  const deleteModule = useCallback(
    (module: CabinetModuleNodeType) => {
      useScene.getState().deleteNode(module.id as AnyNodeId)
      // Deleting the last module cascades the empty run away too — only
      // keep it selected/dirty if it survived.
      if (useScene.getState().nodes[node.id as AnyNodeId]) {
        useScene.getState().markDirty(node.id as AnyNodeId)
        setSelection({ selectedIds: [node.id] })
      } else {
        setSelection({ selectedIds: [] })
      }
    },
    [node.id, setSelection],
  )

  return (
    <PanelWrapper
      icon="/icons/item.webp"
      onClose={onClose}
      title={node.name || '模块化橱柜'}
      width={320}
    >
      <PanelSection title="模块">
        <div className="flex flex-col gap-2 px-1 pb-2">
          {sortedModules.map((module, index) => (
            <div
              className="flex items-center justify-between rounded-lg border border-border/40 bg-[#252527] px-2 py-2"
              key={module.id}
            >
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setSelection({ selectedIds: [module.id] })}
                type="button"
              >
                <div className="truncate text-xs font-medium text-foreground">
                  {module.name || `模块 ${index + 1}`}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {moduleSummary(module)}
                </div>
              </button>
              <button
                aria-label={`将 ${module.name || `模块 ${index + 1}`} 设为阵列源`}
                className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                disabled={module.moduleKind === 'corner-filler'}
                onClick={() => setArraySourceId(module.id as AnyNodeId)}
                title={
                  module.moduleKind === 'corner-filler'
                    ? '转角填板不能作为阵列源'
                    : '将此模块设为阵列源'
                }
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-500/20 bg-red-500/8 text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200 disabled:opacity-30"
                disabled={modules.length <= 1}
                onClick={() => deleteModule(module)}
                type="button"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="px-1 pb-1">
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              icon={<Plus className="h-4 w-4" />}
              label="向左添加"
              onClick={() => addModule('left')}
            />
            <ActionButton
              icon={<Plus className="h-4 w-4" />}
              label="向右添加"
              onClick={() => addModule('right')}
            />
          </div>
          <ActionButton
            className="mt-2 w-full"
            disabled={!widthEqualization.ok || !widthEqualization.changed}
            icon={<EqualIcon className="h-4 w-4" />}
            label="均分宽度"
            onClick={equalizeWidths}
            title={equalizeWidthsTitle}
          />
          <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
            均分标准地柜的宽度，并保持电器柜与转角填板宽度不变。
          </p>
        </div>
      </PanelSection>

      <PanelSection title="沿柜列复制">
        <div className="space-y-2 px-1 pb-2">
          <div className="rounded-lg border border-border/40 bg-[#252527] px-2 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">源模块</div>
            <div className="truncate pt-1 text-xs font-medium text-foreground">
              {arraySource?.name || (arraySource ? moduleSummary(arraySource) : '没有可用模块')}
            </div>
          </div>
          <SliderControl
            label="副本数量"
            max={20}
            min={1}
            onChange={(value) => setArrayCopyCount(Math.round(value))}
            precision={0}
            step={1}
            value={arrayCopyCount}
          />
          <SliderControl
            label="间距"
            max={2}
            min={0}
            onChange={setArraySpacing}
            precision={2}
            step={0.01}
            unit="m"
            value={arraySpacing}
          />
          <div>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              方向
            </div>
            <SegmentedControl
              onChange={(value) => setArrayDirection(value as 'left' | 'right')}
              options={[
                { value: 'left', label: '左' },
                { value: 'right', label: '右' },
              ]}
              value={arrayDirection}
            />
          </div>
          <ActionButton
            className="w-full"
            disabled={!arrayPlan.ok}
            icon={<Copy className="h-4 w-4" />}
            label="创建阵列"
            onClick={duplicateAlongRun}
            title={duplicateAlongRunTitle}
          />
          <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
            副本包含源柜结构及其附属吊柜。现有模块位置不变；创建的阵列需容纳于柜列剩余空间。
          </p>
        </div>
      </PanelSection>

      <PanelSection title="共用踢脚板与台面">
        <div className="space-y-2 px-1 pb-2">
          {node.runTier === 'base' && (
            <div>
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                标准尺寸
              </div>
              <SegmentedControl
                mixed={dimensionProfile === 'custom'}
                onChange={(value) => applyDimensionProfile(value as CabinetDimensionProfileId)}
                options={CABINET_DIMENSION_PROFILES.map((profile) => ({
                  label: profile.label,
                  value: profile.id,
                }))}
                value={dimensionProfile === 'us-base' ? 'us-base' : 'metric-base'}
              />
              <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
                将深度、柜体、踢脚板和台面厚度应用到此柜列。
              </p>
            </div>
          )}
          {node.runTier === 'wall' && (
            <div>
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
            label="深度"
            max={1.2}
            min={0.3}
            onChange={(value) => updateRun({ depth: value })}
            precision={2}
            step={0.01}
            unit="m"
            value={node.depth}
          />
          <SliderControl
            label="柜体高度"
            max={node.runTier === 'tall' ? 2.4 : 1.4}
            min={Math.max(0.4, ...modules.map((module) => minCabinetCarcassHeightForStack(module)))}
            onChange={(value) => updateRun({ carcassHeight: value })}
            precision={2}
            step={0.01}
            unit="m"
            value={node.carcassHeight}
          />
          <ToggleControl
            checked={node.showPlinth}
            label="显示踢脚板"
            onChange={(checked) => updateRun({ showPlinth: checked })}
          />
          {node.showPlinth && (
            <SliderControl
              label="踢脚板高度"
              max={0.3}
              min={0.02}
              onChange={(value) => updateRun({ plinthHeight: value })}
              precision={2}
              step={0.01}
              unit="m"
              value={node.plinthHeight}
            />
          )}
          <ToggleControl
            checked={node.withCountertop}
            label="显示台面"
            onChange={(checked) => updateRun({ withCountertop: checked })}
          />
          {node.withCountertop && (
            <>
              <SliderControl
                label="台面高度"
                max={0.08}
                min={0.005}
                onChange={(value) => updateRun({ countertopThickness: value })}
                precision={3}
                step={0.005}
                unit="m"
                value={node.countertopThickness}
              />
              <SliderControl
                label="台面深度"
                max={0.12}
                min={0}
                onChange={(value) => updateRun({ countertopOverhang: value })}
                precision={2}
                step={0.005}
                unit="m"
                value={node.countertopOverhang}
              />
            </>
          )}
        </div>
      </PanelSection>

      <PanelSection title="中岛与吧台">
        <div className="space-y-2 px-1 pb-2">
          {node.withCountertop && node.barLedge?.edge !== 'back' && (
            <SliderControl
              label="座位侧挑出"
              max={0.45}
              min={0}
              onChange={(value) => updateRun({ countertopBackOverhang: value })}
              precision={2}
              step={0.05}
              unit="m"
              value={node.countertopBackOverhang}
            />
          )}
          <ToggleControl
            checked={node.withFinishedBack}
            label="背面饰板"
            onChange={(checked) => updateRun({ withFinishedBack: checked })}
          />
          <ToggleControl
            checked={node.withFinishedEnds}
            label="端部饰板"
            onChange={(checked) => updateRun({ withFinishedEnds: checked })}
          />
          {node.withCountertop && (
            <ToggleControl
              checked={node.withWaterfall}
              label="落地侧板"
              onChange={(checked) => updateRun({ withWaterfall: checked })}
            />
          )}
          <ToggleControl
            checked={Boolean(node.barLedge)}
            label="吧台"
            onChange={(checked) =>
              updateRun({
                barLedge: checked ? { edge: 'back', height: 1.06, depth: 0.35 } : undefined,
              })
            }
          />
          {node.barLedge && (
            <>
              <SegmentedControl
                onChange={(value) =>
                  updateRun({
                    barLedge: { ...node.barLedge!, edge: value as 'back' | 'left' | 'right' },
                  })
                }
                options={[
                  { value: 'back', label: '后侧' },
                  { value: 'left', label: '左' },
                  { value: 'right', label: '右' },
                ]}
                value={node.barLedge.edge}
              />
              <SliderControl
                label="吧台高度"
                max={1.3}
                min={0.9}
                onChange={(value) => updateRun({ barLedge: { ...node.barLedge!, height: value } })}
                precision={2}
                step={0.01}
                unit="m"
                value={node.barLedge.height}
              />
              <SliderControl
                label="吧台深度"
                max={0.5}
                min={0.15}
                onChange={(value) => updateRun({ barLedge: { ...node.barLedge!, depth: value } })}
                precision={2}
                step={0.01}
                unit="m"
                value={node.barLedge.depth}
              />
            </>
          )}
        </div>
      </PanelSection>

      <PanelSection title="面板">
        <div className="space-y-2 px-1 pb-2">
          <div>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              样式
            </div>
            <SegmentedControl
              onChange={(value) =>
                updateRun({ frontStyle: value as CabinetNodeType['frontStyle'] })
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
                updateRun({ frontOverlay: value as CabinetNodeType['frontOverlay'] })
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
                updateRun({
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
                updateRun({ handleStyle: value as CabinetNodeType['handleStyle'] })
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
                  updateRun({ handlePosition: value as CabinetNodeType['handlePosition'] })
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
    </PanelWrapper>
  )
}
