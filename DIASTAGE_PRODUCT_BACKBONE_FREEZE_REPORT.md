# DiaStage — Product Backbone Freeze Report

日期：2026-09-12。基线：`b2abdbbc52b09fb5e97569adbf49b7d1bacd6708`。

**PRODUCT BACKBONE = FROZEN。** 本机门禁、远端 CI（quality + macOS CLI smoke）及 mcp-ci 已在冻结检查点 `d290c417474823fb089b17b4003783046c79321b` 全部通过。停止在 Draft PR #1 增加产品能力。

本报告是 Closure 的当前验收口径；`DIASTAGE_PRODUCT_BACKBONE_INTEGRATION_REPORT.md` 保留为 b2abdbbc 阶段的历史报告，其未完成项与后续建议不再扩展 PR #1 范围。

## 1. 状态

| 项目 | 结果 |
|---|---|
| PRODUCT BACKBONE | FROZEN |
| VENUE | PASS — 现有空间基础 |
| BUILD | PASS |
| REHEARSE | PASS |
| VERSION / HISTORY INFRASTRUCTURE | PASS |
| BUILD FEEDBACK LINEAGE | PASS |
| COMMON DIA INTERACTION | PASS |
| VERSION SOURCE LINK | PASS |
| INTERRUPTED APPLY RECOVERY | PASS |
| REMOUNT | PARTIAL — REMOUNT PREVIEW / MAPPING |
| PHONE PROTOCOL | PASS |
| EVIDENCE TRIM | PASS |
| CHECK | PASS |
| TYPES | PASS |
| TESTS | PASS |
| BUILD | PASS |
| REMOTE CI | PASS |
| MCP-CI | PASS |
| NEW PRODUCT CAPABILITIES ADDED | 0 |
| REAL MODEL | NOT_RUN |
| REAL DEVICES | NOT_RUN |
| PROJECT STATE / CONSTRAINTS | SCHEMA_ONLY |

冻结只表示本轮工程骨架收口，不代表公网 Invite Beta、真实模型质量或真机验收已经完成。

## 2. 已关闭的数据缺口

### Build Feedback Lineage

Input、原 Proposal、Revision parent、人工修改后的精确 Plan、Preview、Adopt prepared、正式事务回执、Version link、Undo/Redo、manual edit、最新 final state 均有可追溯记录。原 Proposal payload 和 Thread 保留。

Build 与 Rehearse 采用相同原则：先保存 prepared；正式 Scene 与回执经现有 Scene Store 提交、进入同一持久 Journal 事务；只有找到持久回执才把反馈认定为 applied。反馈失败不撤销已经落地的 Scene。刷新只对账，不重执行 Proposal。晚到回调不得降级 applied 或覆盖较新的 final state；取消后的旧回调不得覆盖新一轮对话状态。

新增 `build-events` 是独立 Build payload 的事件存储，位于原 Feedback IndexedDB 的 additive v2→v3 升级中；原五个 stores 不删除、不重建。Scene Journal 保留原 v2 stores，仅增加可读取的 Build/Remount 回执字段。保存仍先本机、后原网络队列，没有另建保存系统。

### Common Interaction

最小公共外层为 schemaVersion、interactionId、sceneId、capability、sceneVersion、status、createdAt、可选 parentInteractionId；capability 仅 build/rehearse/remount。sceneVersion 表示输入事实版本，不能被 adopted 后的新版本冒充。

旧 Build、Interaction、Feedback、Version 缺少 envelope 时保持缺少，不补造历史身份；无效新 envelope 明确报错并保留原始记录。没有 Universal payload、统一业务 Store 或新智能执行器。

### Version Source

正式版本记录 manual / dia-build / dia-rehearse / dia-remount / restore；Dia 来源关联实际 interactionId/envelope，restore 关联 sourceVersion。手动映射不冒称 Dia 来源。

复用已有版本哈希算法增加正式内容指纹，覆盖精确旋转、材质、拓扑、父子结构及持久图数据。空间事实版本保持不变。这样即使手动改材质或对称物件旋转未改变包围盒，新保存版本也归为 manual。回执和版本列表等记账字段不反过来改变该指纹。旧版本/旧回执继续按其已有字段读取。

### Interrupted Recovery

| 顺序 | 已验证行为 |
|---|---|
| prepared → formal transaction → feedback failure → reload | 回执证明已落地；恢复 applied；对象不重复创建 |
| prepared → no formal transaction → reload | 保持未提交；不冒称 applied；正式 Scene 不变 |
| formal transaction → duplicate callback | 幂等；不重复 Apply，不降级反馈 |
| formal transaction → Undo → Redo | 原 Store 一次撤销/重做，正式数据和血缘一致 |
| manual material edit → older callback | 新 final state 不被旧序列覆盖 |
| cancel → new proposal → old callback | 新方案状态保留，旧任务不能重新设置 adopted/rejected |

这些是合成输入、真实代码与 IndexedDB 故障注入/浏览器刷新测试。没有把浏览器刷新等同于 iPhone OS 强杀或断电认证。

