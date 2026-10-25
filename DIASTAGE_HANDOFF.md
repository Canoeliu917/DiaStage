# DiaStage 跨电脑接手说明

更新日期：2026-10-25。

本分支保存原版 DiaStage 的 2026-10-23 本地验收版本、21 件可选道具及腾讯云上线准备。另一份红蓝静态概念稿不属于本次应用发布。

## 先读这些文件

1. [项目规则](AGENTS.md)
2. [本地验收记录](docs/diastage-qa-20261023.md)
3. [腾讯云上线准备清单](docs/diastage-release-readiness-20261025.md)
4. [现有部署操作说明](docs/diastage-production-deploy.md)：云端状态记录日期为 10 月 22 日，操作前重新核实。
5. [运行环境与账号说明](SETUP.md)
6. [按优先级执行的待办](docs/diastage-release-todo.md)及[集中保留的待决事项](docs/diastage-release-decisions.md)：继续工作以这两份更新记录为准，不把历史验收当作当前云端状态。

## 在另一台电脑取得这一版

先安装 Git、Node.js 22.13 或更新版本；本次完整验收使用 Node.js 24.19.0，锁定包管理器为 Bun 1.3.14。Windows 启动脚本可以通过 npm 调用该 Bun 版本。

在准备放置项目的目录中运行：

```sh
git clone --single-branch --branch codex/private-scene-accounts-v01-20261014 https://github.com/Canoeliu917/DiaStage.git DiaStage
cd DiaStage
git status --short --branch
git log -1 --oneline
```

此时应位于 `codex/private-scene-accounts-v01-20261014` 分支。默认 `main` 不代表本次交接版本。若本地已存在同名目录，先核对其中的分支、改动及数据，再决定更新或另建目录；不要覆盖现有工作。

在另一台 Codex 的项目选择中打开刚下载的 `DiaStage` 文件夹，以仓库根目录作为工作目录。桌面版可打开本地项目文件夹，参见 [OpenAI 官方快速开始](https://learn.chatgpt.com/docs/quickstart)。

## Windows 启动

在项目根目录的 PowerShell 中运行：

```powershell
.\启动镜场.cmd
```

也可以在资源管理器中双击该文件。脚本会安装缺少的依赖、构建依赖包并启动服务。保持运行窗口打开，待日志出现 Ready，再打开：

<http://127.0.0.1:4318/?lit=1>

脚本将账号和场景数据放在此电脑项目下的私有 `data` 目录，认证地址与 4318 保持一致。先检查端口是否已占用；不停止未知进程。

## macOS / Linux 本地启动

在仓库根目录中运行，保持终端打开：

```sh
npm exec --yes --package=bun@1.3.14 -- bun install --frozen-lockfile
export PORT=4318
export PASCAL_DATA_DIR="$PWD/data"
export PASCAL_DB_PATH="$PASCAL_DATA_DIR/pascal.db"
export NEXT_PUBLIC_APP_URL=http://127.0.0.1:4318
export BETTER_AUTH_URL=$NEXT_PUBLIC_APP_URL
npm exec --yes --package=bun@1.3.14 -- bun x turbo run build '--filter=editor^...' --env-mode=loose
node node_modules/dotenv-cli/cli.js -e .env -e .env.local -e .env.defaults -- node node_modules/next/dist/bin/next dev apps/editor --hostname=127.0.0.1 --port=4318
```

安装或构建失败时先排查错误，不跳过失败继续启动。上述 macOS / Linux 指令依据现有 Windows 启动脚本整理，尚未在另一台实体电脑验证。腾讯云正式发布使用生产构建及 systemd，另按部署说明执行。

## 账号、剧目和密钥的边界

- GitHub 保存源码、公共素材和说明，不保存本机账号、密码、剧目数据库、私有备份或真实 API Key。
- 同一邮箱在另一套新数据库注册，不会自动取得旧剧目的归属。本机剧目可先从界面导出备份；完整迁移账号、场景和素材需要单独的私有数据迁移流程。
- 迁移前先核对目标电脑现有数据并备份，不覆盖未知账号库。浏览器内尚未同步的数据也需另外导出核对。
- `127.0.0.1` 指打开链接的那台电脑，原电脑的服务不会因登录同一个 Codex 账号而自动运行在新电脑上。
- AI 服务需在新环境单独私密配置。缺配置时先验收手动置景与本地口令，不将模拟模型结果当作真实服务验收。
- 聊天中的进度不依赖自动同步；接手以本文件及仓库内验收、上线准备记录为准。

## 可以直接发给另一台 Codex 的接手消息

> 请接手 Canoeliu917/DiaStage 的 codex/private-scene-accounts-v01-20261014 分支。先阅读 AGENTS.md、DIASTAGE_HANDOFF.md、docs/diastage-qa-20261023.md 和 docs/diastage-release-readiness-20261025.md。先检查本机是否已有该仓库及未提交改动，再安全取得这一分支；按实际系统准备依赖并启动网站，检查首页和 /api/health 正常后打开 http://127.0.0.1:4318/?lit=1。当前是 21 件可选道具的已验收版本。保留现有剧目和账号；缺少旧数据或 API 配置时明确说明。继续整理腾讯云上线待办，本条消息只授权本地接手和准备，不切换公网生产服务。
