'use client'

import type { LevelNode } from '@pascal-app/core'
import { useEffect, useState } from 'react'
import type { LevelDuplicatePreset } from '../../lib/level-duplication'
import { getLevelDisplayName } from '@pascal-app/core'
import { cn } from '../../lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './primitives/dialog'

const DUPLICATE_PRESETS: Array<{
  id: LevelDuplicatePreset
  label: string
  description: string
}> = [
  {
    id: 'everything',
    label: '全部内容',
    description: '平台、布景、材质、物件和参考资源。',
  },
  {
    id: 'structure',
    label: '仅舞台基础',
    description: '不含材质的墙体、平台、舞台台阶、窗和门。',
  },
  {
    id: 'structure-materials',
    label: '舞台基础与材质',
    description: '包含当前材质的墙体、平台和舞台台阶。',
  },
  {
    id: 'structure-furniture',
    label: '舞台基础与物件',
    description: '平台、布景、材质和已放置物件，不含参考资源。',
  },
]

function getLevelLabel(level: LevelNode | null) {
  if (!level) return '当前表演层'
  return getLevelDisplayName(level)
}

export function LevelDuplicateDialog({
  open,
  level,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  level: LevelNode | null
  onConfirm: (preset: LevelDuplicatePreset) => void
  onOpenChange: (open: boolean) => void
}) {
  const [preset, setPreset] = useState<LevelDuplicatePreset>('everything')

  useEffect(() => {
    if (open) {
      setPreset('everything')
    }
  }, [open])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>复制表演层</DialogTitle>
          <DialogDescription>选择复制内容，来源： {getLevelLabel(level)}.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {DUPLICATE_PRESETS.map((option) => (
            <button
              className={cn(
                'cursor-pointer rounded-xl border px-3 py-3 text-left transition-colors',
                preset === option.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-background hover:bg-accent/40',
              )}
              key={option.id}
              onClick={() => setPreset(option.id)}
              type="button"
            >
              <div className="font-medium text-sm">{option.label}</div>
              <div className="mt-1 text-muted-foreground text-xs">{option.description}</div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <button
            className="cursor-pointer rounded-md px-4 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            取消
          </button>
          <button
            className="cursor-pointer rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm transition-opacity hover:opacity-90"
            onClick={() => onConfirm(preset)}
            type="button"
          >
            复制
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
