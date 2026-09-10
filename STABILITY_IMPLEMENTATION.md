# DiaStage 稳定性实施与验收

2026-09-10。工作分支 `codex/mobile-voice-stage-link`，草稿 PR #1。没有修改 main、合并或部署；原 `camera-studio` 工作区及用户场景数据库未改动。已删除的灯光、家装和建筑操作入口保持关闭。

## P0：保存与便携版

- 修复根 CI 实际报告的 Biome 格式和导入排序问题。
- PDF 仅提取文字：取消原生 Canvas 的显式追踪，便携打包再次删除 Canvas/Sharp 原生后端，并逐文件检查 `.node`。保留 PDF 文字引擎、CMap、标准字体和许可证；移除 PDF 画面查看器、源映射和未使用的绘制文件。Windows 将 Next 的目录链接复制为文件，CLI 使用数字回环地址，避免系统无法解析 `pascal.localhost`。
- 便携冒烟读取真正的中文 PDF，检查只读戏剧 MCP，再通过场景 API 保存及恢复项目；没有重新开放 MCP 的旧建筑修改工具。
- 当前保留原有素材、中文字库和剧本文档依赖，包为 **166.8 MiB 压缩 / 220.5 MiB 解压 / 4857 文件**。原 Pascal 的 105/160 MiB、4000 文件门槛已不足以包含这些现有内容，调整为明确的 DiaStage 门槛 **170/235 MiB、5000 文件**。未删除旧项目需要的素材来通过检查。清理前为 178.8/276.6 MiB、5587 文件。
- 自动保存订阅 scene commit 和撤销/重做边界，不再在每次 store 通知时序列化全部节点。拖拽预览保持在 live overrides，完成时才持久化。
- IndexedDB `diastage-scene-journal` 保存一个检查点及有序增量事务。`durability: strict` 的读写事务完成后才显示“本机已保存”。记录包含增改、删除和场景文档字段；重新打开先恢复未同步修改。
- 本机提交依次执行；网络使用一个请求槽，合并最新快照，延迟 1 秒，失败指数退避至最多 30 秒。服务器确认后才清除对应序号，较新的事务保留。响应丢失时比较服务器快照，防止重复应用。
- 退出不发送完整场景 PUT。最新操作尚未写入本机时提供离开提示；写入失败、配额不足和版本冲突均保留既有日志。冲突暂停同步，提供本机版本导出；不同标签页的陈旧写入被拒绝。

## P1：固定低开销默认值

- 新用户默认稳定模式：桌面 30 FPS / DPR 1.25；粗指针 24 FPS / DPR 1；后期与阴影关闭。选择可保存在本机，旧场景数值不变。
- 独立机位监看默认关闭；开启后 320×180、最多 4 FPS，按场景节点/材质/注册版本或机位姿态变化刷新，等待几何更新完成。
- 默认录像 1280×720、24 FPS、4 Mbps；1080p 放在高级设置。手机隐藏 PNG 序列入口。
- 舞台总览只订阅镜头项目及必要状态，不随镜头时间推进更新整表。ScanReference 未变化的帧不再遍历模型层级。
- 注册系统按场景实际节点类型挂载；旧屋顶、天花板和楼梯编辑器惰性加载，继续兼容旧数据。
- Viewer、监看、录像、复台预览各自隔离；帧回调错误转交所属 React 边界，异步监看与录像错误各自结束并释放资源。保存系统仍在 Canvas 之外。

## 可重复检查

```sh
bun run check
bun run check-types
bun run test
PASCAL_PORTABLE_BUILD=1 bun run build
cd packages/cli
bun run build
bun run stage-runtime
bun run smoke-runtime
```

PowerShell 中先设置 `$env:PASCAL_PORTABLE_BUILD='1'`，再运行构建。Editor 测试命令现为 `bun test lib components`，把原本漏跑的组件回归纳入 CI。

| 检查 | 本轮结果 |
| --- | --- |
| 根 Biome | 0 错误；1 条原有的 effect 依赖信息提示，保留项目切换时清理录像的行为 |
| TypeScript | 11 项任务通过 |
| 根测试 | 16 项任务通过；Editor 应用 292 项通过，包含全部 70 项组件测试 |
| 生产构建 | 10 项任务通过 |
| 便携包实际安装/启动/中文 PDF/只读 MCP/场景保存恢复 | Windows 本地通过；GitHub macOS cli-smoke 通过 |
| 拖拽事务边界 | 100 次 live override 更新无本机及网络保存；完成时各一次 |
| 浏览器强制终止及恢复 | 离线 100 次操作，各序号 1–100；`Browser.crash` 后用同一持久配置重开，完整恢复；重连仅一次服务器写入，版本 1→2 |
| 原生 IndexedDB 故障检查 | 部分确认保留后续事务、陈旧窗口拒绝、冲突保留、丢失确认幂等处理通过；QuotaExceededError 为明确注入，非实际填满磁盘 |
| 1000 布景对象持续操作 | 30 分 6.5 秒、572 次操作、572 次串行同步、最大并发 1、0 pageerror；全部 1000 对象位置和体块拓扑保留 |
| 桌面/平板/手机视口 | Chrome 模拟通过；实际 Canvas DPR 分别 1.25/1/1，稳定模式默认开启，0 pageerror |
| GitHub 检查 | 实现提交 `24812a6` 的 CI（quality、cli-smoke）和 mcp-ci 全部成功；最新提交状态以 PR 检查栏为准 |

