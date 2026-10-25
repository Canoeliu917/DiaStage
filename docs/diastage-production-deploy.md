# DiaStage 发布操作说明

本文的环境记录及命令目录来自 2026-10-22。2026-10-25 的源码包、模板目录和本机复验见[本机接手与发布包准备](diastage-local-preflight-20261025.md)。新模板使用 `diastage-release-20261025`；不要直接混用下面的旧包名或旧发布目录。

环境记录核对日期：2026-10-22；2026-10-25 修正了证书申请阶段的公开访问边界。以下命令是待执行的发布步骤，涉及防火墙、Nginx、数据迁移和服务切换时仍须先取得明确授权。当前未切换线上应用。

## 历史环境记录（2026-10-22，执行前重新核实）

- 服务器：腾讯云广州 `DiaStage-01`，`106.53.215.79`，Ubuntu 26.04，x86_64，2 核 / 4GB；根盘可用约 86GB。
- 现有 Node.js `22.22.1`，`node:sqlite` 的内存数据库及备份 API 可用。Bun 位于 `/home/ubuntu/.bun/bin/bun`。
- `diastage.service` 以 `ubuntu` 运行，目录为 `/home/ubuntu/diastage-release-20261007/DiaStage`，应用监听 `127.0.0.1:4329`，本机访问返回 200。
- 当时数据库路径为 `/home/ubuntu/diastage-data/scenes.db`，与代码目录分离；当时只读统计为 0 条剧目，旧版本没有 Better Auth。这不是当前数据状态，不得据此跳过发布前的数据与归属检查。未读取剧目正文或真实密钥。
- Nginx 正在运行，但目前只有默认网站配置，未把域名反向代理至 DiaStage。
- DNSPod 已配置并验证 `@` 的 A 记录为 `106.53.215.79`、`www` 的 CNAME 为 `diastage.art`；腾讯云防火墙有 TCP 22、80 和 ICMP，没有 TCP 443；腾讯云证书列表为 0 条。

沿用现有 Node、Nginx、systemd，不需要安装 Docker 或更换数据目录。

## 包含的部署文件

- `deploy/nginx-http.conf`：申请证书期间仅开放 ACME 验证目录，其余路径返回 503 维护文字，不代理旧版应用。
- `deploy/nginx-https.conf`：正式 HTTPS、HTTP 与 www 跳转、续期验证目录。
- `deploy/diastage.override.conf`：把现有 systemd 服务切换到新代码目录，继续使用 4329 回环端口。
- `deploy/production.env.example`：私有运行环境示例，不包含真实密钥。

## 一、在新目录构建 Linux 版本

上传源码包及相邻的 SHA-256 文件，先校验再解压。包内没有 Windows 构建产物、node_modules、数据库或密钥。

```sh
set -eu
sha256sum -c DiaStage-deploy-source-20261022.tar.gz.sha256
test ! -e /home/ubuntu/diastage-release-20261022
mkdir -p /home/ubuntu/diastage-release-20261022
tar -xzf DiaStage-deploy-source-20261022.tar.gz -C /home/ubuntu/diastage-release-20261022
cd /home/ubuntu/diastage-release-20261022/DiaStage
export PATH="/home/ubuntu/.bun/bin:$PATH"
test "$(bun --version)" = '1.3.14'
node -e 'const s=require("node:sqlite");if(typeof s.backup!=="function")process.exit(1)'
bun install --frozen-lockfile
PASCAL_DB_PATH=/home/ubuntu/diastage-release-20261022/build-check/scenes.db BETTER_AUTH_URL=http://127.0.0.1:4329 ./node_modules/.bin/turbo run build --filter=editor --env-mode=loose
```

构建使用隔离的数据路径。不要设置 `PASCAL_PORTABLE_BUILD=1`：本方案用正常 `next start`，不是 standalone 启动。构建失败就停止，不切换现有服务。4GB 服务器应先核对可用内存，避免同时执行其他构建。

## 二、解析、HTTP 与证书

