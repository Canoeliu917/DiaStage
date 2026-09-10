# 戏剧优先重构审计 · 2026-09-10

## 基线与范围

- 本地工作区：`outputs/camera-studio`，分支 `codex/camera-studio`，基线提交 `fc302d0`，开始前工作树干净。
- 目标为 `Canoeliu917/DiaStage`；本轮只做本地阶段 A、B，不推送、不创建 PR。
- 已完整阅读外部规格、AGENTS、PRODUCT、DESIGN、README、CAMERA_STUDIO、REMOUNT。
- 用户新规格覆盖旧文档中“两套镜头系统必须并存”和“暂停手机适配”的限制。

## 建筑／家装语义与可达入口

| 位置 | 发现 | 本轮处理边界 |
| --- | --- | --- |
| `apps/editor/components/studio-navigation.tsx`、`studio-sidebar.tsx` | 搭台／看台；看台默认进入机位 | 改置景／排演／复台；排演默认人物与行动 |
| `apps/editor/components/build-tab.tsx` | 顶部仅八种工具，但 MEP、屋顶、橱柜、地形、房间预设分支仍在 | 删除产品分支；工具通过舞台术语适配 |
| `packages/editor/src/components/ui/action-menu/furnish-tools.tsx` 与 ItemsPanel | 家电、厨房、卫浴、户外；搜索可绕过分类访问完整目录 | 过滤资源数据源及搜索；重组家具、道具 |
| 材质面板 | 屋面、Pascal 来源标签 | 通用表面处理分类；来源许可独立保留 |
| `stage-overview-*`、`viewer-toolbar.tsx`、FloatingLevelSelector | 建筑、楼层、楼板、加层和场地工程设置 | 展示适配；兼容容器不作为新建工作流 |
| shared editor command palette／工具栏／属性面板 | 可唤醒非戏剧工具 | 收敛可达工具；隔离兼容节点编辑入口 |
| `apps/editor/lib/bootstrap.ts` | 全部插件节点和面板注册 | 保留旧节点读取，关闭产品插件入口 |
| `apps/editor/components/save-button.tsx`、场景 API | 新建使用底层默认结构 | 新建提供真实尺度的舞台模板，不覆盖现有数据 |
| `apps/editor/components/scene-loader.tsx` | 缩略图调用不存在的 POST 接口且吞错 | 删除无效调用，沿用可靠场景保存路径 |
| README、PRODUCT、DESIGN、CAMERA_STUDIO、REMOUNT | 旧产品定位、操作路径和实现历史混杂 | 产品文档重写；原始历史保存在明确隔离目录 |
| `packages/mcp` prompts/tools | 通用建筑生成工具 | 不接入当前产品口令；阶段 F 再实现戏剧白名单 |

内部 `building`／`level`／`wall`／`roof` 等类型、注册器和旧场景节点属于兼容引擎。语义扫描分别检查产品表面和明确列出的兼容／历史路径，不能仅凭标识符计数判定用户可见内容。

## 两套观察系统

| 系统 | 状态／时间 | 存储 | 入口／挂载 |
| --- | --- | --- | --- |
| CameraStudio | Zustand 单例；time、playing、previewing；50 步 cameraUndo/cameraRedo；Shot.motion 保存旧物件行动 | `camera-studio:v1:{sceneId}` | CameraPanel／CameraStudioDock；viewerRuntimeSlot |
| CameraDirector | sceneId Map；transport.currentTime/status；A/B sequence、take.keys；无统一撤销 | `zhijiao.camera-sequence.v1:{sceneId}` | CameraRehearsalPanel；studioSceneSlot |

阶段 B 新建独立人物排演文档和确定性采样器；新人物路径不写入 Shot.motion。旧缓存原样保留在观察的高级入口。阶段 D 将两份缓存导入统一观察轨，保存旧键备份与迁移版本，统一撤销；不能在本轮悄悄删除旧机位或声称已完成 D。

## 戏剧对象缺口与实现选择

原图没有 Production、场次、节拍、角色、走位、行动／抵抗、道具交接和排演版本。复台已有坐标数学，但演员走位只是手工折线。灯光独立保存；不能当作完整提示系统。

阶段 B 新增纯 TypeScript 戏剧领域，场景根 `metadata.diastageTheatre` 存储版本化文档。场地模板、人物替身、标记、走位、道具持有／交接、节拍行动与可恢复版本共用该文档。场景适配器单独处理 store，3D／SVG 展示位于应用层；预演只采样，不逐帧改写场景。保存／恢复通过单次批量更新保留统一撤销与自动保存。

## 验收边界

A、B 各自记录类型检查、相关测试、生产构建与 1440×900、768×1024、390×844 截图。阶段 C 的完整拖放／提示本、D 的摄影机缓存合并、E 的现场演出包、F 的 AI 口令不冒充本轮成果。使用独立新建验收场景；旧数据库与镜头缓存保留。
