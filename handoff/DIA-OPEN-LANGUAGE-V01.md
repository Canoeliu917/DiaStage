# Dia Open Natural Language Grounding V0.1

## 交付与分支

- branch: `codex/dia-open-language-v01-20260914`
- base: `13acb26c4b227a297966ebd59947f2baf013e24a`
- base branch: `codex/dia-spatial-constraints-v01-20260914`
- remote: `https://github.com/Canoeliu917/DiaStage.git`
- worktree: `C:/Users/Administrator/Documents/Codex/2026-09-13/handoff-md-next-codex-prompt-txt/work/DiaStage-open-language`
- 开始时核对基线 clean、branch、HEAD、remote，然后建立独立 worktree。基线回归检查后仍 clean。
- 提交为本报告所属提交；完整 SHA 另见交付消息。
- 没有修改 main，没有 merge、cherry-pick、push 或 deploy。

## 实现范围

自然中文 → 严格 Structured Grounding → canonical / Knowledge / eligibility / 引用校验 → 现有 Stage Proposal → 现有确定性求解 → Ghost → Human Confirm → Formal Scene。

当前 Stage Intelligence 模式启用新接入。已有场景创建、场地设置、Camera canonical 与历史排演流程保留原路由，未增加它们的权限或能力。

沿用 Scenic Assembly、edge snap、model bounds、collision、Stage Asset Interaction、Folding Runtime；没有更改上述 runtime 实现、Scene schema、22 个资产文件、Knowledge catalog 或 Camera canonical 36。受保护路径与基线的 git diff 为空。

实现遵循 ponytail 与 dia-language-trainer：复用现有 Zod、Proposal、Ghost、事务、API 预算控制及 OpenAI SDK，没有新增依赖或平行几何系统。先建立语料与反例，再接入并做浏览器验证。

## Structured Grounding Schema

必需字段：

`rawUtterance, subjects, references, intents, constraints, modifiers, ambiguities, confidence, requiresClarification, groundingVersion`

补充字段：

`minimumWidthMeters, angleDegrees, knowledgeConceptIds`

- groundingVersion = `open-language-v01`；全部 strict object。
- 21 个 intent 枚举：6 个方向、6 个操作、9 个既有 Camera canonical ID。
- 3 个 constraint 枚举：form-enclosure、leave-opening、preserve-path。
- references 支持 selection、last、named、scenic_flats、current_proposal、current_ghost、candidate。
- angleDegrees 仅 90 或 null；没有 position、XYZ、transform、任意 rotation、StagePlan 或工具调用字段。
- 模型上下文只包含对象 ID / 名称 / 已知 kind、选中与最近引用、当前 Proposal / Ghost 的有限引用；不发送完整 Scene 或几何坐标。
- 对象必须存在且数量唯一；重复、失效、未知引用不能执行。
- confidence 低于 0.8 要澄清；高 confidence 不跳过任何校验。
- Knowledge concept 必须存在、ACTIVE 且 allowed。place-on / stack-on 沿用原有 Placement 操作权限，不发明 catalog concept。
- 已有确定性语义不能被模型改写；明确净宽不得由模型发明或丢失。
- Proposal 保存 structuredGrounding、provider/model 和原有来源、私有记录标记；不授权训练。

## Model / provider usage

- 增加 `POST /api/dia/ground`，复用现有鉴权、Origin、防滥用、费用确认、取消信号与 usage tracking。
- 使用 Responses Structured Outputs；`store: false`，没有 tools，没有调用原 StagePlan 模型接口。
- 沿用 `DIASTAGE_COMMAND_MODEL`；仓库当前默认值为 `gpt-5.6-luna`。
- 明确可解析的口令先走本地规则；规则不能理解且没有既有可靠路由时，才请求语义 provider。
- 当前隔离环境没有配置 OpenAI key。实际端点检查返回 503，安全拒绝；本轮实际模型调用为 0。
- provider 的有效输出、虚构 intent、错误原口令、澄清、服务不可用均有模拟测试；另有模拟 provider → Proposal → Ghost → Accept / Undo / Redo 的完整事务测试。
- 下列准确率是固定离线语料的确定性结果，不是真实 LLM 准确率，也不是独立盲测。

