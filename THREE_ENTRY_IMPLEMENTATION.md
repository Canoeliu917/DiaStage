# 三入口实施与验收记录

日期：2026-09-10。适用规格：`DiaStage_Codex_Simplified_Rehearsal_Spec.md` 为产品边界，`DiaStage_Three_Entry_Voice_Script_Implementation_Spec.md` 补充三个输入入口。

## 仓库与依赖审计

实施目录为 `outputs/camera-studio`，分支 `codex/camera-studio`，开始时 HEAD 为 `fc302d0d5e21ddb3b33b2d2bb54beca5f6fc325d`。本地已有三入口首页、SET / REHEARSE / REMOUNT 与照明移除改动，符合规格的开工条件。使用本地工作树，没有检出旧远端 main，没有提交、推送或创建 PR。

已阅读根目录与 editor 的 AGENTS、产品及设计文档、观察与记录、复台文档，以及层级、系统、节点、选择、工具和 Viewer 隔离约束。工作树在本次之前已有大量未提交内容；下面只列本次输入系统及其必要接入点，不将全部 `git diff` 归作本次成果。原数据库、旧项目 ID、缓存与兼容节点保留，浏览器验证另外创建测试项目。

| 复用点 | 实际用途 |
| --- | --- |
| `useScene.applyNodeChanges` | 节点与根 metadata 同一批提交，不直接写数据库 |
| `useScene.temporal` / Zundo | 一次确认对应一次撤销、重做 |
| `useAutoSave`、现有 scenes API | 沿用自动保存、409 版本冲突与加载保护 |
| `useEditor`、`useViewer`、sceneRegistry | 使用已有选择、显示与实体查询；不另设一套选择对象 |
| SceneLoader 的展示插槽 | 组合已有摄影机排演、手动 Ghost 和方案 Ghost，不替换原运行系统 |
| 现有 theatre metadata 与 Camera Studio | 用同一个 scene graph 保存舞台定义、人物与机位，不创建 voice/manual/script 项目格式 |
| `packages/core/src/remount` | 复用纯数学坐标、包围体与净距判断 |

新增依赖限于输入理解：OpenAI 官方 SDK、PDF.js、Mammoth、Mediabunny。DOCX 解压限制复用已有 fflate；没有引入大型 MCP、任意代码执行或新的场景渲染器。依赖版本与 lockfile 已更新。PDF.js 要求 Node.js 22.13+；实际验证使用 Node.js 24。

## 架构与数据

纯 StagePlan、StageCommand、白名单、坐标转换、简单中文解析、校验与编译放在 `packages/core/src/stage/`，不依赖 React、Three.js 或编辑器。

`apps/editor/lib/stage/command-executor.ts` 将严格命令适配到现有节点、人物和摄影机；先检查版本、只读、锁定、数值、尺寸与空间冲突，再原子提交。手动工具、口令和剧本都走此入口。原生编辑器变换通过通用 mutation gate 接入相同验证，core 只持有中立回调边界。

领域原点在台口线与中心线交点，+X 为演员台右、+Z 为台后、+Y 向上，单位米；界面角度为度，底层弧度集中转换。领域坐标与 Pascal 世界坐标只通过适配函数换算。物件间距按边缘净距计算，舞台不足时报告冲突，不自动缩小实体。

现有 scene graph 仍为保存单位。舞台定义和人物等保存在原 `metadata.diastageTheatre` 文档；Camera Studio 以根 `metadata.diastageCameraStudio` 为正式来源，旧 localStorage 仅保留兼容迁移。导入记录与生成节点一起保存、撤销；只记录选用证据和假设，不保存整本剧本或音频。未填写舞台高度会标记未测量，渲染用默认高度不能充当复台实测数据。

## Phase 1 — 统一底座与手动置景

首页手动入口输入场地类型、宽、深和可选净高，然后进入同一个 SET。舞台库按六组分类，支持 17 种领域对象、基本代理几何与已核对的现有资产。门窗有开口、桌椅有基本构形，不用一块实心方盒冒充所有物件。

桌面支持拖放；触控尺寸保留点选物件、再点台面落位。二维与三维共用吸附计算、Ghost、碰撞与越界检查；预览没有正式节点。属性可改名称、尺寸、台位、角度、锁定、可见性，复制和删除也走同一历史。

修复了自动保存的节点骤减保护与合法撤销冲突：只授权精确匹配的历史快照，整批撤销可保存；未知清空、加载中间态及失败保存仍不能绕过保护。