## 3. Remount 为什么保持 PARTIAL

正式 Venue 当前只提供 identity/type/dimensions/origin，没有完整 stage frame/yaw；正式地面按轴对齐矩形更新。映射 Target 则允许三点校准产生旋转 frame，且不包含正式目标墙、门、地面等完整几何所有权。仅改 Venue 名称或移动对象会制造错误正式场地语义。

安全地支持全部现有 Target 需要改 Venue 坐标模型、固定几何归属及多个保存/恢复消费者，超过 Closure 的最小修改范围。因此停止扩展。

保留的能力：来源版本、Source/Target 对比、校准误差、1:1 布景/人物/路线/机位映射、冲突、人工确认、同一批次撤销、Journal/autosave/恢复。正式 Source Venue identity、bounds、原地面保持不变。界面明确写 **REMOUNT PREVIEW / MAPPING / 复台映射预览**，按钮改为“确认应用映射”，不再暗示正式场地迁移或现场验收已完成。

相关审计：`lib/theatre/schema.ts`、`venue-model.ts`、`scene-adapter.ts`、`packages/core/src/remount/schema.ts`、`lib/remount-scene.ts`。未指定 packages 的路径均相对 apps/editor。

## 4. 跨端与范围

Web/Desktop 仍是完整参考实现；Tablet 使用相同 Web 应用；Phone 保持 Dia + Remote，只同步新 envelope。原角色、SceneVersion、Proposal 引用和配对权限校验继续执行，**Remote Adopt 不存在**。协议和 bridge 专项测试覆盖旧投影、Build/Rehearse 真实引用及外场景引用拒绝。

**PRODUCT BACKBONE：Venue → Build → Rehearse → Remount（场地 → 搭台 → 排演 → 复台）。** Venue 是搭台、排演、复台共用的空间基础；置景承载 Venue + Build，排演承载 Rehearse，复台承载 Remount。

**CROSS-CUTTING INFRASTRUCTURE：Version / History、Journal、Feedback、Human Authority、Scene Store、Scene Layers。Version / History / Journal 贯穿全过程，并为 Remount 提供历史来源。** Version 不是第五个阶段或工作区。Camera Rehearsal 保持在 Rehearse 下，用于观察、记录和比较，不升级为一级过程或 Sequencer。

Dia 是贯穿全过程的统一智能入口；品牌表达为 Dialogue → Diagonal → Diagram → Diary，品牌不等于产品阶段或工程 Module。正式定义：**DiaStage 是一个以真实舞台空间为基础，从搭台、排演到复台持续工作的戏剧创作系统。** 本次层级修正只改文档和首页共用定义文案，不改 Version/Scene/Journal 架构。

没有新工作区、Agent、模型调用、移动功能、依赖、Timeline/Cue、Constraint/Project State runtime、Scan pipeline、RAG 或 Document/Card/Drag 系统。混合指令仍可拆成两次 Proposal。

## 5. 验证证据

| 命令 / 检查 | 结果 |
|---|---|
| `bun run check` | PASS，1433 files；0 error / 0 warning，1 条既有 informational diagnostic |
| `bun run check-types` | PASS，9/9 tasks |
| `bun run test --concurrency=1` | PASS，2854 PASS / 0 FAIL / 1 既有 SKIP，14/14 tasks |
| `bun run build` | PASS，8/8 tasks |
| Closure 专项 12 文件 | PASS，84 tests / 814 assertions |
| 最终生产浏览器流程 | PASS，15/15 checks，0 uncaught page errors |

专项覆盖 Build lineage、真实 v2→v3 IDB 升级、Version source、内容指纹、Rehearse/Build interrupted recovery、Remount mapping/source/undo、Scene Journal 和跨端引用。

实际 Chrome 自动化使用隔离合成数据库：创建舞台→Build 修订→Ghost 零写入→明确采用→实际刷新恢复→只读 Version→Target 映射确认→一次撤销→手机配对请求 Ghost。Version 验证实际 Dia Build 来源，Remount 验证正式 Venue 没有被伪称替换。Tablet/Phone 仅 viewport/触控模拟，真实模型与设备均 NOT_RUN。

15项浏览器流程在 `http://127.0.0.1:4328/scene/04951a762115` 验证。随后层级补充只改核心文档和首页一句定义，重新完成全部本机门禁；最新构建另在 `http://127.0.0.1:4329/scene/04951a762115` 启动，首页 HTTP 200 且新定义可见。均为独立合成库，不替代用户正式服务。完整中间结果在 `.tmp-product-backbone-closure/`，脚本 `scripts/product-backbone-acceptance.mjs` 可复跑。

## 6. Evidence Trim

原 `.impeccable/review/`：156 个 Git 文件，14,880,560 bytes。149 个文件（14,819,745 bytes）移至本机忽略目录 `.tmp-evidence-archive-b2abdbbc/`，通过普通删除 commit 从当前树移除。原历史不重写，必要时可从基线 commit 读取。

