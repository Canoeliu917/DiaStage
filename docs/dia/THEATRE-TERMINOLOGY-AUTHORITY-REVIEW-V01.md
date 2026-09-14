# Theatre Terminology Authority Review V0.1

日期：2026-09-14
分支：`codex/dia-knowledge-v01-20260914`
状态：Authority Review 与 Schema Hygiene 已完成；分类以本报告的 Hygiene 修订为准。

## 判定规则

- 四份理论资料均按 `exam_notes` 处理。它们只能提供 `candidate_definition`、`alias` 或 `historical_terminology`，不能单独把定义提升为 `canonical`。
- 《海鸥》《西哈诺》均为 `example_source`，不参与 canonical definition。
- `canonical` 必须有非 `exam_notes` 的 `authorityRefs`。
- 多个高权威来源若发生实质冲突，必须保留多个引用并标记 `contested`；本轮没有发现满足该条件的概念。
- `founders`、`proposers`、`participants`、`adapters` 分字段保存，禁止把“参与者”自动写成“创办者”或“提出者”。

Authority tier 分布：`exam_notes` 114，`institutional_teaching` 9，`peer_reviewed` 1，合计 124。

## Definition Status 结果

### Canonical（6）

- `stage-left` — 舞台左
- `stage-right` — 舞台右
- `upstage` — 舞台后部
- `downstage` — 舞台前部
- `audience-left` — 观众左
- `audience-right` — 观众右

方向术语依据专业舞台实践的确定性视角规则：stage left/right 以演员面向观众时为准，audience left/right 以观众面向舞台时为准。因此 `stage-left` 与 `audience-right` 指向同一物理侧，但仍是两个不同的参照概念。

### Tradition-specific（9）

- `super-objective` — super-objective；`stanislavski_system`
- `stage-event` — 舞台事件；`director_analysis_pedagogy`
- `given-circumstances` — given circumstances；`stanislavski_system`
- `dramatic-situation` — dramatic situation；`chinese_theatre_studies`
- `dramaticity` — 戏剧性（中国戏剧理论用法）；`chinese_theatre_studies`
- `physical-action` — physical action；`stanislavski_system`
- `psychological-action` — psychological action；`stanislavski_system`
- `experiencing-school` — 体验派（历史教学分类）；`historical_acting_pedagogy`
- `representation-school` — 表现派（历史教学分类）；`historical_acting_pedagogy`

### Translation variants（5）

- `blocking` — canonical label `blocking`；中文常用“舞台调度／演员调度”。
- `through-action` — canonical label `through action`；“贯串行动／贯穿行动／贯串动作／贯穿动作”归入同一 concept。
- `counter-through-action` — canonical label `counteraction`；四种“反贯串／反贯穿 + 行动／动作”写法归一。
- `mise-en-scene` — canonical label `mise-en-scène`；与 blocking 相关但不相同。
- `alienation-effect` — canonical label `Verfremdungseffekt`；“间离效果／陌生化效果／陌生化／间情法”归一。

### Contested（0）

没有发现“多个高权威来源对同一概念给出实质冲突定义”的案例。考试资料之间的重复、简化或不一致，不足以单独触发 `contested`；相关风险保存在 `disputedNotes`。

### Heuristic（1）

- `stage-zone` — 舞台九区的固定强弱排序仅是特定教学分析工具，不是 universal rule。

### Operational（26）

确定性的舞台方向、空间关系和资产操作使用工作性 operational definition；它描述 Dia 当前可解析的语义，不等于 canonical 或自动场景权限。

### Descriptive（77）

普通资产、一般理论描述与历史实体使用 descriptive。`black-slaves-cry-to-heaven` 已归为 `historical_entity + descriptive + knowledge_only`，不再与专业方向术语共用 canonical terminology 语义。

## 15 项强制复核结论

