# Dia V0.1：排演伙伴实现与验收记录

日期：2026-09-11。基于 `codex/mobile-voice-stage-link` 的 `83fdcea7`。本轮以用户提供的《Dia V0.1 — Rehearsal Intelligence Public Beta》为准，覆盖此前“排演不做戏剧分析”的产品限制。未修改 main，未合并、部署或推送远端。

**结论：已实现可本地验证的 Proposal → Ghost → 人工决定 → 正式排演 → 私有反馈闭环；尚不满足大众内测全部准入条件。** 没有真实 API Key 或移动真机，不能把合成界面用例、结构检查或 Chromium 触控模拟记为真实模型质量及 Safari 验收。规格只提供了 8 个维度，另外 30 个没有定义，不能自行编造。

| 阶段 | 实际状态 | 边界 |
| --- | --- | --- |
| A Foundation | PARTIAL | 严格 schema 和 8 个 ACTIVE 完成；38D 尚缺 30 个定义 |
| B Agent | PARTIAL | 独立 API、结构化输出、领域验证完成；真实服务未实测 |
| C Interaction | 本地验证通过 | 中文伙伴、方案选择、2D/3D Ghost；成功输出的浏览器用例为明确标注的合成数据 |
| D Human Authority | 本地验证通过 | 采用、一部分、调整后采用、不成立；必须先预览，采用一次撤销 |
| E Learning Infrastructure | 本地验证通过 | 独立私有日志、版本、授权、隐式最终状态；没有训练或上传训练集 |
| F Accessibility | PARTIAL | 同数据模式切换、触控布局、拖动实现；iPhone/iPad/Android 真机未实测 |
| G Hardening | PARTIAL | 错误隔离、既有预算/限流、测试及构建；Gold、真机性能、真实用户验收未完成 |

## 1. 新增与修改文件

新增：

- `apps/editor/lib/rehearsal-intelligence/dimensions.ts`：维度注册、完整度。
- `apps/editor/lib/rehearsal-intelligence/schema.ts`：输入、分析、Proposal、Interaction、Feedback。
- `apps/editor/lib/rehearsal-intelligence/context.ts`：收集当前排演的必要上下文。
- `apps/editor/lib/rehearsal-intelligence/proposal-generator.ts`：模型结果解析和服务端版本元数据。
- `apps/editor/lib/rehearsal-intelligence/proposal-validator.ts`：引用、证据、维度、方案领域校验。
- `apps/editor/lib/rehearsal-intelligence/proposal-compiler.ts`：纯数据意图编译、边界与碰撞检查。
- `apps/editor/lib/rehearsal-intelligence/openai-server.ts`：独立 Rehearsal Agent。
- `apps/editor/lib/rehearsal-intelligence/authority.ts`：临时 Ghost、人工确认、反馈回执恢复。
- `apps/editor/lib/rehearsal-intelligence/feedback.ts`：独立 IndexedDB 私有反馈。
- `apps/editor/lib/rehearsal-intelligence/eval-cases.ts`：100 个原创待审测例。
- `apps/editor/lib/rehearsal-intelligence/eval.ts`：离线结构验证与人工评审汇总。
- `apps/editor/lib/rehearsal-intelligence/rehearsal-intelligence.test.ts`：可执行回归测试。
- `apps/editor/app/api/rehearsal/propose/route.ts`：POST API。
- `apps/editor/components/theatre/rehearsal-partner.tsx`：伙伴、建议、选择、授权与日志交互。
- `apps/editor/components/theatre/simulation-drag.ts`：2D/3D 人物拖动结束后一次提交。
- 本报告及 `.impeccable/review/v01/` 验收截图、测量记录。

修改：

- `apps/editor/components/theatre/simulation-panel.tsx`：简单/专业模式、版本入口、伙伴入口、拖动状态、坐标调整同步路线。
- `apps/editor/components/theatre/runtime.tsx`：正式人物拖动和独立 Ghost 展示/错误边界。
- `apps/editor/components/theatre/theatre.css`：伙伴布局与触控目标。
- `apps/editor/components/studio-sidebar.tsx`：传递 sceneId、订阅本机持久化反馈。
- `apps/editor/lib/theatre/simulation-store.ts`：复用正式编辑流程移动人物及其路线。
- `apps/editor/lib/scene-journal.ts`：公开本机事务成功后的只读订阅。
- `apps/editor/lib/remount-scene.ts`：导出原有障碍物快照函数供上下文复用。
- `apps/editor/lib/ai/usage.ts`：增加 `rehearsal-proposal` 用量分类。
- `apps/editor/app/privacy/page.tsx`、`PRODUCT.md`、`DESIGN.md`、`.impeccable/design.json`：实际数据流和产品/界面约束。独立 UI 复核最终为 ship，仅对原三项界面修复和截图证据负责。

