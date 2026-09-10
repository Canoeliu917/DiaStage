# 舞台台阶与旧建筑资料兼容

2026-09-10，`codex/mobile-voice-stage-link`，草稿 PR #1。替换 P1 原有的建筑系统惰性挂载方案；沿用此前 P0/P1 的本机事务、同步队列和稳定模式。

## 实际修改

- 移除 CeilingSystem、CeilingSelectionAffordanceSystem、RoofEditSystem、RoofSystem 的运行逻辑，以及 StairOpeningSystem、楼板/天花板自动开洞和层高联动。取消空间检测产生建筑楼板、天花板的运行挂载。
- 屋顶、天花板和附属件不再注册渲染器、工具、参数面板或目录入口；删除对应编辑面板、快捷命令和建筑 MCP 工具。旧基础几何函数、schema 和历史素材仍用于读取兼容资料，不作为产品功能呈现。
- 新建的是独立、实心、无栏杆的“舞台台阶”。默认三级，总宽 1.2 米，每级高 0.15 米、深 0.3 米。保留 native StairEditSystem 和基础几何，参数仅有总宽、步高、步深、级数、位置及朝向。总览只显示一个台阶对象，不暴露内部段。
- 保留整体移动、旋转、复制、删除、碰撞/越界校验、完成时保存、单次撤销及 1:1 复台。原生模型工具与舞台库/口令使用同一台阶数据对象。平面图显示全部踏步，取消建筑剖切线和跨层显示。
- “在台右增加三级台阶”“把台阶移到平台前方”通过确定性口令解析与现有预览确认流程执行；没有用模型猜测尺寸或坐标。

## 数据边界

纯 TypeScript 的 `core/stage/stage-stairs.ts` 负责参数、尺寸与节点变更；`nodes/stair` 负责几何、原生交互和参数面板；应用 command executor 统一验证，保存仍经过 scene store、IndexedDB 日志与原服务器版本机制。复台只变换父节点，不缩放实体踏步。

加载旧场景前，把原始 roof/ceiling 及其子节点保存在场地根节点的 `metadata.legacy.architecture`；同时保留父子关系、集合和根列表。未知原始字段不丢失，不改输入数据，重复迁移幂等。第一次打开不触发保存；后续用户编辑才把兼容归档随场景事务持久化。无法安全挂载归档时拒绝该迁移，原始数据不被覆盖。

旧复杂台阶保留原形，支持整体操作；不会静默改造成三级踏步。其面板仅允许位置和朝向，调整踏步尺寸时添加新的舞台台阶。

## 操作

1. 进入“置景 → 舞台库 → 平台与台阶”，添加舞台台阶；也可使用“布景调整”中的原生台阶工具。
2. 选中台阶，展开右侧“舞台台阶”面板，填写参数后点击“应用台阶参数”。
3. 使用移动、复制、删除按钮，或舞台中的移动/旋转手柄；越界或碰撞由同一空间校验拒绝。
4. 等待“本机已保存”；联网后变为“已同步”。撤销一次可恢复整次参数修改。
5. 进入“复台”，把台阶作为整体选择，校准并预览；确认后位置、朝向变化，踏步尺寸与级数保持原值。

## 验证

- 根 Biome：0 错误，1 条原有信息提示。TypeScript：11 项任务通过。
- 根测试：16 项任务通过，Editor 应用 297 项通过。覆盖旧节点无损归档、没有 parentId 的子节点、重复加载、日志恢复、一次撤销、原生台阶碰撞和非法数值拦截、复台保尺寸、两条中文口令。
- 生产构建：10 项任务通过。
- 独立数据库 + 持久 Chrome：打开含旧 roof/ceiling 的项目不发 PUT；离线把台阶从三级改为四级，产生一条真实 IndexedDB 事务；显示“本机已保存”后 `Browser.crash` 强制终止，重开恢复四级及同一日志；重连后版本 1→2，原始归档逐字段相等，0 pageerror。
- 桌面、平板、手机视口：稳定模式默认开启，Canvas DPR 1.25/1/1，0 pageerror。桌面另校验参数面板宽度不超过 320px。
- 便携包新增防递归复制：Windows 的依赖追踪会沿 workspace 链接读到上次 CLI 产物；在复制入口排除 CLI 自身目录，冒烟检查拒绝套娃产物。包体门槛保持 170/235 MiB、5000 文件。实际便携包安装、启动、中文 PDF、只读 MCP 和场景保存/恢复全部通过：166.7 MiB 压缩 / 220.4 MiB 解压 / 4817 文件。

