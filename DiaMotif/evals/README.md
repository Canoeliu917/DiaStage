# DiaMotif 固定评测集

这里是以下 JSONL 的唯一数据来源，测试从这里直接读取。2026-10-29 从语言训练 skill 迁入，逐文件 SHA-256 相同，没有改动样本或预期值。

| 数据集 | 案例数 | 验证入口（仓库根目录执行） |
| --- | ---: | --- |
| [camera-intents.jsonl](camera-intents.jsonl) | 36 | `bun test apps/editor/lib/rehearsal-intelligence/camera-intents.eval.test.ts` |
| [stage-placement-intents.jsonl](stage-placement-intents.jsonl) | 66 | `bun test apps/editor/lib/rehearsal-intelligence/stage-placement.eval.test.ts` |
| [fold-enclosures.jsonl](fold-enclosures.jsonl) | 12 | `bun test apps/editor/lib/rehearsal-intelligence/fold-enclosures.eval.test.ts` |
| [knowledge-retrieval.jsonl](knowledge-retrieval.jsonl) | 55 | `bun test apps/editor/lib/rehearsal-intelligence/knowledge/knowledge-retrieval.test.ts` |
| [stage-proposal-integration.jsonl](stage-proposal-integration.jsonl) | 10 | `bun test apps/editor/lib/rehearsal-intelligence/stage-proposal` |

合计 179 条固定案例，不代表 179 次真实用户测试。其余应用内单元与流程测试保留原位置，由 [DiaMotif 首页](../README.md)连接。

新增用户纠正先登记到 [records](../records/README.md)，经审阅后再纳入固定案例。保留版本与来源；失败案例不得因暂时无法通过而删除。离线 mock、真实供应商调用、人工浏览器验收必须分别报告。

## 真实模型任务验收

[live-model-acceptance.jsonl](live-model-acceptance.jsonl) 另含30题：文字8、修订6、剧本6、照片6、解释4。20题用于开发，10题在实现冻结后运行。详见[运行方法、计分和素材限制](live-model-acceptance.md)。它们不计入上面的179条离线固定案例，也不等于30位用户或30张独立照片。
