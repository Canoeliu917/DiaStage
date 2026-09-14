# Dia Knowledge System V0.1 Report

日期：2026-09-14

分支：`codex/dia-knowledge-v01-20260914`

基线：`01c9c22056724e765d534da658e67cb41e28d137`

Authority + Schema Hygiene 检查点：`5e1a51d8695b47414d20730f932e3e1e28fd9437`

## Source Audit 与 Registry

| sourceId | 类型 | 读取状态与结构 | 适用范围 | 本轮贡献 |
| --- | --- | --- | --- | ---: |
| `dia-src-theatre-encyclopedia-v1` | `knowledge_source` | DOCX 正文与目录可提取；590 段、3 个一级标题；未做分页渲染复核 | directing、dramaturgy、performance、stage_assets、spatial_directing | 100 concepts |
| `dia-src-directing-mindmap-v1` | `knowledge_source` | 1 页；文本可提取，视觉审计用于恢复线性提取丢失的层级 | directing、dramaturgy、spatial_directing | 63 concepts |
| `dia-src-zhongxi-glossary-v1` | `knowledge_source` | 51/51 页；编号词条结构清楚 | directing、dramaturgy、performance、spatial_directing | 86 concepts |
| `dia-src-glossary-2018-v1` | `knowledge_source` | 74/74 页；有页眉、水印、少量错字及重复词条 | directing、dramaturgy、performance、stage_assets、scenic_flats、spatial_directing | 51 concepts |
| `dia-src-seagull-cn-v1` | `example_source` | 40/40 页；四幕结构 | stage_assets、spatial_directing、dramaturgy | 4 scene examples、0 definitions |
| `dia-src-cyrano-cn-v1` | `example_source` | 61/61 页；五幕结构；字符间空格仅在审计副本中归一 | stage_assets、spatial_directing、dramaturgy | 5 scene examples、0 definitions |

五份 PDF 共 227/227 页可提取文本，六个来源均为 `verified`，registry 覆盖率为 6/6（100%）。每个 Concept 至少有一个可解析的 `sourceRef`。原始全文没有复制进产品源码。

四份理论资料之间大量重叠于导演、表演及戏剧基础词条；批处理在 154 个 raw candidates 中合并 30 个重复项，保留 124 个 concepts。没有发现两个高权威来源之间足以标记 `contested` 的实质定义冲突；考试资料中的简化、传统差异和风险保存在 `disputedNotes`，不提升为 canonical。

《海鸥》和《西哈诺》的花园、湖、小舞台、剧院大厅、楼座、阶梯、桌椅等只进入 9 个 `example_pattern` scene fixtures。它们不参与任何 canonical definition。

本轮暂不纳入当前 Dia 执行范围的内容包括电影史等非目标领域、深入人物目标与表演方法、台词／声音／独白训练，以及剧本对白和情节的普遍化推断。

## Batch Extraction

Pipeline：`extract → normalize → deduplicate → alias_merge → relations → source_refs → confidence → status`。

- Raw candidates：154
- Candidate concepts：124
- Duplicate concepts：30
- Conflict concepts：0
- Scene example patterns：9
- ACTIVE：50
- OBSERVE：41
- FUTURE：33

当前只激活 `stage_assets`、`scenic_flats`、`spatial_directing` 三个 domain。

## Schema Hygiene 分布

| 维度 | 分布 |
| --- | --- |
| `conceptKind` | stage_term 12；asset 18；spatial_relation 13；operation 7；theory_concept 73；historical_entity 1；另有 example_pattern 9 |
| `definitionStatus` | canonical 6；tradition_specific 9；translation_variant 5；contested 0；heuristic 1；operational 26；descriptive 77 |
| `authorityTier` | primary_source 0；authoritative_reference 0；peer_reviewed 1；institutional_teaching 9；exam_notes 114 |
| `status` | ACTIVE 50；OBSERVE 41；FUTURE 33 |
| `executionEligibility` | allowed 44；proposal_only 46；knowledge_only 34 |

`heuristic` 已从错误的 103 个降为 1 个，唯一保留项是 `stage-zone`。103 个 concepts 的 definition status 被修正：26 个改为 `operational`，76 个改为 `descriptive`，`black-slaves-cry-to-heaven` 从 `canonical` 改为 `historical_entity + descriptive + knowledge_only`。当前 schema/data validation failure 为 0。

