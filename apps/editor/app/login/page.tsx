import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AccountForm } from '@/components/account-panel'
import { safeAccountNext } from '@/lib/account-navigation'
import { getAuthMailEnabled, getSession } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'
export const metadata = { referrer: 'no-referrer' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string
    passwordSet?: string
    verified?: string
    error?: string
    recover?: string
  }>
}) {
  const params = await searchParams
  const next = safeAccountNext(params.next)
  const emailEnabled = getAuthMailEnabled()
  if (await getSession(await headers())) redirect(next)
  return (
    <main className="dia-account-page">
      <Link href="/">← 回到 DiaStage</Link>
      {params.passwordSet === '1' && (
        <p className="dia-account-success" role="status">
          密码已设置，请用邮箱和新密码登录。
        </p>
      )}
      {params.verified === '1' && (
        <p className="dia-account-success" role="status">
          {params.error
            ? '邮箱验证未完成，链接可能已失效。请重新申请验证邮件。'
            : '邮箱验证已完成，请用邮箱和密码登录。'}
        </p>
      )}
      <section className="dia-account-card" aria-label="账号登录与注册">
        <AccountForm
          next={next}
          emailEnabled={emailEnabled}
          initialMode={params.recover === '1' ? 'forgot' : params.error ? 'verify' : 'login'}
        />
      </section>
    </main>
  )
}
