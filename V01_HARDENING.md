# DiaStage V0.1 — 基线冻结与桌面 Hardening 验收

日期：2026-09-11。工作分支：`codex/mobile-voice-stage-link`。已冻结基线：`a1010ff0b21bd30ef050677c5c58a400ca1cef8f`；本报告随下一次 hardening 提交保存。两次提交均用于现有 Draft PR #1，不是公开发布。

## 当前状态

| 项目 | 结果 |
| --- | --- |
| V0.1 ENGINEERING BASELINE | PASS |
| ONTOLOGY | 8 / 38，complete=false；剩余维度不阻塞工程开发 |
| CANDIDATE CASES | 100 |
| HUMAN REVIEWED | 0 |
| GOLD ALPHA | 0；首批目标 20 |
| REAL MODEL EVAL | NOT_RUN；本机未配置可用 API Key，实际 runner 尝试请求数为 0 |
| IPHONE SAFARI | NOT_RUN |
| IPAD SAFARI | NOT_RUN |
| ANDROID CHROME | NOT_RUN |
| DESKTOP HARDENING | PASS；范围为下列自动化故障、存储和桌面浏览器流程 |
| PUBLIC BETA | NOT READY |

Suggest, Preview, Decide. **AI proposes. The stage previews. Humans decide.** AI 提议。舞台先演。人来决定。

## 修复及其原因

1. **旧方案和预览可能失配。** 在排演场景绑定处统一监听正式节点变化、其他标签页的本机事务通知和服务器版本冲突。预览及采用前再次检查当前场景、上下文和本机日志版本。Ghost 保存实际预览过的完整 Proposal；Partial / Edit 即使产生相同几何结果，也必须重新编译和预览。等待异步检查期间取消、清除 Ghost 或改变场景，同样禁止采用。
2. **撤销后缺少可靠的反馈恢复依据。** 场景日志通过增量 IndexedDB v2 迁移增加决定回执，与正式节点事务一起持久化，服务器确认同步后仍保留。恢复只认可 event / proposal / interaction 三个 ID 一致的回执。旧 v1 的待同步事务、检查点和版本冲突数据保留。
3. **连续采用、Undo / Redo 可能使反馈停留在旧结果。** 观察器同时处理之前和当前的采用记录，保留初次正式采用结果，并更新单条后续人工修改结果。恢复不重复制造 adoption；只有 prepared 而没有正式事务证据的记录不会被认定为已采用。正式保存成功后反馈失败，不回滚用户的排演。
4. **AI 故障必须隔离在提议链路。** 共用请求函数验证 HTTP、JSON、结构、人物、证据和空间约束，保留超时、取消与预算控制。错误清除临时预览，正式场景仍可手动编辑、保存、撤销和重做。
5. **人工审核和模型结果需要分开留存。** Feedback 独立保存 originalProposal、previewedProposal、humanEdit、decision、finalResult；旧记录缺失的预览保持 null。默认 privateProjectData=true、trainingAuthorized=false。Gold Alpha 工具只记录、校验、追加版本与汇总；Eval 的八项人工评分与结构校验分别统计。

没有新增依赖、训练流程、自动采用、复杂运动或产品多 Agent 系统；没有恢复建筑和用户灯光功能，也没有绕过 scene store 写正式场景。

## 验证结果

Windows 桌面，Bun 1.3.14。Turbo 缓存仅用于输入未改变的任务。

| 命令 | 最终结果 |
| --- | --- |
| `bun run check` | PASS，1,392 文件，0 错误；保留 1 条既有信息级依赖提示 |
| `bun run check-types` | PASS，9 / 9 任务 |
| `bun test apps/editor/lib/rehearsal-intelligence/rehearsal-intelligence.test.ts` | PASS，原有 11 个测试保留 |
| `bun run test --concurrency=1` | PASS，2,748 pass，0 fail，1 个既有 skip；14 / 14 任务，13 个缓存；editor 本次实际运行 328 测试、27,173 断言 |
| `bun run build` | PASS，8 / 8 任务，7 个缓存；editor 生产构建成功 |
| `bun apps/editor/lib/rehearsal-intelligence/eval.ts --manifest` | PASS，100 个未人工审核 Candidate |
| `bun apps/editor/lib/rehearsal-intelligence/gold-review.ts --summary` | PASS，Human Reviewed=0，Gold Alpha=0 |
| `bun --conditions=react-server scripts/rehearsal-real-eval.mjs --count=10` | NOT_RUN，未配置 Key，0 次真实请求 |

针对性测试覆盖：手动移动、删除人物、切换场景、多标签页、Partial / Edit 重预览、超时与晚到取消；400 / 401 / 403 / 422 / 429 / 500 / 503、非法 JSON / 结构 / 引用 / 证据 / 空间、碰撞和过期上下文；IndexedDB 不可用、配额不足、interaction / event / consent 写入失败、prepared 恢复、正式事务后恢复、重复决定、连续采用与 Undo / Redo、v1 日志迁移。单元测试中的 fake IndexedDB 和模型 fixture 仅验证程序行为。

### 实际桌面浏览器流程

独立生产服务、合成双人物场景、桌面 Chrome headless、真实 IndexedDB。数据库显式指向被 Git 忽略的独立临时目录；没有复用用户场景数据库。

