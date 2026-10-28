# DiaStage editor app

DiaStage 的 Next.js 应用入口。11.1 首发聚焦 AI 置景、照片置景与剧本置景，以 21 种标准道具辅助戏剧排练。当前默认进入置景；复台入口暂时隐藏，已有实现与保存数据保留。

## 运行

从仓库根目录执行：

```powershell
.\启动镜场.ps1
```

本地地址为 <http://127.0.0.1:4318/>。

## 分层

- `apps/editor`：页面、工作区组合、保存、移动端配对和产品交互。
- `packages/core`：场景数据、确定性计算、事务与撤销。
- `packages/viewer`：React Three Fiber / Three.js 展示运行时。
- `packages/editor`：通用编辑工具与 2D/3D 交互。
- `packages/nodes`：DiaStage 启用的节点定义、几何和工具。

旧建筑节点只在加载时进入兼容归档，不注册、不渲染，也不出现在界面。

## 验证

```sh
bun run check
bun run check-types
bun test apps packages --concurrency=1
bun run build
```

## 许可

DiaStage 自有版权说明见仓库根目录 `DIASTAGE_COPYRIGHT.md`。源自 Pascal 的代码继续受各 package 的 MIT 文件和 `LICENSES/PASCAL-MIT.txt` 约束。
