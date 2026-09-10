'use client'

import { type AnyNodeId, nodeRegistry, useScene } from '@pascal-app/core'
import {
  getFloorplanNodeExtension,
  isFloorplanToolAvailableInMode,
  MaterialPaintPanel,
  triggerSFX,
  useEditor,
  useFloorplanMode,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  BUILD_PRESETS,
  type BuildPreset,
  buildPresetLabel,
  buildPresetSnapshot,
  buildPresetToolDefaults,
  buildPresetUsesTool,
  insertBuildNodes,
  validateBuildSnapshot,
} from '@/lib/build-presets'
import { presetThumbnailUrl } from '@/lib/preset-thumbnails'
import { cn } from '@/lib/utils'

type BuildType = { id: string; label: string; iconSrc: string; kind?: string }
export const BASE_BUILD_TYPES: BuildType[] = [
  { id: 'block', label: '台块 / 平台', iconSrc: '/icons/cube.webp', kind: 'block' },
  { id: 'wall', label: '景片', iconSrc: '/icons/wall.webp', kind: 'wall' },
  { id: 'fence', label: '栏杆', iconSrc: '/icons/fence.webp', kind: 'fence' },
  { id: 'shelf', label: '置物架', iconSrc: '/icons/shelf.webp', kind: 'shelf' },
  { id: 'door', label: '实用门', iconSrc: '/icons/door.webp', kind: 'door' },
  { id: 'window', label: '实用窗', iconSrc: '/icons/window.webp', kind: 'window' },
  { id: 'stair', label: '舞台台阶', iconSrc: '/icons/stairs.webp', kind: 'stair' },
  { id: 'painting', label: '表面处理', iconSrc: '/icons/paint.webp' },
]

function activateBuildTool(kind: string): void {
  if (!BASE_BUILD_TYPES.some((type) => type.kind === kind)) return
  const ed = useEditor.getState()
  const definition = nodeRegistry.get(kind)
  const extension = getFloorplanNodeExtension(definition)
  if (
    !isFloorplanToolAvailableInMode(extension?.availableModes, useFloorplanMode.getState().mode)
  ) {
    useFloorplanMode
      .getState()
      .showExpertModeNotice(BASE_BUILD_TYPES.find((type) => type.kind === kind)?.label ?? '布景')
    return
  }
  const preferredView = extension?.preferredView
  if (preferredView) ed.setViewMode(preferredView)
  useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setCatalogCategory(null)
  ed.setToolDefaults(kind, null)
  ed.setMode('build')
  ed.setTool(kind)
}

