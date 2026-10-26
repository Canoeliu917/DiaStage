# DiaStage 部署准备审阅稿（2026-10-26）

日期：2026-10-26（北京时间）。本稿记录准备状态与待审方案，不是执行脚本。备份及 Certbot 工具安装已完成；未申请证书、修改防火墙、reload Nginx 或切换生产。正式切换仍需最终授权；用户已手动启动本机预览，账号、剧目保存及隔离的浏览器验收已通过。

以下是 2026-10-26 的状态快照，跨电脑接手时须重新核对实际环境、版本、访问权限和授权。接续顺序以 [上线待办](diastage-release-todo.md) 为准，未决事项见 [发布待决事项](diastage-release-decisions.md)。文中本机脚本和 fixture 属原电脑，未随仓库分发。

## 当前证据

- 云端候选 `b57c1d5` 已通过 Linux 生产构建 8/8、认证集成 9/9，以及真实 Next 回环 HTTP 的 8 组验收。HTTP 使用独立测试库、临时密钥和模拟 SES 传输；实例已停止，测试数据库及邮件令牌文件已删除，4330 端口复查空闲。
- 本轮云端只读复核显示，旧 `diastage.service` 仍 active，MainPID `27262`，目录 `/home/ubuntu/diastage-release-20261007/DiaStage` 未改。现有数据目录只有权限 `600` 的 `scenes.db`，没有 `auth.sqlite`、`auth.secret` 或 `ai-usage.db`。
- 两封独立 SES 测试已实际进入 Gmail 收件箱，SPF、DKIM、DMARC 通过；链接仅为测试标识。服务器私有 `/home/ubuntu/diastage-private/ses.env` 的邮件开关仍为 `false`，未接入旧服务。
- b57 构建不含后来新增的品牌联系前端。本机 `8c2b91b0deb397bcf68473344143a8fa26b4b0a6` 已覆盖最新品牌前端，并通过下述浏览器检查；HTTPS 浏览器 Secure Cookie 行为、真实邮件令牌端到端及 QQ/163 尚未验收。
- Nginx active，PID `27986`，配置检查通过；仅启用 `sites-enabled/default` → `sites-available/default`，内容为 `/var/www/html` 默认站点、`server_name _`，没有代理或 SSL 证书配置。80 端口携带 `Host: diastage.art` 返回 200 欢迎页；应用仅监听 `127.0.0.1:4329`，443、4330 无监听。
- `119.29.29.29` 复核根域 A → `106.53.215.79`、www CNAME → `diastage.art`。腾讯云防火墙完整三条规则仅允许 IPv4 TCP 22、TCP 80、ICMP，无 443；只读未改。UFW 未启用，nft INPUT 为 accept。
- Certbot 已从 Ubuntu 腾讯镜像安装，发行包 `4.0.0-4`、CLI `4.0.0`；新增 8 包，0 升级、0 移除，未安装 Nginx 插件，无服务需重启。包自动启用 `certbot.timer`（active/waiting），`certbot.service` inactive/PID 0；未申请证书，accounts/live/renewal 不存在，TLS 仍未配置。
- `/etc/diastage/production.env` 和目标 `production.conf` 均不存在；私有 `ses.env` 权限为 `600`。实际 unit 的环境加载关系仍待核对；Nginx 备份已完成，范围见下方，尚未执行回滚演练。
- 本轮代理自动构建曾在 CreateProcess 阶段被自动审批拒绝，返回 `blocked by policy`，未提供具体理由；被拒命令未执行。随后用户自行运行已修复的 `start-diastage-browser-check.ps1`，构建并启动版本 `8c2b91b0deb397bcf68473344143a8fa26b4b0a6`，健康接口与源码版本相符，Build ID 为 `qIWcBE_LgbxJ8hy7rmdWn`；只监听 `127.0.0.1:4318`，使用 `work/browser-ui-check/data` 独立测试库，邮件关闭且无 AI Key/邀请名单。
- 本机浏览器实测通过：首页、隐私页、使用说明显示 `21@diastage.art`；匿名剧目库跳登录；注册确认密码不一致与错误登录密码有明确提示；新账号空库；建立 8×6 米镜框式舞台并放置硬椅后显示已同步，刷新及退出后重新登录仍恢复两个对象；跨标签退出自动关闭私有编辑器并跳登录；账号 B 的库为空，直接访问 A 的场景显示“未找到场景”（只记录页面表现）；AI 额度页显示未获邀和零用量。未调用模型。已检查的标签页 23 控制台只见 `THREE.Clock` 弃用警告，无错误。此次未重启进程，不替代进程重启持久性或公网 HTTPS 验收。

