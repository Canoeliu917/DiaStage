# Gold Alpha 20：人工审核与 Eval

当前候选为 100，正式人工审核为 0，Gold Alpha 为 0。第一批目标为 20；本次只建立记录、校验、版本和汇总工具，没有生成任何实际人工审核或 Gold 标签。Ontology 保持 `diastage-dramaturgy-0.1`、8/38、complete=false。

AI proposes. The stage previews. Humans decide. 人工审核同样保留多种解释和行动，不寻找一个固定文本答案。结构通过、模型 self-confidence 和人工戏剧质量分别记录。

## 案例审核

由戏剧专业人员挑选并审核首批 20 个 Candidate。`eval-cases.ts` 中的 rubric 是待审描述，不是已经成立的标准。工具不判断某种解释是否正确，也不验证审核者专业资格；记录中的身份和结论必须由实际审核者提供，不能让 LLM 填写或接受自己的结果。

`gold-review.ts` 的日志包含 `schemaVersion: 1` 和 `reviews` 数组。每条审核包含：

| 字段 | 格式与含义 |
| --- | --- |
| caseId | 现有 Candidate 编号 |
| reviewer | 非空的实际审核者标识 |
| reviewVersion | 每个 case 从 1 开始逐次递增的正整数 |
| ontologyVersion | 本次审核使用的 ontology 版本，旧记录不改写 |
| status | accepted / needs-revision / rejected，由人工决定 |
| acceptableInterpretations | 字符串数组，允许的解释范围，可以有多种 |
| acceptableActions | 字符串数组，允许的可排演行动范围，可以有多种 |
| forbiddenClaims | 字符串数组，不可接受的断言；允许空数组 |
| requiredEvidence | 字符串数组，审核者要求的文本或事实依据 |
| uncertaintyExpectation | 非空字符串，需要承认的不确定性 |
| humanAuthorityExpectation | 非空字符串，导演与演员的选择和权限边界 |
| notes | 审核说明字符串，允许为空 |
| reviewedAt | ISO UTC 时间，不早于同 case 上一个审核版本 |

accepted 必须填入非空的解释范围、行动范围和证据要求；这只是记录完整性检查。needs-revision / rejected 可保留尚未确定的空数组。复审追加新版本，不能覆盖或删除旧版本。汇总只看每个 case 最新版本；新版本 needs-revision / rejected 会将先前 accepted 从当前 Gold 计数移除。其他 ontology 的历史审核保留，但不计入当前版本 Gold Alpha。

本地使用示例（从仓库根运行）：

```powershell
New-Item -ItemType Directory -Force .tmp-v01-gold-review
bun apps/editor/lib/rehearsal-intelligence/gold-review.ts --init .tmp-v01-gold-review/log-v0.json
```

审核者按上表独立填写一个审核 JSON 文件后，追加到新的日志快照：

```powershell
bun apps/editor/lib/rehearsal-intelligence/gold-review.ts --append .tmp-v01-gold-review/log-v0.json .tmp-v01-gold-review/reviewer-authored-case.json .tmp-v01-gold-review/log-v1.json
bun apps/editor/lib/rehearsal-intelligence/gold-review.ts --summary .tmp-v01-gold-review/log-v1.json
```

输出文件必须是新文件；工具拒绝覆盖已存在的日志。写入中断时旧快照仍保留，重新读取会拒绝不完整 JSON。`--summary` 不带路径仅汇总空日志，用于确认初始 Candidate=100、Human Reviewed=0、Gold Alpha=0。实际审核者信息和审核文件保存在本地忽略目录，不提交到 Git。

## 模型输出的人工评审

案例审核与模型输出审核独立：accepted 案例不保证任何模型输出通过；输出结构合法也不会将 Candidate 升级为 Gold。

`eval.ts` 导出 `EvalResultSchema`、`EvalResult`、`validateEvalOutput` 与 `HumanReviewSchema`。每个模型结果必须记录：

`provenance`、`caseId`、`modelVersion`、`promptVersion`、`ontologyVersion`、`input`、`rawStructuredOutput`、`latency`、`inputTokens`、`outputTokens`、`estimatedCostCNY`、`validationResult`、`humanReview`。

- provenance 为 `real-model` 或 `synthetic`，两个来源分别保存、分别汇总；合成输入本身不意味着模型响应是合成响应。
- input 必须对应当前版本 Candidate 的完整输入；未知 case 和不支持的 prompt/ontology 版本明确拒绝，不静默重解释历史数据。
- rawStructuredOutput 保留原始 JSON、无效 JSON 文本或无响应的 null；不可省略。latency 单位为毫秒。无法取得的 token 和费用记 null，不能用 0 冒充已知用量。
- validationResult 为 `{ structuralPass, error }`，复用现有 schema、引用、证据存在性、领域与空间编译校验。离线汇总重新校验，拒绝与已保存结果不一致的数据；这是结构校验，不是戏剧评分。
- humanReview 在实际人工审核前保持 null。人工填写时包含 reviewer、reviewVersion、reviewedAt，以及下面完整八项；每项结构为 `{ rating: "pass" | "partial" | "fail", reviewerNote: string }`。备注可为空。

| 字段 | 审核内容 |
| --- | --- |
| grounding | 是否基于给定文本和排演事实 |
| actionability | 能否在排练厅实际尝试 |
| plurality | 是否容纳多种可能，不宣称唯一正确 |
| humanAuthority | 是否保留导演和演员的决定权 |
| spatialFeasibility | 在当前舞台是否可实现 |
| dramaticRelevance | 是否涉及人物、关系、行动、冲突和变化 |
| evidenceQuality | 引用是否真正支持解释，而不只是原文中存在 |
| hallucination | 是否虚构台词、人物、事件、关系或舞台事实；pass 表示未发现虚构 |

程序只汇总人工等级：全部 pass 才计 humanReviewPassed；任一 fail 计 failed，其余已完整审核记录计 partial。未审核保持 null，不参与人工通过计数。人工评分与结构通过分别统计，不生成 Dramatic Accuracy、语义正确率或 Gold 标签；这些字段也不自动生成训练样本或偏好对。

```powershell
bun apps/editor/lib/rehearsal-intelligence/eval.ts --manifest
bun --conditions=react-server scripts/rehearsal-real-eval.mjs --count=10
bun apps/editor/lib/rehearsal-intelligence/eval.ts .local/rehearsal-real-eval/<runId>/results.json
```

真实 runner 默认每个分类取一个 Candidate，20 例时每类取两个；这只是选样，不是 Gold 接受。结果由 runner 写入本地忽略目录，每次运行单独保存。没有可用 API Key 时输出 NOT_RUN，不生成伪模型结果。

CLI 的退出码只表示本次非空结果是否全部通过结构校验：允许首轮 10–20 例独立运行；覆盖缺口仍列在 missing，人工待审仍显示 0。退出码 0 不表示人工质量通过、Gold Alpha 达标或 Public Beta Ready。合成单元测试中的评分和 accepted 只验证存储行为，不能计入真实审核统计。

Public Beta 仍需至少 20 Gold Alpha、真实模型输出和实际人工戏剧审核，以及真机和陌生用户核心流程验收。本阶段不训练、不自动上传数据、不生成 DPO 对、不让结构检查代替这些门槛。
