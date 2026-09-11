# `@pascal-app/core`

DiaStage 沿用的场景核心包。包名保持不变，用于兼容既有内部依赖和上游 MIT 许可边界。

## 职责

- 舞台场景节点与 Zod 校验
- Zustand 场景状态、批量事务、撤销与重做
- 节点注册表、事件总线与素材存储
- 碰撞、吸附、对齐、测量和复台坐标计算
- 旧建筑数据的只读兼容归档

启用的舞台节点包括场地容器、表演层、景片、平台、体块、门、窗、围栏、搁板、物件、人物标记、测量、扫描参考和舞台台阶。屋顶、天花板、机电、家装与工程节点不进入活动场景。

## 边界

该包不依赖 React Three Fiber 或编辑器界面。渲染在 `packages/viewer`，交互在 `packages/editor` 与 `apps/editor`。

## 许可

MIT。原许可见本目录 `LICENSE` 和仓库根目录 `LICENSES/PASCAL-MIT.txt`。
