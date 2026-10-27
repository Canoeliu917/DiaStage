# DiaStage 部署与 HTTPS 维护阶段审阅稿

日期：2026-10-27（北京时间）。本轮完成最新 Linux 候选构建和配置检查，尚未安装生产环境文件、启动新实例、接受 CA 协议、申请证书、修改云防火墙或 reload Nginx。后续按[待办队列](diastage-release-todo.md)接续；[10 月 26 日审阅稿](diastage-deployment-preflight-20261026.md)保留为历史证据。

## 已完成的候选构建

| 项目 | 本次核验值 |
| --- | --- |
| 应用源码提交 | `3c740c842df247b757d8a36b48ed38b5865f98d3` |
| 原始码包 SHA-256 | `d9f7f0ccd067d8a802320d4d1c588abf31a0ffc28b231d9f81b2101777976654` |
| 独立发布目录 | `/home/ubuntu/diastage-release-20261027-3c740c8/DiaStage` |
| 运行工具 | Node `22.22.1`，Bun `1.3.14` |
| Linux 构建 | 6/6 任务、TypeScript、18/18 页面生成通过；无构建缓存命中，总用时 `2m26.834s` |
| Next Build ID | `ahPTayhCW3AnCBkHB_Iyw` |
| 云端证据 | 发布父目录的 `build-verification.json`、`build.log`、`install.log` |

本轮后续提交仅更新部署模板和文档，不改变应用源码；已构建应用版本继续固定为上述 SHA，不因文档提交而重新构建。

源码包只含固定提交的 tracked 内容。安装 782 个包后，`bun.lock` 和三份品牌页面源文件仍与归档一致；根目录及 `apps/editor` 下均不存在 Next 自动加载的 `.env`、`.env.local`、`.env.production`、`.env.production.local`。构建环境采用独立 `build-check` 路径、临时认证密钥、邮件关闭、AI Key/邀请名单为空，不读取生产私有环境。

SSH stdout 在构建完成时断开，外层记录 `Broken pipe`；安装与构建子进程均为 exit 0。随后重新连接，只读核对日志、产物和服务状态，没有重跑构建。此结果证明构建完成，不等于新实例或公网验收通过。原服务 PID `27262`、原目录 `/home/ubuntu/diastage-release-20261007/DiaStage` 和 Nginx PID `27986` 均保持不变。

## 已准备的生产配置

- [环境示例](../deploy/production.env.example)已固定上述完整 SHA；场景库为 `/home/ubuntu/diastage-data-v01/scenes.db`，AI 账本为同目录 `ai-usage.db`，认证库由程序放在同目录的 `auth.sqlite`。新目录尚未创建，旧数据保留不迁移。
- [systemd 覆盖配置](../deploy/diastage.override.conf)已固定新发布目录，直接用 `/usr/bin/node` 运行 Next，仍只监听 `127.0.0.1:4329`。不再经过旧 `.env.defaults` 的 dotenv 启动包装。
- 本次读取实际 unit：无 drop-in、无 `EnvironmentFile`；旧环境仅包含 `NODE_ENV`、`NEXT_TELEMETRY_DISABLED`、`PASCAL_DB_PATH`、`PATH`。因此采用单一 `/etc/diastage/production.env` 即可，无需额外合并多个环境文件。新环境文件会覆盖旧 unit 的同名数据库路径。
- `/etc/diastage/production.env` 与 `/etc/systemd/system/diastage.service.d/production.conf` 当前均不存在，示例不能原样安装。正式配置须在服务器私有操作中填入至少 32 字符的随机稳定 `BETTER_AUTH_SECRET`，并在更新、重启及回滚时保留同一值；公开 origin 不会使用 `auth.secret` 文件回退。已有稳定值时禁止再次生成替换。
- SES 字段从服务器既有私有 `ses.env` 填入最终环境文件，只在服务器内处理，不输出内容。准备阶段仍保持 `DIASTAGE_AUTH_EMAIL_ENABLED=false`、`OPENAI_API_KEY` 和邀请名单为空；模板 ID 为验证 `65290`、重置 `65291`，广州地域与品牌地址沿用已验收配置。
- 最终环境文件按 `600`、新数据目录按 `700`、服务用户 `ubuntu` 准备。正式生成密钥、安装环境与覆盖配置、服务重启尚未执行，不用 `createAuth`/`getAuth` 充当只读预检。

配置草稿与原 unit 合并后通过 `systemd-analyze verify`。宿主机既有 xfs `CPUAccounting` 和 TAT `PIDFile` 提示与本次配置无关，未修改这些服务。

## 下一阶段拟执行：HTTPS 维护页

这一步只建立可验收的 HTTPS 维护入口。申请一张覆盖 `diastage.art` 与 `www.diastage.art` 的证书，以 `21@diastage.art` 为 CA 联系邮箱；页面保持 503 维护状态，不代理旧应用，不切换应用版本，不发送应用邮件，不调用付费 AI。

今天通过 `119.29.29.29` 复核根域 A 为 `106.53.215.79`、www CNAME 为根域。Nginx 仍只启用默认站点；默认配置 SHA 与昨日私有备份相同。Certbot `4.0.0` 已安装，CA accounts/live/renewal 均不存在，443 尚无监听。云防火墙 10 月 26 日记录仅有 TCP 22、TCP 80、ICMP；执行前须重读控制台，若已有正确 443 规则则不重复添加。

取得此阶段的具体同意后，依次执行：

