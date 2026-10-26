# DiaStage 腾讯云 SES API 接入

更新：2026-10-26（北京时间）。SES 广州服务已开通；11:41，根域 `diastage.art` 整体“验证通过”，信誉等级 1、日额度 500 封、共享 IP；11:42 创建发信地址 `21@diastage.art`，别名“DiaStage 咫台”。企业邮域名已开通，用户已登录品牌主邮箱真实收件箱，真实收发尚未验收。模板 `65290`、`65291` 修正固定域名链接后已重新提交，均审核中，生产配置、正式启用及真实发信尚未完成，未切换云端服务。

## 1. 统一品牌地址与当前进度

用户当前目标是网站联系、人工收发、自动通知的可见 From 及回复地址统一为 `21@diastage.art`。已选择腾讯企业邮基础版，企业微信“DiaStage咫台”已注册成功，DNSPod 解析已生效；企业邮域名页最新确认 `diastage.art`“使用中，域名指向：企业微信”，域名验证和开通已通过。自动生成账号的用户名已由 `liuchen` 改为 `21` 并保存，成员列表已显示主邮箱 `21@diastage.art`；编辑器提示原 `liuchen@diastage.art` 保留为别名。用户已登录真实收件箱，但真实收发尚未验收，公开联系邮箱继续使用 `25101763g@gmail.com`。

SES 与企业邮共用根域的配置已在 SES 广州整体验证通过，已创建发信地址 `21@diastage.art`，别名“DiaStage 咫台”；实际 `FromEmailAddress` 配置仍需与控制台地址一致，生产邮件继续关闭。此前子域 `noreply` 方案未采用。

