# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
戏剧导演、舞台美术与在教室和排练厅学习戏剧的学生。

## Product Purpose
DiaStage 是一个以真实舞台空间为基础，记录从搭台、排演到复台全过程的戏剧创作系统。

Dia 是贯穿其中的智能伙伴，把人的自然语言转化成可预演、可修改、可保留的舞台方案。

## Capabilities and Constraints
本阶段遵循《产品骨架重构与 Dia 统一智能端口完善指令》及《Dia 四项能力与品牌定位对齐》补充。工程骨架固定为 Venue → Build → Rehearse → Version → Remount；复用已验证模块，不新增 Agent 或第四工作区。
首页以“把戏说给 Dia。”及“从场地，到搭台，到排演，再到复台。”说明用途；原创示例明确标注为合成演示。语音先转写校对，再进入同一个 Dia。旧版搭台入口折叠保留，手动、剧本输入与复台仍可独立操作。
一级工作区只有 SET / 置景、REHEARSE / 排演、REMOUNT / 复台。
- 置景：舞台与场地、布景调整、舞台库、舞台镜头。搭台口令进入共享 Dia。
- 排演：模拟排演；显示；观察与记录并排；排演版本固定最后。
- 复台：源场地、目标场地、空间标定、映射预览、实体落位、复台验收。

正式人物排演数据包含名称、颜色、位置、朝向、可见性、路线与时长。独立 Rehearsal Intelligence 记录人物目标、关系、行动、策略、冲突、空间意图与状态变化；不将模型分析写成舞台事实。AI 只提议，必须经过校验、Ghost 预览和人的明确选择，才可编译为可撤销的正式修改。舞台几何与坐标仍由现有 Stage Intelligence 负责。
默认“一起排”，专业排演显示精确位置、依据和版本；二者共享 Scene、Thread、Interaction 和 Feedback。每个场景的版本化对话保存在本机，每次请求重新读取实际站位、路线、场地与障碍。只发送最近有限对话和有关决定，旧记忆不能覆盖手动修改。连续修改保留原方案与修订血缘；舞台变化使旧建议失效。
手机为 Dia + Rehearsal Remote，复用配对会话共享方案、选择、Ghost 与决定状态，轻量二维显示，不在首屏加载完整 Viewer。手机可请求预演，正式采用仍须在电脑明确确认；不开放公网场景权限。
训练授权默认关闭，产品事件不含剧本或对话全文。私有反馈保留上下文、方案、预演、决定与最终状态；未来授权和内容权利均明确后才可进入另外的训练准备审核。本轮 trainingEligible 始终 false。
摄影机使用已有位置、注视点、视野角度和轨迹数学。内部固定中性照明仅保障模型可见，不可编辑、不列入对象、不保存。
旧用户照明、旧剧情字段保留于兼容资料，不执行、不进入新排演版本。

## Brand Commitments
咫台 DiaStage；黑白灰；英文 Courier New，中文思源黑体。两个品牌词各自保持连续，白底黑字。

品牌文案集中于 `apps/editor/lib/brand.ts`。三层命名分别为品牌、用户产品、工程；不得将四个品牌词用作 runtime capability enum 或新页面。

| Brand | Product | Engineering |
| --- | --- | --- |
| Dialogue — 听懂你想说的戏 | Dia 对话、语音、选段、澄清 | Conversation / Voice / Reflect / Clarify |
| Diagonal — 人物一进入舞台，距离、方向和位置本身就是关系 | 人物空间关系、排演 | Rehearse / Blocking / Constraints |
| Diagram — 把想法变成可以看见、比较和修改的舞台 | 场地、搭台、Ghost | Venue / Build / Scene / Preview |
| Diary — 记住一场戏是怎样被排出来的 | 版本、历史、复台 | Version / Journal / Feedback / Remount |

戏从 Dialogue 开始；距离、方向和位置让关系在空间中发生；可操作舞台成为 Diagram；修改、选择、版本和复台形成这场戏的 Diary。这是品牌解释，不代表模型完全理解人物、任意生成舞台或永久记忆。四项能力只在第二层产品说明展示，默认工作流不暴露四个英文标签。

## Product Principles
- Dia Core 优先于设备 UI。Web/Desktop 是完整功能参考；Tablet 使用同一个 Web 应用的响应式布局；Phone 保持 Dia + Remote 的轻量定位。先稳定同一个 Dia，再让三端共享它。
- Interaction、Proposal、SceneVersion、Ghost 与 Human Authority 由统一 Dia 链维护。各端只适配输入、显示和会话传输，不复制意图判断、方案生成、编译或采用逻辑；协议投影不能成为另一份正式 Scene。
- Suggest, Preview, Decide. AI proposes. The stage previews. Humans decide.
- AI 提议。舞台先演。人来决定。
- 当前 ontology 为 8 / 38；其余维度等待产品定义，不阻塞 V0.1 工程开发。Public Beta 需通过 Gold Alpha 20、真实模型人工审核、三类真机和独立用户验收。
- 空间事实优先；模型可以简化，位置与尺度必须确定。
- X/Z 地面、Y 向上、米、弧度；界面提供中文名称与单位。
- 旧项目、原始缓存、未知扩展数据和既有复台配置须保留。
- 预览不写正式节点；确认编辑沿用撤销、自动保存与冲突机制。
- 不将未实现的语音、剧本输入或现场系统包装成可用功能。

## Evidence on Hand
本轮实现、Schema、未完成项及证据统一见 DIASTAGE_PRODUCT_BACKBONE_INTEGRATION_REPORT.md。此前连续对话见 DIA_CONVERSATION_LAYER.md，AI 排演见 REHEARSAL_INTELLIGENCE_V01.md，三入口见 THREE_ENTRY_IMPLEMENTATION.md；移除用户照明见 SIMPLIFIED_REHEARSAL.md。历史规划不覆盖本阶段要求。

## Non-goals
不做自动导演、模型直接改台、多 Agent、自有模型训练、SFT/DPO/GRPO、实时动作捕捉、原生手机 App、用户照明设计或建筑家装流程。未完成人工评测、真实 API 与各平台真机验收前，不宣称满足大众内测标准。
