import type { Metadata } from 'next'
import Link from 'next/link'
import { StudioWordmark } from '@/components/studio-wordmark'

export const metadata: Metadata = {
  title: '隐私政策 · 咫台',
  description: 'Pascal Editor 与 Pascal 平台隐私政策的中文译文。',
}

export default function PrivacyPage() {
  return (
    <div className="ds-document min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              <StudioWordmark />
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/terms"
            >
              服务条款
            </Link>
            <span className="text-muted-foreground">|</span>
            <span className="font-medium text-foreground">隐私政策</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 py-12">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="mb-2 font-bold text-3xl">隐私政策</h1>
          <p className="mb-2 text-muted-foreground text-sm">生效日期：2026 年 2 月 20 日</p>
          <p className="mb-8 text-muted-foreground text-sm">
            本页为 Pascal 上游隐私政策的中文译文，文中的“我们”指 Pascal Group Inc.。
          </p>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">1. 简介</h2>
            <p className="text-foreground/90 leading-relaxed">
              Pascal Group Inc.（以下简称“我们”）运营 Pascal Editor 以及位于 pascal.app 的平台。
              本隐私政策说明您使用我们的服务时，我们如何收集、使用和保护您的信息。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">2. 我们收集的信息</h2>

            <h3 className="mt-4 font-medium text-lg">账户信息</h3>
            <p className="text-foreground/90 leading-relaxed">当您创建账户时，我们会收集：</p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>电子邮箱地址</li>
              <li>姓名</li>
              <li>个人资料照片或头像</li>
              <li>OAuth 提供方的数据（使用 Google 登录时，由 Google 提供）</li>
            </ul>

            <h3 className="mt-4 font-medium text-lg">项目数据</h3>
            <p className="text-foreground/90 leading-relaxed">
              当您使用平台时，我们会存储您的项目，包括舞台置景与排演记录、平面图及相关元数据。
            </p>

            <h3 className="mt-4 font-medium text-lg">使用情况分析</h3>
            <p className="text-foreground/90 leading-relaxed">
              我们使用 Vercel Analytics 和 Speed Insights 收集匿名化的使用数据，包括页面浏览量、
              性能指标和一般使用模式，以帮助我们改进平台。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">3. 我们如何使用您的信息</h2>
            <p className="text-foreground/90 leading-relaxed">我们将您的信息用于：</p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>提供和维护您的账户</li>
              <li>存储您的项目，并在不同设备之间同步</li>
              <li>根据使用模式改进我们的服务</li>
              <li>发送可选的新功能和更新电子邮件通知（您可以在设置中取消订阅）</li>
              <li>回应支持请求</li>
              <li>保障平台安全并防止滥用</li>
            </ul>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">4. 数据存储</h2>
            <p className="text-foreground/90 leading-relaxed">
              您的数据使用 Supabase（PostgreSQL 数据库）存储在安全的云基础设施上。
              我们采取适当的技术和组织措施保护您的数据。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">5. 第三方服务</h2>
            <p className="text-foreground/90 leading-relaxed">我们使用以下第三方服务运营平台：</p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>
                <strong>Google</strong> — 用于登录的 OAuth 身份验证
              </li>
              <li>
                <strong>Vercel</strong> — 应用托管、分析和性能监测
              </li>
              <li>
                <strong>Supabase</strong> — 数据库托管和身份验证基础设施
              </li>
            </ul>
            <p className="mt-4 text-foreground/90 leading-relaxed">
              这些服务各自设有隐私政策，规定其如何处理您的数据。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">6. 浏览器记录文件</h2>
            <p className="text-foreground/90 leading-relaxed">
              我们仅使用平台正常运行所必需的最少量浏览器记录文件：
            </p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>
                <strong>会话记录文件</strong> — 身份验证和保持登录状态所必需
              </li>
              <li>
                <strong>分析记录文件</strong> — 由 Vercel Analytics 用于收集匿名化的使用数据
              </li>
            </ul>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">7. 您的权利</h2>
            <p className="text-foreground/90 leading-relaxed">您有权：</p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>访问我们持有的有关您的个人数据</li>
              <li>要求更正不准确的数据</li>
              <li>要求删除您的数据</li>
              <li>导出您的项目数据</li>
              <li>取消接收营销信息</li>
            </ul>
            <p className="mt-4 text-foreground/90 leading-relaxed">
              如需行使上述任何权利，请通过以下邮箱联系我们：
              <a
                className="text-foreground underline hover:text-foreground/80"
                href="mailto:support@pascal.app"
              >
                support@pascal.app
              </a>
              。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">8. 数据保留</h2>
            <p className="text-foreground/90 leading-relaxed">
              在您的账户处于有效状态期间，我们会保留您的数据。如果您删除账户，我们将在 30 天内
              删除您的个人数据和项目数据，但法律要求我们保留的特定信息除外。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">9. 儿童隐私</h2>
            <p className="text-foreground/90 leading-relaxed">
              本平台不面向 13 岁以下儿童。我们不会在知情的情况下收集 13 岁以下儿童的个人信息。
              如果您认为我们收集了此类信息，请立即联系我们。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">10. 本政策的变更</h2>
            <p className="text-foreground/90 leading-relaxed">
              我们可能不时更新本隐私政策。对于重大变更，我们会通过在平台上发布更新后的政策通知您。
              变更发布后，您继续使用平台即表示接受修订后的政策。
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold text-xl">11. 联系我们</h2>
            <p className="text-foreground/90 leading-relaxed">
              如果您对本隐私政策或我们处理您数据的方式有任何疑问，请通过以下邮箱联系我们：
              <a
                className="text-foreground underline hover:text-foreground/80"
                href="mailto:support@pascal.app"
              >
                support@pascal.app
              </a>
              。
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