浏览器验证使用独立临时数据库，未操作用户项目。30 分钟测试运行在 Windows 无头 Chrome + SwiftShader，测试操作为舞台总览中的显示/隐藏切换；它不等同于所有编辑手势的持续压测。拖拽边界通过真实 store 的集成测试另行验证，未声称完成 30 分钟连续物理鼠标拖拽。

## 证据与限制

- `docs/verification/stability/` 保存浏览器原始结果、恢复截图、30 分钟结束截图和三个视口截图。
- 本机验证站点：`http://127.0.0.1:4322/scene/be3c3c1e8762?workspace=set`。它是隔离的临时测试项目，不是部署地址；原 4318 服务保持不变。
- **未实测：iPhone Safari 实机、旧款 iPad、8GB 集成显卡 Windows 电脑。**模拟尺寸、粗指针和软件渲染不替代真机帧率、内存、热量、后台回收和录制兼容性测试。
- 浏览器强制终止恢复已实测；操作系统断电、存储介质故障、用户清除站点数据和浏览器回收存储未实测，不能将一次测试外推为所有设备上的绝对恢复保证。
- 降画质只影响 Viewer/输出参数。坐标、米/厘米换算、碰撞、舞台左右和复台计算继续使用原有纯数据实现及回归测试。
- 没有运行真实录音、付费模型 API 或供应商计费验证，沿用此前本机授权及预算限制。

## 修改文件

下面清单相对于本轮开始的 `2e988a3`；包括 CI 必需格式修正。

~~~text
apps/editor/components/build-tab.tsx
apps/editor/components/camera-rehearsal-panel.tsx
apps/editor/components/camera-rehearsal-system.test.ts
apps/editor/components/camera-rehearsal-system.tsx
apps/editor/components/camera-studio/camera-monitor.tsx
apps/editor/components/camera-studio/camera-stage-runtime.test.tsx
apps/editor/components/camera-studio/camera-stage-system.tsx
apps/editor/components/camera-studio/dock.tsx
apps/editor/components/camera-studio/panel.test.ts
apps/editor/components/camera-studio/recording.test.ts
apps/editor/components/camera-studio/recording.ts
apps/editor/components/camera-studio/runtime.test.ts
apps/editor/components/camera-studio/runtime.tsx
apps/editor/components/camera-studio/store.ts
apps/editor/components/remount-preview-system.test.tsx
apps/editor/components/remount-preview-system.tsx
apps/editor/components/scene-loader.test.tsx
apps/editor/components/scene-loader.tsx
apps/editor/components/stage-overview-panel.test.tsx
apps/editor/components/stage-overview-panel.tsx
apps/editor/components/studio-sidebar.tsx
apps/editor/lib/ai/usage-ledger.ts
apps/editor/lib/build-presets.ts
apps/editor/lib/camera-director.test.ts
apps/editor/lib/camera-director.ts
apps/editor/lib/scene-journal.test.ts
apps/editor/lib/scene-journal.ts
apps/editor/next.config.ts
apps/editor/package.json
packages/cli/scripts/smoke-packed-runtime.ts
packages/cli/scripts/stage-runtime.ts
packages/cli/src/diagnostics.test.ts
packages/cli/src/editor-process.ts
packages/cli/src/runtime.test.ts
packages/editor/src/components/editor/index.tsx
packages/editor/src/components/viewer/viewer-scene-header.tsx
packages/editor/src/hooks/use-auto-save-history-integration.test.ts
packages/editor/src/hooks/use-auto-save-integration.test.ts
packages/editor/src/hooks/use-auto-save.ts
packages/editor/src/index.tsx
packages/editor/src/lib/scene-save-queue.ts
packages/editor/src/lib/scene.ts
packages/editor/src/lib/theatre-parametrics.test.ts
packages/editor/src/lib/theatre-parametrics.ts
packages/editor/src/lib/theatre-presentation.test.ts
packages/editor/src/lib/theatre-presentation.ts
packages/mcp/src/index.test.ts
packages/viewer/src/components/viewer/frame-limiter.tsx
packages/viewer/src/components/viewer/index.tsx
packages/viewer/src/components/viewer/registered-systems.tsx
packages/viewer/src/components/viewer/render-environment.test.ts
packages/viewer/src/components/viewer/render-environment.tsx
packages/viewer/src/components/viewer/renderer-recovery.test.tsx
packages/viewer/src/hooks/use-isolated-frame.test.ts
packages/viewer/src/hooks/use-isolated-frame.ts
packages/viewer/src/index.ts
STABILITY_IMPLEMENTATION.md
docs/verification/stability/*
~~~

