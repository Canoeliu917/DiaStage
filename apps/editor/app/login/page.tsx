import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AccountForm } from '@/components/account-panel'
import { safeAccountNext } from '@/lib/account-navigation'
import { getSession } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; passwordSet?: string }>
}) {
  const params = await searchParams
  const next = safeAccountNext(params.next)
  if (await getSession(await headers())) redirect(next)
  return (
    <main className="dia-account-page">
      <Link href="/">← 回到 DiaStage</Link>
      {params.passwordSet === '1' && (
        <p className="dia-account-success" role="status">
          密码已设置，请用邮箱和新密码登录。
        </p>
      )}
      <section className="dia-account-card" aria-label="账号登录与注册">
        <AccountForm next={next} />
      </section>
    </main>
  )
}
