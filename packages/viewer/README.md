# `@pascal-app/viewer`

DiaStage 沿用的 React Three Fiber / Three.js 展示包。包名保持不变，用于兼容内部依赖和上游 MIT 许可边界。

## 职责

- 3D Viewer 与 2D/3D 视图组合所需状态
- 注册表驱动的舞台节点渲染
- 相机控制、第一人称走台和镜头监看
- 固定中性环境照明
- 参考扫描、辅助线和错误隔离
- 稳定模式下的帧率、DPR 与后期效果控制

用户灯光、物件灯光池、屋顶、天花板、地形和机电渲染器不属于 DiaStage 运行时。

## 使用

应用先加载 `@pascal-app/nodes` 的内置定义，再挂载 `Viewer`。Studio 专用系统通过应用提供的运行时插槽组合挂载，避免覆盖编辑、第一人称和 Capture 模式。

## 许可

MIT。原许可见本目录 `LICENSE` 和仓库根目录 `LICENSES/PASCAL-MIT.txt`。