1. 复核备份、DNS、当前默认站点及其它已启用站点；若与本次基线不同，先调查差异。创建 `/var/www/letsencrypt`，将已准备的 [HTTP ACME 维护配置](../deploy/nginx-http.conf)安装到现有 `/etc/nginx/sites-available/default`，保留 enabled 链接。检查配置成功后 reload Nginx，确认根域与 www 的普通请求均为 503、ACME 路径可达。
2. 复核 CA 协议仍为本次审阅的 v1.8；若版本已变，先重新提供协议供用户确认。获准后执行下述 Certbot webroot 命令。它仅取得证书，不自动修改 Nginx；HTTP-01 使用已开放的 80 端口。

```sh
sudo certbot certonly --webroot -w /var/www/letsencrypt \
  --cert-name diastage.art -d diastage.art -d www.diastage.art \
  --email 21@diastage.art --agree-tos --non-interactive --keep-until-expiring
```

3. 核对证书 SAN 同时覆盖根域与 www、有效期和文件路径。在腾讯云只补充所需的 IPv4 TCP 443 入站规则，保留现有规则；当前仅有 A/CNAME，不额外放行无须使用的应用端口。
4. 将 [HTTPS 维护配置](../deploy/nginx-https-maintenance.conf)安装为同一默认站点，通过配置检查后 reload。80 保留 ACME 并将其他请求跳到 HTTPS；443 两域名均返回 503，配置内没有 `proxy_pass`。外部与浏览器验证有效证书、两域名和重定向，确认不会打开旧 4329 应用。
5. 在 `/etc/letsencrypt/renewal-hooks/deploy/diastage-nginx` 安装 root 拥有、可执行的成功续期钩子：先 `/usr/sbin/nginx -t`，成功才 `/usr/bin/systemctl reload nginx`。核对现有 `certbot.timer`，不另建重复计划。获准范围内做 staging `renew --dry-run` 验证；若要同时验证 deploy-hook，明确使用 `--run-deploy-hooks`，它可能实际 reload Nginx。

[最终应用代理配置](../deploy/nginx-https.conf)将流量转给 4329，须等新版实例、邮件、AI、账号与数据、回滚检查完成且取得最终上线授权后才能安装。HTTPS 维护阶段不使用它。

三种 Nginx 模板都通过了云端 Nginx `-t` 的隔离检查：使用临时测试证书、只在测试副本将监听地址改为回环高端口 `18080/18443`，随后清理测试证书。首次在非特权用户下检查原始 80 端口遇到权限限制，改用隔离测试端口后通过。没有持续监听、reload 或正式证书；该结果仅证明配置可解析，不替代真实 TLS 验收。

### 此阶段需要确认的原因与官方依据

签发会接受 CA 协议、把品牌联系邮箱提交给 CA，并修改公网 HTTPS 配置，超出此前已完成的两封 SES 测试和应用构建范围。Let’s Encrypt 当前生产 ACME 目录指向 [v1.8 协议（2026-07-06）](https://letsencrypt.org/documents/LE-SA-v1.8-July-06-2026.pdf)；执行前再核对 [ACME 目录](https://acme-v02.api.letsencrypt.org/directory)。证书中的域名会进入[公开 CT 日志](https://letsencrypt.org/docs/ct-logs/)，联系邮箱按其[订户隐私政策](https://letsencrypt.org/privacy/#subscriber)不公开。

操作依据：[Certbot Webroot](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot)、[HTTP-01](https://letsencrypt.org/docs/challenge-types/#http-01-challenge)、[续期钩子](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)、[NGINX 配置检查](https://nginx.org/en/docs/switches.html)。`renew` exit 0 也可能表示无需更新，不能单凭退出码认定证书已续期。

## 回滚对象与顺序

已核对仍存在的私有备份：

- `/home/ubuntu/diastage-backups/20261026-pre-ses-153333/diastage.service`、`release.env.defaults`、场景库一致快照及 `restore-check`。旧 unit 当前 SHA-256 为 `b4f2e55030b808be4ff5bad11ba72cff2270fa7a01d79d84d1991452eb507c25`；本次不改该原始 unit 文件。
- `/home/ubuntu/diastage-backups/20261026-pre-https-173224-2550cf/nginx-sites-available-default.conf` 及 enabled 元数据。当前默认站点与该副本 SHA-256 同为 `ce0901350a021608139b5639cf4ccd7717bef8c3a9e4f79031eb46386b67b03f`。

HTTPS 维护阶段若配置检查失败，恢复上述默认站点副本并检查，再决定是否 reload；证书签发失败时保留 HTTP 503 维护，不公开应用。现有应用服务与旧数据无需切换或恢复。已签发的证书与私钥继续私有保存，不为回滚而删除或反复重新签发。

最终应用切换另行获准后，回滚顺序为：先恢复已验证的 HTTPS 维护配置并核对 503；停止新应用；私有备份新增配置、稳定密钥和新数据；仅撤销本次新增的 `production.conf`，将环境文件恢复到切换前状态（原本不存在时先私有留存，再撤销本次新文件）；`daemon-reload` 后启动原 unit 并核对原目录及回环健康。保留新发布目录和新数据，不用旧快照覆盖新数据，不清空其它 drop-in，不让旧应用重新成为公网代理目标。切换前若状态改变，重新固定对应备份与恢复位置。

## 尚未完成

新候选实际运行、真实 HTTPS/Secure Cookie、真实验证与找回邮件令牌、QQ/163 投递、AI 服务商/名单/费用授权、数据政策、完整回滚演练与最终公开切换仍待完成。构建或配置检查不替代这些项目。