命令和此前 100 次离线操作、1000 对象 30 分钟检查的范围见 [稳定性记录](STABILITY_IMPLEMENTATION.md)。本轮截图与原始结果见 [验证目录](docs/verification/stage-steps/)。这些是实际浏览器与 store 测试，场景是专门生成的验收数据。

**未实测：iPhone Safari、旧款 iPad、8GB 集显 Windows 真机，以及真实录音、付费模型 API。**模拟视口不替代实机，浏览器崩溃恢复不等于断电、用户清空站点存储后仍可恢复。本轮没有再跑一次 30 分钟耐久测试；此前结果及局限保留在稳定性记录中。

本机新版：<http://127.0.0.1:4323/scene/1abf1f6afafc?workspace=set>。这是隔离验收项目。4318 仍指向原 `camera-studio` 工作区；其用户修改和数据库未覆盖。未修改 main、合并或部署。

## 修改文件

完整清单相对于 `4caa277`，附于下方。

~~~text
apps/editor/components/build-tab.tsx
apps/editor/components/stage-overview-data.test.ts
apps/editor/components/stage-overview-data.ts
apps/editor/lib/build-presets.test.ts
apps/editor/lib/build-presets.ts
apps/editor/lib/remount-scene.test.ts
apps/editor/lib/remount-scene.ts
apps/editor/lib/scene-journal.test.ts
apps/editor/lib/stage/command-executor.test.ts
apps/editor/lib/stage/command-executor.ts
apps/editor/lib/stage/context.ts
apps/editor/lib/stage/labels.ts
apps/editor/lib/stage/scenery.test.ts
apps/editor/lib/stage/scenery.ts
packages/cli/scripts/smoke-packed-runtime.ts
packages/cli/scripts/stage-runtime.ts
packages/core/package.json
packages/core/src/hooks/spatial-grid/spatial-grid-sync.test.ts
packages/core/src/hooks/spatial-grid/spatial-grid-sync.ts
packages/core/src/index.ts
packages/core/src/schema/nodes/stair.ts
packages/core/src/stage/index.ts
packages/core/src/stage/parser.ts
packages/core/src/stage/plan.ts
packages/core/src/stage/schema.ts
packages/core/src/stage/stage-stairs.test.ts
packages/core/src/stage/stage-stairs.ts
packages/core/src/systems/stair/stair-opening-preview.test.ts
packages/core/src/systems/stair/stair-opening-preview.ts
packages/core/src/systems/stair/stair-opening-sync.test.ts
packages/core/src/systems/stair/stair-opening-sync.ts
packages/core/src/systems/stair/stair-opening-system.tsx
packages/core/src/systems/stair/stair-rise.test.ts
packages/core/src/systems/stair/stair-rise.ts
packages/core/src/utils/archive-architecture.test.ts
packages/core/src/utils/archive-architecture.ts
packages/core/src/utils/scene-migrations.ts
packages/editor/src/components/editor/index.tsx
packages/editor/src/components/systems/ceiling/ceiling-selection-affordance-system.tsx
packages/editor/src/components/systems/ceiling/ceiling-system.tsx
packages/editor/src/components/systems/roof/roof-edit-system.tsx
packages/editor/src/components/tools/stair/stair-defaults.ts
packages/editor/src/components/tools/stair/stair-tool.tsx
packages/editor/src/components/tools/tool-manager.tsx
packages/editor/src/components/ui/command-palette/editor-commands.tsx
packages/editor/src/components/ui/panels/selection-breakdown.test.ts
packages/editor/src/components/ui/sidebar/panels/site-panel/ceiling-tree-node.tsx
packages/editor/src/components/ui/sidebar/panels/site-panel/roof-tree-node.tsx
packages/editor/src/components/ui/sidebar/panels/site-panel/tree-node.tsx
packages/editor/src/index.tsx
packages/editor/src/lib/fresh-planar-placement.ts
packages/editor/src/lib/scene.ts
packages/editor/src/lib/stair-levels.test.ts
packages/editor/src/lib/stair-levels.ts
packages/editor/src/lib/theatre-parametrics.test.ts
packages/editor/src/lib/theatre-parametrics.ts
packages/editor/src/lib/theatre-presentation.ts
packages/mcp/src/prompts/from-brief.ts
packages/mcp/src/prompts/prompts.test.ts
packages/mcp/src/prompts/scene-guidance.ts
packages/mcp/src/resources/agent-guide.ts
packages/mcp/src/tools/apply-patch.test.ts
packages/mcp/src/tools/apply-patch.ts
packages/mcp/src/tools/construction-tools.test.ts
packages/mcp/src/tools/construction-tools.ts
packages/mcp/src/tools/index.ts
packages/mcp/src/tools/live-sync.ts
packages/mcp/src/tools/room-tools.test.ts
packages/mcp/src/tools/room-tools.ts
packages/mcp/src/tools/scene-query.test.ts
packages/mcp/src/tools/scene-query.ts
packages/nodes/src/archived-architecture.ts
packages/nodes/src/ceiling/definition.ts
packages/nodes/src/ceiling/panel.tsx
packages/nodes/src/ceiling/parametrics.ts
packages/nodes/src/ceiling/system.tsx
packages/nodes/src/index.ts
packages/nodes/src/measurement/resolve.test.ts
packages/nodes/src/roof-segment/definition.test.ts
packages/nodes/src/roof-segment/definition.ts
packages/nodes/src/roof-segment/panel.tsx
packages/nodes/src/roof-segment/parametrics.ts
packages/nodes/src/roof/definition.test.ts
packages/nodes/src/roof/definition.ts
packages/nodes/src/roof/index.ts
packages/nodes/src/roof/panel.tsx
packages/nodes/src/roof/parametrics.ts
packages/nodes/src/roof/system.tsx
packages/nodes/src/shared/polygon-vertex-affordance.test.ts
packages/nodes/src/slab/__tests__/definition.test.ts
packages/nodes/src/slab/definition.ts
packages/nodes/src/stair-segment/definition.ts
packages/nodes/src/stair-segment/panel.tsx
packages/nodes/src/stair-segment/parametrics.ts
packages/nodes/src/stair/definition.ts
packages/nodes/src/stair/destination.test.ts
packages/nodes/src/stair/destination.ts
packages/nodes/src/stair/documentation.test.ts
packages/nodes/src/stair/documentation.ts
packages/nodes/src/stair/floorplan-affordances.ts
packages/nodes/src/stair/floorplan.test.ts
packages/nodes/src/stair/floorplan.ts
packages/nodes/src/stair/move-tool.tsx
packages/nodes/src/stair/panel.tsx
packages/viewer/src/components/viewer/index.tsx
packages/viewer/src/components/viewer/renderer-recovery.test.tsx
packages/viewer/src/index.ts
packages/viewer/src/systems/ceiling/ceiling-system.tsx
packages/viewer/src/systems/roof/roof-system.tsx
STABILITY_IMPLEMENTATION.md
STAGE_STEPS_IMPLEMENTATION.md
docs/verification/stage-steps/*
~~~

