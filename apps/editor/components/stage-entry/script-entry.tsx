'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import './stage-entry.css'

const ScriptStageInput = dynamic(
  () => import('./script-input').then((module) => module.ScriptStageInput),
  {
    ssr: false,
    loading: () => <p role="status">正在打开剧本导入…</p>,
  },
)

export function ScriptStageEntry({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen),
    [ready, setReady] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => setReady(true), [])
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
  }, [open])
  return (
    <>
      <button type="button" disabled={!ready} onClick={() => setOpen(true)}>
        选择 PDF / Word
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="stage-entry-dialog stage-script-dialog"
          onCancel={() => setOpen(false)}
        >
          <header>
            <h1>剧本搭台</h1>
            <button type="button" aria-label="关闭剧本导入" onClick={() => setOpen(false)}>
              关闭
            </button>
          </header>
          <ScriptStageInput />
        </dialog>
      )}
    </>
  )
}
