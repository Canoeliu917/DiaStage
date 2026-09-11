# Pascal 功能候选筛选表

扫描范围仅限 `pascalorg/editor` 的 MIT 开源源码与公开 PR。未访问 Pascal 用户项目、社区资产或 hosted catalog。本表只供下一轮筛选，本轮未实现候选功能。

| 功能名称 | Pascal 上游位置 | Pascal 原用途 | DiaStage 戏剧用途 | 用户价值 | 当前已有类似功能 | 新增代码量 | 包体影响 | 运行性能影响 | 维护复杂度 | 知识产权注意事项 | 推荐方式 | 优先级 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 渐进式场景初始化 | PR #800；viewer 几何初始化调度 | 按帧预算建立大型建筑场景 | 分批建立大型舞台、道具和人物几何 | 低配置电脑首开更稳 | 部分：现有稳定模式 | 中 | 低 | 正向，中等收益 | 中 | 复用时保留 Pascal MIT notice | 直接复用 MIT 代码并剔除建筑分支 | A | 保留 |
| 精确撤销/重做失效范围 | PR #805；scene history 与 geometry invalidation | 只重建历史操作影响的建筑节点 | 撤销一次走位或置景时只更新相关舞台对象 | 大场景撤销更快 | 是：已有 history，失效范围仍可优化 | 中 | 低 | 正向 | 中 | 保留上游版权与修改说明 | 直接复用 MIT 代码 | A | 保留 |
| 指针射线缓存与相机节流 | PR #774；viewer picking/camera invalidation | 降低悬停和相机移动的重复射线计算 | 提升选物、走位点、机位移动流畅度 | 高频操作直接受益 | 部分 | 中 | 低 | 正向，高频路径 | 中 | 算法与代码均受 MIT notice 约束 | 直接复用最小缓存代码 | A | 保留 |
| 确定性吸附与网格吸附 | core spatial-grid、editor placement tools | 建筑构件落位 | 台口线、中线、平台边缘与道具落位 | 复台和置景坐标更可靠 | 是，已在用 | 小 | 低 | 低 | 低 | 现有 Pascal 派生源码继续保留 MIT notice | 保持现状，只补戏剧测试 | A | 保留 |
| 多选、框选与组变换 | editor selection/group tools | 成组移动建筑对象 | 成组移动布景、桌椅和演员标记 | 提高排演调整效率 | 是，已在用 | 小 | 低 | 中 | 中 | 保留 MIT notice | 保持现状 | A | 保留 |
| 镜头取景与相机同步 | PR #742、#752；viewer camera controls/capture | 步行、飞行与截图取景 | 导演观察、跟随人物和不同机位预演 | 直接服务看台流程 | 是：Camera Rehearsal 已有主体 | 中 | 中 | 中 | 中 | 只移植公开 MIT 源码，不复制品牌素材 | 选择性复用数学与同步逻辑 | A | 待定 |
| WebGPU/WebGL 恢复与资源释放 | PR #468；viewer renderer lifecycle | 处理设备丢失与页面切换竞态 | 任一监看器失败时保住编辑和保存 | 稳定性价值高 | 是：已有边界和回退 | 小 | 低 | 正向 | 中 | 保留 MIT notice | 仅在本地复现竞态后复用修复 | A | 待定 |
| 场景验证与证据输出 | MCP scene query/validation | 校验生成建筑场景 | AI 构台后列出实际节点、尺寸与冲突证据 | 避免 AI 声称已完成但场景未落地 | 部分：已有命令预览和确认 | 中 | 低 | 低 | 中 | 接口思想可自写；复用源码需 notice | 参考实现思路自己写 | A | 保留 |
| GLB 场景导出 | export/bake pipeline | 导出建筑模型 | 输出舞台方案给其他三维或渲染工具 | 方便教学和交付 | 是：已有 GLB 路径 | 小 | 低 | 导出时中 | 低 | 导出器依赖各自第三方许可 | 保持现状 | B | 保留 |
| STL/OBJ 导出 | Pascal export adapters | 制造或通用三维交换 | 舞美模型打印、白模交换 | 特定用户有用 | 否 | 中 | 中 | 导出时中 | 中 | 需逐项核对导出库许可证 | 只参考思路，按真实需求再写 | C | 待定 |
| 语义测量锚点与情境尺寸 | core measurement、nodes contextual dimensions | 关联建筑构件尺寸 | 标注台口线、中心线、平台高度和行动距离 | 舞台教学与复台核验 | 是，已在用 | 小 | 低 | 低 | 中 | 现有派生源码保留 MIT notice | 保持通用引擎，继续删除 room/BIM 特例 | A | 保留 |
| 版本复制与旧场景迁移 | scene clone/migrations/history | 复制项目并升级旧 schema | 保存排演版本、恢复旧场和安全打开旧项目 | 防止数据损失 | 是，已在用 | 小 | 低 | 低 | 中 | 迁移必须保留原数据，不自动覆盖 | 保持现状并补迁移样本 | A | 保留 |
| 复台采集适配器 | Capture schema/runtime | 接入设备姿态、网格与点云 | 给三点校准提供手工测量、Capture、LiDAR 等输入 | 扩展真实场地复台 | 部分：已有 GLB 上传和接口边界 | 大 | 高 | 高 | 高 | 设备协议和第三方 SDK 需另行审计 | 只参考接口思想，暂不实现 | B | 待定 |
| 墙体切面朝向缓存 | PR #775；wall cutout facing cache | 相机变化时缓存建筑墙切面朝向 | 剖开舞台围挡时减少重复计算 | 大围挡场景更流畅 | 部分 | 中 | 低 | 正向 | 中 | 只取通用缓存逻辑，排除屋顶/天花板 | 选择性复用 MIT 代码 | B | 待定 |
| 便携运行时裁剪 | PR #838；portable runtime staging | 发布包剔除构建期文件 | 缩小本机版体积并避免原生开发依赖混入 | 安装更轻、更稳定 | 是，本轮已采用 | 无 | 正向 | 无 | 低 | 保留包内许可证 | 保持现状 | A | 保留 |

## 明确不要

屋顶、天花板、烟囱、檐沟、天窗、屋脊、太阳能板、建筑楼层开洞、自动房间、MEP、暖通、管线、电气、厨房、卫浴、橱柜、地形、道路、街景、IFC、住宅预设、社区预设、在线素材目录和可编辑灯光不进入 DiaStage。

## 上游索引

- https://github.com/pascalorg/editor
- https://github.com/pascalorg/editor/pull/800
- https://github.com/pascalorg/editor/pull/805
- https://github.com/pascalorg/editor/pull/774
- https://github.com/pascalorg/editor/pull/775
- https://github.com/pascalorg/editor/pull/742
- https://github.com/pascalorg/editor/pull/752
- https://github.com/pascalorg/editor/pull/468
- https://github.com/pascalorg/editor/pull/838
