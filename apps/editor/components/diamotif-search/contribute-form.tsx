'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_COMPLETENESS,
  CONTRIBUTION_RIGHTS,
} from '@/lib/diamotif-search/contribution-fields'

export function ContributeForm() {
  const router = useRouter()
  const [rights, setRights] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const unclear = rights === 'unclear'

  return (
    <form
      className="motif-contribute-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (pending) return
        setPending(true)
        setError('')
        const form = event.currentTarget
        try {
          const response = await fetch('/api/diamotif/contributions', {
            method: 'POST',
            body: new FormData(form),
          })
          const payload = (await response.json()) as { id?: string; error?: string }
          if (!response.ok || !payload.id)
            throw new Error(payload.error || '提交没有完成，请重试。')
          router.push(`/contribute/success?receipt=${payload.id}`)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : '提交没有完成，请重试。')
          setPending(false)
        }
      }}
    >
      <label>
        作品题名
        <input name="title" required maxLength={120} autoComplete="off" />
      </label>
      <label>
        作者
        <input name="author" required maxLength={80} autoComplete="off" />
      </label>
      <label>
        类别
        <select name="category" required defaultValue="">
          <option value="" disabled>
            请选择
          </option>
          {CONTRIBUTION_CATEGORIES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        完整性
        <select name="completeness" required defaultValue="">
          <option value="" disabled>
            请选择
          </option>
          {CONTRIBUTION_COMPLETENESS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        权利声明
        <select
          name="rights"
          required
          defaultValue=""
          onChange={(event) => setRights(event.target.value)}
        >
          <option value="" disabled>
            请选择
          </option>
          {CONTRIBUTION_RIGHTS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        外部链接
        <input
          name="externalUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          maxLength={2000}
          autoComplete="off"
        />
      </label>
      <label>
        文件
        <input
          name="file"
          type="file"
          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,text/plain"
          disabled={unclear}
        />
      </label>
      <p className="motif-form-note">
        {unclear
          ? '权利尚不明确时，只保留题名、作者、链接和短摘要，不接收文件，也不托管全文。'
          : '文件保存在本机数据目录，最大 20MB，只作待审，不进入公开检索。对象存储尚未接入；也可以只提交链接。'}
      </p>
      <label>
        邮箱（可选）
        <input name="contactEmail" type="email" maxLength={120} autoComplete="email" />
      </label>
      <label>
        微信（可选）
        <input name="contactWechat" maxLength={40} autoComplete="off" />
      </label>
      <label>
        说明
        <textarea name="notes" maxLength={unclear ? 180 : 500} rows={5} />
      </label>
      <label className="motif-check">
        <input name="mainlandConfirmed" type="checkbox" value="true" required />
        <span>我确认这是中国大陆作者的作品或大陆正式出版的资料。港澳资料暂不征集。</span>
      </label>
      {error ? (
        <p className="motif-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? '正在提交' : '提交待审'}
      </button>
    </form>
  )
}
