# 简化排演重构 · 2026-09-10

## 唯一规格与基线
本轮以用户上传的 DiaStage_Codex_Simplified_Rehearsal_Spec.md 为唯一产品约束，替代此前 A–F 产品规划。
本地仓库 outputs/camera-studio，分支 codex/camera-studio，HEAD fc302d0。开始前存在大量未提交修改，包括旧排演、摄影机、复台、界面和数据库；本轮在原工作树上增量实施，不重置、不覆盖历史场景、不推送远端。

## 依赖审计
| 链路 | 原依赖 | 本轮处理 |
| --- | --- | --- |
| 首页 | 常驻完整 Editor 与运行系统 | 首页独立三入口说明；手动新建实际可用 |
| 灯光 | app/page、scene-loader、总览、显示、camera-stage → lighting 模块 | 活动入口与运行挂载全部解除；原模块仅为隔离兼容源码与测试 |
| 灯具节点 | item asset/effect、用户灯具缓存 | 从活动图移出，原始节点/子树/分组/缓存存入 legacy |
| Renderer | 可选主题 Lights、环境反射、ItemLightSystem | host 注入 NeutralRenderEnvironment；内部固定中性照明，不使用用户 Lighting 模型 |
| 排演数据 | v1 剧情、场次、行动、道具交接 | v2 StageSceneDocument + version 1 RehearsalSimulation；旧原文留 legacy，投影复用空间采样 |
| 摄影机 | dock 持久化与录像耦合、全工作区挂载 | CameraPersistence 独立；录像和 Remount 运行时按工作区动态装载 |
| 资源 | 通用目录与预设 | 沿用舞台白名单，额外排除灯具和 light effect；保留引擎节点注册以读旧项目 |
| 复台 | items/blocks → source snapshot → plan → batch apply | 保留六步、数学和保存；候选排除灯具 |

未新增依赖、未复制镜头运动数学。兼容节点包和插件注册不能因无界面入口而删除，否则旧项目会缺少解析器。

## 交付范围
置景：舞台与场地、舞台布景、舞台库、舞台镜头。
排演：模拟排演、显示、观察/记录、底部排演版本；旧剧情栏目不可达。
人物基础切片提供位置、朝向、点击记录路线、时长、播放/暂停/复位/循环与路线显示。
排演版本保存布景、人物路线、摄影机与显示，并通过场景历史恢复及一次撤销。固定照明和旧废弃字段不写入新版本。

本轮未实现原本不存在的语音、剧本提取与舞台口令。首页明确说明后续开放，不提供假按钮。完整人物拖拽浮层、机位拖入/复制/锁定、两套机位时间基准统一、摄影机复台属于后续阶段。

## 复台独立验收
六步入口保留：源场地、目标场地、空间标定、映射预览、实体落位、复台验收。
当前适配器支持独立 item/block 的水平 1:1 映射；复杂挂接节点继续报告不支持，不强行变换。
摄影机项目仍为独立缓存，本轮不宣称已能随复台批量应用。人物路线不作为设备处理。

## 验证结果

| 检查 | 命令 / 范围 | 结果 |
| --- | --- | --- |
| 应用类型检查 | apps/editor: bun run check-types | 通过：Next 路由类型生成 + tsc --noEmit |
| 编辑器包类型检查 | bun x tsgo --noEmit -p packages/editor/tsconfig.json | 通过 |
| 单元测试 | apps/editor/lib、apps/editor/components、packages/editor/src、packages/viewer/src、packages/core/src/remount、packages/mcp/src、scripts/theatre-product-copy.test.ts | 1595 通过，0 失败；248 文件 |
| Lint | bun run lint | 通过；0 错误，0 警告，1 条 info |
| 生产构建 | bun x turbo run build --filter=editor --env-mode=loose | 6/6 任务成功 |
| 本地服务 | /api/health、原项目 /scene/bd08682cadac?disable=postFx | 均 HTTP 200 |
| 浏览器交互 | scripts/simplified-browser.cjs | 7 组流程通过，0 pageerror |

Lint 的一条 info 位于 camera-studio/dock.tsx：sceneId 用于场景切换时清理播放器，保留该生命周期依赖。生产构建有原有 SQLite 动态路径造成的文件追踪警告。Next 构建配置本身跳过类型检查，因此上面单独执行了类型检查，没有以构建代替检查。

浏览器验证使用新建的独立验收剧目，原项目没有被测试流程编辑。覆盖手动新建、导航顺序、人物与二维路线、自动保存、播放暂停及循环开关、版本恢复、按需加载机位观察、复台六步导航。批量应用和一次撤销由单元测试覆盖；本轮未在真实用户项目中执行复台应用，也未进行真实硬件视频编码验收。

截图由 Windows Chrome 无头模式、SwiftShader / WebGL 回退生成，尺寸为桌面 1440×900、iPad 768×1024、小屏 390×844。用于布局与交互检查，不等同于真实 iPad GPU 性能测试。截图前关闭了可关闭的操作提示。

