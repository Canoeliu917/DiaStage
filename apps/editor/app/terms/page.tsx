import type { Metadata } from 'next'
import Link from 'next/link'
import { StudioWordmark } from '@/components/studio-wordmark'

export const metadata: Metadata = {
  title: '服务条款 · 咫台',
  description: 'Pascal Editor 与 Pascal 平台服务条款的中文译文。',
}

export default function TermsPage() {
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
            <span className="font-medium text-foreground">服务条款</span>
            <span className="text-muted-foreground">|</span>
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/privacy"
            >
              隐私政策
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 py-12">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="mb-2 font-bold text-3xl">服务条款</h1>
          <p className="mb-2 text-muted-foreground text-sm">生效日期：2026 年 2 月 20 日</p>
          <p className="mb-8 text-muted-foreground text-sm">
            本页为 Pascal 上游服务条款的中文译文，文中的“我们”指 Pascal Group Inc.。
          </p>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">1. 简介</h2>
            <p className="text-foreground/90 leading-relaxed">
              欢迎使用由 Pascal Group Inc.（以下简称“我们”）运营的 Pascal Editor（以下简称“编辑器”）
              以及位于 pascal.app 的 Pascal 平台（以下简称“平台”）。访问或使用我们的服务即表示
              您同意本服务条款。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">2. 编辑器与平台</h2>
            <p className="text-foreground/90 leading-relaxed">
              Pascal Editor 是根据 MIT 许可证发布的开源软件。您可以依照 MIT 许可证条款，使用、
              复制、修改、合并、发布、分发、再许可和／或出售编辑器软件的副本。
            </p>
            <p className="text-foreground/90 leading-relaxed">
              Pascal 平台（pascal.app）及其相关服务，包括用户账户、云存储和项目托管，均为 Pascal
              Group Inc. 拥有并运营的专有服务。本条款适用于您对平台的使用。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">3. 账户与身份验证</h2>
            <p className="text-foreground/90 leading-relaxed">
              要使用平台的部分功能，您必须创建账户。我们通过 Supabase 使用 Google OAuth 和
              电子邮件免密链接进行身份验证。您有责任维护账户凭据的安全，并对您账户下发生的
              所有活动负责。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">4. 可接受的使用行为</h2>
            <p className="text-foreground/90 leading-relaxed">您同意不从事以下行为：</p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>将平台用于任何非法目的，或违反任何适用法律</li>
              <li>上传、分享或传播侵犯知识产权的内容</li>
              <li>试图未经授权访问平台或其系统</li>
              <li>干扰或破坏平台的基础设施</li>
              <li>上传恶意代码、病毒或有害内容</li>
              <li>骚扰、辱骂或伤害其他用户</li>
              <li>使用平台发送垃圾信息或未经请求的通信</li>
            </ul>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">5. 您的内容与知识产权</h2>
            <p className="text-foreground/90 leading-relaxed">
              您对自己创建或上传至平台的所有内容、项目和数据（以下简称“您的内容”）保留完整
              所有权。使用平台即表示您授予我们有限许可，允许我们仅为向您提供服务而存储、展示和
              传输您的内容。
            </p>
            <p className="text-foreground/90 leading-relaxed">
              我们不对您的内容主张任何所有权。您可以随时导出或删除您的内容。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">6. 平台所有权</h2>
            <p className="text-foreground/90 leading-relaxed">
              平台及其设计、功能和专有代码归 Pascal Group Inc. 所有，并受知识产权法律保护。
              虽然编辑器源代码根据 MIT 许可证开源，但平台服务、品牌和基础设施仍属于我们的专有财产。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">7. 账户终止</h2>
            <p className="text-foreground/90 leading-relaxed">
              如果您违反本条款，或从事我们认定有害于平台或其他用户的行为，我们保留暂停或终止
              您账户的权利。您也可以随时通过以下邮箱联系我们，以删除您的账户：
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
            <h2 className="font-semibold text-xl">8. 不作保证</h2>
            <p className="text-foreground/90 leading-relaxed">
              平台按“现状”和“现有可用状态”提供，不作任何明示或默示保证，包括但不限于有关
              适销性、特定用途适用性以及不侵权的默示保证。
            </p>
            <p className="text-foreground/90 leading-relaxed">
              我们不保证平台不会中断、没有错误或不含有害组件。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">9. 责任限制</h2>
            <p className="text-foreground/90 leading-relaxed">
              在法律允许的最大范围内，PASCAL GROUP INC. 不对因您使用平台而产生的任何间接、
              附带、特殊、后果性或惩罚性损害承担责任，包括数据、利润或商誉损失。
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">10. 条款变更</h2>
            <p className="text-foreground/90 leading-relaxed">
              我们可能不时更新本条款。对于重大变更，我们会通过在平台上发布更新后的条款通知您。
              变更发布后，您继续使用平台即表示接受修订后的条款。
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold text-xl">11. 联系我们</h2>
            <p className="text-foreground/90 leading-relaxed">
              如果您对本条款有任何疑问，请通过以下邮箱联系我们：
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
