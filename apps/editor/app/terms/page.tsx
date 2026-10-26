import type { Metadata } from 'next'
import Link from 'next/link'
import { StudioWordmark } from '@/components/studio-wordmark'

export const metadata: Metadata = {
  title: '使用说明（内测版） · 咫台',
  description: 'DiaStage 内测版的舞台编辑、账号保存、AI 额度与确认操作说明。',
}

export default function TermsPage() {
  return (
    <div className="ds-document min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground transition-colors hover:text-foreground">
              <StudioWordmark />
            </span>
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
          <h1 className="mb-2 font-bold text-3xl">使用说明（内测版）</h1>
          <p className="mb-8 text-muted-foreground text-sm">
            更新于 2026 年 10 月 26 日。本页说明 DiaStage 当前内测功能和使用边界。
          </p>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">舞台编辑与保存</h2>
            <p>
              DiaStage
              用于舞台置景、三维与平面预览、剧目保存及照片复原草稿编辑。当前以电脑端操作为主；手机与平板联动是否开放，以页面提供的入口为准。
            </p>
            <p>
              请先用自己的邮箱注册并登录。新建剧目按账号独立保存，其他普通用户无法查看或修改；同一账号在本机版和云端版的剧目不会自动互相同步。
            </p>
            <p>
              内测功能仍在调整，请留意保存结果并导出重要项目备份。验证邮件、邮件找回密码和自助注销账号入口尚未开放。
            </p>
          </section>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">AI 内测资格与额度</h2>
            <p>
              注册账号不等于自动开通付费 AI。当前最多向 20
              个受邀账号开放，由网站承担模型调用费用；用户无需提供个人 API 密钥，也不会扣除用户的
              ChatGPT 订阅额度。
            </p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>每个受邀账号：每天最多 1 元、每月最多 5 元的 AI 估算额度。</li>
              <li>全站：每月最多 100 元的 AI 估算额度；单次任务上限为 1 元。</li>
              <li>按北京时间的自然日、自然月计算；同一账号的多个剧目共用额度。</li>
            </ul>
            <p>
              这些额度用于限制调用，不是可提现余额或固定对话次数。请求开始前会预留估算费用；超过单次提醒额度时会询问是否继续，确认也不能突破账号或全站限额。额度不足时停止新的付费调用，本地口令和手动置景仍可使用。
            </p>
            <p>
              可在“AI
              使用详情与隐私”中查看本账号额度。估算与供应商最终账单可能不同，取消或失败的请求也不一定没有模型费用。已生成剧目的打开、保存和手动编辑本身无需再次调用
              AI；重新识别照片或重新请求生成会再次使用额度。
            </p>
          </section>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">建议、预览与操作确认</h2>
            <p>
              Dia
              默认先生成供检查的建议或预览，由你决定采用、修改或放弃。照片复原先生成草稿，确认建立独立剧目后才保存。
            </p>
            <p>
              如果页面提供连续制景，你主动授权后，符合授权范围并通过校验的操作可以自动应用；方案草台则保留为临时方案，最终确认后写入。可通过“停止并退回建议模式”结束连续授权。
            </p>
            <p>
              AI
              可能误解对象、方位或尺度，请在采用前检查。单张照片无法提供完整尺寸与被遮挡结构，复原结果标记为估算尺度，需要根据实际资料继续校正。
            </p>
          </section>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">输入内容与数据</h2>
            <p>
              使用文字、录音、照片及剧本功能前，请确认你有相应的使用和提交权限。素材出现在剧目或复原结果中，不代表获得了原作品、照片或资产的额外授权。
            </p>
            <p>
              AI 输入发送范围、私人剧目保存位置及本机记录的导出、删除方式，请查看
              <Link className="underline" href="/privacy">
                隐私说明
              </Link>
              。
            </p>
          </section>
          <section className="space-y-4">
            <h2 className="font-semibold text-xl">内测问题与联系</h2>
            <p>
              遇到账号、额度、数据或功能问题，请联系
              <a className="underline" href="mailto:21@diastage.art">
                21@diastage.art
              </a>
              。正式服务条款仍待确认。
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
