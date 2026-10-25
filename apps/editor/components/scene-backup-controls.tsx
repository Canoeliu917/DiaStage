'use client'

import type { SceneGraph } from '@pascal-app/editor'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createSceneCopy, parseSceneBackup } from '@/lib/scene-backup'
import './scene-backup-controls.css'

export function SceneBackupControls({
  sceneName,
  onExport,
  disabled,
}: {
  sceneName: string
  onExport: () => void
  disabled: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState<{ graph: SceneGraph; warnings: string[] } | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <details className="scene-backup-menu">
      <summary>备份 / 恢复</summary>
      <div className="scene-backup-content">
        <button
          type="button"
          aria-label="导出完整备份"
          onClick={onExport}
          disabled={disabled || busy}
        >
          导出完整备份
        </button>
        <label className="grid gap-2">
          从 JSON 恢复为新剧目
          <input
            type="file"
            aria-label="选择场景备份 JSON 文件"
            accept=".json,application/json"
            disabled={disabled || busy}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (!file) return
              setPending(null)
              setError(null)
              setBusy(true)
              try {
                setPending(parseSceneBackup(await file.text()))
                setName(`${file.name.replace(/\.json$/i, '') || sceneName}（恢复）`.slice(0, 200))
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : '无法读取备份文件。')
              } finally {
                setBusy(false)
              }
            }}
          />
        </label>
        {pending && (
          <>
            <p>确认后新建独立剧目，当前剧目保持原样。</p>
            {pending.warnings.length > 0 && (
              <div role="status">
                <p>文件检查提示，请确认后再恢复：</p>
                <ul>
                  {pending.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <label className="grid gap-1">
              新剧目名称
              <input
                aria-label="新剧目名称"
                value={name}
                maxLength={200}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              type="button"
              aria-label="确认恢复为新剧目"
              disabled={busy || !name.trim()}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  router.push(await createSceneCopy(pending.graph, name))
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : '恢复失败，请重试。')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? '正在创建…' : '确认恢复为新剧目'}
            </button>
            <button
              type="button"
              aria-label="取消恢复"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              取消恢复
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