- [桌面截图](previews/simplified/desktop.png)
- [iPad 截图](previews/simplified/ipad.png)
- [小屏截图](previews/simplified/small.png)
- [首页截图](previews/simplified/home.png)
- [二维路线截图](previews/simplified/route-2d.png)
- [复台六步截图](previews/simplified/remount.png)
- [浏览器验收记录](previews/simplified/browser.json)
- [测试日志](previews/simplified/tests.log)、[类型检查](previews/simplified/types.log)、[Lint](previews/simplified/lint.log)、[生产构建](previews/simplified/build.log)

本地访问：http://127.0.0.1:4318/ 。验收剧目：http://127.0.0.1:4318/scene/70248ea9dcf4 。

## 本轮文件清单

以下为本轮新增或增量修改的文件；未将所有工作树未提交内容冒称为本轮成果。底层建筑节点、此前已有的相机与复台数学、旧项目数据库均保留。数据库另包含浏览器流程创建的独立验收剧目。

- `CAMERA_STUDIO.md`
- `DESIGN.md`
- `PRODUCT.md`
- `README.md`
- `REMOUNT.md`
- `SIMPLIFIED_REHEARSAL.md`
- `apps/editor/app/page.tsx`
- `apps/editor/app/scenes/page.tsx`
- `apps/editor/components/camera-studio/camera-stage-system.tsx`
- `apps/editor/components/camera-studio/dock.test.ts`
- `apps/editor/components/camera-studio/dock.tsx`
- `apps/editor/components/camera-studio/panel.test.ts`
- `apps/editor/components/camera-studio/panel.tsx`
- `apps/editor/components/camera-studio/persistence.tsx`
- `apps/editor/components/camera-studio/store.ts`
- `apps/editor/components/lighting/runtime.test.tsx`
- `apps/editor/components/remount-panel.tsx`
- `apps/editor/components/remount.css`
- `apps/editor/components/scene-loader.test.tsx`
- `apps/editor/components/scene-loader.tsx`
- `apps/editor/components/stage-overview-data.test.ts`
- `apps/editor/components/stage-overview-data.ts`
- `apps/editor/components/stage-overview-panel.test.tsx`
- `apps/editor/components/stage-overview-panel.tsx`
- `apps/editor/components/studio-navigation.test.tsx`
- `apps/editor/components/studio-navigation.tsx`
- `apps/editor/components/studio-sidebar.tsx`
- `apps/editor/components/theatre/observe-panel.tsx`
- `apps/editor/components/theatre/runtime.tsx`
- `apps/editor/components/theatre/simulation-panel.tsx`
- `apps/editor/components/theatre/state.ts`
- `apps/editor/components/theatre/theatre.css`
- `apps/editor/components/theatre/versions-panel.tsx`
- `apps/editor/components/viewer-toolbar.tsx`
- `apps/editor/lib/legacy-lighting.ts`
- `apps/editor/lib/remount-scene.ts`
- `apps/editor/lib/studio-workspaces.ts`
- `apps/editor/lib/theatre/new-production.test.ts`
- `apps/editor/lib/theatre/new-production.ts`
- `apps/editor/lib/theatre/presentation.ts`
- `apps/editor/lib/theatre/scene-adapter.ts`
- `apps/editor/lib/theatre/simplified-rehearsal.test.ts`
- `apps/editor/lib/theatre/simulation-store.ts`
- `apps/editor/lib/theatre/simulation.ts`
- `packages/editor/src/components/ui/action-menu/furnish-tools.tsx`
- `packages/editor/src/components/ui/item-catalog/theatre-catalog.ts`
- `packages/viewer/src/components/viewer/lights.tsx`
- `packages/viewer/src/components/viewer/render-environment.tsx`
- `packages/viewer/src/components/viewer/scene-environment.tsx`
- `packages/viewer/src/index.ts`
- `packages/viewer/src/systems/item-light/item-light-system.tsx`
- `scripts/simplified-browser.cjs`

previews/simplified/ 保存本轮截图与检查输出；不包含远端提交或 PR。

## 已知边界

这次交付对应规格第 16 节的第一轮界面与运行链路重组，并用最小空间排演数据替换旧表单。并非宣布五阶段全部完成。

- 语音、剧本导入、舞台口令原先不存在，本轮未新增 AI 或虚假可点击入口。
- 人物支持数值定位、点击定位与依次点击形成路线；完整拖拽和舞台人物浮层仍待后续阶段。
- 摄影机复用既有实体与运动实现；完整拖入、复制、逐机位锁定和逐机位显示控制仍待后续阶段。
- 新排演版本保存 Camera Studio 项目和基本显示状态；高级 camera-director 仍沿用自己的兼容缓存，未合并两套时间基准。
- 复台六步导航和现有布景映射保留；摄影机跟随复台、人物路线参考层属于后续验证范围。
- 自动化与抽样旧项目验证不能证明所有历史外部插件数据均有效；本轮迁移不解析或删除未知旧字段，而是保留原始兼容数据。
