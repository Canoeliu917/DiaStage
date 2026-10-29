# DiaMotif

**DIA 系列最高层的知识、推理与训练评测体系。**

DiaMotif 是 DIA 的长期核心：将戏剧专业知识、语言理解、真实用户反馈与可复现评测汇集到同一入口，支持 DiaStage 及未来 DIA 产品。所有相关任务优先阅读这里，并把新证据和未解决问题写回这里。

## 统一收录

| 内容 | 入口 | 当前状态 |
| --- | --- | --- |
| 书籍、机构资料、定义来源与阅读状态 | [参考资料](references/theatre-books-and-sources.md) | 31 项用户书目；重点书籍单列已读范围与待读章节 |
| 重点书籍对 DIA 的启示 | [人机交互、AI 辅助编剧与道具研究](references/priority-reading.md) | 来源事实与产品推论分别记录 |
| GitHub 开源研究与可复用材料 | [项目核查与收录范围](references/github-projects.md) | 9 个项目的来源／许可；5 条方法卡及 1 份 CC0 剧本片段 |
| 语言、镜头、空间和知识检索评测 | [evals](evals/README.md) | 5 组、179 条已有 JSONL 案例已集中迁入；测试直接读取这里 |
| 千问真实调用验收 | [30题与运行说明](evals/live-model-acceptance.md) | 20道开发题、10道保留题；模型、几何、网页采用与人工验收分列 |
| 用户实测、实验、内测与纠正记录 | [records](records/README.md) | 已整理首批两条真实反馈；真实用户验收仍待进行 |
| 本轮变更、验证与剩余问题 | [2026-10-29 记录](records/2026-10-29-verification.md) | 离线验证与真实模型验收分别标记 |
| 对话接入与舞台执行审计 | [接入审计及30题结果](records/2026-10-29-dialogue-system-audit.json) | 当前链路已接模型；完整任务验收未通过，失败和待验项保留 |

## 与运行中的 DIA 连接

下列代码是 DiaMotif 当前的运行实现，保持单一来源，不复制第二套知识或解析器：

- [知识目录](../apps/editor/lib/rehearsal-intelligence/knowledge/catalog.ts)：145 个概念、12 个登记来源；包括定义、别名、正反例、区别关系和证据级别。
- [知识检索](../apps/editor/lib/rehearsal-intelligence/knowledge/retrieval.ts)与[模型上下文](../apps/editor/lib/rehearsal-intelligence/knowledge/model-context.ts)：每次最多 6 项、8KB；省略资料时标记 `truncated`。
- [DIA统一对话入口](../apps/editor/lib/rehearsal-intelligence/dialogue-server.ts)：每条当前置景对话先提交千问，带入当前舞台、有限历史、待采用方案和实际检索知识；随后校验并预览。旧 [open-language-server](../apps/editor/lib/rehearsal-intelligence/open-language-server.ts) 保留作对照及兼容。
- [语言训练工作流](../.agents/skills/dia-language-trainer/SKILL.md)：从误解和人工纠正形成对比案例，修改规则，再复测。

当前是知识检索、提示上下文、规则与评测体系。尚未进行基底模型微调，也没有将全部教材正文导入模型；不能把“加入参考书目”写成“模型已经掌握全书”。

## 资料与反馈闭环

1. 登记来源：书籍／机构资料、用户原话、人工标注、模型输出、合成案例分别标记。
2. 核实与整理：保留版本、阅读范围、出处、必要上下文和不确定项。
3. 形成可用知识：明确词义、流派差异、正例、易混淆反例和应澄清的情况。
4. 验证：记录输入、预期、实际结果、错误类型、模型与规则版本、复测证据。
5. 人工审阅：经确认才加入固定评测集或未来训练候选；用于调整规则的样本不得再冒充独立验收样本。

未来所有用户语言实测、试验、内测结果和修正都沿用此流程。GitHub 收录脱敏且允许公开的案例及汇总；原始账号、联系方式、私有剧本、照片和密钥不随记录上传。`private/` 已被 Git 忽略。现有应用反馈仍留在其私有存储，本次没有启用后台自动采集或自动上传 GitHub。

## 当前产品原则

DiaStage 继续聚焦 AI 置景、照片置景、剧本置景。用现有 21 件标准道具作排练替代；尊重真实尺寸、贴合、碰撞和观众视角。模型负责理解和提出建议，用户决定采用；正式场景变更须通过确定性校验。手机、平板、投影、复台与语音保持既定暂缓范围。

“最高层”表示 DIA 系列共享的长期知识与评测优先级，不等于把所有研究方向立即开放成产品功能。