## 拟定的新数据与发布配置

- 新持久目录建议为 `/home/ubuntu/diastage-data-v01`，**尚未创建，路径待本次审阅固定**。拟定场景库为该目录下 `scenes.db`；认证库由程序自动放在同目录的 `auth.sqlite`；AI 账本显式设为该目录下 `ai-usage.db`。旧 `/home/ubuntu/diastage-data` 保留，不迁移、覆盖或重新分配旧数据。
- 最终 release 的完整 SHA、源码包摘要、Linux 构建结果及绝对 app 路径，待最新候选构建后固定。现有 `deploy/diastage.override.conf` 仍指向 `diastage-release-20261025/DiaStage`，不能直接安装；最终 `WorkingDirectory`、`ExecStart` 与 `PASCAL_RUNTIME_VERSION` 必须对应同一获准版本。
- `BETTER_AUTH_URL` 保持 `https://diastage.art`。当前旧数据目录尚无认证库或 `auth.secret`，拟定的新环境需要服务器私有、至少 32 字符的随机稳定密钥，首次保存后更新和重启继续复用；生产候选密钥尚待配置。本稿不生成、读取、复制或展示密钥，也不使用已清理的 HTTP 测试密钥。
- 先核对真实 unit、drop-in 和 `EnvironmentFile` 顺序，再确定 `/etc/diastage/production.env` 与现有私有 `ses.env` 的引用方式。确认同名键最终生效值及服务用户的读取权限；不把凭据复制进仓库或此文件。是否需要重置继承的环境文件列表，待实际 unit 确认。
- 准备阶段保持 `DIASTAGE_AUTH_EMAIL_ENABLED=false`，AI Key 和受邀名单关闭。配置准备不等于启用邮件或付费 AI。

## 本次可继续完成的预检

固定最终候选后，核对 Node、Next 启动入口与构建产物存在；确认三项持久路径均在拟定新目录且不落入 release、`build-check` 或旧数据目录。只记录私有目录/文件的存在性、所有者和权限，以及稳定密钥配置是否就绪，不回传内容。

预检不得调用会初始化或迁移数据库的 `createAuth` / `getAuth`。真实域名证书、Nginx 转发和浏览器验收分别记录；健康接口成功不能替代这些检查。

## 回滚准备：先固定备份对象，再批准切换

已知 `/home/ubuntu/diastage-backups/20261026-pre-ses-153333` 的场景 SQLite 一致快照及隔离恢复检查通过，原 unit 和 `.env.defaults` 已私有备份。本轮另建 `/home/ubuntu/diastage-backups/20261026-pre-https-173224-2550cf`，目录 `700`，以下四文件均 `600`：

- `nginx-sites-available-default.conf`：默认站点备份，SHA 与原文件一致。
- `nginx-enabled-metadata.json`：lstat/readlink 及 enabled 列表。
- `service-baseline.json`：现有服务基线。
- `backup-manifest.json`：本次备份清单。

Certbot 安装后再次核对，默认站点 SHA、enabled 链接及原服务/Nginx PID 均未变。下一次切换前仍须固定以下对象及恢复位置：

- 实际 unit 的源文件、全部生效 drop-in，特别是目标 `production.conf` 原本存在或不存在的状态。
- 全部实际加载的环境文件、认证库对应的稳定密钥，以及新生产配置的恢复位置；备份只保存在私有目录。
- 从上述备份恢复默认站点及 enabled 链接的步骤；后续新增站点、证书和续期配置的备份位置。保留可恢复的维护配置。
- 切换前的场景库、认证库、AI 账本及一致性恢复记录；不存在的对象明确记为不存在。新环境投入使用后，也需保存其完整数据与密钥。

获准切换后的回滚顺序应固定为：先恢复公网维护边界并验证，防止公开旧版应用；停止新服务；恢复本轮替换的 drop-in、环境和 Nginx 状态；检查配置，再恢复原服务并核对目录、版本与健康。若原无 `production.conf`，只撤销本轮新增文件，不清空其他 drop-in。具体命令待实际文件及备份位置核验后写定。

保留旧发布目录和新产生的数据；需要恢复数据库时先停机并另存新数据，不能用旧快照直接覆盖。正式切换与回滚演练当前均未执行。
