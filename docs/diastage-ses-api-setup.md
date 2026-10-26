# DiaStage 腾讯云 SES API 接入

更新：2026-10-26（北京时间）。SES 广州根域及品牌发信地址已验证，企业邮与 Gmail 双向收发通过，两份模板约 15:20 审核通过。服务器私有 SES 配置已保存但关闭，未加入现有服务；隔离 Linux 生产构建 8/8、认证集成 9/9 通过，候选未启动。品牌联系链接已完成源代码修改，尚未部署，且晚于 b57 云端构建。实际 API 鉴权、SES 投递、应用浏览器验收及正式切换尚未完成，额外两封 SES 测试待用户确认。

## 1. 统一品牌地址与当前进度

用户当前目标是网站联系、人工收发、自动通知的可见 From 及回复地址统一为 `21@diastage.art`，已经明确，无需再次询问。已选择腾讯企业邮基础版，企业微信“DiaStage咫台”已注册成功，DNSPod 解析已生效；企业邮域名验证和开通已通过。自动生成账号的用户名已由 `liuchen` 改为 `21`，主邮箱为 `21@diastage.art`，原 `liuchen@diastage.art` 保留为别名。此前“页面已补主体及 Gmail”的记录有误；本次已在首页页脚、隐私页两处和使用说明一处的源代码加入品牌 mailto，保留备案号及未确认的政策边界，页面日期更新至 10 月 26 日。三文件 Biome、`apps/editor` 的 `tsgo --noEmit` 和定向 diff 检查通过，尚未部署到生产。

经用户明确同意，已完成 `25101763g@gmail.com` → `21@diastage.art` 测试及企业邮 → Gmail 回复，共两封。初始标识 `DS-MAIL-20261026-A`，Gmail 发送 ID `1a17716d96339139`；企业邮收件箱已收到，回复标识 `DS-MAIL-20261026-A-REPLY`，Gmail 回复 ID `1a1771b0d33f8e7e`，进入 `INBOX`、不含 `SPAM`。Gmail 检查到 From 和 Return-Path 均为 `21@diastage.art`，`spf=pass`、`dmarc=pass`，`smtp.mailfrom` 与 `header.from` 的域均为 `diastage.art`，完全对齐。该企业邮邮件没有 `DKIM-Signature`，认证结果也未列出 DKIM，不能声称企业邮 DKIM 通过，更不能替代 SES 的实际投递验收。

SES 与企业邮共用根域的配置已在 SES 广州整体验证通过，已创建发信地址 `21@diastage.art`，别名“DiaStage 咫台”；服务器私有配置已采用该品牌 From，邮件继续关闭。此前子域 `noreply` 方案未采用。