function BuildPresetPanel({ kind }: { kind: string | null }) {
  const [source, setSource] = useState<'library' | 'community'>('library')
  const [search, setSearch] = useState('')
  const [allKinds, setAllKinds] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const readOnly = useScene((state) => state.readOnly)
  const materials = useScene((state) => state.materials)
  const presets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return BUILD_PRESETS.filter((preset) => {
      if (!BASE_BUILD_TYPES.some((type) => type.kind === preset.rootKind)) return false
      if (/浴|车库|商用/.test(buildPresetLabel(preset))) return false
      if (
        preset.nodeData.descendants.some(
          (node) =>
            !BASE_BUILD_TYPES.some((type) => type.kind === node.type) &&
            node.type !== 'stair-segment',
        )
      )
        return false
      const matchesKind = allKinds || !kind || preset.rootKind === kind
      return (
        matchesKind &&
        preset.source === source &&
        (!query || `${buildPresetLabel(preset)} ${preset.name}`.toLocaleLowerCase().includes(query))
      )
    })
  }, [allKinds, kind, search, source])
  const issues = useMemo(
    () =>
      new Map(
        presets.map((preset) => {
          try {
            validateBuildSnapshot(buildPresetSnapshot(preset), materials)
            return [preset.id, null] as const
          } catch (error) {
            return [preset.id, error instanceof Error ? error.message : '预设暂不可用。'] as const
          }
        }),
      ),
    [presets, materials],
  )

  const activatePreset = (preset: BuildPreset) => {
    try {
      if (readOnly) throw new Error('当前场景为只读。')
      validateBuildSnapshot(buildPresetSnapshot(preset))
      if (buildPresetUsesTool(preset)) {
        useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
        activateBuildTool(preset.rootKind)
        useEditor.getState().setToolDefaults(preset.rootKind, buildPresetToolDefaults(preset))
        setNotice(`已选「${buildPresetLabel(preset)}」。点击舞台绘制或放置，Esc 取消。`)
      } else {
        const levelId = useViewer.getState().selection.levelId
        if (!levelId) throw new Error('请先选择要插入的表演层。')
        // Finish the old drawing tool's cleanup before the new batch enters history.
        flushSync(() => {
          useEditor.getState().setMode('select')
          useEditor.getState().setTool(null)
        })
        const ids = insertBuildNodes(buildPresetSnapshot(preset), levelId as AnyNodeId)
        useViewer.getState().setSelection({ selectedIds: ids })
        setNotice(`已插入并选中「${buildPresetLabel(preset)}」，可移动调整；撤销可移除本次插入。`)
      }
      triggerSFX('sfx:menu-click')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '预设载入失败。')
    }
  }

  return (
    <section
      className="flex min-h-32 max-h-[45%] shrink-0 flex-col gap-2 border-border/50 border-t pt-3"
      aria-label="布景构件"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-xs">布景构件 · {presets.length}</span>
        <label className="flex items-center gap-1 text-muted-foreground text-xs">
          <input
            checked={allKinds}
            onChange={(event) => setAllKinds(event.target.checked)}
            type="checkbox"
          />
          全部类别
        </label>
      </div>
      <div className="flex gap-2">
        <select
          aria-label="预设来源"
          className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={source}
          onChange={(event) =>
            setSource(event.target.value === 'community' ? 'community' : 'library')
          }
        >
          <option value="library">内置资源</option>
          <option value="community">社区</option>
        </select>
        <input
          aria-label="搜索布景构件"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          placeholder="搜索预设"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        绘制预设沿用原生工具；「插入并选择」保留快照坐标，可再移动调整。
      </p>
      <div className="min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              className="overflow-hidden rounded-lg border border-border/60 bg-muted/30 text-left transition-colors hover:bg-muted disabled:opacity-50"
              disabled={readOnly || Boolean(issues.get(preset.id))}
              key={preset.id}
              onClick={() => activatePreset(preset)}
              type="button"
            >
              <Image
                alt=""
                className="aspect-[3/2] w-full object-contain"
                height={100}
                loading="lazy"
                src={presetThumbnailUrl(preset.id, preset.thumbnailUrl)}
                unoptimized
                width={150}
              />
              <span className="block break-words px-2 pt-1 text-xs leading-4">
                {buildPresetLabel(preset)}
              </span>
              <span className="block break-words px-2 py-1.5 text-[10px] text-muted-foreground">
                {issues.get(preset.id) ??
                  (buildPresetUsesTool(preset) ? '点击后在舞台放置' : '插入并选择')}
              </span>
            </button>
          ))}
        </div>
        {presets.length === 0 && (
          <p className="py-4 text-center text-muted-foreground text-xs">此来源下没有匹配的预设。</p>
        )}
      </div>
      {notice && (
        <p aria-live="polite" className="text-xs leading-relaxed">
          {notice}
        </p>
      )}
    </section>
  )
}

export function BuildTab() {
  const activeTool = useEditor((state) => state.tool)
  const mode = useEditor((state) => state.mode)
  const readOnly = useScene((state) => state.readOnly)
  const activeType = BASE_BUILD_TYPES.find((type) => type.kind === activeTool)
  return (
    <div className="build-palette flex h-full flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">选择布景，再点击舞台绘制或放置。Esc 取消。</p>
      <div className="grid grid-cols-2 gap-1.5">
        {BASE_BUILD_TYPES.map((type) => {
          const active =
            type.id === 'painting'
              ? mode === 'material-paint'
              : mode === 'build' && type.kind === activeTool
          return (
            <button
              aria-pressed={active}
              className={cn(
                'flex min-h-16 items-center gap-2 rounded border border-border/50 p-2 text-left text-xs hover:bg-muted',
                active && 'bg-muted ring-1 ring-foreground',
              )}
              disabled={readOnly}
              key={type.id}
              onClick={() => {
                triggerSFX('sfx:menu-click')
                if (type.kind) activateBuildTool(type.kind)
                else useEditor.getState().armMaterialPaint()
              }}
              type="button"
            >
              <Image
                alt=""
                className="size-8 object-contain"
                height={32}
                src={type.iconSrc}
                width={32}
              />
              {type.label}
            </button>
          )
        })}
      </div>
      {mode === 'material-paint' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MaterialPaintPanel />
        </div>
      ) : (
        <BuildPresetPanel kind={mode === 'build' ? (activeType?.kind ?? null) : null} />
      )}
    </div>
  )
}
