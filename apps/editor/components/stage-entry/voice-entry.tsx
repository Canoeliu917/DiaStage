'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import './stage-entry.css'

const StageCommandInput = dynamic(
  () => import('./command-input').then((module) => module.StageCommandInput),
  { ssr: false, loading: () => <p role="status">正在打开舞台口令…</p> },
)

export function VoiceStageEntry() {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    setReady(true)
  }, [])
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
  }, [open])
  return (
    <>
      <button type="button" disabled={!ready} onClick={() => setOpen(true)}>
        开始说话 / 输入文字
      </button>
      {open && (
        <dialog ref={dialog} className="stage-entry-dialog" onCancel={() => setOpen(false)}>
          <header>
            <h1>语音开台</h1>
            <button type="button" aria-label="关闭舞台口令" onClick={() => setOpen(false)}>
              关闭
            </button>
          </header>
          <StageCommandInput />
        </dialog>
      )}
    </>
  )
}
