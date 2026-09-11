# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
戏剧导演、舞台美术与在教室和排练厅学习戏剧的学生。

## Product Purpose
咫台 DiaStage 把文字、口述和剧本中的舞台空间变成可检查、可移动、可模拟，并能复台到真实剧场的方案。

## Capabilities and Constraints
本阶段产品边界以《DiaStage V0.1 — Rehearsal Intelligence 基线冻结与下一阶段推进》为准；此前简化规格中“不分析人物行动”的限制已被本阶段明确替换。原有三入口、相机、复台、旧项目兼容与稳定模式继续保留。
首页提供语音开台、手动置景、剧本搭台与醒目的复台入口。语音和剧本先生成待确认的舞台方案，经校验后与手动操作使用同一命令、历史和场景。
一级工作区只有 SET / 置景、REHEARSE / 排演、REMOUNT / 复台。
- 置景：舞台与场地、布景调整、舞台库、舞台镜头、舞台口令。
- 排演：模拟排演；显示；观察与记录并排；排演版本固定最后。
- 复台：源场地、目标场地、空间标定、映射预览、实体落位、复台验收。

正式人物排演数据包含名称、颜色、位置、朝向、可见性、路线与时长。独立 Rehearsal Intelligence 记录人物目标、关系、行动、策略、冲突、空间意图与状态变化；不将模型分析写成舞台事实。AI 只提议，必须经过校验、Ghost 预览和人的明确选择，才可编译为可撤销的正式修改。舞台几何与坐标仍由现有 Stage Intelligence 负责。
默认采用简单模式，专业模式显示精确位置与分析依据；二者共享同一份正式数据。AI 反馈独立保存在当前浏览器，训练授权默认关闭。
摄影机使用已有位置、注视点、视野角度和轨迹数学。内部固定中性照明仅保障模型可见，不可编辑、不列入对象、不保存。
旧用户照明、旧剧情字段保留于兼容资料，不执行、不进入新排演版本。

## Brand Commitments
咫台 DiaStage；黑白灰；英文 Courier New，中文思源黑体。两个品牌词各自保持连续，白底黑字。

## Product Principles
- Suggest, Preview, Decide. AI proposes. The stage previews. Humans decide.
- AI 提议。舞台先演。人来决定。
- 当前 ontology 为 8 / 38；其余维度等待产品定义，不阻塞 V0.1 工程开发。Public Beta 需通过 Gold Alpha 20、真实模型人工审核、三类真机和独立用户验收。
- 空间事实优先；模型可以简化，位置与尺度必须确定。
- X/Z 地面、Y 向上、米、弧度；界面提供中文名称与单位。
- 旧项目、原始缓存、未知扩展数据和既有复台配置须保留。
- 预览不写正式节点；确认编辑沿用撤销、自动保存与冲突机制。
- 不将未实现的语音、剧本输入或现场系统包装成可用功能。

## Evidence on Hand
当前 AI 排演增量的范围、验证与未实测项见 REHEARSAL_INTELLIGENCE_V01.md。三入口的依赖审计和实际验收见 THREE_ENTRY_IMPLEMENTATION.md；移除用户照明的记录见 SIMPLIFIED_REHEARSAL.md。历史规划不覆盖本阶段要求。

## Non-goals
不做自动导演、模型直接改台、多 Agent、自有模型训练、SFT/DPO/GRPO、实时动作捕捉、原生手机 App、用户照明设计或建筑家装流程。未完成人工评测、真实 API 与各平台真机验收前，不宣称满足大众内测标准。
