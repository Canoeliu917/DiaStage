# 咫台 DiaStage

**DiaStage: Theatre Rehearsal & Stage Previs**\
**戏剧排演与舞台复现**

在虚拟舞台排一遍，再按同一套位置、走位与尺寸把演出搭回来。咫台面向导演、演员、舞台美术、舞台监督与戏剧学习者。

## 工作区

| 工作区 | 要完成的事 |
| --- | --- |
| 置景 | 选择场地，放置景片、台块与家具，摆放舞台镜头 |
| 排演 | 模拟人物站位和移动，显示、观察、记录并保存排演版本 |
| 复台 | 记录源场、校准目标场地，预览真实尺度落位并确认应用 |

**观察与记录**属于排演。人物位置和路线由模拟排演数据定义。

## 用户指南

[用户指南：UE5 主布局与中键环绕](USER_GUIDE.md)以 UE5.6 关卡编辑器为主规范，覆盖观察、变换、支点、吸附和编组，并提供中键环绕、Shift/Alt+中键平移的三维观察扩展。编辑器设置中的“用户指南与快捷键”提供操作说明与方块练习。完整 UE5 键位仍待适配，差异及 [Codex 实施说明](docs/UE5_CONTROLS_IMPLEMENTATION.md)均已列出。

## 本地启动

需要 Node.js 22.13 或更新版本。Windows 可在仓库根目录运行：

```powershell
.\启动镜场.ps1
```

脚本名称因本地使用习惯保留。它会安装缺失依赖、构建内部包，在本机 4318 端口启动开发服务。保留终端窗口，Ctrl+C 停止服务。

打开 <http://127.0.0.1:4318/> 选择开始方式，或进入剧目库。新用户从新项目开始；已有项目按原 ID 打开。历史《空桌》样例初始化说明保存在 [历史操作文档](docs/history/2026-09-10-before-theatre/CAMERA_STUDIO.md)，不自动覆盖已有场景。

通用开发命令：

```sh
bun install --frozen-lockfile
bun dev
```

`bun dev` 使用根目录配置的开发端口。锁定的包管理器版本为 Bun 1.3.14。

## 最小排演流程

1. 手动输入宽深新建舞台，或用语音、文字、PDF / DOCX 形成方案，检查并确认布景。
2. 进入排演，添加人物标记、设置位置与朝向。
3. 点击记录移动，在舞台上依次选择位置，再设置时长。
4. 播放、暂停、回到开始或循环，检查人物移动。
5. 从显示切换视图，从观察切换视点；记录中输出无声视频。
6. 保存排演版本，或进入复台检查另一场地的落位。

当前约束见 [PRODUCT.md](PRODUCT.md)，本轮审计与验收见 [SIMPLIFIED_REHEARSAL.md](SIMPLIFIED_REHEARSAL.md)。排演版本与输出视频不同。

## 数据与兼容

- 舞台节点沿用现有 scene store、批量更新、撤销和自动保存。
- 戏剧领域数据位于 `apps/editor/lib/theatre/`，经校验后写入场景根节点 metadata。
- 旧节点类型由兼容层读取，经戏剧适配层呈现。更换产品入口不改变用户节点 ID。
- 历史观察缓存按原键保留；旧照明移入 legacy，不执行、不加入新版本。
- 本地启动脚本使用 `data/pascal.db`。备份时先停止服务，再复制完整数据目录；不要仅因名称删除数据库。

## 本次范围与后续

三入口共用舞台方案、确定性坐标与命令执行器。手动拖放和点击落位可用；语音转写与复杂文本解析需要服务端配置。剧本只读取文本型 PDF / DOCX，保留可核对的原文出处，确认前不改舞台。实施与验收记录见 [THREE_ENTRY_IMPLEMENTATION.md](THREE_ENTRY_IMPLEMENTATION.md)。
摄影机可与布景共同复台；有独立物件运动或未纳入的跟随主体时明确阻止不完整映射。真实扫描、OCR 与 AR 不在本轮范围。
此前 A–F 的剧情分析与提示本规划已取消；旧交付记录只作历史资料。

已有观察和复台能力见 [CAMERA_STUDIO.md](CAMERA_STUDIO.md) 和 [REMOUNT.md](REMOUNT.md)。

## 语音与剧本配置

在服务端根目录 `.env.local` 中设置后重启；不要使用 `NEXT_PUBLIC_` 前缀，不把密钥提交到 Git：

```dotenv
OPENAI_API_KEY=你的服务端密钥
DIASTAGE_COMMAND_MODEL=gpt-5.6-luna
DIASTAGE_TRANSCRIBE_MODEL=gpt-transcribe
```

不配置密钥也可以手动置景、使用确定性文字示例。转写失败保留本页录音供重试，离开页面即释放；复杂剧本无模型服务时明确报错。录音最多 90 秒 / 12 MB，优先使用设备支持的 MP4；上传剧本最多 20 MB、300 页、300,000 字符，处理超时 60 秒。生产录音需要 HTTPS。

新舞台高度可以暂不填写，但复台前必须补测。原始音频和剧本不写入项目；项目只保存确认后选用的证据摘录与默认值。

## 架构与验证

`packages/core` 负责场景事实，`packages/viewer` 负责渲染，`packages/editor` 与 `apps/editor` 负责操作体验。戏剧领域纯数据与计算不依赖展示层。

```sh
bun test apps/editor/lib/theatre
bun test apps/editor/components
bun test packages/mcp/src/theatre-profile.test.ts
bun x tsgo --noEmit -p apps/editor/tsconfig.json
bun run lint
bun x turbo run build --filter=editor --env-mode=loose
```

这些是可执行命令，不是预先声明通过。每阶段实际结果、截图和未解决项须记录在交付报告中。

## 来源与版权

本仓库保留从 [Pascal Editor](https://github.com/pascalorg/editor) 派生的基础代码。原版权为 **Copyright (c) 2026 Pascal Group Inc.**，完整 MIT 许可位于 [LICENSES/PASCAL-MIT.txt](LICENSES/PASCAL-MIT.txt)，各 package 原许可证继续保留。

DiaStage 自有部分见 [DIASTAGE_COPYRIGHT.md](DIASTAGE_COPYRIGHT.md)，其他代码与字体来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。产品身份调整不改变上游权利声明。

重构前的五份文档、原文中的上游贡献者与技术记录完整保存在 [历史目录](docs/history/2026-09-10-before-theatre/)。

