'use client'

import type { SceneGraph } from '@pascal-app/editor'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

interface SaveButtonProps {
  sceneId: string
  name: string
  version: number
  getGraph: () => SceneGraph | null
}

export function CreateSceneButton({ label = '新建剧目' }: { label?: string } = {}) {
  return (
    <Link
      className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-sm hover:bg-accent/80"
      href="/?entry=manual&lit=1"
    >
      {label}
    </Link>
  )
}

/**
 * Save + Save-as buttons that call the scenes API directly.
 * Used for UIs that want explicit save controls outside of the Editor's
 * built-in autosave plumbing.
 */
export function SaveButton({ sceneId, name, version, getGraph }: SaveButtonProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    const graph = getGraph()
    if (!graph) {
      setStatus('没有可保存的场景')
      return
    }
    setIsSaving(true)
    setStatus(null)
    try {
      const response = await fetch(`/api/scenes/${sceneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': String(version),
        },
        body: JSON.stringify({ name, graph }),
      })
      if (response.status === 409) {
        setStatus('场景存在更新冲突，请重新加载')
        return
      }
      if (!response.ok) {
        setStatus(`保存失败 (${response.status})`)
        return
      }
      setStatus('已保存')
    } catch (error) {
      console.error('[scene-save]', error)
      setStatus('保存失败，请检查连接后重试。')
    } finally {
      setIsSaving(false)
    }
  }, [getGraph, name, sceneId, version])

  const handleSaveAs = useCallback(async () => {
    const graph = getGraph()
    if (!graph) {
      setStatus('没有可保存的场景')
      return
    }
    const newName = typeof window !== 'undefined' ? window.prompt('新场景名称', name) : null
    if (!newName) return
    setIsSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, graph }),
      })
      if (!response.ok) {
        setStatus(`另存为失败 (${response.status})`)
        return
      }
      const meta = (await response.json()) as { id: string }
      router.push(`/scene/${meta.id}`)
    } catch (error) {
      console.error('[scene-save-as]', error)
      setStatus('另存为失败，请检查连接后重试。')
    } finally {
      setIsSaving(false)
    }
  }, [getGraph, name, router])

  return (
    <div className="flex items-center gap-2">
      <button
        className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-xs hover:bg-accent/80 disabled:opacity-50"
        disabled={isSaving}
        onClick={handleSave}
        type="button"
      >
        {isSaving ? '正在保存…' : '保存'}
      </button>
      <button
        className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-xs hover:bg-accent/40 disabled:opacity-50"
        disabled={isSaving}
        onClick={handleSaveAs}
        type="button"
      >
        另存为…
      </button>
      {status && <span className="text-muted-foreground text-xs">{status}</span>}
    </div>
  )
}