没有新增 npm 依赖。没有改写 `stage-planner.ts`，没有恢复建筑、家装、用户灯光或在线素材，也没有删除 Pascal MIT 许可。

## 2. Schema 与分层

`DramaticStateSchema` 保存人物、目标、关系、行动、策略、冲突、空间关系、状态变化、证据和置信度。`RehearsalIntelligenceSchema` 关联 ontologyVersion 和 activeDimensions。它们不直接写入正式的 `rehearsalSimulation`。

`RehearsalProposalSchema` 保存 proposalId、title、intention、rationale、suggestions、alternatives、evidence、confidence、activeDimensions、modelVersion、promptVersion、ontologyVersion。单次 1–3 个方案，每个方案 1–12 条建议，每人至多一条。建议是保持位置、靠近、远离、向舞台区域移动；不接受模型指定的坐标、代码或任意新人物。

`DimensionSchema` 支持 ACTIVE/OBSERVE/DISABLED；当前只注册已给出的 8 项。`ONTOLOGY_COMPLETENESS` 明确为 8/38、complete=false。没有假名称占位。编译器和验证器是 TypeScript 数据计算，不依赖 React 或 Three.js；展示留在现有 theatre runtime。

坐标沿用当前排演系统：米、弧度，Y 向上，X 正方向为演员台左，Z 正方向为台前。舞台口令的台口坐标是另一入口的适配坐标，未混用。

## 3. API

`POST /api/rehearsal/propose` 接收 `RehearsalContextSchema`，成功返回 `{ interaction }`。输入只含选段、自然语言意图、可选导演意图、人物与路线、选中人物、场地摘要和障碍包围盒，未发送完整项目文件、扫描或素材。

沿用项目 `handleAiRequest` 的来源保护、请求 ID、错误格式、12 次/分钟限流、60 秒超时、取消和人民币预算检查。客户端允许手动重试，没有 SDK 自动重试；输出 token 默认 6000、上限 8000。输入限制：剧本选段 12000 字符，意图各 2000，最多 24 人、24 条路线、每条 64 点、128 个障碍。超限明确拒绝，不默默截掉人物。

模型选择：`DIASTAGE_REHEARSAL_MODEL` → `DIASTAGE_COMMAND_MODEL` → 项目默认 `gpt-5.6-luna`。需要服务端 `OPENAI_API_KEY`；真实模型可用性与输出质量尚未实测。API 使用 Responses structured output、严格 Zod、领域验证，并设置 `store: false`。这不等于对模型服务商所有数据保留政策作保证。

未配置密钥返回 503，用户仍能手动排演。格式/空间/证据失败返回 422；模型限流返回 429。AI 服务端模块没有正式场景写入入口。公网身份、项目所有权和持续授权仍需后续解决，不因本功能而开放公网连续制景。

## 4. Ghost Preview 数据流

用户输入 → API 验证 → 生成 Interaction → 本机保存 Interaction → 选择/调整方案 → 本地校验与编译 → 保存 preview 事件 → 临时 Zustand Ghost → 现有 2D/3D runtime 显示。

Ghost 含 sceneId、proposalId、simulation、time、visible、playing；不进入正式节点。深灰半透明人物、虚线路径、编号与面板人物对照；可显示、隐藏、播放、复位、切换和清除。原站位与路线保留。项目节点变化后旧预览失效；离开伙伴取消请求并清除预览。预览展示失败会清空 Ghost 并禁止采用，手动编辑与保存独立运行。

## 5. AI 权限边界与正式应用

编译器把有限的空间意图转换成确定性水平直线运动。small 最多 0.6m，medium 最多 1.2m；slow 约 0.2m/s，natural 约 0.5m/s；靠近留 0.8m。验证人物引用、数据有限性、边界、障碍交叉及人物间距，不能容纳时拒绝，不挪动布景或压缩舞台。

采用必须同时满足：非只读、原始方案匹配、当前场景匹配生成时上下文、确已预览本次编辑后的同一编译结果、未重复采用、请求未取消。AI 不调用 `writeStageDocument` / `editStageDocument`。