SDK 格式校验另参考 [OpenAI Structured Outputs 官方说明](https://developers.openai.com/api/docs/guides/structured-outputs)。

## 四层 Eval

| 层级 | Before | After |
| --- | --- | --- |
| A. Natural Language Grounding | 137 / 216 | 216 / 216 |
| B. Canonical Validation | 本轮新增，原来无此独立 eval | 26 / 26 |
| C. Proposal Integration | 本轮新增，原来无此独立 eval | 5 / 5 |
| D. Browser Conversation | 本轮新增，原来无此独立 eval | 10 类要求全部通过，3 条完整事务流程通过 |

A 层构成：24 个 canonical ID × 专业、普通、口语、省略、同义、否定、修正、易混淆八类 = 192 条，另有 24 条边界语料。旧解析器同一语料为矩阵 113 / 192、边界 24 / 24；新解析器分别为 192 / 192、24 / 24。否定与修正类别包含模板化扩展，不能当作真实用户样本。

B 层覆盖 schema、canonical / Knowledge / eligibility、高 confidence 伪造、未知物件与引用、缺失主体、任意 XYZ / rotation、净宽、不可执行理论、context 不变、Structured Outputs 格式、provider 响应边界、附加未知子句不可部分采用。

C 层使用真实 GLB 与 Scene journal，覆盖 enclosure、corner、multi-hinge fold、direction correction、模拟 provider。逐项验证引用、不可变修订、Ghost、取消、exactly one transaction 和完整 Undo / Redo。

新增测试共 248：216 条语料 + 1 条 inventory + 26 条 validation + 5 条 integration。

## Follow-up 与 Ghost

- “前面别封死，留个入口”：为当前三片围合重新生成带入口的有来源 Proposal。
- “再宽一点”：运行时产品步长 +0.1 m；例如默认 0.8 m → 0.9 m。步长位于 runtime config，Proposal 明示净宽，重新求解全部硬约束，不是语言定义中的默认距离。
- “换另一个方案 / 换另一边”：切换当前合法候选 Ghost；不自动采用。
- “看第二个”：按当前候选序号切换 Ghost。
- “不要了 / 不要这个方案”：取消当前提案、清空 Ghost。
- “不是台左，我说的是观众左边”：保留明确对象，建立新修订，用 audience frame 重新计算，不叠加旧方向变换。
- “角度小一点”：澄清。V0.1 没有任意小角度求解权限。
- 澄清不会丢弃现有合法 Proposal / Ghost；舞台发生变化后，旧引用和采用仍被现有快照校验拒绝。
- UI 预演使用确定性校验后的计划；曾发现接入点漏掉这一步导致来源保护拦截，已修复并加入 UI 等价回归，没有放宽计划一致性校验。

## 4329 Browser Acceptance

Chrome headless，production build，`http://localhost:4329`（IPv6 ::1），独立 `.local/open-language-qa.db`。原 IPv4 `127.0.0.1:4329` 服务未被停止或替换；QA 服务测试结束后已停止。

三条完整流程：三片围合与入口修订、门框与通道、台左 / 观众左修正。覆盖全部指定 10 类口令，并额外验证“看第二个”。

| 检查 | 结果 |
| --- | --- |
| Proposal / Ghost / follow-up / clarification | Accept 前 0 Formal Scene writes |
| Candidate switch | 0 writes |
| Cancel | 0 writes |
| Accept | 每条完整流程恰好 1 write；runtime 测试恰好 1 journal / undo transaction |
| Undo / Redo | 完整 graph 恢复一致 |
| pageerror | 0 |

所有采用只发生在临时 QA scene。脚本只删除自己创建的精确 QA scene ID，scene list 恢复开始状态；独立 QA DB 的 revision 记录未做破坏性清理。

正式服务三个 scene 的完整 API 响应 SHA-256 前后相同：

| scene | SHA-256 |
| --- | --- |
| 71de52238204 | 6e16c2e893ab27b2e03bb12e491a170e0487bca34e8027a6bc21df69ad1c46f0 |
| 8537cf7594fb | 55e65d9977f54b7cfdc89749aefbaf0eecb85e38ef5fdb896ab73f5ab31aaf61 |
| fcc2fff436ea | 832cad1d24c05099f8984db6846e4d3c24909ad8049e15d1d71b0b53fff4c31f |

未向正式 scene / revisions 发出写请求。没有另外导出正式 revisions 表逐行哈希，不把 scene API 哈希宣称为 revisions 表的独立审计。

## Clarification / unsupported

“左边那块”“往左”“开放一点”、对象或数量不唯一、未知物件、未明确引用、任意转角、否定与附加不支持子句均不得产生可采用动作。调度、规定情境、最高任务、重音、潜台词等不转换成 StageAction；“飞起来”、XYZ、忽略规则等拒绝。

## Types、build 与回归

- Editor check-types：PASS。
- Editor production build：PASS。
- git diff --check：PASS。
- Core Stage / Folding 定向回归：58 / 58。
- Editor 完整测试：1113 pass / 6 fail，1119 tests / 115 files。
- 本轮新增 248 项全部通过；Camera canonical 36、Camera Runtime、Authority Review、Knowledge retrieval、Stage Placement、Spatial Runtime 原有测试未删除或降低预期。
- 6 个失败在原基线 `13acb26...` 的相同三个测试文件中重新复现：21 pass / 6 fail，27 tests。基线检查后仍 clean。

既有失败：

1. model-budget：预算耗尽时保留部分证据。
2. p0：添加沙发。
3. stage-facts：冲突物理状态选择。
4. stage-facts：PDF / DOCX 等价证据。
5. stage-facts：已有舞台的离线规划。
6. stage-facts：复杂文本模型证据规划。

## 修改文件

路径相对本次 worktree：

1. apps/editor/app/api/dia/ground/route.ts（新增）
2. apps/editor/lib/rehearsal-intelligence/open-language.ts（新增）
3. apps/editor/lib/rehearsal-intelligence/open-language-client.ts（新增）
4. apps/editor/lib/rehearsal-intelligence/open-language-server.ts（新增）
5. apps/editor/lib/rehearsal-intelligence/open-language-proposal.ts（新增）
6. apps/editor/lib/rehearsal-intelligence/open-language-cases.ts（新增）
7. apps/editor/lib/rehearsal-intelligence/open-language.test.ts（新增）
8. apps/editor/lib/rehearsal-intelligence/open-language-integration.test.ts（新增）
9. apps/editor/lib/rehearsal-intelligence/conversation-controller.ts
10. apps/editor/lib/rehearsal-intelligence/dia-backbone.ts
11. handoff/open-language-browser-acceptance.mjs（新增）
12. handoff/DIA-OPEN-LANGUAGE-V01.md（本报告）

## 已知边界

1. 没有真实 provider accuracy 结果；未配置服务时，超出本地解析范围的口令继续澄清。该固定语料不是对无限自然语言的保证。
2. 现有 camera / 创建 / 历史排演保留原路由；不是重写所有 Dia 输入入口。新 grounding 只向当前白名单能力提供语义。
3. 不从画面猜“左边那块”；最近引用仅在当前会话、同一 Scene version 内有效，不跨刷新重建模糊记忆。
4. “换另一边”当前表示下一个合法候选，不保证几何上严格镜像；用户须查看 Ghost。没有自动选择最佳方案。
5. 任意小角度、多步骤复杂表达与不支持修饰 fail closed。明确净宽目前以数字米数为验证范围。
6. 保留上一轮空间引擎限制：最多三块独立景片、简单直线通道、已验证 U 型折叠；没有 navmesh、Door articulation 或永久 assembly hierarchy。
7. 通道成功浏览器用例使用既有可编辑门框，不代表固定半开门扇的库资产获得新通行能力。
8. 没有扩展 catalog、新激活理论、训练模型、向量数据库、自动学习或 Formal Scene 权限。

Dia proposes. You decide.
