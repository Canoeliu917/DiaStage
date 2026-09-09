'use client'

import { ActionButton, ActionGroup, PanelSection } from '@pascal-app/editor'
import { Copy, Move, Trash2 } from 'lucide-react'

/**
 * Move / Duplicate / Delete buttons at the bottom of the dormer
 * inspector. Pure presentation — owners pass the three handlers.
 */
export function DormerActionsSection({
  onMove,
  onDuplicate,
  onDelete,
}: {
  onMove: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <PanelSection title="操作">
      <ActionGroup>
        <ActionButton icon={<Move className="h-3.5 w-3.5" />} label="移动" onClick={onMove} />
        <ActionButton icon={<Copy className="h-3.5 w-3.5" />} label="复制" onClick={onDuplicate} />
        <ActionButton
          className="hover:bg-red-500/20"
          icon={<Trash2 className="h-3.5 w-3.5 text-red-400" />}
          label="删除"
          onClick={onDelete}
        />
      </ActionGroup>
    </PanelSection>
  )
}
