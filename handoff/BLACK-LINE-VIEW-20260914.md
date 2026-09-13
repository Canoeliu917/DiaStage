# 黑场线稿 — Viewer 显示模式

入口：显示 → 视图风格 → 黑场线稿。选择「实体」或「渲染」退出。

- 三维和分屏的三维区域：纯黑背景、白色结构边线，无实体填充、纹理和阴影。
- 选中：浅蓝线。临时移动 / Dia Ghost：半透明蓝线。碰撞仍为红线。
- Remount 保留来源蓝线、目标绿线、警告黄线、错误红线和虚线的原有含义。
- 第一版显示前后结构线，不是隐藏背面的实体渲染。平面图保持原有显示。
- 为展示隐藏三维背景网格；Snap 网格逻辑不变。网格和材质等原设置在退出后恢复。
- 显示状态仅在当前 Viewer 会话中生效，不保存到 scene props、Version 或资产材质；刷新后回到原显示。

实现位于 viewer：独立显示 Scene，缓存 EdgesGeometry 并跟随源对象的实时矩阵。退出时只释放生成的边线资源。原场景保持可选取，原材质与几何的所有权不变；线条副本不进入 GLB/scene 导出。

注入的预览/反馈可在 THREE.Object3D 上使用继承的 `userData.viewerLineStyle`（`colored` 保留提示颜色，`hidden` 跳过原有实体高亮）。这是运行时显示标记，不是正式节点 props。

## 验证

- `bun run check-types`：9/9 成功。
- `bun run build`：8/8 成功。
- `bun run test --concurrency=1`：3043 pass / 6 fail / 1 skip。6 项失败名称与既有基线一致，未修改相关规划逻辑。
- 最终针对边线、资源释放、选中、预览、实例化、帘片及 Remount 的测试：17 pass，129 assertions。
- `bun run check`：1334 个既有错误、1 info；未全仓格式化。新增的三个 Viewer 文件单独检查通过。
- Chrome 实测：三维 / 分屏 / 退出恢复；22 件资产逐一添加与 22 GLB 加载；碰撞颜色；Undo/Redo；二帘和三帘外端点折叠 / 取消 / 撤销；Version 保存和只读查看；Remount Preview；Dia Ghost 与放弃不改变正式物件；Top / Front / Side / Perspective、Orbit / Pan / Zoom、WASD-QE、398°环绕。

上述修改性验收使用独立 SQLite 副本和临时场景。正式库前后都是 3 scenes / 255 revisions，完整 SQLite、scenes JSON、revisions JSONL 的 SHA-256 全部一致：

| 备份 | SHA-256 |
| --- | --- |
| SQLite | `736503c3fb216f7ff6e1c4a6aef678b5a40e897adf07d7b212aae3922dd3835d` |
| scenes JSON | `99ed6e3a5d6c670eedc417413dae365cd2fbb5b57e178407cfab732693973dd1` |
| revisions JSONL | `901aa1dd215944e0b79e78f87dee0b81e88e07e654df1653dac70f0939d7639b` |

未修改 main、未合并、未部署。22 件资产资源未修改。
