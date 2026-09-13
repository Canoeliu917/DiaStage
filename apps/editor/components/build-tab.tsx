'use client'

import { nodeRegistry, useScene } from '@pascal-app/core'
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

export function BuildTab() {
  const activeTool = useEditor((state) => state.tool)
  const mode = useEditor((state) => state.mode)
  const readOnly = useScene((state) => state.readOnly)
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
      ) : null}
    </div>
  )
}
