# DiaMotif 实测、实验与内测记录

以后所有 DIA 语言实测、试验、内测、人工纠正和复测结论统一在这里归档。当前已建立记录规范并整理首批案例；不是后台自动采集功能。

## 每条记录必须包含

- `id`、`recordedAt`、`source`：区分 `user_report`、`human_annotation`、`synthetic_case`、`model_output`。
- `utterance`、`contextSummary`、`expected`、`observed`：原问题、必要脱敏上下文、预期、实际结果；无法确定的值写 `null`，不补成成功。
- `errorType`：词义、意图边界、指代歧义、修饰条件丢失、执行不一致等；允许“待分类”。
- `verification`：区分离线复现、真实供应商请求、真实浏览器操作和用户确认；保留测试路径、结果与待验证项。
- `versions`：代码提交、规则／提示词版本、供应商与模型；没有模型调用时明确为空。
- `publication`：记录脱敏与公开范围；不保存账号、邮箱、原场景 ID、私有附件路径或可识别的剧本正文。
- `trainingEligibility`：默认 `not_reviewed`。公开归档不等于同意模型训练；只有经适用的授权和人工审核后才能列为训练候选。

## 录入与复测

1. 以日期和主题保存 JSONL 或 Markdown；使用随机匿名案例 ID，不保留可反查用户身份的映射。
2. 实验记录包含条件、模型／参数版本、样本数、成功标准和失败项。耗时、费用只填实际测得数据；mock 不计作真实模型成功率。
3. 内测保留任务是否完成、澄清次数、误操作、人工修正和用户原反馈；没有用户确认就标为待验。
4. 先补正反例，再修规则并回归。沿用 [Dia 语言训练 skill](../../.agents/skills/dia-language-trainer/SKILL.md)。
5. 固定回归样本与未参与调优的验收样本分别报告。需要训练时另行记录来源许可和数据版本，不能将模型自评作为人工正确答案。

首批：[区域置景反馈](2026-10-29-region-creation.jsonl)。其中原话来自用户，复现上下文为开发者构造；已明确区分，未将离线结果标成用户验收。

本轮真模型诊断：[旧接口基线](2026-10-29-live-model-baseline.json)、[统一对话第一次迭代](2026-10-29-live-model-iteration-1.json)、[第二次迭代与中断记录](2026-10-29-live-model-iteration-2.json)。这些记录保留失败与未运行项，不能作为全量通过证明。

最终结果：[20道开发题](2026-10-29-live-model-final-development.json)、[10道保留题](2026-10-29-live-model-final-holdout.json)、[对话接入与执行边界审计](2026-10-29-dialogue-system-audit.json)。30题均已尝试真实调用；仍有语义失败、部分符合与超时，全部浏览器/用户验收待完成。最后的照片支撑与提案状态防护分别注明离线验证范围，没有改写原始评测结果。
