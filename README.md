# 咫台 DiaStage

**DiaStage: Theatre Rehearsal & Stage Previs**\
**AI辅助的戏剧置景与排练空间预览**

> **最高优先级 · [DiaMotif](DiaMotif/README.md)**
>
> DIA 系列的核心知识、推理与训练评测体系。统一收录书籍研究、语言规则、用户实测、实验和内测证据；作为各项 DIA AI 工作的首要接续入口。已验证知识、待读书目、模型输出与人工纠正分别记录。

DiaStage 咫台以21件标准道具为基础，把文字想法、剧场照片和已有剧本中的场景布置转成可预览、可调整、可保存的三维排练方案。Dia 是统一入口，结合真实模型理解、资产约束和几何检查，先预览，再由人确认采用。

**把戏说给 Dia。** 11月1日版聚焦 **AI置景、照片置景、剧本置景**，复台与语音入口隐藏；已有复台代码与数据保留。长期方向仍为 **Venue → Build → Rehearse → Remount（场地 → 搭台 → 排演 → 复台）**，不把长期结构当作当前全部开放的功能。

完整[网站定位](docs/diastage-product-positioning.md)、[产品约束](PRODUCT.md)与[最新验收及剩余待办](docs/diastage-release-todo.md)分别记录产品用途、实现边界和当前状态。源码在GitHub、本机已运行，不等于正式域名已部署。

**Version / History / Journal 贯穿全过程，并为 Remount 提供历史来源。** 它们是 Diary 基础设施，不是额外的用户工作区；Feedback、Human Authority、Scene Store 同样贯穿各阶段。

Dialogue / Diagonal / Diagram / Diary 是品牌解释，不是 Product Backbone、工程模块或 Agent。完整映射见 [PRODUCT.md](PRODUCT.md)，当前验收与冻结门禁见 [Freeze Report](DIASTAGE_PRODUCT_BACKBONE_FREEZE_REPORT.md)。

## 工作区

以下为长期产品结构；当前首发聚焦置景，排演维持既有未开放范围，复台入口按用户决定隐藏。

| 工作区 | 要完成的事 |
| --- | --- |
| 置景 | 选择场地，放置景片、台块与家具，摆放舞台镜头 |
| 排演 | 模拟人物站位和移动，显示、观察、记录并保存排演版本 |
| 复台 | Remount Preview / Mapping：记录源场、校准目标，预览真实尺度落位并确认应用映射；不替换正式场地 |

**观察与记录**属于排演。人物位置和路线由模拟排演数据定义。

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

1. 手动输入宽深新建舞台，或从Dia文字栏输入文字、图片或文字型PDF形成布景方案，检查并确认。语音入口当前隐藏。
2. 进入排演，添加人物标记、设置位置与朝向。
3. 点击记录移动，在舞台上依次选择位置，再设置时长。
4. 播放、暂停、回到开始或循环，检查人物移动。
5. 从显示切换视图，从观察切换视点；记录中输出无声视频。
6. 保存排演版本，或进入复台检查另一场地的落位。

第2–6步保留为既有排演/复台流程说明，不是11月1日版的开放承诺。当前约束见 [PRODUCT.md](PRODUCT.md)，历史审计见 [SIMPLIFIED_REHEARSAL.md](SIMPLIFIED_REHEARSAL.md)。排演版本与输出视频不同。

## 数据与兼容

- 舞台节点沿用现有 scene store、批量更新、撤销和自动保存。
- 戏剧领域数据位于 `apps/editor/lib/theatre/`，经校验后写入场景根节点 metadata。
- 旧节点类型由兼容层读取，经戏剧适配层呈现。更换产品入口不改变用户节点 ID。
- 历史观察缓存按原键保留；旧照明移入 legacy，不执行、不加入新版本。
- 本地启动脚本使用 `data/pascal.db`。备份时先停止服务，再复制完整数据目录；不要仅因名称删除数据库。

## 本次范围与后续

当前文字、照片与剧本输入围绕置景提案及人工确认组织。照片新方案仅用21件目录资产的原尺寸和比例，具体物件可用相似道具替代；不生成专业模型或把圆桌拉成椭圆。剧本提取已有场景布置，不创作新剧本；Dia附件入口支持文字型PDF，历史独立剧本解析也保留DOCX。文件导入和私有素材同步已有实现，真实照片自动摆位、完整文字动作、剧本与跨设备恢复仍待验。历史实施记录见 [THREE_ENTRY_IMPLEMENTATION.md](THREE_ENTRY_IMPLEMENTATION.md)，当前结果见最新待办。
摄影机可与布景共同复台；有独立物件运动或未纳入的跟随主体时明确阻止不完整映射。真实扫描、OCR 与 AR 不在本轮范围。
此前 A–F 的剧情分析与提示本规划已取消；旧交付记录只作历史资料。

已有观察和复台能力见 [CAMERA_STUDIO.md](CAMERA_STUDIO.md) 和 [REMOUNT.md](REMOUNT.md)。

## AI配置与附件范围

当前本机验收使用阿里云百炼北京固定 `qwen3.7-flash-2026-07-15`。通用本地开发可在服务端根目录 `.env.local` 中设置后重启；不要使用 `NEXT_PUBLIC_` 前缀，不把密钥提交到Git。当前专用验收启动脚本使用已有私有配置并拒绝自动加载的env文件，不要另外创建.env.local来覆盖它。

```dotenv
DIASTAGE_AI_PROVIDER=aliyun
DASHSCOPE_API_KEY=你的服务端密钥
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DIASTAGE_AI_BETA_USER_IDS=已核对的受邀账号用户ID
```

不配置密钥也可以手动置景、使用确定性文字示例；AI名单按真实用户ID核验，注册不会自动取得资格。选择百炼但缺少密钥时不会借用旧OpenAI配置。首轮最多20名受邀账号，每账号1元/日且5元/月，全站100元/月；属于应用内预算，非供应商最终账单或商业套餐。旧OpenAI路线保留，语音入口隐藏、百炼配置下旧转写路径不启用。上传剧本最多20MB、300页、300,000字符，处理超时60秒；扫描PDF的OCR未包含。

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
