# 手机舞台助手与扫描转接 — 实施和验收

日期：2026-09-10；配对换码补充：2026-09-11。实施基线：`6419323b02644c5e9608f20c56eead0ed585462c`。
实现及测试提交：`e4575eb7bf97d2d1fe9519f9103c4002c87763c0`；报告和截图在后续独立文档提交中。
仅更新 `codex/mobile-voice-stage-link` 和 Draft PR #1；不修改 main，不合并，不部署。

## 本轮行为

- 手机助手提供「语音构台 / 手动置景 / 剧本搭台 / 复台 / 扫描上传」五个直接入口，本页不挂载 Canvas。首页保留四项核心功能，另有手机助手链接。
- 配对复用原有 8 位会话，绑定已保存场景。请求 UUID、连续序号、单条待确认命令和持久执行回执防止重试重放。手机口令即使在电脑连续制景授权期间也必须经过草案预览、电脑明确确认。
- 舞台端在当前配对码旁提供「重新生成配对码」。新码成功生成后才撤销旧会话；服务重启、配对码过期或已使用时无需先执行一个可能失败的断开请求。
- 扫描应用导出的单文件 GLB 流式上传至临时文件。电脑确认后校验下载长度、SHA-256 和结构，复用 ScanNode、asset://、场景事务、单步撤销与即时保存。手机无直接写场景权限。
- 手动置景复用舞台库、对象调整及底部面板；触控删除先确认，操作按钮至少 44px，触控设备不显示鼠标教学浮层。离线保存警告占据独立行，不能遮挡工作区导航。
- PDF/DOCX 复用现有文本提取、分块预算、StagePlan 校验与原子写入；加入对当前草案的语音/文字修订。歧义提示保留原草案，不把不完整修订当作成功。
- 「复台」默认打开排演版本，仍保留场地映射。版本显示时间和说明，二维预览后明确恢复；恢复生成新记录、保留原版本，并支持撤销。
- 复用稳定模式和监看默认关闭；不可见页面暂停 3D 绘制。扫描单独隔离显示错误，卸载时释放模型缓存和 GPU 资源，保留撤销需要的 IndexedDB 文件。

## 复用与分层审计

未新增扫描节点类型、第二套资源库、第二套会话或 Scene Store。

| 层 | 复用与修改边界 |
|---|---|
| core | 原有 ScanNode 不改模型；asset-storage 增加未提交资源回滚和对象 URL 释放；不引入 Three.js / 编辑器依赖 |
| nodes | 在已有 scan 定义上注册 `parametrics.customPanel`；新增 `scan/panel.tsx` 包装已有 ReferencePanel；渲染仍使用原 ScanRenderer 和 GLTF 加载器 |
| viewer | 原 FrameLimiter 在不可见页面停止绘制；GLTF hook 收紧类型；不引入编辑器工具状态 |
| editor package | 共享 ReferencePanel 支持原有参考选择和注册表选择；移动、旋转、缩放、隐藏复用原实现；删除确认位于共享操作菜单 |
| editor app | 新 GLB 校验/临时存储/确认导入模块、两条扫描 API 路由、共享扫描传输面板；其余均改造已有入口、会话、日志和版本组件 |
| tests / docs | 新测试均为对应模块的回归检查；本文件及合成截图仅用于验收 |

GLB 纯校验不依赖 React 或 Three.js。临时文件服务只在服务端；应用层编排导入，场景修改始终走现有 store。扫描参数面板通过 NodeDefinition 挂载，没有在通用 Inspector 新增 ScanNode 类型分支。版本预览复用二维 PlanDrawing，不增加隐藏 Canvas。

本轮增量架构检查：Blocker 0，Suggestion 0，Nit 0。该结论仅覆盖本轮增量；不表示真实设备、公网身份或部署验收完成。PR 继续保持 Draft。

## 手机与电脑分别做什么

1. 电脑打开已保存剧目，进入「置景 → 舞台口令 → 连接手机舞台助手」，生成配对码。配对码失效时点击旁边的「重新生成配对码」。
2. 手机打开同一服务的 HTTPS `/remote-voice`，输入配对码。语音录制后先检查转写文字，再发送；电脑生成方案、校验、预览并确认。停止、取消、撤销沿用本地解析。
3. 扫描在外部扫描应用中完成，导出普通静态 GLB。手机「扫描上传」选择文件，查看进度、取消或等待回执。网页不执行 LiDAR 扫描。
4. 电脑看到待导入文件后点击「确认导入扫描」。完成本机持久写入后双方显示成功；舞台总览选择「场地扫描」可调整位置、朝向、缩放、透明度和可见性。
5. 手机的手动置景、剧本搭台、复台链接打开既有页面。进入剧目仍须正常项目访问权限，配对令牌不授予任意场景 API 权限。
6. 「复台 → 排演版本」填写名称、可选说明并保存；先预览，再「确认恢复此版本」。新记录说明恢复来源；当前场景可撤销恢复。