## Phase 2 — 文字口令

简单中文数字、米/厘米、台左/右/前/后移动及示例关系先本地解析。复杂输入才请求 `/api/stage/plan`。严格结构化响应经 schema 与领域验证，模型不接触场景 store。

“右边”等歧义先询问，每次最多显示三个问题。方案先显示平面 Ghost、尺寸、位置、默认假设及冲突，允许改参数与取消对象。确认后编译为白名单命令，事务防重放；过期场景版本会拒绝执行。

在项目内使用 **置景 → 舞台口令** 可补充同一舞台，不重新创建既有对象 ID。AI 服务不可用时，手动操作和确定性口令仍可使用。

## Phase 3 — 语音

点击后才申请麦克风。MediaRecorder 按设备能力选择 MP4 或 WebM；最多 90 秒 / 12 MB。停止后释放音轨，转写文本可编辑，再进入 Phase 2 的同一方案流程。组件离开、取消和权限失败均释放资源；失败时当前页可重试。

`/api/ai/transcribe` 验证实际音频容器、编码、时长和大小，而不只相信文件扩展名。API key 和模型配置仅在服务端；无密钥时明确返回服务不可用，不伪造转写成功。

已完成单元测试、真实音频文件格式检查和模拟麦克风浏览器流程。**没有可用的真实 iPhone/iPad Safari 设备，也没有配置 OpenAI 密钥，所以真机录音和真实模型转写尚未验收。** 视口截图不代替真机结论。

## Phase 4 — PDF / DOCX

首页支持拖放及原生文件选择器。`/api/script/stage-plan` 单次聚合验证、抽取、候选筛选、分块、事实合并和方案，整本文本不往返浏览器。只提取物理舞台事实，排除剧情分析、灯光、家装和独立道具管理。

PDF 提取保留页码；DOCX 仅用 `extractRawText` 保留段落，不渲染不可信 HTML。单文件最多 20 MB、300 页、300,000 字符；解析在线程内执行，限制内存、耗时和并发。ZIP 对条目数、实际解压总量、宏、实体、路径等检查。扫描 PDF、加密/损坏文档、旧 `.doc` 提供明确错误。

结果分为 **剧本明确写出 / 系统推测 / 需要确认**。每项有证据、类型、尺寸、台位与加入开关；修改默认尺寸、取消物件或回答问题后重新校验，确认前不写场景。

生产验证发现并修复了 PDF 资源路径被 Turbopack 编译成数字模块 ID 的问题：保留 Node 原生 `require.resolve`，内部异常只返回规范化文档错误。新增 `scripts/stage-script-api.test.cjs`，专门在 `next start` 下验证真实 PDF/DOCX 成功、扫描 PDF 和旧 DOC 正确拒绝；单测和开发环境通过不能替代这一检查。

## Phase 5 — 混合编辑与复台

生成后的布景可手动改，也可继续输入口令，保存与刷新保留对象 ID。SET、REHEARSE、REMOUNT 使用同一项目；没有增加新的剧情、行动或灯光编辑入口。

生产回归还暴露了项目页与剧目库将构建时的公开 URL 当作内部读取地址的问题：4319 保存成功，页面却访问旧的 4318 数据库。两个页面现在经原访问校验读取同进程 scene store，保留令牌、来源与限流，不再向另一个服务自请求。摄影机移动、旋转口令也已补测，保持原视野角度与注视距离。

复台六步实测：

1. **源场地**：新舞台读取实际宽深，选择布景和 Camera Studio 机位；净高未知时要求补测。
2. **目标场地**：输入目标尺寸与对应基准，保持 1:1。
3. **空间标定**：使用已有三点校准，检查退化、方向和误差。
4. **映射预览**：同时预览布景和机位，正式数据不变，列出越界与净距原因。
5. **实体落位**：确认后节点、摄影机关键帧/注视点与相关配置一次提交并保存。
6. **复台验收**：保留原验收流程；一次撤销恢复并保存布景与机位，不能把数字落位当作现场验收。

包含独立物件运动、或跟随主体未纳入的机位会明确阻止不完整映射。演员时序路线不伪装成实体设备。真实扫描、OCR、AR、测绘级精度均未实现。

## 验证与使用

本地开发入口：<http://127.0.0.1:4318/>。配置和启动方式见 [README](README.md)。生产验证另开 4319 端口并使用独立测试数据库，避免对原项目执行验收操作。

