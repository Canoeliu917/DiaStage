# 复台 Remount · 第一阶段

入口：顶部 **导演工作台 → 左侧复台**。保留空间搭建、镜头和场景序列的原有入口。

## 使用

1. **源场地**：填写净宽、进深和高度（米），选择物件/块体，点击“记录演出布置”。组合的子物件一起记录。记录冻结原始世界坐标，不移动节点。
2. **目标场地**：填写正式舞台尺寸，可关联已经存在的扫描参考层。宽度以舞台中线 CL 为中心，深度从台口 PL 朝台后。比例始终 1:1，容纳不下会报告冲突。
3. **空间校准**：输入两套对应的三个水平基准点，顺序为台口中点、舞台右侧、舞台后方。默认两条基线各 1 米。不同场地应使用同一基准三角形，不能用尺寸不同的舞台边角充当对应点。修改容差和安全净距后生成预览。
4. **映射预览**：检查 RMS/最大残差、每个物件源/目标坐标、距 CL/PL 的有向距离、源/目标旋转和冲突原因。蓝为源，绿为可落位，黄为净距提示，红为冲突，灰为目标场地参考。Ghost 使用声明尺寸的包围盒。可输入一条手工演员走位线，每行三个米制坐标，源/目标均显示虚线。
5. **实体落位**：校准通过且没有 error 后，核对提示并勾选确认，点击“确认复台”。物件位置、旋转与复台配置作为一次 scene store 操作提交，沿用场景自动保存。
6. **复台验收**：查看已提交的数字落位记录，可一键撤销刚才的整批复台；若已经继续编辑，使用编辑器历史记录。此页不代表现场实体已经验收。

“保存复台配置”可以在移动前明确保存原始布局、场地、锚点与走位线，不改变物件位置。未点击保存或确认的草稿只在当前页面内存中。配置被其他编辑或撤销改变后，旧草稿不能覆盖新版本；“放弃草稿并载入”读取场景中已有配置。

## 分层与保存

- `packages/core/src/remount/` 是独立的纯 TypeScript 子路径，不新增 package 或依赖。Zod 数据结构、坐标变换、三点校准、包围体碰撞与净距计算均不依赖 React、Three.js 或编辑器。
- `apps/editor/lib/remount-scene.ts` 将场景的父子局部坐标、楼体旋转、楼层高度和地面支撑转换为世界快照，再将预览目标反算为节点局部坐标。预览使用独立草稿；应用只调用一次 `applyNodeChanges({ update })`。
- 配置以版本 1 的 `site.metadata.remount` 随场景保存，包括独立 VenueProfile、ProductionLayout、原始物件快照及最后的 DeploymentPlan。保留根节点其他 metadata。
- `remount-panel.tsx` 提供确认交互；`remount-preview-system.tsx` 只展示 Ghost。新增 `viewerSceneSlot`，原 `viewerRuntimeSlot` 的 CameraStudioRuntime 和 `studioSceneSlot` 的 CameraRehearsalSystem 保持原位。
- Ghost 使用命名的 OVERLAY_LAYER，不参与拾取；在只读、预览、第一人称、Capture、镜头播放及其他编辑操作中隐藏。节点语义改变使预览过期，单纯保存楼层取景视角不使其过期。
- 保留现有 SceneLoader、场景 API、自动保存和版本冲突机制；没有绕过 store 写数据库，也没有依赖空桌示例的固定节点 ID。

## 第一阶段边界

- 只实现水平舞台的刚体 1:1 映射。focus-zone、teaching-scale 数据模式名称保留，但执行入口拒绝非 1:1 模式或缩放。
- 三点建立正交坐标系并计算对应点的映射残差；拒绝共线、重合、朝下、倾斜以及非有限值。这里不是多点最小二乘测绘解算，校准容差不是测量精度承诺。
- 搬运对象为可可靠解析的 item 和 block，支持层级组合。墙面、屋顶、顶棚、块体面挂接物件暂不迁移，面板列出原因。块体只保存绕 Y 轴旋转。
- 冲突使用 3D 定向包围体和净距；墙、柱及未选中物件作为障碍。墙体使用保守包围盒，不扣除门窗洞，凹形/圆形几何可能保守误报。扫描网格和未支持挂接构件不参与精确碰撞，遗漏对象在预览及确认页明确列出。
- 演员走位为手工折线映射，不驱动人物，也不分析演员体积或多人时序碰撞。镜头关键帧保留原值，不随复台自动搬迁。
- 已声明的 physical/proxy 尺寸不变；virtual 不作为实体障碍，但仍检查是否超出场地。真实道具之间的接触/套叠需要导演判断包围体的保守性。

