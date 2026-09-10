'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { Inspector, PanelWrapper, useEditor, useIsMobile } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useState } from 'react'
import { stageKind } from '@/lib/stage/context'
import { StageObjectPanel, useStagePlacement } from './manual-stage-panel'
import './manual-stage.css'

/** Host-owned property surface keeps scenery edits on the same command boundary as placement. */
export function StageSelectionPanel() {
  const selected = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const readOnly = useScene((state) => state.readOnly)
  const draft = useStagePlacement((state) => state.draft)
  const notice = useStagePlacement((state) => state.notice)
  const mobile = useIsMobile()
  const propertiesInSidebar = useEditor((state) => state.activeSidebarPanel === 'build')
  const [open, setOpen] = useState(false)
  if (!selected.length || draft || readOnly || propertiesInSidebar) return null
  const close = () => useViewer.getState().setSelection({ selectedIds: [] })
  const node = selected.length === 1 ? nodes[selected[0] as AnyNodeId] : undefined
  const scenery = node && (node.type === 'block' || node.type === 'item') && stageKind(node)
  const title = node?.name || (node ? '物件属性' : `已选 ${selected.length} 个物件`)
  const content = node ? (
    scenery ? (
      <StageObjectPanel nodeId={node.id} />
    ) : (
      <Inspector nodeId={node.id} onClose={close} />
    )
  ) : (
    <div className="stage-manual-actions">
      {selected.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => useViewer.getState().setSelection({ selectedIds: [id] })}
        >
          {nodes[id as AnyNodeId]?.name || '未命名物件'}
        </button>
      ))}
    </div>
  )
  // Compatibility inspectors already own their desktop card; do not nest a second one.
  if (!mobile && node && !scenery) return content
  if (!mobile)
    return (
      <PanelWrapper title={title} onClose={close} width={320}>
        <section className="stage-manual stage-selection-content" aria-label="布景检查器">
          {content}
          <p role="status">{notice}</p>
        </section>
      </PanelWrapper>
    )
  return (
    <section className="stage-selection-mobile stage-manual" aria-label="布景检查器">
      <div className="stage-manual-actions">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {title} · {open ? '收起' : '调整'}
        </button>
        <button type="button" onClick={close}>
          取消选择
        </button>
      </div>
      {open && (
        <div className="stage-selection-content">
          {content}
          <p role="status">{notice}</p>
        </div>
      )}
    </section>
  )
}
