'use client'

import { type AnyNodeId, useRegistryVersion, useScene } from '@pascal-app/core'
import { triggerSFX, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { insertBuildNodes } from '@/lib/build-presets'
import { presetThumbnailUrl } from '@/lib/preset-thumbnails'
import {
  filterRoomPresets,
  type RoomPreset,
  roomPresetIssue,
  roomPresetName,
  roomPresetSnapshot,
} from '@/lib/rooms-presets'
import { cn } from '@/lib/utils'

const SOURCES = [
  { value: 'library', label: 'Pascal' },
  { value: 'community', label: '社区' },
] as const

export function RoomsPresetPanel() {
  useRegistryVersion()
  const [source, setSource] = useState<RoomPreset['source']>('library')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const readOnly = useScene((state) => state.readOnly)
  const levelId = useViewer((state) => state.selection.levelId)
  const rooms = useMemo(() => filterRoomPresets(source, search), [source, search])
  const cards = rooms.map((room) => ({ room, issue: roomPresetIssue(room) }))

  const insertRoom = (room: RoomPreset) => {
    try {
      // Finish the old tool's draft cleanup before the single undoable insertion.
      flushSync(() => {
        const editor = useEditor.getState()
        editor.setMode('select')
        editor.setTool(null)
      })
      const selectedLevel = useViewer.getState().selection.levelId
      const level = selectedLevel ? useScene.getState().nodes[selectedLevel as AnyNodeId] : null
      if (level?.type !== 'level') throw new Error('请先选择要插入的楼层。')
      const ids = insertBuildNodes(roomPresetSnapshot(room), level.id)
      useViewer.getState().setSelection({ selectedIds: ids })
      triggerSFX('sfx:menu-click')
      setNotice(`已插入“${roomPresetName(room)}”，可移动已选中的房间构件。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '房间插入失败。')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-guide-target="build-rooms">
      <input
        aria-label="搜索预制房间"
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="搜索房间名称或标签"
        type="search"
        value={search}
      />
      <div className="flex shrink-0 items-center gap-4 px-1">
        {SOURCES.map((entry) => (
          <button
            aria-pressed={source === entry.value}
            className={cn(
              'border-b-2 px-0.5 py-1.5 font-medium text-xs',
              source === entry.value
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground',
            )}
            key={entry.value}
            onClick={() => setSource(entry.value)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground text-xs">{rooms.length} 个房间</span>
      </div>
      <p className="text-muted-foreground text-xs">
        {readOnly
          ? '当前场景为只读。'
          : !levelId
            ? '请先选择要插入的楼层。'
            : '点击在当前楼层按预设坐标插入，并选中构件；可一步撤销。'}
      </p>
      {notice ? (
        <p className="text-xs" role="status">
          {notice}
        </p>
      ) : null}
      <div className="subtle-scrollbar grid min-h-0 flex-1 grid-cols-2 auto-rows-min gap-2 overflow-y-auto">
        {cards.map(({ room, issue }) => (
          <button
            className="group flex flex-col gap-1.5 rounded-xl p-1.5 text-left transition-colors hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-40"
            disabled={readOnly || !levelId || issue !== null}
            key={room.id}
            onClick={() => insertRoom(room)}
            title={issue ?? `插入 ${roomPresetName(room)}`}
            type="button"
          >
            <img
              alt={roomPresetName(room)}
              className="aspect-square w-full rounded-lg bg-muted object-cover"
              loading="lazy"
              src={presetThumbnailUrl(room.id, room.thumbnailUrl)}
            />
            <span className="line-clamp-2 text-xs leading-4">{roomPresetName(room)}</span>
            {issue ? <span className="text-amber-300 text-xs">{issue}</span> : null}
          </button>
        ))}
        {rooms.length === 0 ? (
          <p className="col-span-2 py-4 text-muted-foreground text-sm">没有匹配的房间。</p>
        ) : null}
      </div>
    </div>
  )
}
