# 阶段 A 验证检查点

检查窗口：2026-09-10 00:54–00:58（Asia/Shanghai）。分支 `codex/camera-studio`，基础提交 `fc302d0d5e21ddb3b33b2d2bb54beca5f6fc325d`。

本记录用于阶段 A“产品归位”的中途验证。检查时工作树已经包含并持续加入阶段 B 的领域数据、人物面板与运行系统；它不是隔离提交，也不是阶段 B 或全规格完成声明。未启动开发服务、提交或推送。

## 命令与实际结果

| 检查 | 命令 | 实际结果与日志 |
| --- | --- | --- |
| 核心与运行包类型/构建 | `node node_modules/typescript/bin/tsc --build packages/core packages/viewer packages/mcp` | 00:55:22 前退出 0，见 [phase-a-types.log](phase-a-types.log) |
| 共享编辑器类型 | `tsgo --noEmit -p packages/editor/tsconfig.json` | 初次退出 0；此后新增参数适配代码，须再次检查，见下方未解决项 |
| 应用类型 | `tsgo --noEmit -p apps/editor/tsconfig.json` | 首次遇到编辑中的 JSX；修复后仍有 5 项类型错误，见 [phase-a-types-recheck.log](phase-a-types-recheck.log) |
| 应用、复台、产品语义 | `bun test apps/editor/lib apps/editor/components packages/core/src/remount scripts/theatre-product-copy.test.ts` | 首次 162 通过 / 3 失败；更新旧文案断言后 **165 通过 / 0 失败**，见 [phase-a-app-tests-recheck.log](phase-a-app-tests-recheck.log) |
| 共享编辑器测试 | `bun test packages/editor/src` | **839 通过 / 0 失败**，见 [phase-a-shared-tests.log](phase-a-shared-tests.log) |
| MCP 全包测试 | `bun test packages/mcp/src` | **343 通过 / 0 失败**，见 [phase-a-mcp-tests.log](phase-a-mcp-tests.log) |
| editor 生产构建 | `bun x turbo run build --filter=editor --env-mode=loose` | **6/6 任务成功，退出 0，29.173 秒**，见 [phase-a-build.log](phase-a-build.log) |

Bun 使用已安装的 1.3.14，验证进程 PATH 前置 `C:/Users/25101/AppData/Local/npm-cache/_npx/60c3515df86f25b1/node_modules/.bin`，保证 Turbo 子进程能找到 Bun。未更改项目配置或环境文件。

## 测试修复范围

- `apps/editor/components/stage-overview-data.test.ts`：保留原场景 fixture 的“楼层 2”、原注册表“三维扫描”，仅期待适配层显示“表演层 1”“场地参考”；显式确认节点与注册表未被改写。
- `apps/editor/components/camera-studio/panel.test.ts`：确认旧分层显示入口已移除且显示状态未被擅自更改；“景片显示”仍验证原半透明操作。机位、关键帧、录制保护和镜头桥接断言保留。
- `apps/editor/components/studio-navigation.test.tsx`：确认默认置景/人物入口、停止录像和排演播放、历史镜头显式进入、手机概览及第一人称/Capture 独占边界。

## 当时未解决项

00:58:31 的应用类型检查发现：

1. `theatre/panel.tsx` 的演员/导演观察模式尚未同步进入 state 联合类型。
2. `theatre/runtime.tsx` 使用了不存在的 `FloorplanRenderContextValue.scale`。
3. `parametric-inspector.tsx` 的节点回写联合类型不匹配。
4. `theatre-parametrics.ts` 的 number/vec3 字段不符合当前泛型 ParamField。

以上已报告主线程与负责实现的代理。此前构建通过发生在这些文件继续编辑之前；且项目生产构建不是独立类型检查的替代。必须以修复后的最终类型、测试与构建检查点验收。

构建还有既有 SQLite 动态数据路径触发 Turbopack 全项目文件追踪警告。本轮未以忽略注释或更改配置掩盖它。

桌面、平板、手机截图由主线程在界面稳定后提供，本检查点没有伪造截图或浏览器通过结论。阶段 C–F 不在本次记录的完成范围。
