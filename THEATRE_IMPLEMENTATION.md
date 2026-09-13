# 咫台 DiaStage · 阶段 A / B 交付记录

日期：2026-09-10。目标仓库：`Canoeliu917/DiaStage`。本地分支：`codex/camera-studio`；审计基线：`fc302d0d5e21ddb3b33b2d2bb54beca5f6fc325d`。

本报告记录本次落地的代码、最终检查与浏览器验收证据。范围是阶段 A「产品归位」和阶段 B「最小戏剧排演闭环」，不是整份规格 A–F 的完成声明。最终相关测试 1375 项通过，独立类型检查无错误，生产构建 6/6 成功；全仓检查仍有下文明确列出的 3 项既有 Windows CLI 失败。

本地验收：[打开《空桌》验收剧目](http://127.0.0.1:4318/scene/bd08682cadac?disable=postFx)。使用独立验收场景，没有重写原有用户场景。`disable=postFx` 沿用本机渲染排查配置，不代表启用了照片级输出。

## 阶段 A · 产品归位

### 1. 改变的戏剧工作流

一级工作区改为「置景 / 排演 / 复台」。进入排演默认打开「人物与行动」，先确定人物目标与行动，再选择观察方式。摄影机资料位于「观察与记录」的高级入口。网站名称保留「咫台 DiaStage」，副标题改为「戏剧排演与舞台复现 / Theatre Rehearsal & Stage Previs」。

置景按「演出空间 / 布景 / 家具 / 道具 / 标记与测量」组织。共享舞台概览仍可查看当前场地对象；保留既有黑白灰视觉、品牌词连续显示和左右工作区的使用方式。

### 2. 删除或隐藏的入口

从主界面、命令面板、资源搜索、参数编辑入口及默认新建流程隔离住宅分类、屋面附件、机电管线、厨房橱柜、地形道路、建筑生成预设及产品插件入口。资源分类、搜索候选和可调用工具共同收敛，避免只更换标题后仍能从搜索或快捷键进入旧工作流。

底层 `block / wall / door / window / stair` 经适配层呈现为台块、景片、实用门窗、台阶；旧数据类型继续可读。默认 MCP 配置仅保留读取与结构化导出，旧修改工具不作为本阶段戏剧口令使用。

### 3. 新增实体与操作

本阶段新增戏剧资源分类与属性呈现规则、工作区默认入口，以及真正生成 8 × 6 米舞台图的新建剧目流程。共享属性面板、工具提示、吸附说明和命令名称使用一致的舞台语汇。

### 4. 修改文件

主要落点为 `studio-navigation.tsx`、`studio-sidebar.tsx`、`build-tab.tsx`、首页/项目库、`packages/editor` 的资源库、快捷键、命令面板、属性适配层，以及产品文档和语义回归脚本。完整路径见末尾清单。

### 5. 数据迁移与兼容

未批量替换已有节点名称、类型或 ID。旧节点继续通过原注册器读取，产品呈现由独立适配层完成。原产品说明存入 `docs/history/2026-09-10-before-theatre/`；来源和许可证继续保留。

对未声明 `installedPlugins` 的旧图，根据实际使用的节点推导必要插件，并在异步注册完成后补齐显示；显式声明的空数组仍按原意保留。此兼容修复只恢复旧对象读取，不重新开放产品插件入口。

两套历史观察缓存 `camera-studio:v1:{sceneId}` 与 `zhijiao.camera-sequence.v1:{sceneId}` 没有删除或改写。合并缓存和时间线属于阶段 D。

### 6. 测试命令与结果

阶段 A 中途检查点详见 [phase-a-validation.md](previews/theatre/phase-a-validation.md)：

| 检查 | 命令 | 当时结果 |
| --- | --- | --- |
| 应用、复台和产品语义 | `bun test apps/editor/lib apps/editor/components packages/core/src/remount scripts/theatre-product-copy.test.ts` | 165 通过，0 失败；[日志](previews/theatre/phase-a-app-tests-recheck.log) |
| 共享编辑器 | `bun test packages/editor/src` | 839 通过，0 失败；[日志](previews/theatre/phase-a-shared-tests.log) |
| MCP | `bun test packages/mcp/src` | 343 通过，0 失败；[日志](previews/theatre/phase-a-mcp-tests.log) |
| 生产构建 | `bun x turbo run build --filter=editor --env-mode=loose` | 6/6 任务成功；[日志](previews/theatre/phase-a-build.log) |

阶段 A 检查时阶段 B 代码正在并行写入，曾发现观察联合类型、二维视图 `scale` 属性、参数适配联合类型等问题，原始失败保留在 [类型复查日志](previews/theatre/phase-a-types-recheck.log)。这些问题已修复；后续应用和共享编辑器类型检查退出 0，不能把早期构建结果代替最终类型检查。

### 7. 桌面、平板、手机截图

| 尺寸 | 阶段 A 截图 |
| --- | --- |
| 1440 × 900 | [桌面](previews/theatre/phase-a-desktop.jpg) |
| 768 × 1024 | [平板](previews/theatre/phase-a-tablet.jpg) |
| 390 × 844 | [手机](previews/theatre/phase-a-mobile.jpg) |

另保留 [重构前桌面](previews/theatre/before-desktop.jpg)，原窗口为 1054 × 900；不将其当作 1440 × 900 的同尺寸对照。六张 A/B 截图分别符合上述三种尺寸，实际编码均为 JPEG，扩展名已统一为 `.jpg`，见 [尺寸核验](previews/theatre/screenshot-dimensions.json)。

### 8. 未解决与下一阶段

旧引擎和兼容插件代码仍存在。它们不作为当前产品功能入口；删除底层类型前仍须另行迁移用户数据。阶段 C 的完整资源拖放、提示本和报告没有用空菜单冒充实现。

### 9. 证据与操作边界

本阶段通过导航、资源数据源、命令可达性、默认图和回归测试共同改变产品工作流。未推送远端、创建 PR 或覆盖原有场景与镜头缓存。已知检查限制在本报告中单独列出。

## 阶段 B · 最小戏剧排演闭环

### 1. 改变的戏剧工作流

导演可在真实尺度舞台中添加人物替身，填写目标与上下场口，设置走位点、停顿、朝向和路径，安排道具预置、拾取、交接与放下，并将行动和抵抗关联到场次节拍。播放或拖动时间可确定性地重现相同状态；观察和摄影机不是人物行动的存储位置。

操作路径：

1. 新建剧目，或在原场景的「人物与行动」中建立排演数据。
2. 进入「置景 → 演出空间」选择模板、设置宽深高和场地原点；自有舞台地面与参考边界同步，既有用户布景不被缩放。
3. 添加人物、标记与走位；也可显式点击「添加《空桌》排演范例」。范例新增场次，包含可编辑圆桌、两椅、门和信件，不覆盖当前场景。
4. 在「场次与节拍」组织时间段；在「人物与行动」填写行动者、对象、动词、期望变化与抵抗。
5. 进入「置景 → 道具」的「道具与交接」面板，设置预置和交接。关联的场景物件在预演时使用临时显示，不改变正式位置。
6. 播放、暂停、拖动时间；通过导演、观众、演员、侧台或俯视调度检查。观众全景按实际画布宽高与透视视角完整取景，二维切回三维时取消旧导航插值，避免观察预设被覆盖。点击「复位」恢复正式位置后继续编辑。
7. 在「排演版本」保存版本与导演笔记。恢复时先确认；恢复后的全部场景变化可用一次撤销取回。

### 2. 删除或隐藏的入口

人物路径、行动动词和道具交接不再要求进入摄影机面板。原摄影机能力保留在高级记录入口，默认不显示光圈、阻尼、编码等专业参数。进入第一人称、Capture、专用 Studio 或旧镜头播放时，人物预演先停止并归还只读锁。

### 3. 新增实体与操作

纯 TypeScript 领域新增 `TheatreDocument / Production / Venue / RehearsalScene / Role / StageMark / BlockingPath / Prop / Beat / DramaticAction / RehearsalTake`。

- 五类场地模板；伸出式显示三面观众，中心式显示四面观众，其他模板以前沿观众区为基准。
- 中性人物替身、角色颜色与真实身高，台左/台右按演员面向观众定义。
- 路径按速度采样，支持点位停顿和朝向；人物使用角色色虚线路径。
- 道具持有链严格校验，一件道具同一时间只有一位持有人；放下时必须指定落位。
- 节拍、行动和抵抗均使用排演时间范围，拒绝不存在的引用和非法数值。
- 排演版本保存整个舞台图与领域文档，版本快照不递归包含历史版本。

### 4. 修改文件

领域代码位于 `apps/editor/lib/theatre/`；面板、播放状态和 R3F/SVG 展示位于 `apps/editor/components/theatre/`。`scene-loader.tsx` 组合挂载排演与已有运行时，`save-button.tsx` 使用戏剧默认场景图。`ParametricNodeRenderer` 补充临时可见性消费，使 2D/3D 都能隔离当前场次布景。完整路径见末尾。

### 5. 架构、迁移与兼容

领域结构、校验、采样和观察位置计算不依赖 React、Three.js 或编辑器。`scene-adapter.ts` 单独依赖 scene store，将版本化文档写入根节点 `metadata.diastageTheatre`；已有其他 metadata 保留。几何兼容节点继续位于原 scene graph。

预演使用独立时间状态和 `useLiveNodeOverrides` 展示通道。播放期间持有可叠加的只读租约；停止先同步恢复道具，再归还本模块租约，不释放其他模式的锁。预演不产生场景提交、不进入自动保存、不创建撤销步骤。

非当前场次的自有布景使用展示层可见性过滤；过滤不写入节点或版本快照。初次加载和切换场次时选中本场布景所在表演区，避免俯视图只显示默认空地；后续用户选区不会被反复覆盖。

正式字段编辑通过一次 `applyNodeChanges` 提交。版本恢复经过图、引用和数值验证，以一次 scene store 更新恢复布景、排演、材质和分组，保留版本历史及其他根 metadata。错误输入在进入正式图前被拒绝，不用 `any` 绕过领域校验。

另修复两个保存风险：热更新时重复加载初始快照覆盖新增内容；较早保存完成时错误清除后续编辑的未保存标记。现在同源快照不会重复覆盖当前编辑，保存确认按编辑批次处理，明确换场景或恢复版本仍正常加载。

### 6. 测试命令与结果

最终检查覆盖最后的观众画幅适配、旧导航插值取消、窄屏操作栏与旧图插件兼容修复。完整命令、检查时间和平台限制见 [阶段 B 验证记录](previews/theatre/phase-b-validation.md)：

| 检查 | 命令 | 实际结果 |
| --- | --- | --- |
| 领域与播放回归 | `bun test apps/editor/lib/theatre apps/editor/components/theatre/playback.test.ts` | 独立检查 39 项 / 368 断言通过；也包含在下方最终统一日志内 |
| 应用、共享编辑器、复台和语义相关测试 | `bun test apps/editor/lib apps/editor/components packages/editor/src packages/mcp/src packages/core/src/remount scripts/theatre-product-copy.test.ts` | **1375 通过 / 0 失败，214 文件，14416 断言，退出 0**；[最终日志](previews/theatre/phase-b-final-tests.log) |
| 旧图插件专项 | `bun test packages/editor/src/lib/scene-plugins.test.ts` | 最后测试清理修改后 **3 通过 / 0 失败**；[日志](previews/theatre/phase-b-final-plugin-tests.log) |
| 全仓各包测试 | 见下方完整命令 | 全范围检查点 **5008 通过 / 1 跳过 / 3 失败**；[日志](previews/theatre/phase-b-tests-native.log)；没有将后续相关测试重跑称为全仓重跑 |
| 应用和共享编辑器类型 | `tsgo --noEmit -p apps/editor/tsconfig.json`、`tsgo --noEmit -p packages/editor/tsconfig.json` | **均退出 0**；[最终日志](previews/theatre/phase-b-final-types.log) |
| lint / 格式 | `biome check` 检查变更源文件 | **79 文件，退出 0**，保留 7 项 warning、2 项 info；[最终日志](previews/theatre/phase-b-final-lint.log) |
| editor 生产构建 | `bun x turbo run build --filter=editor --env-mode=loose` | **6/6 任务成功，13.549 秒，退出 0**，01:41:51 结束；[最终日志](previews/theatre/phase-b-final-build.log) |

全仓各包实际验证命令：

```sh
bun test packages/core/src packages/viewer/src packages/editor/src packages/nodes/src packages/mcp/src packages/capture-protocol/src packages/capture-viewer/src packages/cli/src apps/editor/lib apps/editor/components scripts
```

全仓 3 项失败位于既有 CLI 的 Windows 文件权限/进程停止测试：`info creates private local storage on a fresh home`、`managed runtime > allows an explicit force stop only for the recorded editor command`、`managed runtime > force-stops the recorded editor when its runtime manifest is damaged`。第一项断言 POSIX `0700` 权限，Windows 返回的 `mode & 0o077` 为 54；后两项要求强制停止成功，但现有运行管理器在 Windows 显式返回不支持，结果为 `state_conflict`，后续清理还触发 `EBUSY`。相关 CLI 源码和测试本轮未修改，具体日志与代码位置见 [最终验证记录](previews/theatre/phase-b-validation.md)。本阶段没有通过删测试、放宽断言或绕过进程保护隐藏失败，因此不能写成「全仓全部通过」。

回归测试具体覆盖：非法数值与交叉引用；角色恒速、停顿、朝向、重复拖动时间确定性；道具单一持有链；预演不产生保存提交；多模式租约和互斥；带父级旋转/平移的二维与三维位置；演员相机位于替身头球之外；多个场次可见性与保存兼容；版本保存/恢复/一次撤销/JSON 重开；旧节点与其他根 metadata 保留。

### 7. 桌面、平板、手机截图

以下截图来自运行中的本机编辑器。A/B 分别展示最终集成页面的置景与排演工作区，不是两个隔离提交的截图：

| 尺寸 | 阶段 B 截图 |
| --- | --- |
| 1440 × 900 | [桌面](previews/theatre/phase-b-desktop.jpg) |
| 768 × 1024 | [平板](previews/theatre/phase-b-tablet.jpg) |
| 390 × 844 | [手机](previews/theatre/phase-b-mobile.jpg) |

浏览器检查包含播放/暂停、保存/重开、三个观察视角，以及顶部平面入口和观察俯视均可看到当前场次布景。三种宽度均无文档横向溢出。详见 [浏览器验收记录](previews/theatre/browser-validation.md) 与 [原始核验数据](previews/theatre/browser-evidence.json)，另有 [二维调度](previews/theatre/phase-b-plan.jpg)、[6 秒行动](previews/theatre/phase-b-playback.jpg) 和 [保存版本](previews/theatre/phase-b-takes.jpg)。

新验收剧目的 API 保持 v10，含 2 位人物和 1 个排演版本；连续播放未增加场景版本。原场景 `5a3d9a429154` 打开和查看复台后仍为 v27、39 个节点，更新时间保持原值。最终轻量显示的验收刷新后浏览器 error 日志为 0；此结果不替代全部 GPU、资产及网络条件的测试。

### 8. 尚未实现与下一阶段

阶段 B 采用几何替身和确定性物体位置演算，不包含骨骼表演、面部表情或自动戏剧判断。演员视角检查当前落点，不宣称是持续跟随人物的摄影轨。

- C：完整资源拖放、提示时间线、演出提示本、场间换景表、报告与版本差异。
- D：两套摄影机缓存/状态合并、统一观察轨与时间基准、简化记录预设。
- E：批准版本到目标场地的完整走位/地胶点映射、现场验收和演出包、离线模式。
- F：有限口令规划器、白名单、预览确认、事务执行与一次撤销。

既有复台数学与摄影机录制仍可使用，但不能据此宣称上述 C–F 的新验收链已经实现。《空桌》跨目标舞台、现场清单和 AI 撤销等全规格步骤不纳入本轮 A/B 完成声明。

### 9. 证据与操作边界

场地、人物、走位、道具、节拍与行动具有可编辑数据、运行展示和保存测试；不只更换菜单文字。自动回归和人工浏览器检查分别记录，不将一种证据冒充另一种。未推送、未提交 PR、未清空旧缓存，未把演示对象固定 ID 写入业务逻辑。

## 完整修改 / 新增文件清单

以下根据最终源码冻结后的 `git diff --name-only` 与 `git ls-files --others --exclude-standard` 并集生成。排除预览截图/日志、历史原文归档和临时工作日志；这些证据目录已在上文独立链接。

本次清单计入 89 个源文件、测试和说明文件。

### 产品与设计文档

- 修改 [.impeccable/design.json](.impeccable/design.json)
- 修改 [CAMERA_STUDIO.md](CAMERA_STUDIO.md)
- 修改 [DESIGN.md](DESIGN.md)
- 修改 [PRODUCT.md](PRODUCT.md)
- 修改 [README.md](README.md)
- 修改 [REMOUNT.md](REMOUNT.md)
- 新增 [THEATRE_AUDIT.md](THEATRE_AUDIT.md)
- 新增 [THEATRE_IMPLEMENTATION.md](THEATRE_IMPLEMENTATION.md)

### 应用入口、排演界面与领域模块

- 修改 [apps/editor/.impeccable/surfaces/apps-editor-app-page-tsx.md](apps/editor/.impeccable/surfaces/apps-editor-app-page-tsx.md)
- 修改 [apps/editor/app/layout.tsx](apps/editor/app/layout.tsx)
- 修改 [apps/editor/app/page.tsx](apps/editor/app/page.tsx)
- 修改 [apps/editor/app/privacy/page.tsx](apps/editor/app/privacy/page.tsx)
- 修改 [apps/editor/app/scenes/page.tsx](apps/editor/app/scenes/page.tsx)
- 修改 [apps/editor/components/build-tab.tsx](apps/editor/components/build-tab.tsx)
- 修改 [apps/editor/components/camera-studio/panel.test.ts](apps/editor/components/camera-studio/panel.test.ts)
- 修改 [apps/editor/components/remount-panel.tsx](apps/editor/components/remount-panel.tsx)
- 修改 [apps/editor/components/save-button.tsx](apps/editor/components/save-button.tsx)
- 新增 [apps/editor/components/scene-loader.test.tsx](apps/editor/components/scene-loader.test.tsx)
- 修改 [apps/editor/components/scene-loader.tsx](apps/editor/components/scene-loader.tsx)
- 修改 [apps/editor/components/stage-overview-data.test.ts](apps/editor/components/stage-overview-data.test.ts)
- 修改 [apps/editor/components/stage-overview-data.ts](apps/editor/components/stage-overview-data.ts)
- 修改 [apps/editor/components/stage-overview-panel.tsx](apps/editor/components/stage-overview-panel.tsx)
- 修改 [apps/editor/components/studio-navigation.test.tsx](apps/editor/components/studio-navigation.test.tsx)
- 修改 [apps/editor/components/studio-navigation.tsx](apps/editor/components/studio-navigation.tsx)
- 修改 [apps/editor/components/studio-sidebar.tsx](apps/editor/components/studio-sidebar.tsx)
- 新增 [apps/editor/components/theatre/panel.tsx](apps/editor/components/theatre/panel.tsx)
- 新增 [apps/editor/components/theatre/playback.test.ts](apps/editor/components/theatre/playback.test.ts)
- 新增 [apps/editor/components/theatre/prop-preview.ts](apps/editor/components/theatre/prop-preview.ts)
- 新增 [apps/editor/components/theatre/runtime.tsx](apps/editor/components/theatre/runtime.tsx)
- 新增 [apps/editor/components/theatre/scene-visibility.ts](apps/editor/components/theatre/scene-visibility.ts)
- 新增 [apps/editor/components/theatre/state.ts](apps/editor/components/theatre/state.ts)
- 新增 [apps/editor/components/theatre/theatre.css](apps/editor/components/theatre/theatre.css)
- 修改 [apps/editor/components/viewer-toolbar.tsx](apps/editor/components/viewer-toolbar.tsx)
- 修改 [apps/editor/lib/bootstrap.ts](apps/editor/lib/bootstrap.ts)
- 修改 [apps/editor/lib/build-presets.ts](apps/editor/lib/build-presets.ts)
- 新增 [apps/editor/lib/theatre/blocking.ts](apps/editor/lib/theatre/blocking.ts)
- 新增 [apps/editor/lib/theatre/new-production.test.ts](apps/editor/lib/theatre/new-production.test.ts)
- 新增 [apps/editor/lib/theatre/new-production.ts](apps/editor/lib/theatre/new-production.ts)
- 新增 [apps/editor/lib/theatre/presentation.ts](apps/editor/lib/theatre/presentation.ts)
- 新增 [apps/editor/lib/theatre/presets.ts](apps/editor/lib/theatre/presets.ts)
- 新增 [apps/editor/lib/theatre/scene-adapter.test.ts](apps/editor/lib/theatre/scene-adapter.test.ts)
- 新增 [apps/editor/lib/theatre/scene-adapter.ts](apps/editor/lib/theatre/scene-adapter.ts)
- 新增 [apps/editor/lib/theatre/schema.ts](apps/editor/lib/theatre/schema.ts)
- 新增 [apps/editor/lib/theatre/theatre.test.ts](apps/editor/lib/theatre/theatre.test.ts)

### 共享编辑器与兼容适配

- 修改 [packages/editor/src/components/editor/editor-layout-v2.tsx](packages/editor/src/components/editor/editor-layout-v2.tsx)
- 修改 [packages/editor/src/components/editor/floorplan-mode-coordinator.tsx](packages/editor/src/components/editor/floorplan-mode-coordinator.tsx)
- 修改 [packages/editor/src/components/editor/index.tsx](packages/editor/src/components/editor/index.tsx)
- 新增 [packages/editor/src/components/editor/scene-load.test.tsx](packages/editor/src/components/editor/scene-load.test.tsx)
- 修改 [packages/editor/src/components/ui/action-menu/furnish-tools.tsx](packages/editor/src/components/ui/action-menu/furnish-tools.tsx)
- 修改 [packages/editor/src/components/ui/action-menu/index.tsx](packages/editor/src/components/ui/action-menu/index.tsx)
- 修改 [packages/editor/src/components/ui/action-menu/structure-tools.tsx](packages/editor/src/components/ui/action-menu/structure-tools.tsx)
- 修改 [packages/editor/src/components/ui/command-palette/editor-commands.tsx](packages/editor/src/components/ui/command-palette/editor-commands.tsx)
- 修改 [packages/editor/src/components/ui/controls/material-picker.tsx](packages/editor/src/components/ui/controls/material-picker.tsx)
- 修改 [packages/editor/src/components/ui/item-catalog/item-catalog.tsx](packages/editor/src/components/ui/item-catalog/item-catalog.tsx)
- 新增 [packages/editor/src/components/ui/item-catalog/theatre-catalog.ts](packages/editor/src/components/ui/item-catalog/theatre-catalog.ts)
- 修改 [packages/editor/src/components/ui/panels/multi-height-mode.tsx](packages/editor/src/components/ui/panels/multi-height-mode.tsx)
- 修改 [packages/editor/src/components/ui/panels/multi-parametric-inspector.tsx](packages/editor/src/components/ui/panels/multi-parametric-inspector.tsx)
- 修改 [packages/editor/src/components/ui/panels/node-display.ts](packages/editor/src/components/ui/panels/node-display.ts)
- 修改 [packages/editor/src/components/ui/panels/panel-wrapper.tsx](packages/editor/src/components/ui/panels/panel-wrapper.tsx)
- 修改 [packages/editor/src/components/ui/panels/parametric-field-control.tsx](packages/editor/src/components/ui/panels/parametric-field-control.tsx)
- 修改 [packages/editor/src/components/ui/panels/parametric-inspector.tsx](packages/editor/src/components/ui/panels/parametric-inspector.tsx)
- 修改 [packages/editor/src/components/ui/panels/selection-breakdown.test.ts](packages/editor/src/components/ui/panels/selection-breakdown.test.ts)
- 修改 [packages/editor/src/components/ui/sidebar/mobile-tab-bar.tsx](packages/editor/src/components/ui/sidebar/mobile-tab-bar.tsx)
- 修改 [packages/editor/src/components/ui/sidebar/panels/items-panel/index.tsx](packages/editor/src/components/ui/sidebar/panels/items-panel/index.tsx)
- 修改 [packages/editor/src/components/ui/sidebar/use-plugin-panels.tsx](packages/editor/src/components/ui/sidebar/use-plugin-panels.tsx)
- 修改 [packages/editor/src/components/ui/snap-target-badge.tsx](packages/editor/src/components/ui/snap-target-badge.tsx)
- 修改 [packages/editor/src/components/viewer/viewer-scene-header.tsx](packages/editor/src/components/viewer/viewer-scene-header.tsx)
- 新增 [packages/editor/src/hooks/use-auto-save-integration.test.ts](packages/editor/src/hooks/use-auto-save-integration.test.ts)
- 修改 [packages/editor/src/hooks/use-auto-save.ts](packages/editor/src/hooks/use-auto-save.ts)
- 修改 [packages/editor/src/hooks/use-keyboard.ts](packages/editor/src/hooks/use-keyboard.ts)
- 修改 [packages/editor/src/index.tsx](packages/editor/src/index.tsx)
- 修改 [packages/editor/src/lib/continuation.ts](packages/editor/src/lib/continuation.ts)
- 修改 [packages/editor/src/lib/paint-scope.test.ts](packages/editor/src/lib/paint-scope.test.ts)
- 修改 [packages/editor/src/lib/paint-scope.ts](packages/editor/src/lib/paint-scope.ts)
- 新增 [packages/editor/src/lib/scene-plugins.test.ts](packages/editor/src/lib/scene-plugins.test.ts)
- 修改 [packages/editor/src/lib/scene.ts](packages/editor/src/lib/scene.ts)
- 新增 [packages/editor/src/lib/theatre-parametrics.test.ts](packages/editor/src/lib/theatre-parametrics.test.ts)
- 新增 [packages/editor/src/lib/theatre-parametrics.ts](packages/editor/src/lib/theatre-parametrics.ts)
- 新增 [packages/editor/src/lib/theatre-presentation.test.ts](packages/editor/src/lib/theatre-presentation.test.ts)
- 新增 [packages/editor/src/lib/theatre-presentation.ts](packages/editor/src/lib/theatre-presentation.ts)
- 修改 [packages/editor/src/store/use-editor.tsx](packages/editor/src/store/use-editor.tsx)

### MCP 入口隔离

- 修改 [packages/mcp/README.md](packages/mcp/README.md)
- 修改 [packages/mcp/src/bin/pascal-mcp.ts](packages/mcp/src/bin/pascal-mcp.ts)
- 修改 [packages/mcp/src/server.ts](packages/mcp/src/server.ts)
- 新增 [packages/mcp/src/theatre-profile.test.ts](packages/mcp/src/theatre-profile.test.ts)
- 新增 [packages/mcp/src/theatre-profile.ts](packages/mcp/src/theatre-profile.ts)
- 修改 [packages/mcp/src/tools/output-schema-contract.test.ts](packages/mcp/src/tools/output-schema-contract.test.ts)

### Viewer 展示支持

- 修改 [packages/viewer/src/components/renderers/parametric-node-renderer.tsx](packages/viewer/src/components/renderers/parametric-node-renderer.tsx)

### 验证脚本

- 新增 [scripts/theatre-product-copy.test.ts](scripts/theatre-product-copy.test.ts)