1. 已完成并验证 DNSPod `@` A → `106.53.215.79`、`www` CNAME → `diastage.art`；发布前再次核对解析仍指向该服务器。当前未开通 IPv6，不添加无效 AAAA。
2. 腾讯云防火墙增加 TCP 443 的网站访问规则，保留 TCP 80 用于验证及跳转；不开放应用端口 4329。操作系统防火墙如已启用，也应允许 80/443。
3. 备份 `/etc/nginx/sites-available/default`、`/etc/systemd/system/diastage.service` 及已有的同名 drop-in 文件；保留原发布目录。
4. 获准准备证书后，安装 `nginx-http.conf` 为 `/etc/nginx/sites-available/diastage`，链接至 `sites-enabled/diastage`。先检查其他已启用站点没有将本域名或默认入口代理至旧版应用；默认欢迎站点可以保留。两个提供的模板必须先后替换同一个 `diastage` 文件，不能同时启用。

```sh
sudo install -d -m 755 /var/www/letsencrypt
sudo install -m 644 deploy/nginx-http.conf /etc/nginx/sites-available/diastage
sudo ln -s /etc/nginx/sites-available/diastage /etc/nginx/sites-enabled/diastage
sudo nginx -t
sudo systemctl reload nginx
```

若同名站点或链接已存在，先核对和备份，不覆盖未知配置。只有 `nginx -t` 成功后才 reload。此时旧版应用仍只监听回环端口；本模板仅提供 `/.well-known/acme-challenge/` 下已存在的验证文件，其他网站路径包括 API 均返回 503。不要把 `return 503` 放到 `server` 层，否则会先于 ACME 的 location 执行。正式配置应用后再验证此访问边界，本机语法检查不能代替真实 HTTP 验收。

按 Certbot 官方 Ubuntu 指引安装工具。DNS 生效并且两个域名的 HTTP 验证目录可访问后，申请一张覆盖两者的证书：

```sh
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name diastage.art -d diastage.art -d www.diastage.art
```

首次申请的 CA 账号、联系邮箱和服务条款由操作者交互确认。证书签发后继续保留 ACME/503 配置。**拿到证书不代表可以公开旧版应用，不能在此时安装 `nginx-https.conf`。** 该模板会代理 4329，须在第四节完成候选版本、数据与账号隔离检查并取得切换授权后才启用。

## 三、私有配置与数据备份

先在服务器内只读核实实际场景库、认证库、认证密钥和 AI 账本的位置及存在情况，并记录数量与归属检查结果。当前模板的 `/home/ubuntu/diastage-data` 只是目标示例；若实际路径不同，先调整私有配置及备份计划，不移动或覆盖现有数据。场景库的所在目录也是当前版本认证库 `auth.sqlite` 和本机密钥 `auth.secret` 的目录。不要在聊天或日志中输出密钥、完整环境或剧目正文。

```sh
sudo install -d -o root -g ubuntu -m 750 /etc/diastage
```

确认 `/etc/diastage/production.env` 尚不存在，才将 `deploy/production.env.example` 复制为该文件，所有者 `root:ubuntu`、权限 `0640`。已存在时核对并保留原密钥。父目录和文件都不位于 Nginx 网站目录。

已有认证库时保留与它对应的有效 `BETTER_AUTH_SECRET` 或原 `auth.secret`，不要生成新值替换。只有确认是全新认证环境时，才在服务器内生成一次至少 32 字符的随机 `BETTER_AUTH_SECRET` 并写入私有文件。禁止在聊天、终端录屏、日志或源码中输出，后续重启和更新继续使用同一个值。`PASCAL_DB_PATH` 和 `DIASTAGE_AI_LEDGER_PATH` 必须指向核实后的持久路径，不能指向源码目录或临时 `build-check` 数据库。

先准备私有备份目录和恢复步骤。只有在明确授权的停机窗口内，才停止现有应用并对核实后的各持久数据目录做一致性备份，包含场景库、认证库、AI 账本及 SQLite 的 WAL/SHM、认证密钥和私有设置文件；独立目录的账本也不能遗漏。备份目录权限设为 `0700`。Nginx 配置、systemd 原 unit/drop-in 和私有环境文件一并备份；不把备份放在源码或公开目录内。验证备份可读取并在隔离目录演练恢复后再迁移。

是否迁移取决于本次只读检查及用户确认的数据范围，不能沿用历史空库结论。同邮箱在新认证库注册也不会自动取得旧剧目归属。需要迁移时严格使用 `SETUP.md` 的精确 ID、预检查、备份和 bootstrap 流程；不能将全部数据自动划给某个邮箱。只有本次核实确为全新空库且用户选择独立开始时，才采用首次注册流程。

## 四、切换及回滚

