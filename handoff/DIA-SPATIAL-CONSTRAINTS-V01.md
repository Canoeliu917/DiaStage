# Dia Spatial Constraint Engine V0.1

## 分支与安全边界

- branch: `codex/dia-spatial-constraints-v01-20260914`
- base: `298b254cdab1c34dfe5b341dd3a520c3e10fed1d`
- remote: `https://github.com/Canoeliu917/DiaStage.git`
- worktree: `C:/Users/Administrator/Documents/Codex/2026-09-13/handoff-md-next-codex-prompt-txt/work/DiaStage-spatial-constraints`
- 从已确认 clean 的 Integration 基线建立独立 worktree；没有修改 main，没有 merge、cherry-pick、push 或 deploy。
- 没有更改 Knowledge catalog、Camera canonical 36、Camera Runtime、Scene schema、22 个资产文件或 Folding Runtime 实现。复用现有 Folding Runtime；本轮只新增适配器及原有 Proposal / command executor 的窄接入。

## Schema 与确定性求解

`StageSpatialConstraint` 保存 type、subjects、target?、parameters、sourceIntent、knowledgeConceptIds、requirement、confidence。支持 form_enclosure / leave_opening / preserve_path / align_edges / corner_angle。

`requirement` schema 接受 required / preferred；V0.1 的受限语言映射全部生成 required，不开放降低约束等级或软约束折衷。Solver 校验约束与已验证 Proposal 的语义及来源完全一致。

输入 Scene snapshot、Stage Proposal、assets、constraints；输出 0..8 个候选。候选保存 candidateId、actions、folds、resolvedTransforms、constraintsSatisfied、constraintsUnsatisfied、warnings、feasibility、movementCost、clearanceRegions、plan。只输出通过全部硬约束的 feasible 候选，因此当前返回候选的 constraintsUnsatisfied 为空；无解返回空候选并显示原因。

- 三块独立直立景片：枚举不动的锚点和两种开口朝向，复用 scenicConnectionTransforms、edge snap、真实模型轮廓、接触及碰撞检查，不建立 parent hierarchy。
- 直墙和 90° 转角：保留合法方向；碰撞或边界不合法的候选被剔除。
- 入口：实际测量侧片内侧净距，检查入口矩形无阻挡，并验证 requested/default minimum。
- 通道：门口至台前边界的轴向矩形净空；按模型三角面检查门洞净高范围，不把整个门框包围盒或资产总宽当作可通行门洞。阻挡物的左右避让位置由确定性模型边界计算。
- 排序：先过滤 required 未满足、非法碰撞、越界和尺寸不足，再按 movementCost、动作数排序。movementCost = 平移米数 + 最短整件旋转角 / 180；折叠按铰链角改变量 / 180 累加。没有审美评分，也没有 AI 自动采用。
- runtime config：入口和通道默认最小净宽均为 0.8 m；通道净高检查为 1.9 m，默认目标为台前边界。这些是产品参数，不是戏剧术语定义或通行规范认证，宽度默认值及目标在 Proposal 中可见。
- 三联景片：在模型 clone 上调用现有 limitItemFoldControls / computeItemFoldBounds，最终 controls 通过现有单事务写入路径采用；不改原始 GLB hierarchy。现有 SCN-FOLD-03 manifest 为 0..180°，所以本轮只有 90°/90° 的合法 U 型候选，不放开 270°。

## Eval

| 层级 | 结果 |
| --- | --- |
| Semantic Constraint Eval | 14/14 |
| Constraint Solver Eval | 6/6 |
| Spatial Runtime / transaction tests | 4/4 |
| 新增测试合计 | 24/24 |
| Core Stage + Folding 额外回归 | 60/60 |
| Editor 完整测试 | 865 pass / 6 fail，871 tests / 113 files |
| Camera canonical cases | 36/36 |
| Camera Runtime | 9/9 |
| Authority Review | 13/13，未删除或降低预期 |
| Knowledge retrieval tests | 61/61 |
| Stage placement canonical cases | 66/66，另有 1 条 inventory 检查 |
| Editor check-types | PASS |
| Editor production build | PASS |
| git diff --check | PASS |

6 个失败均在基线 298b254 上用同一测试文件重新复现，基线复现为 21 pass / 6 fail；核对后 Integration 工作树仍 clean。本轮未修复或降低这些既有预期：

1. model-budget：预算耗尽时保留部分证据。
2. p0：添加沙发。
3. stage-facts：冲突物理状态选择。
4. stage-facts：PDF / DOCX 等价证据。
5. stage-facts：已有舞台的离线规划。
6. stage-facts：复杂文本模型证据规划。

## 4329 真浏览器验收

Chrome headless，production build，`http://localhost:4329`（IPv6 ::1）。保留原来的 IPv4 127.0.0.1:4329 服务，不终止、不接管。QA server 仅使用本 worktree 的忽略文件 `.local/spatial-qa.db`，标准安全设置未放宽。