可选 `TENCENT_SES_REPLY_TO_EMAIL` 默认留空；品牌邮箱收发验收通过且用户确认后才填写 `21@diastage.art`。它映射到官方可选字符串参数 `ReplyToAddresses`，仅改变回复收件地址，不改变可见 From；当前未配置。[官方 SendEmail 参数](https://cloud.tencent.com/document/api/1288/51034)

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

公网解析器 `119.29.29.29` 已核对两条 MX（优先级 5、10）和 SPF、DMARC、DKIM 三条 TXT 正确；此前也已查询到 `qqmail95878e99.diastage.art` → `mail.qq.com` 的 CNAME。此结果仅代表该解析器当前返回，不代表所有 DNS 缓存已更新。11:41，SES 广州根域整体“验证通过”，信誉等级 1、日额度 500 封、共享 IP；11:42 创建 `21@diastage.art` 发信地址，别名“DiaStage 咫台”。用户已登录企业邮真实收件箱，实际收发和 SES 投递仍待验收。

官方口径存在差异：[域名 FAQ](https://cloud.tencent.com/document/product/1288/52776) 说明必须与企业邮箱共用时需要合并 SPF；[身份验证 FAQ](https://cloud.tencent.com/document/product/1288/60652) 允许 MX 使用自有邮件服务器；[快速入门](https://cloud.tencent.com/document/product/1288/47454) 则提示不可使用企业邮箱域名。本次保留企业邮 MX 并合并单条 SPF 后，SES 广州整体验证已通过；这证明当前配置通过服务商验证，不等同实际投递验收。

1. 企业邮和 SES 根域配置均已验证，主邮箱及 SES 发信地址 `21@diastage.art` 均已创建；接下来完成真实收发验收，通过后再更新公开联系方式。
2. 后续继续保留企业邮两条收件 MX、验证 CNAME 及网站 A/CNAME；同一主机名只保留一条已合并的 SPF，不用向导默认值覆盖。保护现有 DKIM、DMARC，后续策略调整须独立验证。
3. 后续 DNS 变更按控制台实际主机名、类型、记录值、优先级核对并验证；本文件不提供通用值代填真实记录。
4. 模板审核、企业邮真实收发和 SES 实际送达分别验收，不以“记录已保存”或域名“验证通过”代替。

## 3. 两份模板已修正并重新提交，等待审核结果

- 邮箱验证：模板 ID `65290`，名称“DiaStage 验证邮箱”，11:44:22 首次提交；退回后已替换内容并重新提交，15:17 确认状态“审核中”。文件 `deploy/email-templates/verify-email.html`，邮件主题使用“验证 DiaStage 邮箱”。
- 重置密码：模板 ID `65291`，名称“DiaStage 重置密码”，11:44:54 首次提交；退回后已替换内容并重新提交，15:17 确认状态“审核中”。文件 `deploy/email-templates/reset-password.html`，邮件主题使用“重置 DiaStage 密码”。

已选择 HTML 富文本，重新上传上述修正后的仓库文件并核对预览正确，沿用原模板 ID。控制台提示审核预计 1 个工作日、节假日顺延；重新提交不代表审核通过。审核通过后再将对应真实 ID 写入服务器私有环境的 `TENCENT_SES_VERIFY_TEMPLATE_ID`、`TENCENT_SES_RESET_TEMPLATE_ID`，目前未配置或正式启用。[官方模板操作](https://cloud.tencent.com/document/product/1288/77251)

10 月 26 日下午复查时，两份模板均因链接使用纯变量 `{{url}}`、未保留固定域名而被退回。修正后的 HTML 使用 `https://diastage.art/{{url}}`；程序先校验认证链接属于该域名，再把去掉首个斜杠的路径、查询参数和片段放入变量，保留原令牌及回调参数。

两份模板仅有 `{{url}}` 变量，值不再包含协议及域名。腾讯云占位语法为 `{{键}}`；发送时 `Template.TemplateData` 为 JSON 字符串，不直接传入对象或 HTML。启用真实发信时，`BETTER_AUTH_URL` 必须为 `https://diastage.art`，避免模板固定域名和认证服务地址错配；本地开发保持邮件关闭。邮箱验证及密码重置均为 1 小时有效；修改认证有效期时同步修改模板并重新审核。[官方 Template 数据结构](https://cloud.tencent.com/document/product/1288/51053)

模板与此次发送代码必须配套启用；旧代码传入完整 URL，会与新模板的固定域名重复拼接。此次修正已通过 10 项 SES 定向测试、88 次断言、两份 TypeScript 文件的 Biome 检查和独立审阅；测试核对模板拼接后保留原令牌、嵌套回调参数及片段，TC3 签名另以独立计算交叉验证。下文完整构建记录属于此前候选；本次未重跑完整构建、未真实发信。

## 4. 最小发信权限与私有配置

开通时用户已明确同意并完成腾讯云服务角色 `SES_QCSLinkedRoleBilling` 授权。官方策略 `QcloudAccessForSESLinkedRoleInBilling` 允许 `billing:CreateOrdersAndPay`（资源 `*`）及 `finance:trade`（资源 `qcs::ses:::*`），角色由腾讯 SES 服务扮演；这与下述应用发信密钥不同，不把计费权限加给应用子用户。授权本身不能证明已产生具体费用。[官方服务角色权限](https://intl.cloud.tencent.com/zh/document/product/598/80322)

11:48:17 已保存专用 CAM 策略 `DiaStageSesSendEmail`，ID `291316357`；仅允许 `ses:SendEmail`、资源 `*`，没有其他权限。专用用户 `diastage-ses` 已由运营者完成创建；详情已核验访问方式为“编程访问”、用户组为 0，且仅有一条直接关联策略 `DiaStageSesSendEmail`，关联时间为 2026-10-26 11:48:36。15:06 用户已下载凭据 CSV，已确认本机文件存在、仅有一条记录且 SecretId/SecretKey 字段非空，未输出凭据内容；结构核验不代表 API 鉴权已通过。服务器仍未配置，生产邮件保持关闭，不附加计费、模板管理、DNS 或管理员权限。官方将 `SendEmail` 列为操作级授权，资源必须为 `*`；不能假设它支持按发信域或模板 ID 限制资源。已保存并关联的策略内容如下：[官方 SES 授权粒度](https://intl.cloud.tencent.com/zh/document/product/598/57150)

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

按 `deploy/production.env.example` 在服务器私有环境填写 `TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`、`TENCENT_SES_REGION`、`TENCENT_SES_FROM_EMAIL` 及两个模板 ID。凭据不放前端、不使用 `NEXT_PUBLIC_`、不提交 GitHub 或粘贴到聊天；私有环境文件仅运行账号可读。应用只发送单收件人的认证邮件。

仓库示例默认 `DIASTAGE_AUTH_EMAIL_ENABLED=false`，其余值留空。上述配置完成且准备执行已获准的测试时才在隔离服务设为 `true`；不自动开启生产服务。API 接受请求不代表收件箱已送达。

## 5. 启用前验收

- [x] SES 广州根域整体“验证通过”，`21@diastage.art` 发信地址已创建，别名“DiaStage 咫台”。
- [x] 修正纯变量链接导致的退回，重新上传模板 `65290`、`65291` 并提交审核，预览已核对；两份各仅含 `{{url}}`，域名固定为 `https://diastage.art/`，15:17 均为“审核中”。
- [ ] 确认两份模板均审核通过，再填写私有配置并启用隔离验收；变量、主题、1 小时文案与代码保持一致。
- [x] 保存并直接关联专用策略 `DiaStageSesSendEmail`；内容仅允许 `ses:SendEmail`、资源 `*`，绑定已核验。
- [x] 创建专用用户 `diastage-ses`；已核验仅编程访问、无用户组且只有上述一条直接策略。
- [x] 确认用户下载的凭据 CSV 已保存在本机，两项必需字段非空；未输出或提交凭据内容。
- [ ] 完成服务器私有配置及实际 API 鉴权验证；当前仅核验下载文件结构，未配置服务器。日志及错误响应不含凭据、验证链接或重置令牌，生产邮件在验收前保持关闭。
- [ ] 隔离账号验证注册、未验证访问、重发限流、忘记密码统一回复、过期/重复使用链接、发送失败提示和重置后旧会话失效。
- [ ] 运营者指定测试收件人并确认发送后，分别检查 QQ、163、Gmail 的实际收件和垃圾箱；再验两个账号的剧目隔离。

此前完整本地复核：生产构建 6/6（生成 18 个页面）、真实 Better Auth + Node SQLite 认证集成 9/9、包含可选 Reply-To 的 Bun 相关测试 17/17（115 次断言）、类型检查 9/9、11 个文件的 Biome 检查通过；独立代码审阅无阻断项。企业邮及 SES 域名/DNS 已通过验证，品牌主邮箱及发信地址已创建，两份模板均审核中；应用发送仍使用模拟请求，未真实发信。生产配置、正式启用、浏览器及实际收发/送达验收仍未完成。进度见[上线队列](diastage-release-todo.md)，未决地址与运营事项见[发布待决事项](diastage-release-decisions.md)。