可重跑的主要命令（Bun 需位于 PATH）：

```sh
bun test apps/editor/lib apps/editor/components packages/core/src packages/editor/src packages/viewer/src packages/mcp/src scripts/theatre-product-copy.test.ts
bun run check-types
cd apps/editor && bun run check-types
cd ../.. && bun run lint
bun x turbo run build --filter=editor --env-mode=loose
```

浏览器脚本位于 `scripts/stage-{manual,command,script}-browser.cjs` 与 `scripts/remount-stage-browser.cjs`。使用 Playwright 和本机 Chrome；可设置 `PLAYWRIGHT_MODULE`、`CHROME_PATH` 与 `BASE_URL`。PDF/DOCX 示例文件随 `scripts/fixtures/stage-script/` 保存，均为自制测试资料。

浏览器证据：

- [手动置景](previews/stage-manual/browser.json)：二维点击与三维拖放、属性、锁定、复制、撤销、冲突和取消。
- [文字口令](previews/stage-command/browser.json)：示例、整批撤销/重做、同一 ID 补充编辑、歧义阻止。
- [剧本开发环境](previews/stage-script/browser.json)：真实 PDF/DOCX、证据、尺寸修改、保存/刷新、两种文件坐标相同。
- [复台](previews/remount-stage/browser.json)：六步、未测净高、布景/机位混合映射与一次撤销。
- [模拟语音](previews/three-entry/voice-browser.json)：假麦克风授权失败、录音、转写失败重试、可编辑文字、释放音轨；没有真实模型调用。
- [生产解析 API](previews/three-entry/production-api.log)：PDF/DOCX 200、扫描 PDF 422、旧 DOC 415。
- [生产浏览器完整流程](previews/stage-script-production/browser.json)：9 项检查通过，包括取消门景片后只创建两个对象、DOCX 后续口令编辑、确认/撤销/重做/刷新、三个工作区切换不丢数据。

生产浏览器结果单独记录：未捕获页面异常 **0**，业务网络请求失败 **0**；控制台有 **1** 条由扫描 PDF 负例主动触发的 HTTP 422，页面同时给出正确说明。另有 **25** 条页面跳转取消的 Next.js 预取请求，依据实际 prefetch 请求头单列保存，未当作业务故障，也没有隐藏日志。生产服务 stderr 为空。

测试日志分开保留，避免把平台限制或预期失败输入写成全部成功：

| 检查 | 结果与证据 |
| --- | --- |
| 网站及核心相关 Bun 测试 | 3,149 通过，0 失败；[日志](previews/three-entry/tests.log) |
| 其他工作区测试 | 2,000 通过、3 失败、1 跳过；[日志](previews/three-entry/tests-additional.log) |
| 工作区类型检查 | 11/11 任务成功，包含 editor 的 `next typegen && tsc --noEmit`；[日志](previews/three-entry/types-workspace.log) |
| lint | 0 错误、0 警告，1 项既有提示；[日志](previews/three-entry/lint.log) |
| editor 生产构建 | 6/6 任务成功；[日志](previews/three-entry/build.log) |

三个失败都在未修改的上游 CLI Windows 测试：一项要求 POSIX 文件权限，两项强制停止进程与实现中的 Windows 禁用分支冲突。没有把这些失败改成跳过；另一个 material 测试为原有跳过。lint 提示为录像 dock 的 `sceneId` 生命周期依赖，保持原行为。构建仍有既有 SQLite 动态路径导致追踪范围较大的警告，未修改数据库路径来掩盖它。

CLI 测试生成的四个临时进程已在核对命令行后停止。原组合清理命令被自动审批以 `blocked by policy` 拒绝；采用仅停止进程的安全清理后，没有重试删除两个临时目录。[清理记录](previews/three-entry/test-cleanup.json) 更新了早先测试日志中的进程存活状态。4318 开发服务保留。

四种截图视口为 1440×900、820×1180、1180×820、390×844，均为浏览器模拟：