点击采用后先存 `prepared` Feedback，再经一次 `applyNodeChanges` 更新 SITE 的正式文档与决策回执。等待既有本机事务日志成功后才确认采用并标记 `applied`。整个采用可一次撤销。两个 IndexedDB 不是跨库原子事务，用原始建议、prepared 记录和正式回执恢复中断。失败不会回滚/覆盖用户之后的场景编辑。

操作路径：新建剧目 → 排演 → 添加人物 → 拖动或点击定位 → 记录路线 → 播放 → AI 排演伙伴输入意图 → 生成 → 选方案 → 预览 → 采用/取消某些建议/修改后重新预览/不成立。自动保存沿用原日志；面板“保存 / 查看版本”复用已有版本功能。

## 6. Feedback、隐式偏好与隐私

独立数据库 `diastage-rehearsal-feedback`，按 sceneId 索引：

| Store | 内容 |
| --- | --- |
| interactions | interactionId、sceneId、createdAt、模型/prompt/ontology 版本、8 维、inputContext、dramaticState、proposals、privateProjectData、trainingAuthorized |
| events | eventId、interactionId、proposalId、previewed、decision、originalProposal、humanEdit、finalResult、reasonTags、optionalUserNote、createdAt、status |
| consent | 当前项目的明确授权选择、privateProjectData、updatedAt |

decision 为 preview/adopt/partial/edit/reject/manual-edit。用户无需填写专业表格，理由备注自愿，reasonTags 允许为空。正式场景持久化后观察最新人工修改和撤销，保存原建议与最终 simulation；不按动画帧写日志，不生产 DPO 对。

每条生成记录默认 `trainingAuthorized=false`、`privateProjectData=true`。授权与项目保存分开；显式选择只记录未来授权意愿，没有训练数据集上传/匿名化流水线。用户可导出当前项目私有反馈 JSON、删除本机反馈、恢复最近建议。导出包含用户选段，应按私有备份管理。普通项目保存不包含整份反馈日志。

## 7. Default / Professional

简单模式默认开启：人物、名称颜色、拖动/点击定位、路线、时长、播放、自然语言伙伴、理由和采用动作。无需了解 schema、Objective 或 Confidence。

专业模式额外显示精确站位/朝向及专业分析折叠区（各戏剧维度、原文证据、模型自评置信度、版本）。置信度明确是模型自评而非正确率。两种模式读写同一份正式排演文档；切换只改本地界面状态，不转换或另存项目。

## 8. 桌面、平板与手机验证

隔离的生产服务器：`http://127.0.0.1:4324`；测试剧目 `/scene/4990618ed04f?workspace=rehearse`。测试数据目录 `.tmp-v01-data`；没有使用或覆盖用户正在编辑的剧目。原 4318/4323 服务未关闭。

Windows 本机 Chrome headless，1440×1000、1024×1366、390×844；后两者为 Chromium 触控/viewport 模拟，**不是 iPad/iPhone Safari 真机**。建议由合成数据产生，界面明确标注“测试用例”“不是真实模型结果”。

- 新建、添加人物、生成缺密钥提示、预览与播放、采用、刷新重新打开已做浏览器操作验证。
- 2D/3D 人物拖动：拖动中正式位置不变、网络保存 0 次；松手后位置更新，各 1 次 PUT。详情见 `drag-result.json`。
- 三尺寸页面没有横向溢出、未捕获 pageerror；伙伴按钮至少 44px 高。触摸第二指取消拖动，保留原视图缩放机制。模式切换验证不改变服务器场景。
- 截图及浏览器测量见 `.impeccable/review/v01/`：`desktop.png`、`tablet.png`、`mobile.png`；另有 `*-proposal`、`*-entry`、`*-simple`、`*-professional`、`*-analysis`。
- `responsive-result.json` 中 navigation duration 和 JS heap 是本机热启动/单次采样，**不是 3D 完全就绪时间、GPU 占用、持续 FPS 或真实移动端性能**。

iPhone Safari、iPad Safari、Android Chrome 实机、软键盘/安全区、多指长期操作、移动热行为、1000 对象 30 分钟、强杀恢复：未实测。不能据模拟截图批准大众内测。

## 9. 单元测试