本地验证入口：`http://127.0.0.1:4323/`、`/remote-voice`。回环地址仅能在该电脑访问。2026-09-11 已通过 Tailscale Serve 的 Tailnet 私有 HTTPS 地址验证页面和配对 API 来源校验；本机使用 `PASCAL_SCENE_API_ORIGINS=https://<tailnet-host>` 明确允许该来源。设备专用域名和本机环境文件没有提交。

## 保存、回滚与清理

- 继续使用完成操作后写入的 IndexedDB 场景事务日志；预览不写正式节点。语音/扫描成功回执等待日志事务完成，不能将内存节点误报为本机已保存。
- 服务器沿用单请求合并队列和指数退避；成功确认才清除对应本机日志。保存失败、离线、配额错误和版本冲突保留未同步操作。
- 扫描先持久存资源，再原子创建节点。创建前切换场景、只读或 store 拒绝时，删除未提交资源；正式节点已创建但日志失败时保留节点和资源，允许重试保存，不清服务器文件来伪装成功。
- 同一导入 UUID 固定对应一个 ScanNode；并发确认合用一个 Promise，重试先检查已有节点及本机持久状态。重复 ACK 不会重新创建节点。
- 临时上传上限：32 MiB/文件、150 万顶点、4 个并发保留文件、128 MiB 总量；同一会话同时保留一个待处理文件。开文件前同步预留容量，防止并发绕过。
- 上传最长 120 秒、文件最长约 10 分钟。导入确认、放弃、取消、撤销会话和过期清理；10 秒清扫器重试 Windows 文件占用造成的暂时删除失败。重启时原会话权限失效，接收新上传前清理孤立临时文件。
- 卸载扫描时释放 GPU 几何、材质、纹理、加载缓存和 blob URL，不删除可被撤销或版本引用的已提交资源。

## 实际执行的验证

在仓库根目录执行，Bun 1.3.14；Windows / Chrome / SwiftShader 的结果不等同于 iPhone/iPad 真机。

| 命令 / 验证 | 结果 |
|---|---|
| `bun run check` | 2188 文件，0 错误；1 条既有非阻断 info：camera-studio/dock.tsx effect 多余依赖 |
| `bun run check-types` | 11/11 任务通过 |
| `bun run test --concurrency=1` | 16/16 任务通过；合计 5122 pass、0 fail、1 既有 skip；Editor 应用 309 pass，editor package 845 pass |
| `bun run build` | 10/10 任务通过，Next.js 生产构建完成 |
| `bun run --cwd packages/mcp build` | 通过；core 构建已包含在根构建中 |
| `bun test --cwd packages/mcp` | 335 pass、0 fail |
| `bun test apps/editor/lib/scene-store-server.test.ts apps/editor/lib/scene-api-security.test.ts` | 9 pass、0 fail |
| `bunx biome check packages/mcp apps/editor/lib/scene-store-server.ts apps/editor/lib/scene-api-security.ts apps/editor/app/api/scenes` | 148 文件通过 |
| 手机指令压力测试 | 2000 条真实本地解析 / 场景 store 指令；重复、乱序、ACK 丢失、恢复与撤销均通过；未确认写入断言为 0 |
| 扫描文件压力测试 | 250 次实际临时文件流式上传：125 次下载后确认、125 次放弃；无文件泄漏，重复请求/ACK 幂等 |
| 上传异常 | 32 MiB 与顶点边界、坏头/截断/长度/摘要、外部资源、并发容量、实际 120 秒超时、取消、撤权和过期清理均通过 |
| 资源导入 | fake-indexeddb + 真实 store/日志/asset-storage；合成 GLB 和 stub fetch，验证摘要失败与注入配额错误不写节点，创建拒绝回滚 asset，单步撤销及幂等 |
| API 集成 | 实际 Next 路由处理器 + 临时文件，验证手机/电脑角色、已保存场景、流式下载和撤权；不是公网身份验收 |
| UI 组件 | 五入口无 Canvas、未保存场景禁配对、GLB-only、共享删除确认以及场景槽/导航回归通过 |
| 配对换码增量（2026-09-11） | 相关 Biome 与 TypeScript 检查通过；Next.js 16.3.0 生产构建通过；生产包包含换码按钮，Tailnet 私有 HTTPS 页面返回 200，跨来源配对请求通过来源校验。完整 Bun 测试由推送后的 CI 复验 |

