import Link from 'next/link'
import { AccountForm } from '@/components/account-panel'
import { getAuthMailEnabled } from '@/lib/auth/server'

export const metadata = { title: '设置密码 · DiaStage', referrer: 'no-referrer' }

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams
  return (
    <main className="dia-account-page">
      <Link href="/">← 回到 DiaStage</Link>
      <section className="dia-account-card" aria-label="设置账号密码">
        {token && !error ? (
          <AccountForm resetToken={token} emailEnabled={getAuthMailEnabled()} />
        ) : (
          <>
            <h1>链接已失效</h1>
            <p>请重新获取设置密码的链接。</p>
            <Link href="/login">返回登录</Link>
            {getAuthMailEnabled() && <Link href="/login?recover=1">重新申请重置密码邮件</Link>}
          </>
        )}
      </section>
    </main>
  )
}