| 场景 | 合法候选 | 结果 |
| --- | ---: | --- |
| 三块景片 U 型 | 8 | PASS |
| 三块景片 + 默认入口 | 8 | PASS |
| 现有可编辑门框 + 通道阻挡物 | 2 | PASS |
| 真实 SCN-DOOR-130 半开门扇 + 默认通道 | 0 | 正确 fail closed |
| 90° 两方向 | 2 | PASS |
| 一侧被已有物件阻挡 | 1 | PASS |
| 三块景片要求 9 m 入口 | 0 | 不可采用 |
| 三联景片从 180° 展开折为 U 型 | 1 | PASS |

所有可采用场景：Ghost creation = 0 writes；A/B switch（有第二候选时）= 0 writes；Cancel = 0 writes；Accept = exactly 1 write。Runtime 测试同时验证 exactly 1 Scene commit / history transaction。Undo 恢复完整原 graph，Redo 恢复完整 adopted graph。pageerror = 0。

方案按钮切换当前 Ghost，采用仅使用当前候选；取消清空 plan、folds、clearance regions。采用前再次检查 Scene 快照、知识来源、候选 plan 与折叠配置，并重新求解。Knowledge 和 LLM 不产生最终 XYZ，也不直接调用 Scene mutation。

## Formal Scene protection

全部创建、采用、Undo/Redo、删除均限定在独立 QA DB 的临时 scene。浏览器脚本逐场比较完整 graph，结束后 scene list 恢复开始状态；只删除脚本刚创建的精确 QA scene ID。QA 删除记录仍可保留在该独立 DB 的 revision 历史，不清理正式数据。

原 IPv4 服务上的 3 个 scene，完整 API 响应 SHA-256 及版本在执行前后保持一致：

| scene | version | SHA-256 |
| --- | ---: | --- |
| 71de52238204 | 22 | 6e16c2e893ab27b2e03bb12e491a170e0487bca34e8027a6bc21df69ad1c46f0 |
| 8537cf7594fb | 190 | 55e65d9977f54b7cfdc89749aefbaf0eecb85e38ef5fdb896ab73f5ab31aaf61 |
| fcc2fff436ea | 122 | 832cad1d24c05099f8984db6846e4d3c24909ad8049e15d1d71b0b53fff4c31f |

没有对正式 DB / revisions 发出写入请求；未另行导出正式 revisions 表做逐行哈希，因此不把 scene API 哈希宣称为 revisions 表的独立逐行审计。

## 修改文件

以下路径均相对上述 worktree：

- apps/editor/lib/stage/spatial-constraints.ts（新增）
- apps/editor/lib/stage/spatial-solver.ts（新增）
- apps/editor/lib/stage/spatial-fold.ts（新增）
- apps/editor/lib/stage/spatial-constraints.test.ts（新增）
- apps/editor/lib/stage/spatial-runtime.test.ts（新增）
- apps/editor/lib/stage/model-contact.ts
- apps/editor/lib/stage/scenic-proposal.ts
- apps/editor/lib/stage/command-executor.ts
- apps/editor/lib/stage/plan-preview.ts
- apps/editor/lib/rehearsal-intelligence/stage-placement-intents.ts
- apps/editor/lib/rehearsal-intelligence/knowledge/stage-proposal.ts
- apps/editor/lib/rehearsal-intelligence/dia-backbone.ts
- apps/editor/lib/rehearsal-intelligence/conversation-controller.ts
- apps/editor/components/stage-entry/plan-preview-system.tsx
- apps/editor/components/stage-entry/plan-preview-system.test.tsx
- apps/editor/components/stage-entry/plan-preview-floorplan.tsx
- apps/editor/components/theatre/rehearsal-partner.tsx
- handoff/spatial-qa-fixtures.ts（新增）
- handoff/spatial-browser-acceptance.mjs（新增）
- handoff/DIA-SPATIAL-CONSTRAINTS-V01.md（本报告，新增）

复用优先的实现遵循 ponytail 和 dia-language-trainer：沿用现有 Proposal、几何、Ghost、事务与 eval 结构，只扩展受限语法和必要适配，没有平行产品架构或新依赖。

## 已知边界

1. V0.1 不是通用布局优化器；最多三个直立景片，不处理任意角度、多组装配、永久层级或物理稳定性。
2. 通道仅支持与台口平行的门框和朝台前的直线矩形；不做绕行、navmesh、开门扇或自动选择目标区。侧向避让无法满足全部硬约束时返回无解。
3. 真实库门景片的固定半开门扇 / 底部构件目前不能满足默认直通净空。成功的浏览器通道案例使用现有可编辑门框几何，不能宣传为两个库门资产已经获得开门通行能力。
4. 折叠碰撞采用保守包围范围，U 型中空区域内有物件也可能拒绝；模型未就绪、锁定、宿主附着、倾斜或条件不足均 fail closed。
5. required / preferred 已有 schema 字段，但当前只执行硬约束，不提供软约束折衷方案。
6. 保留候选上限和最少移动排序，不保证穷举全局最优布局。
