# DiaStage Product Backbone Integration Report

> 历史基线报告：技术状态与测试数字保留为 b2abdbbc 时点。2026-09-12 的层级修正仅更新下文产品表达；当前 Closure / 冻结状态见 [Freeze Report](DIASTAGE_PRODUCT_BACKBONE_FREEZE_REPORT.md)。Version / History / Journal 为横向基础设施，不是第五个产品阶段。已收紧的旧中间证据可按 [总 manifest](.impeccable/review/evidence-manifest.json) 在本机归档或基线 commit 中取回。

## 1. 基本信息

- 日期：2026-09-12。
- 工作分支：`codex/mobile-voice-stage-link`。
- 起始 Commit：`6623136e1435898316bc9cfca8a716649d80702c`。
- 验证代码 Commit：`6e31e4234b9e1649817b9fa3171a317dbca75771`；报告与证据由随后独立文档提交保存，不修改上述产品代码。
- Draft PR：[Canoeliu917/DiaStage #1](https://github.com/Canoeliu917/DiaStage/pull/1)。实施前核对为 Open / Draft、远端 head 与起点相同。本报告冻结时远端新提交 CI 尚未执行，随后状态以该 Draft PR 检查结果为准；不把本机 PASS 写成远端 PASS。
- main / Merge / Deploy / Release / Force push / History rewrite：全部 **NO**。
- 本轮同时收口上轮尚未提交的 Web / Tablet / Phone Internal Hardening。已有用户截图 `v01/home.png`、`v01/plan.png` 未覆盖，不纳入本轮提交；原数据库、私人文件和第三方许可未改动。

## 2. 本轮目标

产品过程为 **Venue → Build → Rehearse → Remount**，将已存在的能力接入同一个 Dia。**Version / History / Journal 贯穿全过程，并为 Remount 提供历史来源。** 补充文件只统一产品定义、品牌表达与入口，不新增四个 Agent 或四个工作区。

> AI proposes. The stage previews. Humans decide.

## 3. 总体结果

以下 PASS 仅表示本报告明确列出的本地工程验收范围，不表示真实模型质量或真机认证。

| 项目 | 结果 | 边界 |
|---|---|---|
| PRODUCT BACKBONE | PARTIAL | 主链路已连接；Build 后续反馈、混合指令及高级复台尚未闭环 |
| VENUE | PASS | 现有场地事实的只读模型；无自动扫描语义 |
| BUILD | PASS | 受控对象、本机规则、修订、Ghost、明确采用和一次撤销 |
| REHEARSE | PASS | 原方案/修订链保留，新增人物与布景站位及讨论后预演 |
| VERSION | PASS | 快照、查看、明确恢复、作为复台来源 |
| REMOUNT | PARTIAL | 原场/目标/人物路线整体比较和刚体映射；无关系约束适配 |
| DIA UNIFIED ENTRY | PASS | 三工作区共用同一场景 Thread |
| VOICE → DIA | PARTIAL | 转写校对后共用控制器；真实录音和转写未实测 |
| MOBILE DIA | PARTIAL | 轻量远控、状态恢复、布景投影已实现；无手机版本历史浏览器 |
| TABLET / DESKTOP | PASS | 限浏览器和尺寸模拟，见验收证据 |
| HUMAN AUTHORITY | PASS | 无人工采用的路径不写正式 Scene |
| FEEDBACK LINEAGE | FAIL | 排演闭环保留；新增 Build 尚缺采用后 Undo/手改反馈及回执重建 |
| SCENE LAYERS | PASS | 最小显示开关及复台 Source/Target 比较 |
| PROJECT STATE | SCHEMA_ONLY | 不作为隐藏记忆运行 |
| CONSTRAINT LAYER | SCHEMA_ONLY | 五种数据契约；没有求解器 |
| A/B REHEARSAL | PARTIAL | 选择/预演多个方案；无双屏同步播放或片段组合 |
| TIMELINE | PARTIAL | 保留既有路线时长/播放；逐角色分时段 Blocking Timeline 延后 |
| REAL MODEL | NOT_RUN | 未配置真实 Key、未发起真实模型验收 |
| IPHONE / IPAD / ANDROID | NOT_RUN | Chromium viewport 不能替代真机 |
| PUBLIC BETA | NOT_READY | 仍需真实模型、Gold 和设备/用户验收 |

## 4. 当前产品骨架

`Venue → Build → Rehearse → Remount` 操作同一个正式 Scene；Version / History / Journal 贯穿所有阶段。DiaConversation 负责生命周期和路由，现有编译器、校验器、人工决定与 Scene Store 执行各自职责。

- Build：确定性文字 → StagePlan → 校验 → 同 Viewer Ghost → 人工采用。
- Rehearse：实时事实 → 本机受控站位 / 既有模型接口 → Proposal → 原 Ghost / Authority。
- Version / Remount：Dia 查找真实已存版本，打开只读预览或复台来源；不自动恢复或复台。
- Reflect / Clarify：读取当前人物与路线后讨论，或要求补充指令；不改台。
- Constraints / Project State：仅 Schema。没有新的 Agent、隐藏记忆或新 Scene Store。

## 5. Existing Architecture Mapping

| 领域 | 实际文件与职责 |
|---|---|
| Venue | `lib/theatre/{simulation,schema,simulation-store}.ts` 保留正式场地；新增 `lib/theatre/venue-model.ts` 只读提取尺寸、方向与节点引用；`components/theatre/runtime.tsx` 展示 |
| Build | `packages/core/src/stage/{schema,parser,plan}.ts`（plan.ts 包含编译与校验）；`lib/stage/{context,scenery,command-executor}.ts`；`components/stage-entry/{plan-review,plan-preview-system}.tsx` |
| Rehearse | `lib/rehearsal-intelligence/{context,proposal-generator,proposal-compiler,proposal-validator,authority}.ts`；`components/theatre/rehearsal-partner.tsx` |
| Version | `components/theatre/versions-panel.tsx`；抽出的 `lib/theatre/rehearsal-versions.ts`；既有 Scene Journal 与版本冲突保存链 |
| Remount | `packages/core/src/remount/` 纯数学；`lib/remount-scene.ts` 适配；`components/{remount-panel,remount-preview-system}.tsx` 展示 |
| Dia | 既有 `lib/rehearsal-intelligence/conversation-controller.ts` 扩展受控路由；同目录 `dia-backbone.ts` 保存 Build 建议、`conversation-storage.ts` 本机持久化；`components/theatre/dia-remote-bridge.tsx` 与 `lib/remote-voice/dia-protocol.ts` 轻量投影 |

除明确标为 `packages/` 的路径外，上表相对 `apps/editor/`。原来缺少的连接是：Dia 仅面向排演、Build 是独立入口、版本只能在面板内部读取、历史排演未进入复台对比。以上通过适配现有模块解决，没有重写 store、journal、配对服务或人工排演权限。

## 6. Dia Unified Entry

- 删除置景侧栏独立 `stage-command` 主入口；旧侧栏偏好映射到物件库。
- Dia 在置景、排演、复台均可打开，桌面右侧统一为“告诉 Dia”。
- 首页旧版语音搭台折叠为次级兼容入口；手动与剧本入口继续保留。
- 录音复用 VoiceRecorder，转写进入可编辑输入，点击发送后才由同一个控制器判断意图。
- 未删除稳定的旧逐次方案审阅模块。旧连续制景授权代码仍在，但现有挂载不传 sceneId，自动执行入口不可达；没有以本轮接线重新开放它。

## 7. Venue

已实现：米制宽/深/高、XZ 地面与 +Y 向上、台口、台左/台右、原点、矩形边界；识别可见门、墙、平台、舞台台阶、固定设施、布景与 ScanReference 的节点引用。高度未实测时仍可保留未测状态，复台沿用补测要求。

门节点不等于经过验证的上下场通道；没有新建可活动区域求解、观众席语义编辑、BIM、建筑工程量、高精度扫描或自动障碍分割。GLB 继续作为参考，不能声称已被 Dia 理解。

## 8. Build

实际支持原有受控目录：矩形桌、圆桌、椅、门景片、墙景片、平台、台阶、体块及既有代理/道具类型；并非任意 Mesh 生成。圆桌使用可编辑 Block 拓扑，预览与正式几何共享描述。

已验证文字：`给我一张圆桌，两把椅子，台右一扇门`；`桌子往台左一点`。后者以明确显示的默认 30 厘米计算；两把椅子的默认相对位置同样记录在 assumptions，用户可修改后重新预览。无法确定的对象、边界与冲突不会静默跳过。

`StagePlan → validateStagePlan → Ghost → compileStagePlan → executeStageCommands` 复用现有事务、自动保存和一次撤销。预览内容改变后必须重新预览；采用前再次核对本机日志、Scene 事实、Ghost 身份、取消信号和正在进行的拖动。

模型直接决定坐标 / 写 Scene / 执行任意代码：**NO / NO / NO**。

## 9. Rehearse

每次发送重新读取场地、人物位置/朝向、路线、时长、布景边界、选段和导演意图。保留旧 Proposal 修订、Partial/Edit、Ghost、Adopt/Reject、Undo/Redo 与反馈链。

新增受控初始站位：`A站门边，B靠桌子`、`B别那么近`。按当前物件外包轮廓的最近一侧计算 0.5 米 / 1 米净距，人物半径假设 0.25 米；保留朝向，清除该人物旧路线。它不是“走到物件旁”的动画，也不搜索绕障路线。目标缺失、重名、越界或冲突时明确拒绝。

讨论后选择第一/第二方向可生成新的预演，不伪造上一轮 Proposal ID。受控规则标记为本机规则；演示场景继续标记合成数据。

## 10. Version

保存完整场景快照、场地、人物路线、机位/显示状态、时间、名称、说明，以及 scene / venue / rehearsal 哈希。历史版本只读查看与明确恢复分开；恢复保留来源并支持撤销。版本可成为复台来源，无须先覆盖当前场景。

不足：没有完整双版本差异浏览器；版本 interactionId 目前只关联既有排演决定，尚未关联 Build transaction；日期/序号只能在实际保存的版本中查找，找不到即要求人工选择。

## 11. Remount

可整体展示 Source Venue、源布景轮廓、源人物/路线、Target Venue 和映射后的方案；04 映射预览中直接切换原版本、叠加与目标方案。保留三点校准、误差、冲突列表、米/弧度和 1:1 刚体映射，不自动缩小物件。

仍标 **PARTIAL**：当前对比使用代理轮廓，不复刻所有历史材质；结构不同或缺失节点会阻止应用并说明，不能自动重建历史对象。手工目标场地目前是复台参考/配置，确认应用移动所选布景、人物与路线，但不自动将正式 Venue 和场地几何替换成目标场；这还不是完整的新场地迁移。独立目标 frame 可旋转，但现有 Venue 文档没有完整朝向字段。高级戏剧关系保持与场口重解释未完成。

## 12. Remount Intelligence

| 能力 | 结果 | 实际含义 |
|---|---|---|
| Preserve | IMPLEMENTED | 同一刚体变换保留尺寸、相对位置、人物朝向和路线 |
| Adapt | NOT_IMPLEMENTED | 不按场口、人物目标或软约束重新排布 |
| Conflict | IMPLEMENTED | 越界、碰撞、安全距离、数据/结构不一致 |
| Needs Human Decision | IMPLEMENTED | 冲突阻止确认；只有明确确认才批量应用 |

合成例：10 米源场映射到 7 米目标场时，仍保持物件真实尺寸，超出的物件标冲突；没有把全部坐标乘 0.7。原台右出口不存在时，系统尚不能自动解释该戏剧关系，应由用户确认。

## 13. Scene Layers

专业模式提供场地、布景、人物、路线、方案预览开关；复台有原版本/目标方案/叠加比较。它们是展示状态，不写正式节点，也不进入版本快照。

Build Ghost 与排演 Ghost 均遵从预览开关。纯展示隐藏不会再触发复台编辑锁；真实拖动和混合字段 override 仍会阻止应用。Source/Target 属于复台比较控件，没有新建七套独立场景。

## 14. Project State

**SCHEMA_ONLY**：场景 ID/版本、选段、导演意图、选中人物、重要约束、基准版本、目标场地、当前问题。当前 UI 与控制器继续读取已有事实；没有挂载第二套项目 Store 或模型维护的隐藏真相。

## 15. Constraint Layer

`near-object / distance-preference / keep-out-zone / preserve-relation / must-use-entrance` 五种 Schema 及边界测试已建立。**全部仍为 SCHEMA_ONLY**，未作为跨 Build/Rehearse/Remount 的运行时约束系统执行。局部人物靠物件功能不等于已实现全局约束层。

## 16. A/B Rehearsal

**PARTIAL**：保留同一次 Interaction 的多个方案，可选择、预演 A/B 并明确采用；切换会清除旧 Ghost，不能误采用上一项。没有双屏同步播放、时间片拼接或 Timeline merge。

## 17. Default Mode

普通用户看到三个工作区、舞台、Dia 输入、建议、预演与决定。四个品牌词仅在首页折叠说明；Ontology、模型自评与版本元数据不作为默认主卖点。Build 的尺寸审阅仍相对专业，是后续可用性验收重点。

## 18. Professional Mode

复用同一数据显示场地尺寸、台位、排演依据、元数据、图层与版本来源；复台继续显示校准、映射与冲突。Constraints 编辑器、Project State 编辑器、专业报告未实现，未用空面板冒充。

## 19. Desktop / Tablet / Phone

优先级已按最新补充冻结为 **Dia Core → Web/Desktop 参考实现 → Tablet 同 Web 响应式 → Phone Dia + Remote**。没有为手机或平板复制路由、生成器、编译器与采用逻辑；本轮设备工作是既有协议与布局的修复，不继续扩展设备专属智能能力。

桌面与平板由同一个 `rehearsal-partner.tsx` 创建 `DiaConversation`，并将该实例传给 `DiaRemoteBridge`。Phone 的 message/select/preview/reject/cancel 经 SceneVersion、Interaction、Proposal 引用校验后，调用这一实例。Build 和排演的 Ghost 分别读取现有共享预览 store，手机投影不自行计算或宣称预览成功；没有远程 Adopt 命令。

**协议统一仍为 PARTIAL**：跨端共享了当前方案与权限校验，但 Build 与 Rehearse 仍使用不同记录结构，尚非一个完整的统一 Interaction Schema；历史版本与复台比较也未完整投影到 Phone。优先补齐这些 Dia 核心事实与回执，再扩展终端 UI。

桌面为本机 Chrome 自动化；手机和平板为 Chromium 尺寸/触控模拟。22 种尺寸：手机 360/375/390/393/430 宽及横屏，平板 768/820/834/1024 宽及横屏，桌面 1280×720 至 1920×1080。输入、发送、预演、Ghost 控件、横向溢出、44px 点击区、平板舞台空间均按脚本检查。

另测 390×500 的软键盘空间、横竖屏草稿/选择/Thread 保留。它不能模拟真实 iOS 键盘、Safari GPU/后台回收或物理内存压力。iPhone、iPad、Android、8GB 集显 Windows 专项真机均 **NOT_RUN**。

## 20. Voice → Dia

`Audio → Speech-to-Text → Editable Transcript → Human Confirm → Dia → Intent → Proposal → Ghost` 接线已实现。电脑与手机均复用录音生命周期；浏览器假麦克风只验证取消、后台事件和资源释放。

**Voice → Direct Formal Scene Write = NO**。真实音频、转写质量与真实模型未实测；同时含 Build 与 Rehearse 的复杂句子目前要求分两次确认，尚未形成一个混合方案。

## 21. Human Authority

| 路径 | 正式 Scene 写入 |
|---|---:|
| Discuss / Clarify | 0 |
| Proposal generation / Revision | 0 |
| Ghost / Preview | 0 |
| Reject | 0 |
| 手机发送与请求预演 | 0 |
| 人工明确 Adopt / Apply | 才可提交 |

回归覆盖取消期间迟到回复、采用前 Ghost 清除、拖动中采用、跨窗口日志变化、旧方案/改后未预览、搭台转排演引用污染。原排演 Authority 未重写；Build 只复用现有写入边界。

## 22. Feedback / Future Dia Data

原排演链继续保留 Input → Context → Proposal → Preview → Human Decision/Edit → Final Result → Undo/后续手改观察。私有标记与训练默认值不变：`privateProjectData=true`、`trainingAuthorized=false`、`trainingEligible=false`。

Build 已保存原文、上下文、originalPlan、最新 plan、previewedPlan、parentId、状态和 finalSceneVersion，但尚无完整编辑历史、采用后 Undo/手改事件与崩溃中断后的 applied 回执重建。因此 **不能宣称整个产品 Feedback Lineage PASS**。正式节点依然由 Scene Journal 保存，这一缺口不等于已保存场景丢失。

本轮没有训练、自动数据上传、SFT/LoRA/DPO/GRPO 或新的训练许可。

## 23. Deleted / Reduced Product Complexity

移除置景独立口令 tab；旧语音入口降级折叠；三个工作区共用 Dia；Build 预览 store 不再从 UI 面板反向导入；版本读取从面板内部抽出，供 Dia 和复台复用。保留一个 Viewer、一个 Scene、一个 Thread、原保存和配对服务。

没有新增四套品牌页面、配色、Agent runtime 或框架依赖。旧兼容入口没有全部删除，后续清理需区分不可达自动授权分支与仍被剧本流程使用的编译/审阅函数。

## 24. Files

完整 Added / Modified / Deleted 清单附于文末。清单包含本轮与接续的未提交 hardening 增量，不含编译产物、密钥、录音、数据库或浏览器配置。

## 25. Bundle / Performance

测量口径：新浏览器上下文实际取得的 JS response 解码字节，按 URL 去重；不是 gzip transfer、内存占用或模型延迟。基准 `6623136e` 的 `/remote-voice` 首屏为 **859,545 bytes / 8 chunks**；本轮 **862,339 bytes / 8 chunks**，增加 **2,794 bytes（0.3251%）**。桌面 `/demo` 至 Dia + Viewer 挂载为 **5,737,619 bytes / 34 chunks**，没有同口径改前基准（NOT_MEASURED），不虚构增减比例。完整列表见 `bundle-result.json`。

手机源码依赖隔离测试继续通过，首屏不引入完整 Viewer、Three.js、Editor 或 Node Registry。桌面仍加载既有完整 Viewer。

Three.js 清理补丁解决 Renderer / RenderObjects / Texture / RenderTarget 自有监听器未释放问题，不释放仍共享的模型资源。生产浏览器 20 次路由预演循环通过原增长阈值：cycle 5→20，DOM 2130→2229，listeners 1484→1560；RAF、timer、interval、audio、track 均为 0，object URL 保持 1。不能由此声称 GPU 显存或 1000 对象半小时真机验收通过。

## 26. Tests

| 命令 | 实际结果 |
|---|---|
| `bun install --frozen-lockfile` | PASS，922 packages，lockfile 无修改；本机直连解析停滞，改用已有网络代理完成 |
| `bun run check` | PASS，1,425 文件，0 error / 0 warning，1 条原有 informational diagnostic |
| `bun run check-types` | PASS，9/9 tasks |
| `bun run test --concurrency=1` | PASS，14/14 tasks；2,823 PASS / 0 FAIL / 1 原有 SKIP |
| `bun run build` | PASS，8/8 tasks |

| Workspace | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| capture-protocol | 16 | 0 | 0 |
| capture-viewer | 25 | 0 | 0 |
| cli | 34 | 0 | 0 |
| core | 833 | 0 | 0 |
| editor package | 670 | 0 | 0 |
| mcp | 120 | 0 | 0 |
| nodes | 534 | 0 | 1 |
| viewer | 191 | 0 | 0 |
| editor app | 400 | 0 | 0 |

首轮失败已保留原因记录：新展示组件未在保存测试中隔离、旧菜单断言未更新、前序机位测试污染空场景 fixture；均修根因，没有删除失败测试或放宽正式对象数量/权限断言。另新增纯图层隐藏不阻止复台的两项测试。

## 27. Browser Acceptance

实际证据以对应 JSON 为准：`resources`、`matrix`、`recovery`、`faults`、`gesture`、`stress`、`performers`、`screens`；新的 Build/Version/Remount/手机 Build 见 `acceptance-result.json`。脚本不接真实模型，使用独立合成场景与实际浏览器、API、IndexedDB。

已完成的基础链包括：22 尺寸与 Ghost 控件；20 次资源释放；刷新/离线/丢响应/丢确认/429/503 重试；无重复消息与无伪造 Ghost 成功。手势取消、长对话与人物压力结果分别保留，不合并写成“全设备通过”。

8 个 hardening phase 全部 PASS，共 **60 项检查 + 22 尺寸矩阵**：resources 2、matrix 26、recovery 10、faults 6、gesture 5、stress 4、performers 4、screens 3。所有结果 `errors=[]`。resources/matrix/recovery 完成后只有复台图层锁与比较 UI 的调整，其余 5 phase 在包含这些调整的生产构建验证；最后的按钮 hover 修复另做 DOM 验证并重建，不把早期结果冒充针对新 CSS 的重跑。

复台按钮 hover 修复另有 **4/4 PASS**：三个选中按钮背景保持 rgb(238,238,238)、文字 rgb(24,24,24)，普通按钮 hover 仍正常。此项在 dev 实际 DOM 验证后重新生产构建，生产服务 HTTP 200。

产品流程在最终生产构建已 **14/14 PASS、0 未捕获异常**：空场 API 基线→两次 Build 建议/Ghost 零写入→确认新增 4 件；人与物件站位及距离修订；Reflect 后第二方向预演；命名版本和只读查看；复台 6 个对象与 2 条路线映射、确认后平移 10 米、一次撤销恢复完整 graph 哈希。独立手机场景真实配对→发送 Build→请求电脑 Ghost→SVG 显示 4 件布景；电脑确认前 graph 不变，手机无 Adopt。

## 28. Evidence

- `.impeccable/review/internal-device/*-result.json`：SYNTHETIC 内容 / SIMULATION 尺寸；实际 Chrome 自动化。
- `.impeccable/review/internal-device/*.png`：桌面/平板/手机、Ghost、键盘与模式截图。
- `.impeccable/review/product-backbone/acceptance-result.json`：最终生产构建的产品流程。
- `.impeccable/review/product-backbone/bundle-result.json`：实际 JS 请求测量。
- `.impeccable/review/product-backbone/`：品牌首页、搭台、排演、版本、复台与手机证据。
- `scripts/internal-device-hardening.mjs`、`scripts/internal-device-resources.mjs`、`scripts/product-backbone-acceptance.mjs`：可重复运行的浏览器检查；设 `BASE_URL` 为独立本地测试服务，使用已有 Playwright。

本地验证入口：`http://127.0.0.1:4328/`，使用隔离的合成测试数据库；不会替代用户正式项目。真实手机、真实录音、真实 API 输出均无证据，明确 **NOT_RUN**。

## 29. 当前真正完成的功能

产品/品牌定义集中管理；三工作区统一 Dia；受控自然语言搭台及修订；正式几何一致的 Ghost；实时人物/物件站位；讨论到预演；版本只读查看和历史来源复台；原/目标整体比较；最小场景图层；手机状态恢复和轻量布景投影；取消与采用边界修复；资源释放与跨尺寸回归。

以上“完成”仅限代码与已列自动化检查，不包含真实模型理解、现场尺寸精度或真实用户体验保证。

## 30. 仍未完成

- Build 完整反馈回执与 Undo/后续手改血缘；Version 对 Build 的显式关联。
- 一句话同时布景与人物行动的组合 Proposal；复杂指令仍需拆分澄清。
- Project State / 五类 Constraints 的运行时编辑和执行；高级关系复台、自动场口适配。
- 复台后正式 Venue/目标场地几何的整体切换；目前只应用映射对象与排演，须明确区分。
- A/B 同步对比和片段组合、分段 Blocking Timeline、Cue。
- 手机版本历史查看、真实语音与模型验收、Gold 20、人类戏剧质量审核、独立初学者测试。
- iPhone / iPad / Android 与低配置 Windows 真机；1000 对象 30 分钟持续操作；OS 强杀/断电恢复认证。
- 高精度扫描、Scan→Venue 语义化、RAG、长期项目记忆、自有模型训练。

## 31. Known Risks

| 类别 | 实际风险 |
|---|---|
| 技术/维护 | 控制器承担的生命周期增加；旧逐次搭台和新 Dia 审阅仍并存 |
| 产品 | 初学者仍需理解对象选择、预览与正式采用；Build 数值审阅较多 |
| 性能 | 浏览器模拟不能证明旧款设备 GPU/内存稳定；大场景未完成长测 |
| 数据 | IndexedDB 配额与用户清理浏览器仍影响私有记录；Build 反馈恢复有缺口 |
| 移动 | Safari 后台、键盘、音频格式、WebGL 仍需真机 |
| Remount | 代理轮廓不等于完整模型；结构差异要人工恢复，关系适配尚未实现 |
| AI | 本机规则覆盖有限；真实模型与真实转写尚未验收 |

## 32. Technical Debt

新增的共享 Build preview store 取代 UI 反向依赖；版本模块是抽取既有逻辑，没有另起保存系统。Project State / Constraints 按要求仅留最小数据契约，无惰性功能实现。

仍有受控遗留：旧语音搭台入口/授权分支、Build 与排演两类反馈记录格式、Three.js 资源修补。没有新增 Agent 框架、训练入口或临时 `any` 绕过。品牌四词只存在于文案/文档映射，不造成重复工程模块。

## 33. Product Risks

目前最明显的差距是“可操作闭环”与“全程创作记录”的差距：搭台采用后的行为尚未完整进入 Diary；复台仍以几何映射为主；受控 Build 能力有限。报告中的品牌定义是方向，不能据此宣传任意生成、完全理解关系或永久记忆。

## 34. 下一步建议

### P0

1. 先稳定 Dia Core：补齐 Build 提交回执、Undo/手改反馈与 Version 关联，复用已有事务观察原则，再统一跨端可引用的记录；不复制设备智能逻辑。
2. 明确目标场地确认后如何成为正式 Venue，补齐场地几何切换及排演上下文的连续性。
3. 使用真实 Key 和真实语音完成小规模人工审阅，推进 Gold 20。
4. iPhone/iPad/Android、低配 Windows 和 1–3 位初学者完成同一条搭台→排演→复台验收。
5. 测 OS 强杀恢复、配额不足与 1000 对象持续操作；保留原始结果，不用截图替代。

### P1

最小混合指令澄清/组合方案；Project State 与少量可解释约束；手机版本查看和复台关系差异说明。

### P2

Cue、完整 Timeline、Scan 语义提取、RAG 与原生 App 继续延后。

## 35. Codex 自己的建议

最快形成可发布产品，应停止扩展 Agent、通用约束求解、自由 3D 生成与完整摄影机剪辑，把现有一路操作做完真实人/设备验收。

三个最可能的技术债：Build 与排演反馈格式分离；旧语音执行入口与统一 Dia 并存；上游 Three.js 补丁维护。

三个最影响体验的部分：无法理解复杂句子时的继续引导；Build 数值表单和确认成本；真实手机键盘/后台/录音尚未验证。

## Brand / Product / Engineering Mapping

正式产品定义：**DiaStage 是一个以真实舞台空间为基础，从搭台、排演到复台持续工作的戏剧创作系统。**

Dia 定义：**Dia 是贯穿其中的智能伙伴，把人的自然语言转化成可预演、可修改、可保留的舞台方案。**

| Brand | Product | Engineering |
|---|---|---|
| Dialogue — 听懂你想说的戏 | Dia 对话/输入/澄清 | Conversation / Voice / Reflect / Clarify |
| Diagonal — 人物进入舞台，距离、方向和位置本身就是关系 | 人物空间关系/排演 | Rehearse / Blocking / Constraints |
| Diagram — 可看见、比较和修改的舞台 | 场地/搭台/Ghost | Venue / Build / Scene / Preview |
| Diary — 记住一场戏怎样被排出来 | 版本/历史/复台 | Version / Journal / Feedback / Remount |

品牌解释为 **Dialogue → Diagonal → Diagram → Diary**；产品工作区为 **置景 / 排演 / 复台**；核心产品过程为 **Venue → Build → Rehearse → Remount**。Version / History / Journal / Feedback 是贯穿全过程的 Diary 基础设施。四个层级分别表达，不新增运行时能力枚举或 Agent。

## 文件清单附录

相对仓库根目录；源码、测试、脚本与文档合计新增 20 个、修改 53 个、删除 0 个。本轮没有删除稳定模块文件。

### Added

- `DIASTAGE_PRODUCT_BACKBONE_INTEGRATION_REPORT.md`
- `apps/editor/components/stage-entry/mobile-dependency.test.ts`
- `apps/editor/components/stage-entry/plan-preview-system.test.tsx`
- `apps/editor/components/theatre/dia-remote-bridge.test.ts`
- `apps/editor/lib/brand.ts`
- `apps/editor/lib/rehearsal-intelligence/dia-backbone.test.ts`
- `apps/editor/lib/rehearsal-intelligence/dia-backbone.ts`
- `apps/editor/lib/rehearsal-intelligence/local-rehearsal.test.ts`
- `apps/editor/lib/rehearsal-intelligence/local-rehearsal.ts`
- `apps/editor/lib/rehearsal-intelligence/provider-format.test.ts`
- `apps/editor/lib/stage/plan-preview.ts`
- `apps/editor/lib/theatre/product-backbone.test.ts`
- `apps/editor/lib/theatre/project-state.ts`
- `apps/editor/lib/theatre/rehearsal-versions.ts`
- `apps/editor/lib/theatre/venue-model.ts`
- `apps/editor/lib/theatre/version-remount.test.ts`
- `packages/viewer/src/lib/render-objects-cleanup.test.ts`
- `scripts/internal-device-hardening.mjs`
- `scripts/internal-device-resources.mjs`
- `scripts/product-backbone-acceptance.mjs`

### Modified

- `DESIGN.md`
- `PRODUCT.md`
- `README.md`
- `apps/editor/app/layout.tsx`
- `apps/editor/app/page.tsx`
- `apps/editor/components/remount-panel.tsx`
- `apps/editor/components/remount-preview-system.test.tsx`
- `apps/editor/components/remount-preview-system.tsx`
- `apps/editor/components/remount.css`
- `apps/editor/components/scene-loader.test.tsx`
- `apps/editor/components/scene-loader.tsx`
- `apps/editor/components/stage-entry/dia-home-entry.tsx`
- `apps/editor/components/stage-entry/dia-home.css`
- `apps/editor/components/stage-entry/mobile-assistant.test.tsx`
- `apps/editor/components/stage-entry/mobile-dia.css`
- `apps/editor/components/stage-entry/mobile-dia.tsx`
- `apps/editor/components/stage-entry/plan-preview-system.tsx`
- `apps/editor/components/stage-entry/plan-review.tsx`
- `apps/editor/components/stage-entry/recording-session.test.ts`
- `apps/editor/components/stage-entry/remote-voice-controller.tsx`
- `apps/editor/components/studio-navigation.test.tsx`
- `apps/editor/components/studio-sidebar.tsx`
- `apps/editor/components/theatre/dia-conversation.css`
- `apps/editor/components/theatre/dia-remote-bridge.tsx`
- `apps/editor/components/theatre/rehearsal-partner.tsx`
- `apps/editor/components/theatre/runtime.tsx`
- `apps/editor/components/theatre/scene-visibility.ts`
- `apps/editor/components/theatre/simulation-drag.ts`
- `apps/editor/components/theatre/simulation-panel.tsx`
- `apps/editor/components/theatre/versions-panel.tsx`
- `apps/editor/lib/rehearsal-intelligence/authority.ts`
- `apps/editor/lib/rehearsal-intelligence/context.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation-controller.test.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation-controller.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation-storage.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation.test.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation.ts`
- `apps/editor/lib/rehearsal-intelligence/openai-server.ts`
- `apps/editor/lib/rehearsal-intelligence/proposal-compiler.ts`
- `apps/editor/lib/rehearsal-intelligence/proposal-validator.ts`
- `apps/editor/lib/rehearsal-intelligence/schema.ts`
- `apps/editor/lib/remote-voice/dia-protocol.ts`
- `apps/editor/lib/remote-voice/dia-store.test.ts`
- `apps/editor/lib/remount-scene.test.ts`
- `apps/editor/lib/remount-scene.ts`
- `apps/editor/lib/scripts/stage-facts.ts`
- `apps/editor/lib/stage/labels.ts`
- `apps/editor/lib/stage/scenery.test.ts`
- `apps/editor/lib/stage/scenery.ts`
- `apps/editor/lib/studio-workspaces.ts`
- `packages/core/src/stage/parser.ts`
- `packages/core/src/stage/schema.ts`
- `patches/three@0.185.1.patch`

### Deleted

无。

### 验收证据

新增截图、合成场景与结果 JSON 单独列于 [.impeccable/review/product-backbone/evidence-manifest.json](.impeccable/review/product-backbone/evidence-manifest.json)，记录逐文件字节和 SHA-256。用户已有 v01/home.png、v01/plan.png 不在清单内。

## 36. 最终一句结论

**DiaStage product backbone is: NEEDS ANOTHER HARDENING PASS** — 主骨架与统一入口已经连接，品牌没有引入重复模块，但 Build 完整记录链、真实模型和真机验收仍不足以冻结为可发布产品。
