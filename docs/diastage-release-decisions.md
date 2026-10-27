# DiaStage 发布待决事项

更新：2026-10-27（北京时间）。按用户要求集中保留，继续完成不依赖这些决定的准备。本文件记录决定与验收边界，不包含凭据或私人场景内容；SSH 配置授权不等于正式服务切换授权。

## 已确定，不再重复询问

- 邮箱注册；每个新账号从空白剧目库开始，独立保存和访问自己的剧目，不按邮箱自动认领旧场景。云端使用新数据，不迁移、删除或重新分配既有数据。
- 首发准备开放 AI 内测：最多 20 个受邀账号，网站承担费用；全站每月 100 元，每账号每日 1 元、每月 5 元。日额度计入月额度，所有剧目共用。没有充值或真实付费调用授权。
- 继续使用指定验收分支，保留原账号、剧目、素材和预算账本。暂不切换腾讯云正式服务。
- 手机和平板联动仍按现有默认关闭状态处理。
- 用户确认主办单位及负责人均为刘琛；网站联系、人工收发、自动通知可见 From 及回复地址统一使用 `21@diastage.art` 的目标已经明确，无需再问。此前“本机隐私与使用说明已补主体及 Gmail”记录有误；本次已真正补充首页、隐私页及使用说明的品牌联系链接源代码，保留原备案与待确认政策，尚未部署。
- 用户确认已备案，并提供“粤ICP备2026162365号”；现有首页页脚展示相同编号。尚未读取腾讯云备案后台，不补猜 `-1` 等网站后缀。
- 用户声明现有素材都允许公开；保留原来源和许可证记录，不将该声明扩展为对第三方作品的额外授权。
- 用户已授权 SSH 远程配置并明确同意安装本机新公钥；2026-10-26 15:26 经 TAT 安装成功，严格主机公钥校验后已连接云端，未切换正式服务。
- 用户已明确同意 HTTPS 维护阶段：以 `21@diastage.art` 为 CA 联系邮箱、接受 LE v1.8 协议，申请根域/www 证书、仅开放 443、安装维护页并验证自动续期（含 Nginx reload）。不公开或切换应用，不新增邮件或付费 AI；最终生产切换仍需另行授权。
- 2026 年 11 月 1 日是内测目标日期；仍需通过上线验收条件并取得最终切换授权，不会到期自动发布。
- 用户已选择腾讯云 SES API，广州根域、品牌发信地址和两份模板均通过验证或审核。计费角色授权已确认；专用 CAM 用户仅编程访问、无组且只关联允许 `ses:SendEmail`、资源 `*` 的策略。凭据已私存 `/home/ubuntu/diastage-private/ses.env`，目录 `700`、文件 `600`、属 `ubuntu`，未输出内容。用户明确批准的两封独立 SES 测试于 16:28:48 经实际 API 接受并进入 Gmail 收件箱，SPF/DKIM/DMARC 全通过且域名对齐；生产仍 active、私有开关仍 `false`。证据见[SES 投递记录](diastage-ses-api-setup.md)。
- 用户已选择腾讯企业邮基础版，企业微信“DiaStage咫台”已注册，DNSPod 邮件解析已写入。企业邮域名验证及开通已通过，主邮箱为 `21@diastage.art`，原 `liuchen@diastage.art` 保留为别名。经用户明确授权，`25101763g@gmail.com` → 品牌邮箱收件及品牌邮箱 → Gmail 回复共两封测试已完成，双方均进收件箱；Gmail 回复 ID `1a1771b0d33f8e7e`、标识 `DS-MAIL-20261026-A-REPLY`。SPF/DMARC 通过且 `diastage.art` 完全对齐；该企业邮邮件无 DKIM 签名，不能据此声称企业邮 DKIM 或 SES 投递通过。

## 等用户回来处理