保留 7 份历史摘要/关键恢复证据，新选 3 张最终桌面/平板/手机截图、1 份 Closure summary 和1份总 manifest，最终 **12 文件 / 476,669 bytes，净减少144个文件和14,403,891 bytes（96.80%）**。历史摘要不冒充本轮重跑。manifest 记录每个移动/保留文件的路径、大小、SHA-256 和读取方式；旧报告中的中间路径可据此找回。

自动化脚本保留，未来完整输出默认进入 `.tmp-product-backbone-<run>`；review 目录默认忽略，仅允许显式选取最终证据。用户原有未跟踪 home.png、plan.png 保留原地、未提交。没有移除必要许可证。

- [最终桌面](.impeccable/review/final/desktop.png)
- [最终平板](.impeccable/review/final/tablet.png)
- [最终手机](.impeccable/review/final/phone.png)
- [Closure summary](.impeccable/review/final/summary.json)
- [Evidence manifest](.impeccable/review/evidence-manifest.json)

## 7. Git 与冻结门禁

Closure 产品代码提交：`4110939f26dbd29b6cf4d5b377f057b914ac8b0b`。层级文案、报告与 Evidence 检查点：`d290c417474823fb089b17b4003783046c79321b`。工作分支：`codex/mobile-voice-stage-link`。

作出冻结决定时，当前 Commit 与实际 Draft PR Head 均为 **d290c417474823fb089b17b4003783046c79321b**，PR 为 Open / Draft / unmerged。随后仅提交本报告的冻结结果和 Beta Blockers 文档；报告不把尚未产生的自身提交 SHA 伪造为已测试代码。最终文档 Head 及其检查以 [PR #1](https://github.com/Canoeliu917/DiaStage/pull/1) 和交付消息为准。

- [GitHub CI #23](https://github.com/Canoeliu917/DiaStage/actions/runs/34674876003)：PASS；quality 与 macOS packed CLI smoke 均 success。
- [mcp-ci #21](https://github.com/Canoeliu917/DiaStage/actions/runs/34674875995)：PASS；core/mcp build、mcp tests、scene API tests、Biome 均 success。

基线 main：`4170d1919a8eb25a7bc96503dfb55098b71bbbfe`。本轮不修改 main，不 merge、deploy、release、force push，不重写历史；没有新增 secret/private data，没有删除必要 license。审计的变更范围仅闭环引用/恢复/来源、小量状态文案、测试、文档及 evidence。

## 8. PR #1 的性质与停止条件

PR #1 是 **Pascal → DiaStage Alpha Integration Migration**，不是普通 Feature PR。它跨越 Pascal 功能删减、Theatre refocus、Mobile Assistant、Voice、Scan、Rehearsal Intelligence、Dia Conversation、Build、Version、Remount、Hardening、大量测试与验收证据，因此累计 diff 很大。

不为缩小 diff 恢复已删除的 Pascal 功能，不为减少 commit 重写历史。冻结后 PR #1 只接受 release-blocking bug/security/regression fix 或 documentation correction，停止增加产品能力。

## 9. 风险与下一阶段

仍需验证公网 Auth/tenant、项目归属、服务器持久化、备份恢复、预算/kill switch、staging、真实模型、隐私导出删除、release/rollback 及首批5–10位用户。现有本机机制不等于这些公网保障均已完成。浏览器配额、用户主动清理存储、系统强杀/断电、真实移动端 GPU/音频/后台行为仍是实际风险。

冻结后已另列 [DIASTAGE_01_INVITE_BETA_BLOCKERS.md](DIASTAGE_01_INVITE_BETA_BLOCKERS.md)，只保留10项发布阻塞。后续建议独立主题：`beta/auth-tenancy`、`beta/persistence-backup`、`beta/real-model`、`beta/device-validation`；不在本轮创建分支或 PR。Document → Stage 仅为0.2候选，不是 Invite Beta blocker，不进入 PR #1。

## 10. Closure 源码与测试文件

本轮产品代码 commit 共31个文件（含测试和1个验收脚本），层级补充另改 `brand.ts` 的一句产品定义；完整路径可用 `git show --name-status 4110939f` 核查。核心新增为 `build-feedback.ts`、`interaction-envelope.ts`、`version-source.ts` 及对应专项；原 Controller、Authority、Version、Remount、Journal、Phone bridge 仅适配。

本轮相对 b2abdbbc 的最终变更共 **190个文件**（Git默认重命名检测口径）：32个代码/测试/脚本文件，6个文档/配置文件，152个 Evidence 路径变更。Evidence 149个原文件移出当前树，其中2张最终图像由Git识别为重命名；完整逐项列表在manifest，未删测试脚本。

Draft PR 的整个迁移累计变更为 **2680个文件**（包含最终 Beta Blockers 文档）；这是相对 main 的迁移量，不是本轮新增功能量。本轮新增产品能力 **0**。冻结后的下一步只进入 Validation / Release / Real Users，不再重新定义 Dia、工作区或核心过程。
