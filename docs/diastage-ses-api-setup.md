# DiaStage 腾讯云 SES API 接入

更新：2026-10-26（北京时间）。用户已选定腾讯云 SES API，广州服务已成功开通；控制台显示 1000 免费封，域名、地址及模板均为 0。尚未创建发信域、修改 DNS、上传模板、发送真实邮件或切换云端服务。邮件 P0 的配置与实际环境验收仍未完成。

## 1. 统一品牌地址与当前进度

用户当前目标是网站联系、人工收发、自动通知的可见 From 及回复地址统一为 `21@diastage.art`。已选择腾讯企业邮基础版，企业微信已注册成功，组织名为“DiaStage咫台”，已进入企业邮箱开通域名向导。企业邮的 `diastage.art` 域名及 `21` 邮箱仍待配置、开通和验证，公开联系邮箱继续使用 `25101763g@gmail.com`。

SES 的 `FromEmailAddress` 首选目标同为 `21@diastage.art`，需先核验企业邮与 SES 共用根域的 DNS 可行性；当前不提交自动发信域名。此前子域 `noreply` 方案未采用。

可选 `TENCENT_SES_REPLY_TO_EMAIL` 默认留空；品牌邮箱收发验收通过且用户确认后才填写 `21@diastage.art`。它映射到官方可选字符串参数 `ReplyToAddresses`，仅改变回复收件地址，不改变可见 From；当前未配置。[官方 SendEmail 参数](https://cloud.tencent.com/document/api/1288/51034)

若根域共用不可行，`HeaderFrom` 代发仅作为待验证备选；官方说明可能显示代发标识，不能保证纯品牌显示，也未在本项目验证或配置。[官方代发说明](https://cloud.tencent.com/document/product/1288/54785)

SES API 支持 `ap-guangzhou`、`ap-hongkong`。按 SES 控制台实际开通地域填写配置，并在同一地域核对发信域、发信地址及模板。API 使用 `ses.tencentcloudapi.com`、`SendEmail`、版本 `2020-10-02`。[官方接口说明](https://cloud.tencent.com/document/api/1288/51034)

## 2. 配置 DNS 并创建发信地址

2026-10-26 DNSPod 只读核实：`diastage.art` 现有两条记录为 `@` A → `106.53.215.79`、`www` CNAME → `diastage.art.`，TTL 均为 600；没有邮件 MX/TXT 记录。本轮未修改 DNS。

官方口径存在差异：[域名 FAQ](https://cloud.tencent.com/document/product/1288/52776) 说明必须与企业邮箱共用时需要合并 SPF；[身份验证 FAQ](https://cloud.tencent.com/document/product/1288/60652) 允许 MX 使用自有邮件服务器；[快速入门](https://cloud.tencent.com/document/product/1288/47454) 则提示不可使用企业邮箱域名。根域方案尚未验证，不据单篇文档直接认定可用。

1. 先完成企业邮现有域名配置，核对并保存两服务后台实际要求的记录，再确认 SES 共用根域能否通过验证；有冲突时向腾讯云核实，不先提交 SES 域名。
2. 保护网站 A/CNAME；配置企业邮后保留其收件 MX，不用 SES 向导默认值盲目覆盖。同一主机名只保留一条 SPF，按两服务实际授权合并；保护已有 DKIM、DMARC。
3. 兼容性和操作范围确认后，再按控制台实际主机名、类型、记录值、优先级配置并验证；本文件不提供通用值代填真实记录。
4. 两服务域名、品牌邮箱收发及 SES 发信地址均验证通过后，才进入模板和实际送达验收。验收不以“记录已保存”代替。

## 3. 上传两份模板并记录审核通过的 ID

- 邮箱验证：`deploy/email-templates/verify-email.html`；邮件主题使用“验证 DiaStage 邮箱”。
- 重置密码：`deploy/email-templates/reset-password.html`；邮件主题使用“重置 DiaStage 密码”。

在 SES 发信模板中选择 HTML 富文本，上传对应文件并预览，审核通过后将真实 ID 分别写入 `TENCENT_SES_VERIFY_TEMPLATE_ID`、`TENCENT_SES_RESET_TEMPLATE_ID`，不使用示例 ID。[官方模板操作](https://cloud.tencent.com/document/product/1288/77251)

两份模板仅有 `{{url}}` 变量。腾讯云占位语法为 `{{键}}`；发送时 `Template.TemplateData` 为 JSON 字符串，即 `JSON.stringify({ url })`，不是直接传入对象或 HTML。链接由服务器认证流程生成，邮箱验证及密码重置均为 1 小时有效；修改认证有效期时同步修改模板并重新审核。[官方 Template 数据结构](https://cloud.tencent.com/document/product/1288/51053)

## 4. 最小发信权限与私有配置

开通时用户已明确同意并完成腾讯云服务角色 `SES_QCSLinkedRoleBilling` 授权。官方策略 `QcloudAccessForSESLinkedRoleInBilling` 允许 `billing:CreateOrdersAndPay`（资源 `*`）及 `finance:trade`（资源 `qcs::ses:::*`），角色由腾讯 SES 服务扮演；这与下述应用发信密钥不同，不把计费权限加给应用子用户。授权本身不能证明已产生具体费用。[官方服务角色权限](https://intl.cloud.tencent.com/zh/document/product/598/80322)

应用发信 CAM 子用户尚未创建；后续计划使用独立子用户的服务器凭据，只授予 `ses:SendEmail`，不附加计费、模板管理、DNS 或管理员权限。官方将 `SendEmail` 列为操作级授权，资源必须为 `*`；不能假设它支持按发信域或模板 ID 限制资源。以下为待运营者审核的最小策略建议：[官方 SES 授权粒度](https://intl.cloud.tencent.com/zh/document/product/598/57150)

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

- [ ] 发信域及地址真实验证通过；两份模板审核通过且变量、主题、1 小时文案与代码一致。
- [ ] 服务器私有配置完整，最小 CAM 策略通过；日志及错误响应不含凭据、验证链接或重置令牌。
- [ ] 隔离账号验证注册、未验证访问、重发限流、忘记密码统一回复、过期/重复使用链接、发送失败提示和重置后旧会话失效。
- [ ] 运营者指定测试收件人并确认发送后，分别检查 QQ、163、Gmail 的实际收件和垃圾箱；再验两个账号的剧目隔离。

最新本地复核：生产构建 6/6（生成 18 个页面）、真实 Better Auth + Node SQLite 认证集成 9/9、包含可选 Reply-To 的 Bun 相关测试 17/17（115 次断言）、类型检查 9/9、11 个文件的 Biome 检查通过；独立代码审阅无阻断项。发送使用模拟请求，未真实调用 SES；本地通过不代表浏览器、DNS、模板审核或送达验收通过。进度见[上线队列](diastage-release-todo.md)，未决地址与运营事项见[发布待决事项](diastage-release-decisions.md)。
