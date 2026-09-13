'use client'

import { ReferencePanel } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'

export default function ScanPanel() {
  const id = useViewer((s) => s.selection.selectedIds[0])
  if (!id?.startsWith('scan_')) return null
  return (
    <ReferencePanel
      nodeId={id as `scan_${string}`}
      onClose={() => useViewer.getState().setSelection({ selectedIds: [] })}
    />
  )
}
