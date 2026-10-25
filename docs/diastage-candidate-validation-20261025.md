# DiaStage AI 内测候选验收记录

日期：2026-10-25。分支：`codex/private-scene-accounts-v01-20261014`。

## 固定候选与发布包

- 应用候选提交：`8c5b282693d36ee0a5bc17892babed97ec1d2ffd`，包含账号 AI 预算控制及本轮发布修正。后续记录提交仅补充本文件与队列状态。
- 源码包：`DiaStage-source-20261025-8c5b282.tar.gz`；52,150,858 字节。
- SHA-256：`6ab2d32c21d39df4a4067fc5489a54e472067d23d13f3b9c4e1fc4eeb2463381`。
- 本机工作区输出：`output/DiaStage-release-20261025-8c5b282/`，含源码包、同名 `.sha256`、`files.txt`、`manifest.json`；这些产物不提交进源码仓库。
- 使用固定提交的 `git archive`，逐项读取 2,488 个归档条目（2,205 个普通文件）。确认根 `styles/elevation.css`、锁文件、workspace 源码、补丁、文档 worker 和部署模板存在。
- 排除私有环境、数据库、密钥、日志、备份、`.local`、依赖、Windows 构建产物、`previews` 和 `.impeccable`；校验归档路径及符号链接不逃逸到包目录之外。测试源码和固定夹具保留。
- 直接 Git 连接连续网络失败后，使用已连接的 GitHub 工具以预期远端提交校验更新分支。候选完整文件树 `c832e6d12215c04c815290393e41a31ea6e9eb91` 与本机已构建版本一致，归档每个文件内容亦一致；没有强制覆盖远端改动。

## 本轮真实执行的检查

| 检查 | 结果 |
| --- | --- |
| `bun test apps/editor/lib/ai apps/editor/lib/photo-stage/analyze-server.test.ts` | 53 通过，0 失败；1,322 次断言 |
| `bun scripts/test-ai-beta.ts` | 12 通过；临时 SQLite、真实登录 cookie、模拟模型且禁止网络 |
| `bun scripts/test-private-scenes.ts` | 9 通过；独立账号与剧目接口隔离 |
| `turbo run build --filter=editor --env-mode=loose` | 6 项任务通过；生产编译、TypeScript、18 页生成成功 |
| 变更应用文件 Biome、`git diff --check` | 通过 |
| Windows Nginx 1.30.6 `-t` | 修改后的 HTTP 模板语法通过；没有启动监听 |
| 本机原始场景库 | 2 条剧目、2 条修订、0 条事件与私有备份逐行一致；完整性正常 |

没有将 10 月 23 日的 3,709 项历史测试计入上述 74 项。本轮构建前确认没有 Next/Bun 网站进程及 4318/4329 监听，随后才更新本机 `.next`。构建使用新隔离数据目录和空 AI 名单，不复用真实场景库或账本。

## 本轮修正

- 公开两页改为 DiaStage 内测实际说明，清除不适用的上游身份、登录/数据库服务和联系邮箱；说明照片随确认剧目留存、浏览器记录与服务器记录的区别、AI 输入范围与额度。正式主体、联系方式、保留/删除安排仍待确认。
- 非 AAC-LC 音频在无 codec 声明和伪造 LC 声明时均被拒绝，且不会触发转写；现有 AAC-LC 和 Opus 兼容测试继续通过。
- 证书申请阶段仅开放 ACME，其他路径返回 503；安全候选验收及明确授权切换前不代理旧版。回滚时同样先进入维护状态。
- 生产配置示例补充服务端 API Key 和候选版本字段，不含真实值；部署步骤不再以历史空库为依据跳过迁移核查。

## 未执行，不能据此宣称上线完成

- 未切换或改动腾讯云服务，没有上传候选包至云端，也没有真实付费 AI 调用。
- 没有 Linux 构建、云端备份恢复、真实邮件、供应商接口或正式 HTTPS 验收。
- 新候选尚未启动并进行真实浏览器验收。自动启动此前被审批拒绝，工具没有提供具体理由；本轮未换工具绕过。用户手动使用保留原数据路径的启动脚本后再验收。
- Nginx 本轮只执行 `-t`，没有宣称已经通过真实 ACME/503 HTTP 行为或 Ubuntu 配置检查。

下一步及需用户决定的事项分别见[待办队列](diastage-release-todo.md)和[待决记录](diastage-release-decisions.md)。
