# DiaStage 本机接手与发布包准备

日期：2026-10-25。分支：`codex/private-scene-accounts-v01-20261014`。

## 本轮完成

- 检查已有工作目录，确认无未提交改动，快进取得远端交接版本 `9f94f9d`，没有覆盖其他分支或目录。
- Windows 上使用 Node.js 24.19.0、Bun 1.3.14，`bun install --frozen-lockfile` 成功，锁文件没有变化。
- `turbo run build --filter=editor --env-mode=loose` 成功，6 个构建任务通过；Next 生产编译、TypeScript 检查及 18 个页面的生成完成。构建使用隔离数据目录。
- 私有场景接口集成 9 项通过，真实 SQLite 认证集成 3 项通过，均使用隔离测试数据。
- 本机原有场景库、认证库和 AI 预算账本已通过 SQLite 备份 API 备份，认证密钥单独私密保存。三份数据库备份的 `integrity_check` 均为 `ok`。没有复制这些数据进入源码包。
- 修正启动脚本的旧示例场景提示，改为首页；生产环境模板补上固定 AI 账本路径；systemd 模板中的两处发布目录统一为 `/home/ubuntu/diastage-release-20261025/DiaStage`。
- PowerShell 启动脚本语法检查、发布目录一致性检查和 `git diff --check` 通过。

## 本机启动边界

本机存在旧账号和剧目，因此本次运行应沿用原数据目录，而不是让默认启动脚本在项目 `data` 目录中新建另一套账号。私有启动脚本和备份记录保留在被 Git 忽略的 `.local` 下，不随源码交接。

自动启动曾被审批拒绝，用户随后手动执行了保留原数据路径的启动脚本，Next.js 报告 Ready。2026-10-25 15:58（北京时间）实际 HTTP 检查通过：首页返回 200，包含 DiaStage 标题、舞台内容和应用脚本；`/api/health` 返回 200、`status: ok`；匿名 `/api/auth/get-session` 返回 200 和 `null`。

本机入口为 `http://127.0.0.1:4318/?lit=1`，已发送在 Codex 中打开首页的请求。运行窗口需要保持打开。本次 HTTP 检查不等同于重新完成登录、三维编辑和真实 AI 的完整浏览器验收。

## 源码包及 Linux 待执行步骤

本轮源码包从明确的 Git 提交生成，包名包含提交短号，SHA-256 与文件列表放在包旁。包只含跟踪的源码、公开资源和文档；排除 `previews`、`.impeccable` 验收产物，以及本机环境、数据库、密钥、日志、依赖和构建输出。代码测试夹具仍属于源码，不包含本机运行测试所生成的账号或场景库。

下面是目标服务器的**待执行步骤**，本轮未连接服务器或执行这些操作。必须在上传包后，将 `source_package` 替换为实际文件名；保持已有服务运行，只在新的目录构建：

```sh
set -eu
source_package=DiaStage-source-20261025-实际提交短号.tar.gz
sha256sum -c "$source_package.sha256"
release_dir=/home/ubuntu/diastage-release-20261025
test ! -e "$release_dir"
mkdir "$release_dir"
tar -xzf "$source_package" -C "$release_dir"
cd "$release_dir/DiaStage"
export PATH="/home/ubuntu/.bun/bin:$PATH"
test "$(bun --version)" = 1.3.14
node -e 'const v=process.versions.node.split(".").map(Number); if(v[0]<22||(v[0]===22&&v[1]<13))process.exit(1); const s=require("node:sqlite");if(typeof s.backup!=="function")process.exit(1)'
bun install --frozen-lockfile
PASCAL_DB_PATH="$release_dir/build-check/scenes.db" \
DIASTAGE_AI_LEDGER_PATH="$release_dir/build-check/ai-usage.db" \
BETTER_AUTH_URL=http://127.0.0.1:4329 \
NEXT_TELEMETRY_DISABLED=1 \
./node_modules/.bin/turbo run build --filter=editor --env-mode=loose
```

如果新目录已经存在，先核对其内容，不删除或覆盖。不要上传本机 `.next` 或 Windows 原生依赖。现有生产数据路径仍须在服务器上重新核实；模板中的路径只是准备配置。

本机没有可用 Linux 运行环境，因此 Linux 构建、正式 HTTPS、证书续期、Nginx 语法与代理验证、云端备份恢复及重启后持久化均尚未验收。历史文档中的空库判断不得用于本次迁移。

## 仍需决定

- 云端独立开始，还是迁移指定本机账号、剧目和素材。
- 首发是否开放真实付费 AI，以及费用承担和预算方案。
- 公开注册前的账号恢复流程、邮件能力和素材公开授权。

本轮没有部署、切换腾讯云正式服务或修改公网配置。后续按[上线准备清单](diastage-release-readiness-20261025.md)继续。
