import type { Metadata } from 'next'
import Link from 'next/link'
import { StudioWordmark } from '@/components/studio-wordmark'

export const metadata: Metadata = {
  title: '隐私说明（内测版） · 咫台',
  description: 'DiaStage 内测版的账号、私人剧目、AI 输入和数据保存说明。',
}

export default function PrivacyPage() {
  return (
    <div className="ds-document min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground transition-colors hover:text-foreground">
              <StudioWordmark />
            </span>
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
          <h1 className="mb-2 font-bold text-3xl">隐私说明（内测版）</h1>
          <p className="mb-8 text-muted-foreground text-sm">
            更新于 2026 年 10 月 25 日。本页说明 DiaStage 当前内测版本的数据处理方式。
          </p>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">账号与私人剧目</h2>
            <p>
              当前使用邮箱和密码注册、登录。服务端保存账号邮箱、显示名称、密码的安全散列及登录会话信息，不保存明文密码；浏览器使用必要的登录
              Cookie 保持会话。
            </p>
            <p>
              新建剧目归当前登录账号所有，其他普通用户无法查看或修改。切换账号后，剧目库按新账号读取。旧版尚未归属账号的剧目不会自动公开，也不会交给首个注册者。
            </p>
            <p>
              验证邮件、邮件找回密码和自助注销账号入口尚未开放。请使用自己的常用邮箱并妥善保管密码；内测期间需要账号协助时，请联系邀请你参加测试的人。
            </p>
          </section>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">数据保存在哪里</h2>
            <p>
              账号、已保存的剧目及其修订记录、AI
              额度账本保存在当前网站的服务端。本机运行时，服务端在运行网站的电脑上；访问云端网站时，这些数据保存在网站服务器上。本机版与云端版的数据不会自动互相同步。
            </p>
            <p>
              对话、提案及采用、修改、拒绝等反馈另存于当前浏览器，并按账号区分。这些浏览器记录不会随剧目自动同步到其他设备。
            </p>
            <p>
              使用照片复原并确认建立剧目后，处理后的参考照片与复原方案会一同保存到剧目中，用于继续对照和编辑。
            </p>
          </section>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">AI 会接收哪些内容</h2>
            <p>
              能由本地规则处理的口令无需调用模型。使用付费 AI
              功能时，网站服务端会将本次功能所需的输入发送至 OpenAI：
            </p>
            <ul className="list-disc space-y-2 pl-6 text-foreground/90">
              <li>
                文字对话与复杂口令：发送输入文本和相关舞台上下文，例如对象名称、选中对象、当前方案及视图设置；使用剧本规划时，还会发送筛选后的剧本片段。
              </li>
              <li>
                语音转写：发送本次录音进行识别。转写文字可继续用于舞台口令解析；原始录音不会写入剧目或费用账本。
              </li>
              <li>
                照片复原：点击识别后，发送按所选范围裁切、压缩后的图片和方案名称，结合舞台资产目录生成复原草稿。
              </li>
            </ul>
            <p>
              文字与照片的模型请求设置了 store:
              false。该设置不代表供应商不保留任何数据。供应商处理规则可查看
              <a
                className="underline"
                href="https://developers.openai.com/api/docs/guides/your-data"
                target="_blank"
                rel="noreferrer"
              >
                OpenAI 数据控制说明
              </a>
              。
            </p>
          </section>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">用量与费用记录</h2>
            <p>
              服务端账本将账号与请求编号、功能、模型、用量、估算费用、时间、处理状态及错误类型关联，用于额度控制和故障排查。账本不保存录音、照片、输入文本、转写原文或完整剧本。
            </p>
            <p>
              “查看我的 AI
              额度”显示本账号的用量与限额；管理员另可查看全站汇总。费用按内部参考价估算，并包含进行中请求的预留额度，不是供应商最终账单。
            </p>
          </section>
          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">浏览器记录的导出与删除</h2>
            <p>
              在“Dia → 详情与设置 →
              私有记录与训练授权”中，可以导出或删除当前剧目的本机对话与反馈。导出文件可能包含历史原文，请自行保管。删除本机记录不会删除正式剧目、账号或服务端费用账本。
            </p>
            <p>
              页面中的训练授权开关默认关闭，仅记录授权意向；当前没有据此上传反馈或启动模型训练的流程。这个开关与完成本次
              AI 请求时向模型服务发送输入是两件事。
            </p>
            <p>
              清理浏览器数据可能删除本机记录。退出账号不会自动删除已保存的数据，请按需要导出项目及本机记录备份。
            </p>
          </section>
          <section className="space-y-4">
            <h2 className="font-semibold text-xl">内测反馈</h2>
            <p>
              如需核对账号或数据处理问题，请联系邀请你参加测试的人。正式公开运营的主体、联系方式及完整数据处理安排仍待确认。
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