1. `given-circumstances` 与 `dramatic-situation` 为不同 ID、不同 tradition，并有双向区分语义。
2. `super-objective` 明确属于 `stanislavski_system`。
3. 贯串／贯穿、行动／动作四种写法归一到 `through-action`。
4. `physical-action` 与 `psychological-action` 使用 `related_to`，不使用 `distinct_from` 二分。
5. 体验派／表现派只作为历史教学分类，均不是 `acting-method` 的 `broader_than` 顶层分类。
6. 间离效果的定义强调反思距离，不写成完全禁止情感或共鸣。
7. 间离效果／陌生化效果归入一个 `alienation-effect`。
8. 舞台调度／blocking 与 mise-en-scène 显式区分。
9. `blocking` 和 `mise-en-scene` 保留为两个 ID，并建立 `distinct_from`。
10. 舞台九区及固定强弱顺序标为 `heuristic`，不作为 universal rule。
11. “改变关系／命运”仅保留为舞台事件的导演分析判别线索，不作为必要定义。
12. “假定情境中人物心理的直观外现”标为中国戏剧理论中的特定表述，不作为唯一 universal definition。
13. `stage-left` 使用演员面向观众的左侧规则，并以 `same_spatial_side_as` 关联 `audience-right`。
14. 《黑奴吁天录》记录为 adaptation / re-creation；`adapters` 与 `participants` 分开。
15. 所有 Concept 均具有分离的 `founders`、`proposers`、`participants`、`adapters` 字段。

## 明确发现并阻止进入 canonical 的错误／误导性命题

1. **“形体行动只等于外部行为，并与心理行动完全分离。”** 过度二元化；资料自身也写到外部动作与心理、情感相互作用。
2. **“间离效果完全不允许观众产生共鸣或情感。”** 过度绝对；布莱希特传统的重点是阻断无批判认同、维持判断能力，不等于清除一切情感。
3. **“舞台九区存在固定且普遍的强弱顺序。”** 只能作为特定教学 heuristic；实际显著性受剧场形制、构图、灯光、行动与观众关系影响。
4. **“舞台事件必须改变人物关系或命运。”** 是某类导演分析框架的强判别标准，不是所有戏剧传统对 event 的必要定义。
5. **“戏剧性唯一等于假定情境中人物心理的直观外现。”** 范围过窄，属于特定中国戏剧理论表述。
6. **“体验派／表现派穷尽全部表演方法。”** 是历史教学分类的过度推广。
7. **“舞台调度、blocking、mise-en-scène 是完全同义词。”** 合并会丢失概念范围；blocking 侧重演员位置与移动，mise-en-scène 范围更综合。
8. **“《黑奴吁天录》是完全原创剧本。”** 错误；“第一个完整的创作剧本”等历史表述不能抹去它由既有小说／译本改编并再创造的事实。

## Authority References

- University of Alaska Fairbanks, Theatre & Film Student Handbook — Theatre Terms: https://www.uaf.edu/theatrefilm/student-handbook.php
- Columbia Film Language Glossary — Mise-en-Scène: https://filmglossary.ccnmtl.columbia.edu/term/mise-en-scene/
- University of Central Florida — Bertolt Brecht’s Dramatic Structure: https://cah.ucf.edu/news/bertolt-brechts-dramatic-structure/
- 杭州师范大学《还原一个真实的春阳社》: https://rwxy.hznu.edu.cn/upload/resources/file/2022/12/28/7759474.pdf
- 田汉基金会《孙维世：忆欧阳予倩创作〈黑奴恨〉》: https://www.tianhanfoundation.org/news_20/283.html

## 验证

- Authority review tests：原 13 条全部保留并通过；Schema Hygiene 另增 8 条，共 21 passed / 0 failed / 77 assertions。
- Biome scoped check：passed。
- Knowledge 源文件隔离 TypeScript check：passed。
- 全 workspace TypeScript check 因本 worktree 中 workspace package declarations 尚未构建而失败；错误集中为既有 `@pascal-app/core` / `@pascal-app/viewer` 模块解析，未发现 knowledge 文件错误。
- 本阶段未修改或调用 Stage Runtime、Formal Scene mutation、Preview 或 Human Confirm 流程。
