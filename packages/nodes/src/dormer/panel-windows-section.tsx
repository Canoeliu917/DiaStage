'use client'

import type { WindowNode } from '@pascal-app/core'
import { ActionButton, PanelSection } from '@pascal-app/editor'
import { Move, Pencil, Plus } from 'lucide-react'

export function DormerWindowsSection({
  windows,
  canAdd,
  onAdd,
  onEdit,
  onMove,
}: {
  windows: WindowNode[]
  canAdd: boolean
  onAdd: () => void
  onEdit: (window: WindowNode) => void
  onMove: (window: WindowNode) => void
}) {
  return (
    <PanelSection title={`窗户（${windows.length}）`}>
      {windows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {windows.map((window, index) => (
            <div
              className="flex items-center gap-1 rounded-lg border border-border/50 bg-[#2C2C2E] p-1"
              key={window.id}
            >
              <button
                className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[#3e3e3e]"
                onClick={() => onEdit(window)}
                type="button"
              >
                <span className="block truncate font-medium text-foreground text-xs">
                  {window.name || `窗户 ${index + 1}`}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground capitalize">
                  {window.dormerFace ?? '前侧'} · {window.width.toFixed(2)} ×{' '}
                  {window.height.toFixed(2)} m
                </span>
              </button>
              <button
                aria-label={`编辑 ${window.name || `窗户 ${index + 1}`}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#3e3e3e] hover:text-foreground"
                onClick={() => onEdit(window)}
                title="编辑窗户"
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={`移动 ${window.name || `窗户 ${index + 1}`}`}
                className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-[#3e3e3e] hover:text-foreground"
                onClick={() => onMove(window)}
                title="移动窗户"
                type="button"
              >
                <Move className="h-3.5 w-3.5" />
                移动
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-2 py-3 text-center text-muted-foreground text-xs">暂无窗户</div>
      )}

      <div className="px-1 pt-2 pb-1">
        <ActionButton
          className="w-full"
          disabled={!canAdd}
          icon={<Plus className="h-3.5 w-3.5" />}
          label="添加窗户"
          onClick={onAdd}
        />
        {!canAdd && (
          <p className="px-1 pt-2 text-center text-[10px] text-muted-foreground">
            增大老虎窗宽度后可再添加窗户。
          </p>
        )}
      </div>
    </PanelSection>
  )
}