新增 `rehearsal-intelligence.test.ts`：11 passed、0 failed、262 assertions。覆盖严格 schema/非法坐标/引用/证据、确定性编译、台左方向、障碍/人物冲突、预览和拒绝零正式写入、未预览及过时方案拒绝、Adopt/Partial/Edit 单次撤销和日志恢复、配额/取消、prepared 恢复、隐式修改及撤销更新。

IndexedDB 单元测试使用仓库现有 `fake-indexeddb`，这是明确的存储测试替身，不是真机持久化认证。浏览器采用和重新打开另用真实 Chromium IndexedDB。全仓 `bun run test --concurrency=1` 通过：14/14 个任务成功，其中 13 个命中缓存；合计 2707 passed、0 failed、1 个既有 skip。editor 应用本轮实际执行 287 项，耗时 134.32 秒，包含原有 120 秒扫描超时测试。core/editor/viewer/nodes/MCP/CLI/Capture 均在全仓结果内。

## 10. 类型与静态检查

`bun run check-types` 通过。`bun run check` 通过（1383 个文件，0 error；原有 camera-studio/dock.tsx 的 sceneId 依赖有 1 条 informational 提示，未修改无关代码）。没有临时 any 或绕过类型检查。

## 11. 生产构建

`bun run build` 通过，最终标签修正后 8/8 任务成功、7 个命中缓存，5.916 秒；新 API `/api/rehearsal/propose` 包含在输出中。真实启动采用 `next start`，不是以开发服务能打开代替生产构建。没有远端部署。

本机 Bun 1.3.14。复核命令：

```powershell
bun run check
bun run check-types
bun test apps/editor/lib/rehearsal-intelligence/rehearsal-intelligence.test.ts
bun run test --concurrency=1
bun run build
bun apps/editor/lib/rehearsal-intelligence/eval.ts --manifest
```

## 12. 尚未完成

1. 38D 中未提供的 30 个维度及其正式定义；已向用户询问，没有假装完成。
2. 真实模型 API Key、模型可用性、时延、质量与实际人民币消耗验证。
3. 100 个候选案例的戏剧专业人工审核，成为真正的 Gold Cases；当前已审核 Gold=0，真实模型评估=0。
4. iPhone、iPad、Android 各一轮真实设备验收及低配电脑长时稳定性。
5. 陌生用户独立完成核心流程的可用性验收，以及公网身份/归属隔离。
6. 连续 FPS、scene-ready、移动温度等完整性能基线；本轮仅复用 AI 用量诊断、保存状态与浏览器测量。

## 13. 已知风险与限制

- V0.1 编译器每人一条水平直线，不做寻路、上台阶、姿态捕捉、多段停顿。复杂意图须分轮，不能让模型文字宣称编译器未表达的行为。
- 障碍取当前 item/block/stair/wall 的世界包围盒；旋转物件及带洞景片可能保守拒绝可通行路线；扫描/其他节点的精细通行信息未纳入。不是物理安全认证。
- 证据必须是选段逐字子串，可阻止凭空引用，不能证明戏剧解释合理；“唯一正确”等措辞校验也不能替代人工判断。
- 私有日志仅在当前浏览器/来源；清除站点数据会丢失，跨设备不自动同步这些反馈。未来训练仍须授权核对、去标识、剧本权利与人工筛选。
- 单项目日志未做滚动裁剪，以保护原始反馈；长期大量交互可能占用存储。界面限制生成数量，配额不足提示导出清理，不静默丢数据。
- 固定保存事务与反馈库间不是全局原子事务；回执可补全已落地采用，未落地 prepared 不自动执行。跨标签冲突遵循既有保存机制。

## 14. 下一阶段

先补齐正式 38D 清单、审核 100 个候选测例并配置可用模型，运行真实输出评审；随后在 iPhone/iPad/Android 和低配电脑完成排演/预览/采用/离线恢复验收，再邀请少量陌生用户试用。先修复这些验收暴露的问题，再决定是否增加更复杂动作。当前不做 SFT、DPO、GRPO、自训练、多 Agent 或原生 App。

Eval：`bun apps/editor/lib/rehearsal-intelligence/eval.ts --manifest` 输出候选及输入；将真实模型 output、modelVersion、caseId 和独立 humanReview 写成结果数组后执行 `bun apps/editor/lib/rehearsal-intelligence/eval.ts results.json`。缺测例、无人工审核或任何语义未通过都返回非零状态；结构通过不冒充戏剧质量通过。