**当前仍不授权执行本节。** 仅在候选版本的 Linux 构建、独立账号剧目隔离、数据检查及备份恢复均通过，并获得用户明确切换授权后继续。确认正式域名证书已签发、私有环境文件密钥有效、模板目录与实际候选目录一致。公网仍保留 ACME/503 维护配置；先备份同名 `production.conf`（如存在），再将模板安装到现有服务的 drop-in 目录：

```sh
sudo install -d -m 755 /etc/systemd/system/diastage.service.d
sudo install -m 644 deploy/diastage.override.conf /etc/systemd/system/diastage.service.d/production.conf
sudo systemctl daemon-reload
sudo systemctl restart diastage.service
systemctl is-active diastage.service
curl --fail http://127.0.0.1:4329/api/health
curl --fail http://127.0.0.1:4329/api/auth/get-session
```

未登录的认证检查应返回 HTTP 200，正文为 `null`；`/api/health` 通过仅代表应用存活，不等于认证已就绪。

确认 4329 上已是获准的账号隔离版本、回环验收通过后，才启用正式 HTTPS 代理：

```sh
sudo install -m 644 deploy/nginx-https.conf /etc/nginx/sites-available/diastage
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://diastage.art/api/health
curl --fail https://diastage.art/api/auth/get-session
```

确认两个域名的证书可信、www 跳转至根域名，并检查首页备案号、字体、登录/退出、自己的剧目读取以及服务重启后的持久化。配置 Certbot 的成功续期部署钩子为 `nginx -t && systemctl reload nginx`，检查续期定时任务并运行 `certbot renew --dry-run`。不要打印 `systemctl show ... Environment` 或完整插值配置，避免泄漏密钥。

若失败，先恢复公网 ACME/503 维护配置，防止回滚后公开未经账号隔离的旧版应用，再停止新服务，恢复此次切换前的 drop-in，执行 `daemon-reload`、`nginx -t` 后按已核实的回滚方案重启原服务。旧目录保持不动。数据如已发生迁移，应在停机状态下按发布前成套备份恢复；保留新产生的数据副本，不盲目用旧库覆盖它。

## 验证范围

2026-10-25：使用从 nginx.org 官方下载的 Windows Nginx 1.30.6，在独立临时 prefix 中以 `nginx.exe -t -p <prefix> -c check.conf -e stderr` 检查修改后的 HTTP 模板，结果为 syntax is ok / test is successful。wrapper 直接包含仓库模板，仅补充 events/http 上下文及隔离日志、临时目录。没有启动监听、发起证书申请、修改或 reload 腾讯云配置。本次只证明语法与引用配置可加载，ACME 文件响应、503 状态和 Ubuntu 现网配置仍需在获准应用后验证；未重新测试未改动的 HTTPS 模板。

以下为 2026-10-22 的历史验收记录，不代表本次复验：本机 Node.js 24.19.0 上，默认生产构建通过编译、TypeScript 和 18/18 页面生成；先前 standalone 版本的 32 项 HTTP、资源与匿名访问权限检查通过。当时官方 Windows Nginx 对两份模板的语法检查通过，HTTPS 检查使用临时测试证书。

当时全应用回归 1198 项通过，另有新增服务错误处理的 9 项定向测试及 28 项 viewer 回归通过。真实 AI 与语音服务配置尚未完成：实际界面返回“语音转写与复杂口令服务尚未配置”，不能将使用模拟服务的测试结果视为真实模型或语音转写验收。

当时默认 Node 生产进程的自动启动被审批拒绝，返回信息没有具体理由。用户随后手动启动后的本机 HTTP 验收见[2026-10-25 本机记录](diastage-local-preflight-20261025.md)。Ubuntu 上的构建、真实配置 `nginx -t`、证书签发、账号注册与正式切换仍待执行。

## 官方参考

- [NGINX return 指令](https://nginx.org/en/docs/http/ngx_http_rewrite_module.html#return)
- [NGINX 配置检查参数](https://nginx.org/en/docs/switches.html)
- [NGINX 反向代理](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Certbot 使用说明](https://eff-certbot.readthedocs.io/en/stable/using.html)
- [腾讯云轻量服务器防火墙](https://cloud.tencent.com/document/product/1207/44577)
- [腾讯云备案号悬挂说明](https://cloud.tencent.com/document/product/243/61412)
