# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
戏剧导演、舞台美术与在教室和排练厅学习戏剧的学生。

## Product Purpose
咫台 DiaStage 把文字、口述和剧本中的舞台空间变成可检查、可移动、可模拟，并能复台到真实剧场的方案。

## Capabilities and Constraints
产品边界以《DiaStage_Codex_Simplified_Rehearsal_Spec》为主，《DiaStage_Three_Entry_Voice_Script_Implementation_Spec》补充输入方式。
首页提供语音开台、手动置景、剧本搭台与醒目的复台入口。语音和剧本先生成待确认的舞台方案，经校验后与手动操作使用同一命令、历史和场景。
一级工作区只有 SET / 置景、REHEARSE / 排演、REMOUNT / 复台。
- 置景：舞台与场地、布景调整、舞台库、舞台镜头、舞台口令。
- 排演：模拟排演；显示；观察与记录并排；排演版本固定最后。
- 复台：源场地、目标场地、空间标定、映射预览、实体落位、复台验收。

人物数据只包含名称、颜色、位置、朝向、可见性与路线、时长。不创建剧情分析、动机解释、提示本或物件交接体系。
摄影机使用已有位置、注视点、视野角度和轨迹数学。内部固定中性照明仅保障模型可见，不可编辑、不列入对象、不保存。
旧用户照明、旧剧情字段保留于兼容资料，不执行、不进入新排演版本。

## Brand Commitments
咫台 DiaStage；黑白灰；英文 Courier New，中文思源黑体。两个品牌词各自保持连续，白底黑字。

## Product Principles
- 空间事实优先；模型可以简化，位置与尺度必须确定。
- X/Z 地面、Y 向上、米、弧度；界面提供中文名称与单位。
- 旧项目、原始缓存、未知扩展数据和既有复台配置须保留。
- 预览不写正式节点；确认编辑沿用撤销、自动保存与冲突机制。
- 不将未实现的语音、剧本输入或现场系统包装成可用功能。

## Evidence on Hand
三入口的依赖审计和实际验收见 THREE_ENTRY_IMPLEMENTATION.md；上一轮移除用户照明的记录见 SIMPLIFIED_REHEARSAL.md。THEATRE_AUDIT.md 与 THEATRE_IMPLEMENTATION.md 为此前已取消规划的历史记录，不再规定产品方向。

## Non-goals
不做人物心理、动机、情绪解释、剧情分段编辑、提示控制台、用户照明设计、真实扫描或 AR 导航。
