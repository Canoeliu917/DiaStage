# DiaStage 发布操作说明

核对日期：2026-10-22。DNS 解析已配置并验证；以下防火墙、HTTPS 与服务器发布步骤仍待执行，尚未切换线上应用。

## 已核对的现有环境

- 服务器：腾讯云广州 `DiaStage-01`，`106.53.215.79`，Ubuntu 26.04，x86_64，2 核 / 4GB；根盘可用约 86GB。
- 现有 Node.js `22.22.1`，`node:sqlite` 的内存数据库及备份 API 可用。Bun 位于 `/home/ubuntu/.bun/bin/bun`。
- `diastage.service` 以 `ubuntu` 运行，目录为 `/home/ubuntu/diastage-release-20261007/DiaStage`，应用监听 `127.0.0.1:4329`，本机访问返回 200。
- 数据库路径为 `/home/ubuntu/diastage-data/scenes.db`，与代码目录分离。只读统计为 0 条剧目；旧版本没有 Better Auth。未读取剧目正文或真实密钥。
- Nginx 正在运行，但目前只有默认网站配置，未把域名反向代理至 DiaStage。
- DNSPod 已配置并验证 `@` 的 A 记录为 `106.53.215.79`、`www` 的 CNAME 为 `diastage.art`；腾讯云防火墙有 TCP 22、80 和 ICMP，没有 TCP 443；腾讯云证书列表为 0 条。

沿用现有 Node、Nginx、systemd，不需要安装 Docker 或更换数据目录。

## 包含的部署文件

- `deploy/nginx-http.conf`：申请证书期间的 HTTP 反向代理及 ACME 验证目录。
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
4. 安装 `nginx-http.conf` 为 `/etc/nginx/sites-available/diastage`，链接至 `sites-enabled/diastage`。默认站点可以保留；两个提供的模板必须先后替换同一个 `diastage` 文件，不能同时启用。

```sh
sudo install -d -m 755 /var/www/letsencrypt
sudo install -m 644 deploy/nginx-http.conf /etc/nginx/sites-available/diastage
sudo ln -s /etc/nginx/sites-available/diastage /etc/nginx/sites-enabled/diastage
sudo nginx -t
sudo systemctl reload nginx
```

若同名站点或链接已存在，先核对和备份，不覆盖未知配置。只有 `nginx -t` 成功后才 reload。此时仍运行旧版应用。

按 Certbot 官方 Ubuntu 指引安装工具。DNS 生效并且两个域名的 HTTP 验证目录可访问后，申请一张覆盖两者的证书：

```sh
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name diastage.art -d diastage.art -d www.diastage.art
```

首次申请的 CA 账号、联系邮箱和服务条款由操作者交互确认。拿到真实证书后再安装正式配置：

```sh
sudo install -m 644 deploy/nginx-https.conf /etc/nginx/sites-available/diastage
sudo nginx -t
sudo systemctl reload nginx
```

确认两个域名的证书可信、www 跳转至根域名。配置 Certbot 的成功续期部署钩子为 `nginx -t && systemctl reload nginx`，检查续期定时任务并运行 `certbot renew --dry-run`。

## 三、私有配置与数据备份

仅在 HTTPS 已可用、新版本已构建成功后继续。

```sh
sudo install -d -o root -g ubuntu -m 750 /etc/diastage
```

确认 `/etc/diastage/production.env` 尚不存在，才将 `deploy/production.env.example` 复制为该文件，所有者 `root:ubuntu`、权限 `0640`。已存在时核对并保留原密钥。父目录和文件都不位于 Nginx 网站目录。

在服务器内生成一次至少 32 字符的随机 `BETTER_AUTH_SECRET` 并写入该私有文件，禁止在聊天、终端录屏、日志或源码中输出。重启和更新继续使用同一个值。`PASCAL_DB_PATH` 必须仍为 `/home/ubuntu/diastage-data/scenes.db`。

停止现有应用后，对整个 `/home/ubuntu/diastage-data` 做一致性备份，包含 SQLite 的 WAL/SHM、可能存在的认证数据库及私有设置文件。备份目录权限设为 `0700`。Nginx 配置、systemd 原 unit/drop-in 和私有环境文件也一起备份；不把备份放在源码或公开目录内。

本次服务器数据库为 0 条剧目，无需运行旧剧目归属迁移。上线时由用户使用已确认的邮箱首次注册并设置密码。若发布前已有新剧目，重新只读核对；需要迁移时严格使用 `SETUP.md` 的精确 ID、预检查、备份和 bootstrap 流程，不能将全部数据自动划给某个邮箱。

## 四、切换及回滚

确认私有环境文件密钥非空后，将模板安装到现有服务的 drop-in 目录：

```sh
sudo install -d -m 755 /etc/systemd/system/diastage.service.d
sudo install -m 644 deploy/diastage.override.conf /etc/systemd/system/diastage.service.d/production.conf
sudo systemctl daemon-reload
sudo systemctl restart diastage.service
systemctl is-active diastage.service
curl --fail http://127.0.0.1:4329/api/health
curl --fail https://diastage.art/api/health
curl --fail https://diastage.art/api/auth/get-session
```

未登录的认证检查应返回 HTTP 200，正文为 `null`；`/api/health` 通过仅代表应用存活，不等于认证已就绪。

先备份同名 `production.conf`（如存在）。随后检查首页备案号、字体、www 跳转、登录/退出、自己的剧目读取以及服务重启后的持久化。不要打印 `systemctl show ... Environment` 或完整插值配置，避免泄漏密钥。

若失败，停止新服务，恢复此次切换前的 drop-in 与 Nginx 配置，执行 `daemon-reload`、`nginx -t` 后重启原服务。旧目录保持不动。数据如已发生迁移，应在停机状态下按发布前成套备份恢复；保留新产生的数据副本，不盲目用旧库覆盖它。

## 验证范围

本机 Node.js 24.19.0 上：默认生产构建通过编译、TypeScript 和 18/18 页面生成；先前 standalone 版本的 32 项 HTTP、资源与匿名访问权限检查通过。官方 Windows Nginx 对两份模板的语法检查通过，HTTPS 检查使用临时测试证书。

本轮全应用回归 1198 项通过，另有新增服务错误处理的 9 项定向测试及 28 项 viewer 回归通过。真实 AI 与语音服务配置尚未完成：实际界面返回“语音转写与复杂口令服务尚未配置”，不能将使用模拟服务的测试结果视为真实模型或语音转写验收。

默认 Node 生产进程的本机启动被自动审批拒绝，返回信息没有具体理由，因此该启动及后续 HTTP 检查仍未验证。Ubuntu 上的构建、真实配置 `nginx -t`、证书签发、账号注册与正式切换仍待执行。

## 官方参考

- [NGINX 反向代理](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Certbot 使用说明](https://eff-certbot.readthedocs.io/en/stable/using.html)
- [腾讯云轻量服务器防火墙](https://cloud.tencent.com/document/product/1207/44577)
- [腾讯云备案号悬挂说明](https://cloud.tencent.com/document/product/243/61412)