完整 Authority 分类、15 项术语复核与 8 条被阻止进入 canonical 的错误／误导性定义见 `THEATRE-TERMINOLOGY-AUTHORITY-REVIEW-V01.md`；完整的 103 项变更清单见 `DIA-KNOWLEDGE-SCHEMA-HYGIENE-V01.md`。

## Retrieval V0.1

提供确定性的 canonical ID、alias、domain、relation、source lookup，以及受 `executionEligibility` 闸门控制的 executable intent retrieval。歧义 alias 返回 `clarificationRequired = true`、clarification 文本与全部候选，不静默选择。

`explainConcept` 对 heuristic 返回结构化 `universal = false` 与 `heuristic_not_universal`，并在文本中明确“非普遍规律”；tradition-specific 定义也保留 tradition 限定。

### Eval before / after

| 指标 | Before | After |
| --- | ---: | ---: |
| 可自动执行的 knowledge retrieval fixtures | 0 | 55/55 |
| 指定的十类 Retrieval 场景覆盖 | 4/10 完整，1/10 部分 | 10/10 |
| Retrieval 测试（含 inventory 与边界） | 0 | 61/61 |

Before 指进入 Retrieval Eval 阶段时的 Authority 检查点状态：当时有 20 条 seed fixtures，但没有 runner；20 条 seed 的预期与实现一致，不计作自动化分数。After 的 55 条覆盖台左／观众左、规定情境／戏剧情境、blocking／mise-en-scène、through-action 与 alienation-effect 译名、scenic-flat／fold-hinge、heuristic 限定、theory execution 边界、example/theory 隔离和歧义 clarification。

## 权限边界

- Knowledge 模块不导入 Formal Scene store、mutation API、StageAction adapter 或 Stage Placement mapper。
- `theory_concept` 全部不是 `allowed`，检索得到的 executable intents 全为空。
- 运行时测试遍历所有 retrieval path 后，Formal Scene 的 nodes、root IDs、collections、materials、installed plugins、undo history 与 scene commit 数均保持不变。
- `allowed` 只表示知识语义可以支持既有 proposal 流程；knowledge intent string 不是 Runtime `StageAction`，也不获得直接写 Scene 的权限。
- Preview、Human Confirm 与 “Dia proposes. You decide.” 边界保持不变。

## 验证

- Authority Review：13/13，原预期未删除或降低。
- Schema Hygiene：8/8。
- Knowledge Retrieval：61/61，其中 JSONL fixtures 55/55。
- Knowledge 合计：82/82。
- Camera canonical eval：37/37（36 fixtures + inventory）。
- Stage Placement eval：67/67（66 fixtures + inventory）。
- Camera Runtime actions：9/9。
- Stage Placement actions：15/15。
- Stage Placement Formal Scene authority：1/1。
- Scoped TypeScript：passed。
- Scoped Biome：passed。

## 已知边界与下一批建议

- 当前是确定性检索，不含 embedding、向量数据库、模糊语义搜索或模型训练。
- 114/124 concepts 的最高内部 authority 仍是 `exam_notes`；除 6 个方向术语外，不应把本轮资料中的普通定义宣传为跨传统 canonical。
- `stack-on` 在现有 124 个 concepts 中没有安全等价项；本轮按“不得增长 concepts”要求没有猜测映射。
- DOCX 缺少受控分页渲染复核；PDF 文本虽完整可提取，仍可能保留原件的错字或翻译差异。
- Example Corpus 当前只有两部剧本、9 个场景 fixture，不代表所有剧场形制或时代传统。
- Knowledge executable intent 名称是独立的知识语义标识，尚未建立到 Runtime StageAction 的自动 adapter。

下一批可优先评审而非自动激活：`blocking`、`focus`、`stage-picture`、`movement-line`、`actor-scenery-relation`、`actor-audience-relation`、`spatial-level`、`group-composition`、`scene-transition`。它们即使进入 ACTIVE，也应先保持 `proposal_only`；`stage-zone` 可用于带限定的解释，但不得成为 `allowed` 或绝对空间规则。
