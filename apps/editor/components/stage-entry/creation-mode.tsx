'use client'

import { useState } from 'react'
import { z } from 'zod'
import type { CreationLease } from '@/lib/stage/creation-policy'

const LeaseSchema = z.strictObject({
  projectId: z.string().min(1).max(160),
  userId: z.string().min(1),
  sessionId: z.string().uuid(),
  mode: z.enum(['create', 'draft']),
  expiresAt: z.number().finite().positive(),
})

export async function requestCreationPermission(
  projectId: string,
  action: 'grant' | 'check' | 'revoke',
  mode?: 'create' | 'draft',
) {
  const response = await fetch('/api/ai/creation-permission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: action === 'revoke',
    body: JSON.stringify({
      projectId,
      action,
      ...(mode ? { mode, explainedAndConfirmed: true } : {}),
    }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? '无法验证制景授权')
  return LeaseSchema.nullable().parse(result.lease)
}

export function CreationModeControl({
  sceneId,
  lease,
  onChange,
  onStop,
}: {
  sceneId: string
  lease: CreationLease | null
  onChange: (lease: CreationLease) => void
  onStop: () => void
}) {
  const [requested, setRequested] = useState<'create' | 'draft' | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <section aria-label="AI 制景授权">
      {lease ? (
        <div
          role="status"
          style={{ position: 'sticky', top: 0, zIndex: 2, background: '#111', padding: 12 }}
        >
          {lease.mode === 'create' ? 'AI 连续制景已开启' : '方案草台已开启 · 尚未写入正式舞台'}
          <button type="button" onClick={onStop}>
            停止并退回建议模式
          </button>
        </div>
      ) : (
        <div className="stage-entry-actions">
          <span>建议模式 · 每次确认后落位</span>
          <button type="button" onClick={() => setRequested('create')}>
            开启 AI 连续制景
          </button>
          <button type="button" onClick={() => setRequested('draft')}>
            开启方案草台
          </button>
        </div>
      )}
      {requested && (
        <section role="dialog" aria-label="制景授权说明">
          <h3>{requested === 'create' ? '连续制景授权' : '方案草台授权'}</h3>
          <p>
            仅授权当前本机项目与会话。允许新增、移动、旋转、缩放布景及调整镜头；仍需通过完整空间校验。
          </p>
          <p>
            删除、修改舞台尺寸、超过20个对象、外部导入和费用超限仍需确认。禁止灯光、家装、任意代码与网络工具。30分钟无操作、断开手机或离开面板后授权失效。
          </p>
          <p>
            {requested === 'draft'
              ? '连续调整只保留在临时方案中，最后一次确认才写入。'
              : '安全操作自动写入，每轮可撤销；不明确的指代会先追问。'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                const next = await requestCreationPermission(sceneId, 'grant', requested)
                if (next) {
                  onChange(next)
                  setRequested(null)
                }
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : '授权失败')
              } finally {
                setBusy(false)
              }
            }}
          >
            我已阅读，授权当前项目
          </button>
          <button type="button" onClick={() => setRequested(null)}>
            保持建议模式
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