| 优先级 | 待确认事项 | 确认前的处理 |
| --- | --- | --- |
| P0 | 应用真实认证邮件及其他收件方验收 | 企业邮互测、SES 域名/模板、获准的两封独立 API/Gmail 投递、隔离 Next HTTP 8 组及邮件关闭条件下的本机核心 UI 均通过。真实邮件令牌端到端、QQ/163 和公网浏览器仍待验；生产邮件关闭，未加入现有服务。 |
| P0 | 云端候选的预算账本、生产配置与浏览器验收 | 含品牌前端的 `3c740c8` 新目录 Linux 构建 6/6、18/18 页及配置静态检查通过，新 runtime 未启动；b57 HTTP 和 8c 本机 UI 保留原范围。新数据目录、生产环境文件和正式稳定密钥尚未创建，预算账本、应用 TLS/Secure Cookie 与公网浏览器仍待验收。 |
| P0 | 公网浏览器实际核验 | HTTPS 维护范围已获准，无需重复询问；证书、维护 Nginx、443、外部系统证书信任/301/503 及 staging 续期 hook 均通过，见[验收记录](diastage-https-validation-20261027.md)。内置浏览器被客户端拦截，正常浏览器仍待实际核验；不公开应用，不等于最终生产切换授权。 |
| P0 | 适用于内地业务的真实 AI 服务商、可用模型/价格、验证费用上限及受邀账号名单 | 默认空名单关闭付费 AI；不假设广州服务器可直接采用当前 OpenAI API，也不擅自改现有模型。选定供应商后再核对账户、计价、数据处理和网络；真实模型验收另需明确小额费用上限。 |
| P0 | 完整数据保留与删除安排、正式服务条款 | 主体及品牌地址目标已确认，联系链接源代码已完成但尚未部署；继续保留当前可核实的内测说明，不虚构保留期限或法律承诺。 |
| P1 | 正式切换窗口及最终发布授权 | 以 11 月 1 日内测为目标；隔离 Linux 构建和备份恢复核对已通过，仍需账号/场景/额度、HTTPS 和回滚检查，再取得最终切换授权；目标日期不触发自动发布。 |

## 已核对的服务商限制

