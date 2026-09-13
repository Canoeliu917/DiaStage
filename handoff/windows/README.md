# DiaStage 0.1 — Windows 笔记本续开发

2026-09-14 夜间检查点。产品代码基于 a69935f71a2219908901dd6182c087da6b365ea5；交接分支 codex/windows-handoff-20260914 包含全部前序改动和本文档。未修改 main、合并或部署。

## 第一次使用

1. 将完整 ZIP 解压到固定目录，例如 D:\DiaStage-Work。不要直接在压缩包内运行。
2. 双击包根目录的“启动 DiaStage.cmd”。runtime 内附本次验证使用的 Windows x64 Node 24.19.0 与 Bun 1.3.14，不需要另外安装这两项。
3. 第一次启动需要联网安装 bun.lock 中锁定的依赖。等待窗口显示 Ready，再在 Chrome 打开 http://127.0.0.1:4329/scene/fcc2fff436ea 。
4. 保持启动窗口打开。以后在同一个解压目录继续工作，不要每天重新解压旧数据库覆盖新数据。

另外两个保留场景：

- http://127.0.0.1:4329/scene/8537cf7594fb
- http://127.0.0.1:4329/scene/71de52238204

源代码位于 DiaStage 子目录，完整 .git 检查点随包保留，origin 指向 https://github.com/Canoeliu917/DiaStage.git 。Windows ARM 笔记本运行附带的 x64 工具需要系统支持 x64 模拟。

## 今晚保留的工作

- 原生 22 件标准资产、资源目录收口和第一轮旧入口清理。
- 0.1 工作区收缩为置景／复台，Dia 和 View 保留，Version/History 为公共能力。
- 选中反馈与场地边界说明、单行资产和面板选项、放大的选用预览、左下场景总览。
- 工具栏重排、网格说明、V/G/T/R 道具操作与 WASD/QE 观察视角。
- Dia 预览适配侧栏宽度和锁定；二帘／三帘仅两端显示折叠拖动手柄。
- 开发数据退休只体现在包中的当前 SQLite；被退休的旧测试场景不会作为运行数据库重新带回。

## 每天继续工作

在 Codex 中打开包内 DiaStage 文件夹，使用交接分支或从该分支建立后续工作分支。

可以给下一次 Codex 这段说明：

> 从当前 codex/windows-handoff-20260914 及其后续提交继续 DiaStage 0.1。先检查 Git 状态和 .local/handoff-20260913/pascal.db，保护当前场景。产品范围为置景、22 件资产、Version/History、Remount Preview、Dia、基础 View。面板选项一项一横行，桌面场景总览固定在左下，二帘与三帘只有两个外端折叠手柄。WASD/QE 移动视角。不要修改 main、merge、deploy 或恢复旧测试场景。读本目录 README 后再开始。

有代码改动时，检查差异、测试、commit，再 push；干净工作树才执行 git pull --ff-only。首次在笔记本 push 需要用自己的 GitHub 账号登录 Git。包不携带原电脑的 Git 凭据。

每天舞台编辑结束后，先等待页面显示已同步，再双击“保存舞台备份.cmd”。它将当前 SQLite 一致性快照、scenes JSON、完整 revisions JSONL 和 SHA-256 保存到 DiaStage/.local/backups/时间戳。不会改动在线场景，也不会覆盖前一次备份。

代码由 GitHub 管理；.local 中的场景与备份不进入 Git。跨电脑切换时应另外携带最新备份；恢复前先关闭所有 DiaStage 页面和启动窗口，并先备份目标电脑数据。不要用旧包覆盖后续新增场景。

## 数据与浏览器边界

包中的 .local/handoff-20260913/pascal.db 是打包时最新的正式数据库，包含三个场景、位置、角度、折叠状态、资产引用及服务器端完整历史。具体数量与哈希见包内备份清单。

Chrome 中的 Dia 对话、收藏、Journal、View 和部分 Remount 草案存放在该浏览器的 IndexedDB/localStorage，不随代码或 SQLite 自动迁移。本包未连接用户实际 Chrome，不能宣称已取得这些数据的最新副本。若需要它们，在旧电脑的真实 DiaStage 页面使用随包的 browser-export.js 单独导出并携带下载的 JSON；不要在 Chrome 错误页运行，不要清除站点数据。旧版浏览器导出未被当作最新状态打包或自动恢复。

保持使用 http://127.0.0.1:4329，localhost 或不同端口会使用另一个浏览器存储区。浏览器导出文件先作为离线备份保存；导入应核对 sceneId、版本及 Journal 未提交事务，不能盲目写回旧舞台。

如果需要在线模型能力，在 DiaStage/.env.local 中自行设置 OPENAI_API_KEY。包与 GitHub 均不携带 API 密钥。没有密钥时只使用当前代码支持的离线能力。

## 验证与限制

- UI 修正全量测试：3041 通过、6 个既有失败、1 跳过；check 仍有既有 1334 errors / 1 info，未全仓格式化。
- 最新端点调整：9 项折叠相关测试通过，types 9/9、build 8/8，通过 Dia／平面／三维端点拖动、撤销、取消和锁定浏览器验收。
- 既有失败涉及沙发旧预期和脚本规划等能力，不要为了旧测试把正式长沙发 1.75m 改回 2m。
- 交接包包含源码、Git 检查点、22 GLB、44 张缩略图／预览、catalog、当前数据库与导出。为避免跨机器缓存问题，不携带 node_modules、.next、.turbo 或原电脑凭据。