- 七种 HTTP 错误及 invalid JSON：AI 正式写入数为 0；每种故障后均能手动移动、保存、Undo、Redo。
- Partial 取消一项后 Adopt 禁用；重新 Ghost 后启用。
- 同浏览器双标签页：B 修改并保存正式人物后，A 的旧 Ghost 清除且不能采用。
- Adopt → Undo → Redo → 关闭页面后重新打开：正式路线、反馈和本机决定回执一致；没有重复 adoption。
- 注入现有 Ghost 错误边界的回调：预览清除、采用禁用、正式数据不变；再次预览并采用仍成功。这是错误边界回调注入，**不是实际 GPU 故障**。
- 上述两组浏览器流程未捕获页面异常数为 0。页面重开与事务恢复是崩溃恢复路径的替代检查，**不是操作系统强杀、断电或真实浏览器崩溃实测**。

证据：[故障与多标签页](.impeccable/review/v01/desktop-hardening-browser.json)、[采用与恢复](.impeccable/review/v01/desktop-adopt-recovery.json)、[合成截图](.impeccable/review/v01/desktop-hardening.png)。本机验收服务路径：`http://127.0.0.1:4325/scene/0807a30e693f?workspace=rehearse`；场景与服务只存在本机，不随仓库分发。

### 桌面性能基线

Chrome 153、Windows、headless；独立空白页，2 位人物、4 个节点，预热 5 次、采样 25 次。同步操作批量计时后折算单次耗时。以下是小场景微基准，不能当作用户端总延迟、FPS 或移动设备性能。

| 阶段 | 中位数 ms | 测量边界 |
| --- | ---: | --- |
| Context collection | 0.004 | 上下文收集 |
| Proposal validation | 0.010 | 包含编译校验 |
| Proposal compile | 0.006 | 单独编译 |
| Ghost creation | 0.006 | 展示数据创建，不含 GPU |
| Ghost activation | 0.00006 | store 激活，每批 5,000 次折算，不含 React / GPU |
| Adopt transaction | 0.100 | applyNodeChanges，不含权限门禁和持久化 |
| Journal persistence | 0.600 | 真实 IndexedDB strict durability |
| Feedback persistence | 0.400 | 真实 IndexedDB strict durability |
| AI network latency | NOT_RUN | 与本地计算分开；没有真实模型请求 |

恢复后的场景与保存数据一致；成功读取 30 条合成反馈。原始样本及 p95：[performance.json](.impeccable/review/v01/desktop-hardening-performance.json)。复现：`node scripts/rehearsal-desktop-benchmark.mjs`，Bun 在 PATH 中或指定 BUN_EXECUTABLE；PLAYWRIGHT_MODULE 可指向已有的 Playwright 安装。该程序不进入应用运行时。

**未实测：**真实 GPU context loss、低配 Windows、温度与内存长期变化、1,000 对象连续 30 分钟、iPhone / iPad / Android 真机。已有 1,000 对象日志单元测试不能替代这些项目。

## 人工审核与后续门槛

[Gold Alpha 审核说明](GOLD_ALPHA_REVIEW_V01.md)提供首次审核、复审版本和汇总命令；初始数据没有任何伪造的审核人、accepted 案例或戏剧正确率。真实 runner 支持首轮 10–20 例，保留原始输出、版本、耗时、token、费用和待人工审核字段，结果写入被忽略的 `.local/`。缺失用量记 null，真实与 synthetic 来源分别记录。

[真机验收清单](REAL_DEVICE_ACCEPTANCE_V01.md)包含三类设备各 25 步核心流程和平台专项，初始全部 NOT_RUN。Public Beta 仍需要：20 个 Gold Alpha 及真实模型输出的人工戏剧审核；三类真机核心流程；1–3 位未参与开发者独立完成核心流程。剩余 30 个 ontology 维度由产品方定义，不冒充完成，也不阻塞上述工程工作。

## 文件与隐私范围

本次 hardening 修改：

- `PRODUCT.md`、`DESIGN.md`、`REHEARSAL_INTELLIGENCE_V01.md`。
- `apps/editor/components/scene-loader.tsx`、`scene-loader.test.tsx`、`theatre/rehearsal-partner.tsx`。
- `apps/editor/lib/scene-journal.ts`、`scene-journal.test.ts`。
- `apps/editor/lib/rehearsal-intelligence/` 内的 `authority.ts`、`eval.ts`、`openai-server.ts`、`proposal-validator.ts`、`schema.ts`、`rehearsal-intelligence.test.ts`。

本次新增：

- `V01_HARDENING.md`、`GOLD_ALPHA_REVIEW_V01.md`、`REAL_DEVICE_ACCEPTANCE_V01.md`。
- `apps/editor/lib/rehearsal-intelligence/` 内的 `proposal-client.ts`、`hardening.test.ts`、`observer-recovery.test.ts`、`gold-review.ts`、`gold-review.test.ts`、`eval.test.ts`、`real-eval.ts`、`real-eval.test.ts`、`desktop-benchmark.ts`。
- `scripts/rehearsal-real-eval.mjs`、`scripts/rehearsal-desktop-benchmark.mjs`。
- `.impeccable/review/v01/` 下上述三个 synthetic JSON 及一张 synthetic PNG。

用户原有的未提交截图保持原样，不纳入本次提交。真实剧本、反馈、录音、扫描、浏览器 profile、IndexedDB 导出、Key、环境文件、临时数据库和评测私有输出不纳入本次提交。Pascal MIT 许可文本保留。

基线提交已停止跟踪旧 `data/pascal.db`，磁盘原件保留；它在此前远端历史中已存在，本轮普通提交**不会清除历史对象**。未进行历史重写、main 修改、合并、部署、Release 或将 Draft 改为 Ready。