根测试包含既有阶段数据、单位/台左台右、门窗相邻/歧义、禁止功能、碰撞/越界、全场景校验、预算和隐私检查。测试通过不等于真实模型准确率；本轮未调用付费模型测拒绝率或漏检率。

### 生产浏览器模拟

自动化使用 Playwright 驱动本机 Chrome，生产服务 4323，单独测试数据库、合成场景和 GLB；未用用户录音/剧本/扫描。原始日志、配对码、浏览器配置和数据库没有加入提交。

- 实际 HTTP + 两个浏览器上下文：语音生成预览前 0 次写入；确认后 1 条事务。手机上传后 0 次额外场景写入，电脑确认扫描后增加 1 条事务。保存版本和确认恢复各增加 1 条。
- 阻断场景 PUT 后，共 4 条真实 IndexedDB 事务；通过 `Browser.crash` 强制终止浏览器。重开逐字段比较，4 条有序事务完全一致，扫描资源仍可加载；重连仅一次服务器保存，版本 1→2，随后清空已确认日志。正常流程 0 pageerror。
- 桌面 1440×1000、平板 1024×1366、手机 390×844：均无水平溢出、助手按钮不小于44px；编辑页仅 1 个 Canvas。禁用 navigator.gpu 后真实 WebGL 绘制成功；该回退路径实际 DPR 均为1，未更改场景几何。
- 模拟 visibilitychange：隐藏期间600ms内实际 WebGL draw 调用增量为0，恢复可见后继续绘制。这不是实机锁屏/后台回收测试。
- 故意让一个合成扫描 URL 返回坏文件：扫描专属边界显示错误，版本保存仍成功。R3F 同时报告1次预期注入的加载错误，额外错误0；没有拦截或隐藏它。Viewer 初始化/设备丢失及其他模块隔离另由既有单元测试覆盖。
- 手机视口文件选择和非法类型错误提示通过；真实 iOS「文件」应用、麦克风、锁屏与断网不在此结论内。

浏览器结果与截图：[docs/verification/mobile-stage-assistant](docs/verification/mobile-stage-assistant)。命令驱动脚本在验收机仓库外的 `voice-stage-budget-checks/mobile-{browser,viewports,error-isolation}.cjs`；仓库内模块回归测试可用上方 Bun 命令运行。

## 未实现 / 未实测及已知限制

- **未实测**：iPhone Safari、旧款 iPad、8GB 集显 Windows 真机；真实录音/转写、付费模型与供应商账单；真实 LiDAR 导出、实际弱网、锁屏、后台回收。
- **已配置私有测试通道，真机配对仍待复测**：Tailscale Serve 仅供同一 Tailnet 内设备访问，不是公网部署。已验证 HTTPS 页面和来源校验；修复后的真实 iPhone Safari 换码、配对与录音流程尚未完成复测。`NEXT_PUBLIC_DIASTAGE_REMOTE_URL` 只能填访问地址，不能填密钥。公网拥有者身份和授权连续制景继续禁用，不能称为公网生产就绪。
- **未实现跨设备 asset:// 同步**：已导入扫描文件仅存在导入电脑当前浏览器的 IndexedDB。项目保存同步节点引用，不同步二进制；另一手机/浏览器可查看对象参数和版本，但不会自动取得该扫描模型。清除站点数据会丢本机文件，应保留扫描源 GLB。此次未新增远端永久资源库。
- GLB 当前接受普通静态三角网格和内嵌 PNG/JPEG；单图最大4096像素、最多64张、总计3200万像素。不接受外部 URI、动画、蒙皮、灯光或扩展（含 Draco/Meshopt/KTX2）；扫描应用须用未压缩静态 GLB 导出。低配置预算限制不是完整 glTF 合规认证。
- 会话/上传容量为单服务进程内存状态，多实例共享会话/容量尚未实现。自动过期会话需重新配对；后台降频不会自动延长10分钟会话。
- 版本预览是轻量二维布景与人物初始位置图，不加载扫描网格；版本恢复保留扫描引用，依赖对应本机资源。已有版本越多，项目元数据也会增长，仍受既有场景体积限制约束。
- 本轮没有重新执行此前1000对象30分钟耐久测试；历史报告见 [STABILITY_IMPLEMENTATION.md](STABILITY_IMPLEMENTATION.md)，不把历史结果写成本轮真机验证。站点存储被主动清除、浏览器回收或设备损坏不在恢复保证内。