## 后续接口

已预留纯接口 `VenueCaptureAdapter.loadVenueProfile(source: unknown): Promise<VenueProfile>`。

第二阶段尚未实现：手机采集、LiDAR、摄影测量、点云/Gaussian Splat 重建、AR 引导、现场逐件签收、测量精度认证、多点优化校准、精确网格碰撞、多条时序演员行动线、镜头关键帧迁移。没有接入 AI 大模型或大型 MCP 客户端。

## 文件清单

新增：

- `packages/core/src/remount/schema.ts`
- `packages/core/src/remount/geometry.ts`
- `packages/core/src/remount/planning.ts`
- `packages/core/src/remount/index.ts`
- `packages/core/src/remount/remount.test.ts`
- `apps/editor/lib/remount-scene.ts`
- `apps/editor/lib/remount-scene.test.ts`
- `apps/editor/components/remount-panel.tsx`
- `apps/editor/components/remount-preview-system.tsx`
- `apps/editor/components/remount-preview-system.test.tsx`
- `apps/editor/components/remount.css`
- `REMOUNT.md`

接入修改：

- `packages/core/package.json`：导出 `./remount`。
- `apps/editor/components/studio-sidebar.tsx`：导演工作台的一级复台入口。
- `apps/editor/components/studio-navigation.tsx`：打开复台时结束建模工具。
- `apps/editor/components/studio-navigation.test.tsx`：复台入口及模式回归。
- `apps/editor/components/scene-loader.tsx`、`apps/editor/app/page.tsx`：注入展示系统，保留相机系统。

`ScanNode`、Capture 协议/运行时、相机排演源码和 `apps/editor/package.json` 未因复台业务而改写。上传的旧 SceneLoader 未覆盖当前实现。

## 验证命令

在仓库根运行（Windows 环境通过 `npm exec --yes --package=bun@1.3.14 -- bun` 调用 Bun）：

```powershell
bun test apps/editor/lib apps/editor/components packages/core/src/remount
bun test packages/editor/src
node node_modules/typescript/bin/tsc --build packages/core
.\node_modules\.bin\tsgo.exe --noEmit -p apps/editor/tsconfig.json
.\node_modules\.bin\biome.exe lint
bun x turbo run build --filter=editor --env-mode=loose
```

开发访问：`http://127.0.0.1:4318/scene/empty-table-camera?disable=postFx`。
验收使用独立场景副本，原空桌场景不用于落位写入测试。

浏览器验收副本：`http://127.0.0.1:4318/scene/5a3d9a429154?disable=postFx`。

已验证的实际保存闭环：送信方椅子 `[-0.752, 0, 0.814] → [9.248, 0, 0.814]`，拒收方椅子与信封一起平移 10 米，场景 API 保存三项 placement；一次撤销后三件全部恢复，原始快照和配置保留。完整刷新后已恢复三件源快照与走位线。预览前后 API 物件位置一致，预览本身未写入复台 metadata。

最终验证结果（2026-09-09）：

- 应用与复台：89 项通过，0 失败（含纯数学、scene store、扫描参考资源生命周期、导航回归）。
- 编辑器回归：835 项通过，0 失败。
- core TypeScript 构建、应用独立类型检查：通过。另行类型检查确保不依赖项目现有 `ignoreBuildErrors` 设置。
- 全仓 lint：通过；保留原有 editor `sceneLoadAttempt` effect 的 1 条 info，无新增 lint 错误。
- editor 生产构建：6/6 任务成功。
- 本地启动与实际交互：已验证页面、Ghost、手工走位、保存、批量确认、一次撤销、完整刷新恢复。轻量预览下的地面覆盖线框问题已通过叠加层绘制顺序修复并加入回归断言。

预览截图：`previews/remount-preview.png`。