可选 `TENCENT_SES_REPLY_TO_EMAIL` 仓库默认留空；根据用户已明确的统一地址目标及品牌收发测试结果，服务器私有配置已填写 `21@diastage.art`。它映射到官方可选字符串参数 `ReplyToAddresses`，仅改变回复收件地址，不改变可见 From；配置未加入现有服务，邮件开关保持关闭。[官方 SendEmail 参数](https://cloud.tencent.com/document/api/1288/51034)

当前使用已验证的根域及已创建的品牌发信地址，不需要为域名验证切换为 `HeaderFrom` 代发；代发在本项目仍未配置或验收，官方说明可能显示代发标识。[官方代发说明](https://cloud.tencent.com/document/product/1288/54785)

SES API 支持 `ap-guangzhou`、`ap-hongkong`。按 SES 控制台实际开通地域填写配置，并在同一地域核对发信域、发信地址及模板。API 使用 `ses.tencentcloudapi.com`、`SendEmail`、版本 `2020-10-02`。[官方接口说明](https://cloud.tencent.com/document/api/1288/51034)

## 2. 配置 DNS 并创建发信地址

2026-10-26 11:41，DNSPod 实际记录共 8 条；11:21 创建的企业邮收件记录和原网站记录保留：

- 原 `@` A → `106.53.215.79`、`www` CNAME → `diastage.art.` 保留。
- 保留 `@` MX → `mxbiz1.qq.com.`，优先级 5。
- 保留 `@` MX → `mxbiz2.qq.com.`，优先级 10。
- 根域保持单条 SPF TXT，现值为 `v=spf1 include:spf.mail.qq.com include:qcloudmail.com ~all`。
- 保留 `qqmail95878e99` CNAME → `mail.qq.com.`。
- 新增 `_dmarc` TXT → `v=DMARC1; p=none`。
- 新增 `qcloudgz2048._domainkey` TXT，配置 SES 广州的 2048 位 DKIM 公钥，不在本文复制公钥全文。

公网解析器 `119.29.29.29` 已核对两条 MX（优先级 5、10）和 SPF、DMARC、SES DKIM 三条 TXT 正确；此前也已查询到 `qqmail95878e99.diastage.art` → `mail.qq.com` 的 CNAME。此结果仅代表该解析器当前返回，不代表所有 DNS 缓存已更新。11:41，SES 广州根域整体“验证通过”，信誉等级 1、日额度 500 封、共享 IP；11:42 创建 `21@diastage.art` 发信地址，别名“DiaStage 咫台”。企业邮与 Gmail 双向收发已通过，SES 实际投递仍待验收；此处 DKIM TXT 属 SES，不证明企业邮邮件已有 DKIM 签名。

官方口径存在差异：[域名 FAQ](https://cloud.tencent.com/document/product/1288/52776) 说明必须与企业邮箱共用时需要合并 SPF；[身份验证 FAQ](https://cloud.tencent.com/document/product/1288/60652) 允许 MX 使用自有邮件服务器；[快速入门](https://cloud.tencent.com/document/product/1288/47454) 则提示不可使用企业邮箱域名。本次保留企业邮 MX 并合并单条 SPF 后，SES 广州整体验证已通过；这证明当前配置通过服务商验证，不等同实际投递验收。

1. 企业邮和 SES 根域配置均已验证，主邮箱及 SES 发信地址 `21@diastage.art` 均已创建；企业邮双向收发已通过，接下来单独验收实际 SES 投递。公开网页品牌联系链接已完成源代码修改，尚未部署。
2. 后续继续保留企业邮两条收件 MX、验证 CNAME 及网站 A/CNAME；同一主机名只保留一条已合并的 SPF，不用向导默认值覆盖。保护现有 DKIM、DMARC，后续策略调整须独立验证。
3. 后续 DNS 变更按控制台实际主机名、类型、记录值、优先级核对并验证；本文件不提供通用值代填真实记录。
4. 模板审核、企业邮真实收发和 SES 实际送达分别验收，不以“记录已保存”或域名“验证通过”代替。

## 3. 两份模板已修正并审核通过

- 邮箱验证：模板 ID `65290`，名称“DiaStage 验证邮箱”，11:44:22 首次提交；退回后已替换内容并重新提交，15:17 为“审核中”，约 15:20 确认审核通过。文件 `deploy/email-templates/verify-email.html`，邮件主题使用“验证 DiaStage 邮箱”。
- 重置密码：模板 ID `65291`，名称“DiaStage 重置密码”，11:44:54 首次提交；退回后已替换内容并重新提交，15:17 为“审核中”，约 15:20 确认审核通过。文件 `deploy/email-templates/reset-password.html`，邮件主题使用“重置 DiaStage 密码”。

已选择 HTML 富文本，重新上传上述修正后的仓库文件并核对预览正确，沿用原模板 ID。重新提交时控制台曾提示预计 1 个工作日、节假日顺延；实际约 15:20 两份均审核通过。对应真实 ID 已写入服务器私有环境的 `TENCENT_SES_VERIFY_TEMPLATE_ID`、`TENCENT_SES_RESET_TEMPLATE_ID`，尚未正式启用。[官方模板操作](https://cloud.tencent.com/document/product/1288/77251)

10 月 26 日下午复查时，两份模板均因链接使用纯变量 `{{url}}`、未保留固定域名而被退回。修正后的 HTML 使用 `https://diastage.art/{{url}}`；程序先校验认证链接属于该域名，再把去掉首个斜杠的路径、查询参数和片段放入变量，保留原令牌及回调参数。

两份模板仅有 `{{url}}` 变量，值不再包含协议及域名。腾讯云占位语法为 `{{键}}`；发送时 `Template.TemplateData` 为 JSON 字符串，不直接传入对象或 HTML。启用真实发信时，`BETTER_AUTH_URL` 必须为 `https://diastage.art`，避免模板固定域名和认证服务地址错配；本地开发保持邮件关闭。邮箱验证及密码重置均为 1 小时有效；修改认证有效期时同步修改模板并重新审核。[官方 Template 数据结构](https://cloud.tencent.com/document/product/1288/51053)

模板与此次发送代码必须配套启用；旧代码传入完整 URL，会与新模板的固定域名重复拼接。此次修正已通过 10 项 SES 定向测试、88 次断言、两份 TypeScript 文件的 Biome 检查和独立审阅；测试核对模板拼接后保留原令牌、嵌套回调参数及片段，TC3 签名另以独立计算交叉验证。此前完整本地复核与最新 Linux 构建分别记录于下方，均不等于真实 SES 发信验收。

## 4. 最小发信权限与私有配置

开通时用户已明确同意并完成腾讯云服务角色 `SES_QCSLinkedRoleBilling` 授权。官方策略 `QcloudAccessForSESLinkedRoleInBilling` 允许 `billing:CreateOrdersAndPay`（资源 `*`）及 `finance:trade`（资源 `qcs::ses:::*`），角色由腾讯 SES 服务扮演；这与下述应用发信密钥不同，不把计费权限加给应用子用户。授权本身不能证明已产生具体费用。[官方服务角色权限](https://intl.cloud.tencent.com/zh/document/product/598/80322)

11:48:17 已保存专用 CAM 策略 `DiaStageSesSendEmail`，ID `291316357`；仅允许 `ses:SendEmail`、资源 `*`，没有其他权限。专用用户 `diastage-ses` 已由运营者完成创建；详情已核验访问方式为“编程访问”、用户组为 0，且仅有一条直接关联策略 `DiaStageSesSendEmail`，关联时间为 2026-10-26 11:48:36。15:06 用户已下载凭据 CSV，已确认本机文件存在、仅有一条记录且 SecretId/SecretKey 字段非空，未输出凭据内容；现已通过 SSH 保存服务器私有配置，但实际 API 鉴权尚未测试。生产邮件保持关闭，不附加计费、模板管理、DNS 或管理员权限。官方将 `SendEmail` 列为操作级授权，资源必须为 `*`；不能假设它支持按发信域或模板 ID 限制资源。已保存并关联的策略内容如下：[官方 SES 授权粒度](https://intl.cloud.tencent.com/zh/document/product/598/57150)

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": ["ses:SendEmail"],
      "resource": ["*"]
    }
  ]
}
```

已按 `deploy/production.env.example` 将专用凭据、`TENCENT_SES_REGION=ap-guangzhou`、品牌 `TENCENT_SES_FROM_EMAIL`/`TENCENT_SES_REPLY_TO_EMAIL` 和两个已审模板 ID 保存至 `/home/ubuntu/diastage-private/ses.env`。目录权限 `700`、文件 `600`，属 `ubuntu`，`DIASTAGE_AUTH_EMAIL_ENABLED=false`；未加入现有 service。凭据不放前端、不使用 `NEXT_PUBLIC_`、不提交 GitHub 或粘贴到聊天，本文不复制私有文件内容。应用只发送单收件人的认证邮件。

仓库示例默认 `DIASTAGE_AUTH_EMAIL_ENABLED=false`，其余值留空。上述配置完成且准备执行已获准的测试时才在隔离服务设为 `true`；不自动开启生产服务。API 接受请求不代表收件箱已送达。

### SSH、数据与隔离候选准备

用户明确同意安装本机新 SSH 公钥，15:26 经 TAT 安装成功；严格主机公钥校验后 SSH 连接成功。旧服务仍 active，运行目录 `/home/ubuntu/diastage-release-20261007/DiaStage`。本次只读核对实际场景库 `/home/ubuntu/diastage-data/scenes.db`，三张场景相关表均为 0，完整性正常；未改现有服务或数据。

`/home/ubuntu/diastage-backups/20261026-pre-ses-153333` 已通过 SQLite backup API 生成一致快照；隔离 `restore-check` 的完整性、三表计数及 SHA 一致。服务 unit 与 `.env.defaults` 备份权限 `600`、目录 `700`，未输出内容。候选 `b57c1d5` 纯 tracked 源码包已上传 `/home/ubuntu/diastage-candidate-b57c1d5` 并解压 `app`，SHA-256 `de5e50937e785d7f3e59737d14a98b3e47dc0533fc9354e2ccba612b89c7e578` 远端校验通过。

独立 SES probe 已加载真实私有环境，并通过 mock fetch 完成两模板路由 dry-run，未真实发送，不能视为实际 API 鉴权成功。额外两封 SES 测试仍待用户确认。

Linux 依赖安装首次因腾讯默认镜像全包 404 失败，随后仅该次命令指定 `registry.npmjs.org`，成功安装 782 个包。候选代码 `b57c1d56cb96955db49305ae27fee38e8ece8a38` 在 `/home/ubuntu/diastage-candidate-b57c1d5/app` 完整生产构建 8/8 通过，含 Next 编译、TypeScript 和 18 页生成。此构建早于后续品牌联系页面源码修改，不能作为新联系页的 Linux 验收。候选尚未启动，生产服务不变。

Linux 认证集成最终 9/9 通过（auth 3/3、email 6/6，9.96 秒）：Bun 打包已有测试后，以 `env -i` 的 Node 22 执行，网络防护记录 fetch/socket/listen 尝试均为 0，临时数据库已清理。首次 8/9 源于启动器额外加入 `NODE_ENV=test`，使 Better Auth 在测试模式跳过 Origin 校验，原预期 403 的断言得到 200；只移除启动器变量后复测通过，未改源码或断言。前后均确认生产 active、私有 SES 开关为 `false`。

## 5. 启用前验收

- [x] SES 广州根域整体“验证通过”，`21@diastage.art` 发信地址已创建，别名“DiaStage 咫台”。
- [x] 修正纯变量链接导致的退回，重新上传模板 `65290`、`65291` 并提交审核，预览已核对；两份各仅含 `{{url}}`，域名固定为 `https://diastage.art/`，15:17 均为“审核中”。
- [x] 约 15:20 确认两份模板均审核通过；对应 ID 已写入私有配置，变量、主题、1 小时文案与代码保持一致，邮件仍关闭。
- [x] 保存并直接关联专用策略 `DiaStageSesSendEmail`；内容仅允许 `ses:SendEmail`、资源 `*`，绑定已核验。
- [x] 创建专用用户 `diastage-ses`；已核验仅编程访问、无用户组且只有上述一条直接策略。
- [x] 确认用户下载的凭据 CSV 已保存在本机，两项必需字段非空；未输出或提交凭据内容。
- [x] 通过 SSH 保存服务器私有 SES 配置，目录 `700`、文件 `600`、属 `ubuntu`，邮件开关 `false`，未加入现有服务。
- [x] 完成获准的 Gmail 与品牌企业邮双向测试，共两封、均进收件箱；Gmail 回复 SPF/DMARC 通过且域名对齐，该企业邮邮件无 DKIM 签名。
- [x] SSH 严格核验接入、实际场景库只读检查、一致性备份及隔离恢复核对通过，未改现有服务或数据。
- [x] 候选源码包上传、SHA-256 校验及解压完成；独立 SES probe 加载真实私有环境，以 mock fetch 验证两模板路由通过，未真实发送。
- [x] 隔离 Linux 安装 782 个依赖包并完成生产构建，8/8 任务、Next 编译、TypeScript 及 18 页生成通过；候选未启动，生产服务不变。
- [x] Linux auth 3/3、email 6/6 集成通过，无网络尝试，临时数据库已清理；首次失败已定位为启动器环境变量并在不改源码/断言的情况下复测通过。
- [x] 品牌联系链接完成源代码修改及 Biome/tsgo/定向 diff 检查；尚未部署，b57 Linux 构建早于这些联系页改动。
- [ ] 完成实际 SES API 鉴权及投递验证。额外两封 SES 测试待用户确认，尚未执行实际 API 请求；日志及错误响应不含凭据、验证链接或重置令牌，生产邮件在验收前保持关闭。
- [ ] 隔离账号验证注册、未验证访问、重发限流、忘记密码统一回复、过期/重复使用链接、发送失败提示和重置后旧会话失效。
- [ ] 按获准范围对指定测试收件人实测 SES，分别检查 QQ、163、Gmail 的实际收件和垃圾箱；企业邮与 Gmail 已完成的互测不能替代此项。再验两个账号的剧目隔离。

此前完整本地复核：生产构建 6/6（生成 18 个页面）、真实 Better Auth + Node SQLite 认证集成 9/9、包含可选 Reply-To 的 Bun 相关测试 17/17（115 次断言）、类型检查 9/9、11 个文件的 Biome 检查通过；独立代码审阅无阻断项。最新 Linux 构建见第 4 节；实际 SES API 鉴权与投递、正式启用及应用浏览器验收仍未完成。进度见[上线队列](diastage-release-todo.md)，运营待决事项见[发布待决事项](diastage-release-decisions.md)。
