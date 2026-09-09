# 咫角 DiaStage

AI Dramaturgy & Spatial Previs

2026-09-09 界面更新。

- 空间搭建：物件库、建模、场景；自然工具与设置继续可用。
- 导演工作台：场景、画面、镜头、场景序列。两处“场景”共享同一场景树。
- 黑白灰界面、几何镜框标记、Courier New 英文字体与思源黑体中文；场景库改为档案式列表。
- 街景面板和道路建模入口已移除。旧节点仍可读取，不删除用户工程中的插件节点。
- 进入镜头或画面前解除建模工具，切换前停止拍摄。导演工作台隐藏建模浮动工具栏，避免遮挡镜头。

建模与镜头继续共用原场景。旧镜头处于 Edit，六层镜头排演运行于 Studio 的 React Three Fiber Viewer 插槽；第一人称与 Capture 的互斥保持。

本地地址：http://127.0.0.1:4318/scene/empty-table-camera?disable=postFx

源码包保留原 `启动镜场.cmd` / `启动镜场.ps1` 启动脚本名称以便继续使用；网站显示名称为咫角 DiaStage。

## 验证

应用与编辑器类型检查通过；835 项编辑器单元测试、64 项应用测试通过；生产构建通过。本地验证覆盖 1440、703、390 像素宽度、两组导航、连续序列播放、第一人称进入与退出。独立界面审查结论为 ship，7 张最终截图均已检查。

现有 33 个场景节点、根节点、材质、集合、已安装插件数据与更新前快照一致。浏览器内 4 个镜头、A/B 机位和 2 个镜头试拍仍可读取。视频录制沿用原实现，此次没有生成新视频。

英文字体统一为系统 Courier New，中文统一为本地打包的思源黑体 Source Han Sans SC 可变字体（250–900 字重）。字体来自 Adobe 官方发布，SIL OFL 授权随包提供；不再加载 Geist、Barlow 与 Pixel 字体。品牌“咫角”和“DiaStage”分别连续白底黑字，词内不分隔。手机端专项调整按用户要求暂停。

## 参考

借鉴戏剧节网站的品牌文字层级、节目单元和编排方式，未复制海报或标志：

- [乌镇戏剧节](https://www.wuzhenfestival.com/)
- [阿那亚戏剧节](https://www.aranyatheaterfestival.com/)
- [蛇口戏剧节](https://www.shekoutheatrefestival.com/stf2025/)

字体来源：[Adobe Source Han Sans](https://github.com/adobe-fonts/source-han-sans/blob/release/Variable/WOFF2/TTF/SourceHanSansSC-VF.ttf.woff2)。
