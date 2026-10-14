'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { safeAccountNext } from '@/lib/account-navigation'
import { notifyAccountChanged } from '@/lib/auth/account-change'
import './account-panel.css'

export type AccountUser = { id: string; email: string; name: string }

function authError(code: string | undefined, status: number): string {
  if (status === 429) return '尝试次数较多，请稍后再试。'
  if (code === 'INVALID_EMAIL_OR_PASSWORD') return '邮箱或密码不正确，请重新输入。'
  if (code?.startsWith('USER_ALREADY_EXISTS')) return '这个邮箱已注册，请切换到登录。'
  if (code === 'PASSWORD_TOO_SHORT') return '密码至少需要 10 个字符。'
  if (code === 'INVALID_TOKEN') return '设置密码的链接已失效，请重新获取。'
  if (code === 'INVALID_EMAIL') return '请输入有效的邮箱地址。'
  return '暂时未能完成，请稍后重试。'
}

export function AccountForm({
  next = '/scenes',
  resetToken,
}: {
  next?: string
  resetToken?: string
}) {
  const id = useId()
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const resetting = resetToken !== undefined

  return (
    <div className="dia-account-form">
      <h2>{resetting ? '设置你的密码' : register ? '建立你的账号' : '回到你的舞台'}</h2>
      <p>剧目随账号保存，仅自己可见。</p>
      {!resetting && (
        <div className="dia-account-tabs" role="group" aria-label="账号操作">
          <button
            type="button"
            disabled={busy}
            aria-pressed={!register}
            onClick={() => {
              setRegister(false)
              setError('')
            }}
          >
            登录
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={register}
            onClick={() => {
              setRegister(true)
              setError('')
            }}
          >
            注册
          </button>
        </div>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          const data = new FormData(event.currentTarget)
          const email = String(data.get('email') ?? '').trim()
          const password = String(data.get('password') ?? '')
          if ((register || resetting) && password !== data.get('confirm')) {
            setError('两次输入的密码不一致。')
            return
          }
          setBusy(true)
          setError('')
          try {
            const endpoint = resetting
              ? 'reset-password'
              : register
                ? 'sign-up/email'
                : 'sign-in/email'
            const body = resetting
              ? { token: resetToken, newPassword: password }
              : { email, password, ...(register ? { name: email.split('@')[0] } : {}) }
            const response = await fetch(`/api/auth/${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (!response.ok) {
              const result = await response.json().catch(() => ({}))
              setError(authError(result.code, response.status))
              return
            }
            notifyAccountChanged()
            // A full navigation discards the previous account's in-memory editor state.
            window.location.replace(resetting ? '/login?passwordSet=1' : safeAccountNext(next))
          } catch {
            setError('连接失败，请检查网络后重试。')
          } finally {
            setBusy(false)
          }
        }}
      >
        {!resetting && (
          <label htmlFor={`${id}-email`}>
            <span>邮箱</span>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              placeholder="你的常用邮箱"
              required
              disabled={busy}
            />
          </label>
        )}
        <label htmlFor={`${id}-password`}>
          <span>{resetting ? '新密码' : '密码'}</span>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete={register || resetting ? 'new-password' : 'current-password'}
            minLength={register || resetting ? 10 : undefined}
            maxLength={128}
            placeholder={register || resetting ? '至少 10 个字符' : '输入密码'}
            required
            disabled={busy}
          />
        </label>
        {(register || resetting) && (
          <label htmlFor={`${id}-confirm`}>
            <span>确认</span>
            <input
              id={`${id}-confirm`}
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              placeholder="再次输入密码"
              required
              disabled={busy}
            />
          </label>
        )}
        {error && (
          <p className="dia-account-error" role="alert">
            {error}
          </p>
        )}
        <button className="dia-account-submit" type="submit" disabled={busy}>
          {busy ? '正在处理…' : resetting ? '保存密码' : register ? '注册并进入' : '登录并继续'}
        </button>
      </form>
      <p className="dia-account-note">请妥善保管密码，邮件找回暂未开放。</p>
      <Link className="dia-account-privacy" href="/privacy">
        隐私与数据保存说明 ↗
      </Link>
    </div>
  )
}

export function AccountMenu({ user }: { user: AccountUser }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="dia-account-menu">
      <span title={user.email}>{user.email}</span>
      <Link href="/scenes">我的剧目</Link>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const response = await fetch('/api/auth/sign-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            })
            if (!response.ok) throw new Error('sign_out_failed')
            notifyAccountChanged()
            window.location.replace('/?lit=1')
          } catch {
            setError('退出失败，请重试。')
            setBusy(false)
          }
        }}
      >
        {busy ? '正在退出…' : '退出登录'}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  )
}

export function HomeAccountPanel({ user }: { user: AccountUser | null }) {
  const [open, setOpen] = useState(true)
  return (
    <aside className="dia-home-account" aria-label="我的账号">
      {user ? (
        <AccountMenu user={user} />
      ) : (
        <>
          <button
            className="dia-account-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="home-account-form"
            onClick={() => setOpen(!open)}
          >
            {open ? '收起账号面板 −' : '登录 / 注册'}
          </button>
          {open && (
            <section id="home-account-form" className="dia-account-card">
              <AccountForm next="/?lit=1" />
            </section>
          )}
        </>
      )}
    </aside>
  )
}
