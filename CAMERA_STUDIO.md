# 观察与记录

摄影机帮助导演检查舞台构图与人物位置。**置景 → 舞台镜头**摆放机位，**排演 → 观察 / 记录**观看与输出；排演默认打开模拟排演。

## 当前范围

保留已实现的观察点、目标跟随、路径采样、预演与无声视频输出，以及已有的高级参数编辑。人物位置和路线由简化排演数据定义。

预演视频只包含三维画面。实时录制依赖浏览器编码支持与设备性能，不保证离线渲染质量，不包含配音、麦克风或系统声音。页面可回放和浏览器发起下载，不等于已核验磁盘文件。

旧高级功能和迁移验证的原始记录见 [历史 CAMERA_STUDIO.md](docs/history/2026-09-10-before-theatre/CAMERA_STUDIO.md)。历史操作名称不作为新导航规范。

## 用户工作流

先设置人物位置与路线，再选择观察方式；高级焦距、画幅、阻尼与导出设置应逐步展开。正式排演数据的版本由排演系统保存，观察视频另行导出。

人物排演复用现有确定性采样。两套历史观察状态保持各自缓存，尚未统一时间基准。摄影机数据持久化独立于录像底栏，置景时可保存机位而不加载录像运行时。

## 兼容与源码边界

| 历史系统 | 源码 | 保存位置 |
| --- | --- | --- |
| 目标跟随与路径观察 | `apps/editor/components/camera-studio/` | `camera-studio:v1:{sceneId}` |
| 参数化观察与手动记录 | `camera-rehearsal-panel.tsx`、`camera-rehearsal-system.tsx`、`apps/editor/lib/camera-director.ts` | `zhijiao.camera-sequence.v1:{sceneId}` |

Camera Studio 当前以场景根节点 `metadata.diastageCameraStudio` 为正式保存来源，旧 `camera-studio:v1:{sceneId}` 仅供兼容迁移。原缓存保留，撤销和重做同步正式元数据，不另开历史操作。参数化观察仍使用原独立键，不覆盖缓存。旧记录中的物件运动可用于读取历史工程，但新的人物路线写入简化排演数据。

Viewer 中的运行系统继续通过既有插槽组合挂载，面板只控制交互。工作区切换、二维、第一人称、只读与 Capture 的控制权仍需通过模式回归验证，不能让多个系统同时接管相机。

## 来源

基础编辑与渲染代码派生自 Pascal Editor。原版权 **Copyright (c) 2026 Pascal Group Inc.** 与完整许可保存在 [LICENSES/PASCAL-MIT.txt](LICENSES/PASCAL-MIT.txt)；详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