| 视口 | 首页 | 剧本审阅 |
| --- | --- | --- |
| 桌面 | [截图](previews/stage-script-production/home-desktop.png) | [方案](previews/stage-script-production/plan-desktop.png) · [证据](previews/stage-script-production/review-desktop.png) |
| iPad 竖屏 | [截图](previews/stage-script-production/home-ipad-portrait.png) | [方案](previews/stage-script-production/plan-ipad-portrait.png) · [证据](previews/stage-script-production/review-ipad-portrait.png) |
| iPad 横屏 | [截图](previews/stage-script-production/home-ipad-landscape.png) | [方案](previews/stage-script-production/plan-ipad-landscape.png) · [证据](previews/stage-script-production/review-ipad-landscape.png) |
| iPhone 尺寸 | [截图](previews/stage-script-production/home-iphone.png) | [方案](previews/stage-script-production/plan-iphone.png) · [证据](previews/stage-script-production/review-iphone.png) |

## 修改文件

完整源码与测试路径见 [文件清单](previews/three-entry/changed-files.txt)。该清单包含本次在既有文件中的增量，不代表这些文件此前没有用户修改；截图与日志按上文链接单独列出。

新增主干文件（同目录相关 `.test.ts` / `.test.tsx` 一并交付）：

- `packages/core/src/stage/`：`schema.ts`、`coordinates.ts`、`parser.ts`、`plan.ts`、`index.ts`。
- `packages/core/src/store/scene-mutation.ts`。
- `apps/editor/lib/stage/`：`context.ts`、`command-executor.ts`、`initial-stage.ts`、`scenery.ts`、`labels.ts`、`import-metadata.ts`、`script-questions.ts`。
- `apps/editor/lib/ai/`：`api.ts`、`openai-server.ts`、`stage-planner.ts`、`voice-transcriber.ts`、`audio-validation.ts`。
- `apps/editor/lib/scripts/`：`limits.ts`、`extract.ts`、`document-worker.mjs`、`stage-facts.ts`、`script-planner.ts`。
- `apps/editor/app/api/ai/transcribe/route.ts`、`api/stage/plan/route.ts`、`api/script/stage-plan/route.ts`。
- `apps/editor/components/stage-entry/`：`manual-entry.tsx`、`manual-stage-panel.tsx`、`stage-selection-panel.tsx`、`placement-math.ts`、`placement-system.tsx`、`runtime.tsx`、`command-input.tsx`、`plan-review.tsx`、`plan-preview-system.tsx`、`voice-entry.tsx`、`voice-recorder.tsx`、`recording-session.ts`、`script-entry.tsx`、`script-input.tsx`、`stage-entry.css`、`manual-stage.css`。
- `apps/editor/components/camera-studio/persistence.tsx` 及测试。
- `apps/editor/lib/remount-stage-camera.test.ts`、`apps/editor/components/scene-loader.test.tsx`、`packages/editor/src/hooks/use-auto-save-history-integration.test.ts`。
- `apps/editor/lib/scene-page-store.test.ts`、`scripts/stage-script-api.test.cjs`：生产环境的同进程读取与 PDF 解析回归。
- 上述浏览器脚本、测试样例、本验收文档与 `previews/` 验收产物。

修改既有接入点，保留原文件中的用户修改：

- 首页 `apps/editor/app/page.tsx`，SceneLoader、Studio 侧栏及导航测试。
- `apps/editor/app/scene/[id]/page.tsx`、`app/scenes/page.tsx`、`lib/scene-store-server.ts`：经访问校验读取当前运行时项目。
- `apps/editor/lib/theatre/schema.ts`、`simulation.ts`，`components/theatre/simulation-panel.tsx`、`versions-panel.tsx`。
- `apps/editor/lib/remount-scene.ts`、`components/remount-panel.tsx`。
- `packages/core/src/store/use-scene.ts`、core 导出及 package 配置。
- `packages/editor/src/components/editor/{index.tsx,editor-layout-v2.tsx}`、`src/index.tsx`：中立选择面板插槽。
- `packages/editor/src/hooks/use-auto-save.ts` 及原有测试。
- 根/editor `package.json`、`bun.lock`、`apps/editor/next.config.ts`。
- `README.md`、`PRODUCT.md`、`DESIGN.md`、`CAMERA_STUDIO.md`、`REMOUNT.md`。

## 仍需外部验收的边界

- 配置服务端密钥后，测试实际账户可用的两个模型、真实中文录音与复杂剧本；本次未产生付费模型调用。
- iPhone/iPad Safari 真机的权限、后台切换、音频编码及长录音需要设备验证；没有用 Chrome 截图代替。
- 碰撞使用保守包围体，复杂网格可能误报；摄影机滚转与不完整运动/跟随复台会明确阻止，不能静默改变画面。
- 未提交、未推送；部署、真实扫描、OCR 和 AR 不属于这次交付。