- 腾讯云邮件推送：2026-03-02 零点后开通服务的个人认证用户不支持 SMTP 发信，可使用 API / 控制台；不能直接套用 SMTP 接入方案。品牌邮箱与 Gmail 的互测不代表应用 SES API 已验收。来源：[腾讯云 SMTP 发送邮件指南](https://cloud.tencent.com/document/product/1288/65749)。
- OpenAI API 官方支持国家/地区名单不含中国内地。广州服务器面向内地用户时，不能把当前代码使用 OpenAI 当作已验证的正式服务方案，需先选择适用供应商；本轮不变更现有模型。来源：[OpenAI API 支持国家与地区](https://developers.openai.com/api/docs/supported-countries)。

## 邮箱方案：统一品牌目标，根域配置已验证

- 品牌主邮箱 `21@diastage.art` 已创建，旧地址 `liuchen@diastage.art` 保留为别名；已完成获准的 Gmail 双向收发测试。首页页脚新增品牌 mailto 并保留 ICP，隐私页两处、使用说明一处加入联系链接，日期更新至 10 月 26 日；三文件 Biome、`apps/editor` 的 `tsgo --noEmit`、定向 diff 及本机三页浏览器核对通过。生产页面不变；未改变完整数据处理与正式条款待确认的边界。
- DNSPod 当前 8 条记录保留原网站、企业邮双 MX 和验证 CNAME，根域 SPF 合并企业邮与 SES，DMARC `p=none` 及 SES 2048 位 DKIM 已配置，SES 整体验证通过。企业邮此前回复 SPF/DMARC 通过但无 DKIM 签名；后续两封独立 SES 邮件的 SPF/DKIM/DMARC 则均通过，证据与范围见[SES API 接入](diastage-ses-api-setup.md)。
- 两份模板 `65290`“DiaStage 验证邮箱”、`65291`“DiaStage 重置密码”因纯变量链接被退回后，已修正为 `https://diastage.art/{{url}}`，程序配套传相对路径及查询/片段，约 15:20 均审核通过。已审 ID 写入私有配置，各一封独立 SES 实际请求及 Gmail 投递已通过；应用正式启用仍未完成。
- 可选 `TENCENT_SES_REPLY_TO_EMAIL` 仓库默认空；用户统一品牌地址的目标已明确，品牌双向收发通过后，服务器私有配置已填写 `21@diastage.art`，映射 `ReplyToAddresses`，仅改变回复收件地址，不改变可见 From。配置尚未加入现有服务，邮件开关保持关闭。[官方参数说明](https://cloud.tencent.com/document/api/1288/51034)
- 后续 DNS、模板和真实发送均按后台实际配置及验收推进；凭据仅放服务器私有环境，不写 GitHub、前端或聊天。
- 此次模板修正通过 10 项 SES 定向测试、88 次断言、两份 TypeScript 文件的 Biome 检查及独立审阅。此前候选完整本地复核：生产构建 6/6（18 个页面）、真实 Better Auth + Node SQLite 认证集成 9/9、含可选 Reply-To 的 Bun 相关测试 17/17（115 次断言）、类型检查 9/9、11 个文件的 Biome 检查通过。最新 Linux 构建结果见下方；邮件开关关闭，模拟发送和企业邮互测不代表真实 SES 或应用浏览器验收。部署与验收步骤见[SES API 接入](diastage-ses-api-setup.md)及[待办队列](diastage-release-todo.md)。
- 已执行的品牌互测、SSH 配置及恰好两封独立 SES 实测均有用户明确授权；后续不扩大此次发信数量或收件人范围，仍无真实付费 AI 测试或正式服务切换结果。

## 云端接入与备份证据

- 15:26 经 TAT 安装用户明确同意的本机专用 SSH 公钥，严格主机公钥校验后连接成功。现有 `diastage.service` 仍 active，运行目录 `/home/ubuntu/diastage-release-20261007/DiaStage`。
- 本次只读检查实际场景库 `/home/ubuntu/diastage-data/scenes.db`，三张场景相关表均为 0，完整性正常；未修改现有服务或数据，不沿用此前历史空库推断。
- 备份目录 `/home/ubuntu/diastage-backups/20261026-pre-ses-153333` 已通过 SQLite backup API 创建一致快照；隔离 `restore-check` 的完整性、三表计数和 SHA 一致。服务 unit 与 `.env.defaults` 备份权限 `600`、目录 `700`，未输出内容。
- 候选 `b57c1d5` 源码包上传、SHA-256 校验及解压通过，摘要见[待办队列](diastage-release-todo.md)。独立 SES probe 通过 dry-run 后，按用户明确批准向指定 Gmail 各发送一封已审模板，实际 API 鉴权、投递和认证均通过；详细 Gmail ID、标识链接及认证头见[SES 投递记录](diastage-ses-api-setup.md)。
- Linux 依赖安装首次因腾讯默认镜像全包 404 失败，随后仅该次命令指定 `registry.npmjs.org`，成功安装 782 个包。候选 `b57c1d56cb96955db49305ae27fee38e8ece8a38` 在 `/home/ubuntu/diastage-candidate-b57c1d5/app` 完整生产构建 8/8 通过，含 Next 编译、TypeScript 和 18 页生成；此构建早于后续联系页面源码修改。旧服务未切换；应用真实认证邮件令牌端到端、公网浏览器及正式切换仍未完成。
- Linux 认证集成最终 9/9 通过（auth 3/3、email 6/6），网络尝试为 0，临时数据库已清理；首次启动器环境问题已在不改代码或断言的情况下复测解决，细节见[SES 接入记录](diastage-ses-api-setup.md)。生产 active、私有 SES 开关 `false` 前后保持一致。
- 候选 `b57c1d5` 的真实生产 Next 在 Linux `127.0.0.1:4330` 完成隔离 HTTP 验收，8 组全过、退出码 0，SES 传输模拟，详细范围见[HTTP 验收记录](diastage-ses-api-setup.md)。测试实例已停止、数据库及邮件令牌文件已删除，端口空闲；旧生产 MainPID `27262`、目录和私有邮件关闭状态未变。
- 10 月 26 日 HTTPS 只读预检时 DNS 正确，腾讯云防火墙仅有 TCP 22、TCP 80、ICMP 三条规则，无 443；Nginx 配置检查通过但仍为默认欢迎页，无代理或 SSL，443/4330 无监听。旧服务 PID `27262`、Nginx PID `27986` 未变，当时未改站点或防火墙。
- `/home/ubuntu/diastage-backups/20261026-pre-https-173224-2550cf` 已备份默认站点、enabled 链接/列表、服务基线和 manifest，目录 `700`、四文件均 `600`；default SHA 及链接状态在安装后复核未变。Certbot `4.0.0-4`（CLI `4.0.0`）从 Ubuntu 腾讯镜像安装成功，新增 8 包且无升级/移除，无服务需重启；包自动启用 `certbot.timer`。当时未申请证书，accounts/live/renewal 不存在；10 月 27 日后续结果见下方。

## 2026-10-27 新候选与审阅结果

- 远端提交 `3c740c842df247b757d8a36b48ed38b5865f98d3` 的源码包摘要、新目录及完整构建证据见[今日队列](diastage-release-todo.md)。安装 782 包、Linux 构建 6/6 与 18/18 页通过，Build ID `ahPTayhCW3AnCBkHB_Iyw`。构建退出 0，外围 SSH 输出最终 `Broken pipe`；重连只读核验版本、锁文件和品牌源文件一致，未重复构建。
- 原 unit 已确认无 drop-in/EnvironmentFile，旧 dotenv 仅载入 `.env.defaults`；新配置草稿采用直接 Next 与单一 `/etc/diastage/production.env`。`systemd-analyze verify` 与三种 Nginx 模板的隔离静态检查通过，后者仅用临时自签证书及回环高端口，已清理；不代表正式 TLS 或运行验收。生产环境/drop-in、新数据目录及正式密钥均未创建，未安装应用配置。
- 签发前 DNS 与 Nginx 默认站点 SHA 复核通过；随后按用户明确授权完成 LE v1.8 确认与正式双域 ECDSA 证书签发，有效期为 `2026-10-27 02:04:16 UTC` 至 `2027-01-25 02:04:15 UTC`。维护 Nginx 已安装并通过 `nginx -t`/reload，云端回环 curl 正规 CA 验证通过，两域 HTTPS 503、HTTP 301，无应用代理；证书指纹及细节见[今日队列](diastage-release-todo.md)。新 runtime 未启动，旧应用 PID `27262`/原目录不变，未新发邮件或付费 AI。
- 控制台登录已恢复，仅新增 IPv4 全网 TCP 443 规则，原 22/80/ICMP 保留。外部 Windows HttpClient 无证书 bypass，两域 HTTP 301 至根域 HTTPS、两域 HTTPS 503 品牌维护文本通过；正式证书指纹未变。第二次 staging dry-run 将输出保存到服务器文件，退出 0、全部模拟续期及实际 deploy-hook 成功；timer active/enabled，未重签正式证书，测试 fixture 已清理。完整时间和证据见[HTTPS 验收记录](diastage-https-validation-20261027.md)。
- 内置浏览器打开域名报 `net::ERR_BLOCKED_BY_CLIENT`、停留 `about:blank`，未绕过；这是浏览器验收受阻，不是 TLS 验证失败，也不计为通过。下一步正常浏览器实际核验及新版私有配置、稳定密钥准备与运行计划；新数据目录、生产 env/drop-in 仍未创建，旧应用 PID `27262`/目录及 Nginx PID `27986` active 状态保持，未新发邮件或调用 AI。

## 仍需实际环境验收

- 腾讯云候选的生产配置、稳定密钥及正式运行验收：最新 `3c740c8` 已构建但未启动；旧 b57 隔离 HTTP 及本机 8c UI 保留各自证据，不替代新候选正式运行，不改旧服务目录。
- 正式证书、维护配置、443、外部系统 TLS/301/503 和 staging 续期 hook 验证已通过；正常浏览器仍待核验。应用反向代理及健康版本检查属于后续应用验收，维护页不代理应用。
- 本机核心浏览器已通过登录退出、跨标签撤离、账号隔离、手动置景及刷新留存，详情见[本机记录](diastage-release-todo.md)。公网浏览器、进程重启、真实邮件令牌及 TLS/Secure Cookie 实际浏览器行为仍待验。
- 本机未受邀 AI 的零用量与提示通过，未调用模型；真实 AI、额度耗尽提示及供应商验收仍待完成。
- 自动启动及自动构建曾被审批拒绝，构建返回 `blocked by policy` 且无具体理由，拒绝的命令未执行，未更换工具绕过。随后用户自行成功构建启动 `8c2b91b` 于 `127.0.0.1:4318`，健康版本已核对；使用独立测试库、邮件关闭、AI Key/名单为空。A 注册空库、8×6 舞台与硬椅同步并刷新保留，B 空库且不能打开 A 场景；A 再登录仍仅自己的 01 个剧目。已检查的标签页 23 控制台仅见 `THREE.Clock` 弃用警告，无 error；完整版本与边界见[待办记录](diastage-release-todo.md)。使用用户原数据须另行明确，生产未切换。

执行进度见[待办队列](diastage-release-todo.md)，原始范围见[19 项清单](diastage-release-readiness-20261025.md)。