## 精确文件清单

以下清单相对基线 `6419323`；包含本报告、合成截图和清理后的结果，不含任何原始日志或数据库。

```text
apps/editor/app/api/remote-voice/sessions/[id]/commands/route.ts
apps/editor/app/api/remote-voice/sessions/[id]/scans/[uploadId]/route.ts
apps/editor/app/api/remote-voice/sessions/[id]/scans/route.ts
apps/editor/app/api/remote-voice/sessions/route.ts
apps/editor/app/page.tsx
apps/editor/app/remote-voice/page.tsx
apps/editor/components/scene-loader.tsx
apps/editor/components/stage-entry/command-input.tsx
apps/editor/components/stage-entry/manual-entry.tsx
apps/editor/components/stage-entry/manual-stage-panel.tsx
apps/editor/components/stage-entry/mobile-assistant.test.tsx
apps/editor/components/stage-entry/phone-voice-link.tsx
apps/editor/components/stage-entry/remote-voice-controller.tsx
apps/editor/components/stage-entry/scan-transfer.tsx
apps/editor/components/stage-entry/script-entry.tsx
apps/editor/components/stage-entry/script-input.tsx
apps/editor/components/stage-entry/stage-entry.css
apps/editor/components/stage-entry/voice-entry.tsx
apps/editor/components/studio-navigation.test.tsx
apps/editor/components/studio-sidebar.tsx
apps/editor/components/theatre/theatre.css
apps/editor/components/theatre/versions-panel.tsx
apps/editor/lib/ai/config.ts
apps/editor/lib/remote-voice/api.ts
apps/editor/lib/remote-voice/client.ts
apps/editor/lib/remote-voice/command-stress.test.ts
apps/editor/lib/remote-voice/scan-api.test.ts
apps/editor/lib/remote-voice/scan-glb.test.ts
apps/editor/lib/remote-voice/scan-glb.ts
apps/editor/lib/remote-voice/scan-import.test.ts
apps/editor/lib/remote-voice/scan-import.ts
apps/editor/lib/remote-voice/scan-store.test.ts
apps/editor/lib/remote-voice/scan-store.ts
apps/editor/lib/remote-voice/scan-test-fixtures.ts
apps/editor/lib/remote-voice/session-store.test.ts
apps/editor/lib/remote-voice/session-store.ts
apps/editor/lib/scene-api-security.ts
apps/editor/lib/scene-journal.ts
apps/editor/lib/stage/command-executor.ts
apps/editor/lib/theatre/simplified-rehearsal.test.ts
apps/editor/package.json
bun.lock
docs/verification/mobile-stage-assistant/mobile-assistant-phone.png
docs/verification/mobile-stage-assistant/mobile-browser-result.json
docs/verification/mobile-stage-assistant/mobile-error-isolation-result.json
docs/verification/mobile-stage-assistant/mobile-home-desktop.png
docs/verification/mobile-stage-assistant/mobile-manual-phone.png
docs/verification/mobile-stage-assistant/mobile-remount-tablet.png
docs/verification/mobile-stage-assistant/mobile-script-phone.png
docs/verification/mobile-stage-assistant/mobile-viewports-result.json
MOBILE_STAGE_ASSISTANT.md
packages/core/src/index.ts
packages/core/src/lib/asset-storage.test.ts
packages/core/src/lib/asset-storage.ts
packages/editor/src/components/editor/index.tsx
packages/editor/src/components/editor/node-action-menu.test.tsx
packages/editor/src/components/editor/node-action-menu.tsx
packages/editor/src/components/ui/panels/parametric-inspector.tsx
packages/editor/src/components/ui/panels/reference-panel.tsx
packages/editor/src/index.tsx
packages/editor/src/lib/theatre-parametrics.ts
packages/editor/src/lib/theatre-presentation.ts
packages/nodes/src/scan/definition.ts
packages/nodes/src/scan/panel.tsx
packages/nodes/src/scan/parametrics.ts
packages/nodes/src/scan/renderer.tsx
packages/viewer/src/components/viewer/frame-limiter.tsx
packages/viewer/src/hooks/use-gltf-ktx2.tsx
```
