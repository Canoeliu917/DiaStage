# 阶段 B 最终验证

检查日期：2026-09-10，Asia/Shanghai。分支 `codex/camera-studio`，基线 `fc302d0d5e21ddb3b33b2d2bb54beca5f6fc325d`。本次只验证本地修改，未提交、推送或创建 PR。

最终实现包含阶段 A 产品入口重组、阶段 B 最小排演闭环、保存请求与 HMR 重新装载的竞态修复，以及最后实测发现的观察视角切换、窄画布构图和旧插件读取兼容问题。阶段 A 中途记录的应用类型错误已在本检查点修复。此前 `phase-b-types-final` / `phase-b-related-tests-final` / `phase-b-build` 是较早检查点，最终冻结结果以 **`phase-b-final-*`** 为准。

## 结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 全仓 TypeScript | 8 个 composite 包与共享 editor、UI、CLI scripts、两个应用均通过 | [phase-b-types.log](phase-b-types.log) |
| 最终共享 editor / 应用类型复查 | 两项退出 0；01:40:34–01:40:41 | [phase-b-final-types.log](phase-b-final-types.log) |
| 本次相关测试 | **1375 通过，0 失败**，214 文件、14416 次断言；01:40:34–01:40:50 | [phase-b-final-tests.log](phase-b-final-tests.log) |
| 插件兼容测试的最终清理补充 | **3 通过，0 失败**；补充 teardown 恢复原注册表后单独复验 | [phase-b-final-plugin-tests.log](phase-b-final-plugin-tests.log) |
| 扩展到全部包的测试检查点 | **5008 通过，1 跳过，3 失败**，583 文件；三项为未修改 CLI 的 Windows 限制，详见下文；最后小修已由上方相关测试覆盖 | [phase-b-tests-native.log](phase-b-tests-native.log) |
| 修改源码 lint | 79 文件，0 错误、7 warning、2 info，退出 0 | [phase-b-final-lint.log](phase-b-final-lint.log) |
| editor 生产构建 | **6/6 任务成功**，退出 0，Turbo 任务时间 13.549 秒；01:41:15 开始，01:41:51 结束，覆盖最终冻结源码 | [phase-b-final-build.log](phase-b-final-build.log) |
| 文档与源码空白检查 | `git diff --check` 退出 0 | [phase-b-diff-check.log](phase-b-diff-check.log) |

生产构建输出仍显示 `Skipping validation of types`，因此上表的独立 TypeScript 检查是必要验证，不能由构建成功代替。Turbopack 留下一项原有 SQLite 动态数据路径导致全项目文件追踪的警告；未用忽略注释或配置掩盖。

## 命令与范围

```text
node node_modules/typescript/bin/tsc --build packages/capture-protocol packages/core packages/viewer packages/nodes packages/mcp packages/capture-viewer packages/ifc-converter packages/cli

tsgo --noEmit -p packages/editor/tsconfig.json
tsgo --noEmit -p packages/ui/tsconfig.json
tsgo --noEmit -p packages/cli/tsconfig.scripts.json
tsgo --noEmit -p apps/editor/tsconfig.json
tsgo --noEmit -p apps/ifc-converter/tsconfig.json

bun test apps/editor/lib apps/editor/components packages/editor/src packages/mcp/src packages/core/src/remount scripts/theatre-product-copy.test.ts

bun test packages/core/src packages/viewer/src packages/editor/src packages/nodes/src packages/mcp/src packages/capture-protocol/src packages/capture-viewer/src packages/ifc-converter/tests packages/cli/src apps/editor/lib apps/editor/components scripts

bun x turbo run build --filter=editor --env-mode=loose
```

Bun 为已安装的 1.3.14。最终验证进程 PATH 直接前置 `C:/Users/25101/AppData/Local/npm-cache/_npx/60c3515df86f25b1/node_modules/bun/bin`，未修改项目环境配置。

lint 沿用仓库规则，使用仓库外临时配置将原来被排除的 `components/ui` 纳入本次修改文件检查。保留的 6 项 `!important` 用于窄屏覆盖已有宿主布局；另有原有 ItemCatalog 未使用 import，以及材质面板、插件异步注册 effect 的依赖提示。没有通过改规则关闭这些提醒。[检查文件列表](phase-b-checked-sources.txt)记录了覆盖范围。

## 全量测试的三项 Windows 失败

1. `packages/cli/src/diagnostics.test.ts:30` 要求新建目录的 POSIX mode 权限低 6 位为零；Windows 返回 `54`。这是平台不适用的权限断言，本轮未修改该文件。
2. `packages/cli/src/runtime.test.ts` 的“仅强制停止记录中的 editor 命令”失败。
3. 同文件的“manifest 损坏时强制停止记录中的 editor”失败。

后两项的明确原因是 `packages/cli/src/editor-process.ts:692` 和 `:707` 在 `win32` 下直接返回 `false`，现有运行时不支持该操作系统的强制命令身份匹配。保护逻辑拒绝停止测试子进程，随后临时目录清理得到 `EBUSY`。已确认这些测试和实现文件相对基线无差异；没有修改平台保护逻辑、跳过用例或放宽断言来制造全通过。

两轮全量测试遗留的进程均依据日志中的隔离临时目录精确定位并停止；没有停止用户的开发服务。[清理记录](phase-b-test-process-cleanup.log)。

初次全量运行还有一个 jitless 测试失败，根因是 npm `bun.cmd` 包装器使 `Bun.spawnSync(['bun', '-e', source])` 返回帮助文本而非 JSON。直接使用原生 `bun.exe` 后该用例及最终全量运行均通过，无需修改源码。[诊断](phase-b-jitless-diagnostic.log)、[原生运行结果](phase-b-jitless-native.log)。

## 本次关键回归覆盖

- 舞台模板、旧场景无损读取、自有地面真实尺寸同步与一次撤销。
- 人物走位、朝向、停顿、道具持有与交接、行动及节拍校验。
- 新范例的独立节点、按场次可见性、旧布景保留、可恢复排演版本。
- 单选与多选专业属性隔离、资源分类与默认产品文案。
- Edit、Capture、第一人称与观察录制的独占保护。
- 实际 hooks 回归：保存中新增修改不会误清脏状态，同源 HMR 不重新覆盖用户场景，SceneLoader 不重置保存基线。
- 观众画面按实时 FOV 与画布比例包含全部舞台角点；二维转三维时取消旧观察插值后应用新视角。
- 无 `installedPlugins` 字段的旧图按实际节点推导必要插件，支持异步注册；显式空数组保持原意，插件入口仍不开放。

本轮属于 A/B 最小闭环，不能据此声称完整提示本、摄影机缓存统一、离线演出包、AI 口令或完整剧场几何均已实现。不同场地类型具有类型记录、真实尺寸参考和观众方位标识；完整观众席和剧场设施不在本轮。

[修改和新增文件清单](phase-b-changed-files.md)。浏览器桌面、平板、手机验收截图由主任务在最终页面实测后单独提供，本日志不将单元测试冒充浏览器验收。
